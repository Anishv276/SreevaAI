/**
 * lib/modal-dispatch.ts
 * ======================
 * Dispatch layer between BullMQ (still running on the t3.medium for capacity
 * queueing/logging) and the Modal-hosted extraction/scoring/report/brief
 * functions. A dispatch job's entire body is: try to acquire the org's
 * concurrency slot, call the Modal endpoint if got one, or re-delay itself a few
 * seconds if the org is at capacity -- mirroring lib/org-concurrency.ts's
 * runWithOrgSlot + job.moveToDelayed pattern exactly, just retrying entry into a
 * Modal HTTP call instead of retrying entry into a BullMQ job's own execution.
 *
 * This satisfies the explicit requirement: a request that can't get a slot is
 * NOT dropped or failed -- it stays "queued" (visible in BullMQ/Redis, same as
 * today) and is picked up automatically the moment an earlier one finishes.
 *
 * Each function below replicates the FULL job body that today's worker.ts
 * handler runs (DB reads for org/JD config, R2 download, DB writes, billing) --
 * not just the extraction call -- so the calling API route's job.data shape is
 * unchanged from today (e.g. { applicationId, bucket, key, fileName, orgId }).
 */
import { DelayedError, type Job } from "bullmq";
import { prisma } from "./prisma";
import { getObjectBuffer } from "./s3";
import { recordOrgBillingUsage } from "./usage-metrics";
import { MODAL_ORG_CONCURRENCY, withModalOrgSlot } from "./modal-concurrency";
import { generateId } from "./ids";
import { sendScheduleInviteEmail } from "./mail";

const RETRY_DELAY_MS = 3000;

const MODAL_ENDPOINTS = {
  resumeExtraction: process.env.MODAL_EXTRACT_RESUME_URL || "",
  jdExtraction: process.env.MODAL_EXTRACT_JD_URL || "",
  resumeAndScore: process.env.MODAL_EXTRACT_RESUME_AND_SCORE_URL || "",
  briefGeneration: process.env.MODAL_GENERATE_BRIEF_URL || "",
  interviewReport: process.env.MODAL_GENERATE_REPORT_URL || "",
};

const MODAL_API_KEY = process.env.EXTRACT_SERVICE_API_KEY || "";

async function callModalFormEndpoint(url: string, form: FormData, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      body: form,
      headers: MODAL_API_KEY ? { "x-api-key": MODAL_API_KEY } : undefined,
      signal: controller.signal,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = body?.detail ?? body;
      throw new Error(`Modal endpoint ${url} failed (${res.status}): ${JSON.stringify(detail).slice(0, 500)}`);
    }
    return body;
  } catch (e: any) {
    if (e.name === "AbortError") throw new Error(`Modal endpoint ${url} timed out after ${timeoutMs}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function callModalJsonEndpoint(url: string, payload: any, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
        ...(MODAL_API_KEY ? { "x-api-key": MODAL_API_KEY } : {}),
      },
      signal: controller.signal,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = body?.detail ?? body;
      throw new Error(`Modal endpoint ${url} failed (${res.status}): ${JSON.stringify(detail).slice(0, 500)}`);
    }
    return body;
  } catch (e: any) {
    if (e.name === "AbortError") throw new Error(`Modal endpoint ${url} timed out after ${timeoutMs}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * screen-resume-modal job body. job.data shape: { applicationId, bucket, key,
 * fileName, orgId } -- identical to today's screen-resume BullMQ job. Replicates
 * worker.ts's processResumeScreeningJob in full: DB reads for JD/org config, R2
 * download, org-slot-gated Modal call, DB write, billing.
 */
export async function processResumeScreeningViaModal(job: Job, token: string | undefined): Promise<any> {
  const {
    applicationId,
    bucket = process.env.R2_RESUMES_BUCKET || "resumes",
    key,
    fileName = "resume.pdf",
    orgId = null,
  } = job.data || {};

  if (!applicationId || !key) throw new Error("Missing applicationId or key in screen-resume-modal job");
  if (!orgId) throw new Error("Missing orgId in screen-resume-modal job");

  console.log(`[MODAL-DISPATCH] Job ${job.id} picked up for ${applicationId} (screen-resume)`);

  await prisma.application.update({
    where: { id: applicationId },
    data: { resumeScreeningStatus: "extracting", applicationUpdatedAt: new Date() },
  }).catch((e: any) => console.warn(`[MODAL-DISPATCH] status update failed: ${e.message}`));

  console.log(`[MODAL-DISPATCH] Downloading from R2: ${key}`);
  const sourceBuffer = await getObjectBuffer(bucket, key);
  console.log(`[MODAL-DISPATCH] Downloaded ${sourceBuffer.length} bytes for ${applicationId}`);

  const [application, org] = await Promise.all([
    prisma.application.findUnique({
      where: { id: applicationId },
      select: {
        job: {
          select: { id: true, title: true, interviewMode: true, jdExtractedDetails: true, resumeScreeningCriteria: true, resumeScreeningThreshold: true, organization: { select: { name: true } } },
        },
      },
    }),
    prisma.organizationDetails.findUnique({
      where: { id: orgId },
      select: { llmResumeExtraction: true, llmResumeReport: true },
    }),
  ]);
  if (!org) throw new Error(`Org ${orgId} not found for screen-resume-modal job`);

  const isInterviewOnly = application?.job?.interviewMode === "interview-only";

  const extractedDetails = (() => {
    try { return JSON.parse(application?.job?.jdExtractedDetails || "{}"); } catch { return {}; }
  })();
  const screeningCriteria = (() => {
    try { return JSON.parse(application?.job?.resumeScreeningCriteria || "{}"); } catch { return {}; }
  })();
  const threshold = application?.job?.resumeScreeningThreshold || 60;
  // Interview Only mode: extraction only, no JD scoring, no threshold.
  const hasJd = !isInterviewOnly && Object.keys(extractedDetails).length > 0;

  const outcome = await withModalOrgSlot(
    "resumeExtraction",
    orgId,
    MODAL_ORG_CONCURRENCY.resumeExtraction,
    async () => {
      console.log(`[MODAL-DISPATCH] Slot acquired for org=${orgId}, calling extraction${hasJd ? "+score" : ""} for ${applicationId}`);
      await prisma.application.update({
        where: { id: applicationId },
        data: { resumeScreeningStatus: "scoring", applicationUpdatedAt: new Date() },
      }).catch(() => {});

      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(sourceBuffer)]), fileName);

      let result: any;
      if (hasJd) {
        form.append("extract_model", org.llmResumeExtraction);
        form.append("score_model", org.llmResumeReport);
        form.append("jd_payload", JSON.stringify({
          jd: extractedDetails,
          jd_raw_text: extractedDetails?.rawText || extractedDetails?.description || "",
          threshold,
          screening_criteria: screeningCriteria,
        }));
        result = await callModalFormEndpoint(MODAL_ENDPOINTS.resumeAndScore, form, 180_000);
      } else {
        form.append("model", org.llmResumeExtraction);
        result = await callModalFormEndpoint(MODAL_ENDPOINTS.resumeExtraction, form, 120_000);
      }
      console.log(`[MODAL-DISPATCH] Extraction${hasJd ? "+score" : ""} done for ${applicationId}`);
      return result;
    },
  );

  if (outcome.queued === true) {
    console.log(`[MODAL-DISPATCH] Org=${orgId} at capacity (${MODAL_ORG_CONCURRENCY.resumeExtraction}), re-queueing ${applicationId} in ${RETRY_DELAY_MS}ms`);
    await job.moveToDelayed(Date.now() + RETRY_DELAY_MS, token);
    throw new DelayedError();
  }
  const result = (outcome as { queued: false; result: any }).result;
  if (result?.error) {
    await prisma.application.update({
      where: { id: applicationId },
      data: { resumeScreeningStatus: "failed", applicationUpdatedAt: new Date() },
    }).catch(() => {});
    throw new Error(result.error);
  }

  const scoreData = result?.score ?? null;
  const resumeData = result?.data ?? {};
  const resumeText = result?.text ?? "";
  const aiScore = typeof scoreData?.score === "number" ? Math.round(scoreData.score) : null;
  const reportJson = scoreData ? JSON.stringify(scoreData) : null;

  let resumeStatus = "pending";
  if (isInterviewOnly) {
    resumeStatus = "extracted";
  } else if (aiScore !== null) {
    resumeStatus = aiScore >= threshold ? "shortlisted" : "rejected";
  }

  const parsedName = resumeData?.full_name?.trim() || "";
  const parsedEmail = resumeData?.email?.trim() || "";
  const parsedPhone = resumeData?.phone?.trim() || "";

  await prisma.application.update({
    where: { id: applicationId },
    data: {
      resumeRawText: resumeText,
      resumeParsedData: JSON.stringify({ source: { bucket, key }, parsed: resumeData }),
      ...(aiScore !== null && { resumeAiScore: aiScore }),
      ...(reportJson && { resumeFullScanReport: reportJson, resumeAiReport: reportJson }),
      ...(parsedName && { candidateFullName: parsedName }),
      ...(parsedEmail && { candidateEmail: parsedEmail }),
      ...(parsedPhone && { candidatePhone: parsedPhone }),
      resumeScreeningStatus: resumeStatus,
      applicationUpdatedAt: new Date(),
    },
  });
  console.log(`[MODAL-DISPATCH] DB updated for ${applicationId}: aiScore=${aiScore} status=${resumeStatus}`);

  if (isInterviewOnly) {
    const inviteEmail = parsedEmail || undefined;
    if (!inviteEmail) {
      console.warn(`[MODAL-DISPATCH] Interview Only: no email extracted for ${applicationId}, skipping auto-invite`);
    } else {
      try {
        const interviewId = generateId("ivw", parsedName || applicationId);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        await prisma.interview.create({
          data: {
            id: interviewId,
            applicationId,
            inviteEmailSentAt: new Date(),
            inviteLinkExpiresAt: expiresAt,
            interviewStatus: "PENDING",
          },
        });
        const interview = await prisma.interview.findUnique({ where: { applicationId }, select: { candidateInviteToken: true } });
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.sreevaai.com";
        await sendScheduleInviteEmail({
          email: inviteEmail,
          fullName: parsedName || "Candidate",
          jobTitle: application?.job?.title || "",
          scheduleLink: `${baseUrl}/schedule/${interview?.candidateInviteToken}`,
          orgName: application?.job?.organization?.name || "The Company",
        });
        console.log(`[MODAL-DISPATCH] Interview Only: auto-invite sent to ${inviteEmail} for ${applicationId}`);
      } catch (e) {
        console.error(`[MODAL-DISPATCH] Interview Only: auto-invite failed for ${applicationId}:`, e);
      }
    }
  }

  const usageExtract = result?.usage_extract ?? result?.usage ?? null;
  const usageScore = result?.usage_score ?? null;
  if (usageExtract) {
    await recordOrgBillingUsage({
      orgId,
      feature: "resumeExtraction",
      usage: {
        model: usageExtract.model,
        inputTokens: usageExtract.inputTokens || 0,
        outputTokens: usageExtract.outputTokens || 0,
        cachedInputTokens: usageExtract.cachedInputTokens || 0,
        eventId: `resume-extraction:${job.id}`,
      },
    }).catch((err: unknown) => console.error(`[MODAL-DISPATCH] resumeExtraction billing failed:`, err));
  }
  if (usageScore) {
    await recordOrgBillingUsage({
      orgId,
      feature: "resumeReport",
      usage: {
        model: usageScore.model,
        inputTokens: usageScore.inputTokens || 0,
        outputTokens: usageScore.outputTokens || 0,
        cachedInputTokens: usageScore.cachedInputTokens || 0,
        eventId: `resume-report:${job.id}`,
      },
    }).catch((err: unknown) => console.error(`[MODAL-DISPATCH] resumeReport billing failed:`, err));
  }

  console.log(`[MODAL-DISPATCH] Job ${job.id} completed for ${applicationId} — score: ${aiScore ?? "n/a"}`);
  return { applicationId, aiScore, hasScore: aiScore !== null };
}

/**
 * resume-file-extract-modal job body. job.data: { bucket, key, fileUrl, fileName,
 * orgId, orgOpenAIModel } -- extract only, no scoring/DB write. Result returned
 * for the caller (UI polling via /api/extract/status/[jobId]) to read.
 */
export async function processResumeFileExtractViaModal(job: Job, token: string | undefined): Promise<any> {
  const {
    bucket = process.env.R2_RESUMES_BUCKET || "resumes",
    key,
    fileUrl = null,
    fileName = "resume.pdf",
    orgId = null,
    orgOpenAIModel,
  } = job.data || {};
  if (!key) throw new Error("Invalid resume extraction job payload");
  if (!orgOpenAIModel) throw new Error("Missing orgOpenAIModel (org LLM config not loaded from DB)");

  console.log(`[MODAL-DISPATCH] Job ${job.id} picked up (resume-file-extract)`, { fileName, bucket, key });
  const sourceBuffer = await getObjectBuffer(bucket, key);

  const outcome = await withModalOrgSlot(
    "resumeExtraction",
    orgId,
    MODAL_ORG_CONCURRENCY.resumeExtraction,
    async () => {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(sourceBuffer)]), fileName);
      form.append("model", orgOpenAIModel);
      const result = await callModalFormEndpoint(MODAL_ENDPOINTS.resumeExtraction, form, 120_000);
      console.log(`[MODAL-DISPATCH] File extraction done, job=${job.id}`);
      return result;
    },
  );

  if (outcome.queued === true) {
    console.log(`[MODAL-DISPATCH] Org=${orgId} at capacity (${MODAL_ORG_CONCURRENCY.resumeExtraction}), re-queueing job=${job.id} in ${RETRY_DELAY_MS}ms`);
    await job.moveToDelayed(Date.now() + RETRY_DELAY_MS, token);
    throw new DelayedError();
  }
  const extracted = (outcome as { queued: false; result: any }).result;
  if (extracted?.error) throw new Error(extracted.error);

  if (orgId && extracted?.usage) {
    await recordOrgBillingUsage({
      orgId,
      feature: "resumeExtraction",
      usage: {
        model: extracted.usage.model,
        inputTokens: extracted.usage.inputTokens || 0,
        outputTokens: extracted.usage.outputTokens || 0,
        cachedInputTokens: extracted.usage.cachedInputTokens || 0,
        eventId: `resume-file-extraction:${job.id}`,
      },
    }).catch((err: unknown) => console.error(`[MODAL-DISPATCH] resumeExtraction (file) billing failed:`, err));
  }

  return {
    text: extracted?.text || "",
    data: extracted?.data || {},
    usage: extracted?.usage || {},
    url: fileUrl,
    bucket,
    key,
    fileName,
  };
}

/** jd-extraction-modal job body, same pattern, lower default concurrency. */
export async function processJdExtractionViaModal(job: Job, token: string | undefined): Promise<any> {
  const { buffer: fileBuffer, fileName, text, kind, orgId, orgOpenAIModel } = job.data || {};
  console.log(`[MODAL-DISPATCH] Job ${job.id} picked up (jd-extraction, kind=${kind})`);

  const outcome = await withModalOrgSlot(
    "jdExtraction",
    orgId,
    MODAL_ORG_CONCURRENCY.jdExtraction,
    async () => {
      console.log(`[MODAL-DISPATCH] Slot acquired for org=${orgId}, calling JD extraction`);
      const form = new FormData();
      if (kind === "text") {
        form.append("file", new Blob([Buffer.from(String(text || ""), "utf8")]), `jd_text_${job.id}.txt`);
      } else {
        const buf = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer?.data ?? fileBuffer);
        form.append("file", new Blob([new Uint8Array(buf)]), fileName || "jd.pdf");
      }
      form.append("model", orgOpenAIModel);
      const result = await callModalFormEndpoint(MODAL_ENDPOINTS.jdExtraction, form, 120_000);
      console.log(`[MODAL-DISPATCH] JD extraction done, job=${job.id}`);

      if (orgId && result?.usage) {
        await recordOrgBillingUsage({
          orgId,
          feature: "jdExtraction",
          usage: {
            model: result.usage.model,
            inputTokens: result.usage.inputTokens || 0,
            outputTokens: result.usage.outputTokens || 0,
            cachedInputTokens: result.usage.cachedInputTokens || 0,
            eventId: `jd-extraction:${job.id}`,
          },
        }).catch((err: unknown) => console.error(`[MODAL-DISPATCH] jdExtraction billing failed:`, err));
      }
      return result;
    },
  );

  if (outcome.queued === true) {
    console.log(`[MODAL-DISPATCH] Org=${orgId} at capacity (${MODAL_ORG_CONCURRENCY.jdExtraction}), re-queueing job=${job.id} in ${RETRY_DELAY_MS}ms`);
    await job.moveToDelayed(Date.now() + RETRY_DELAY_MS, token);
    throw new DelayedError();
  }
  const result = (outcome as { queued: false; result: any }).result;
  if (result?.error) throw new Error(result.error);
  return { text: result?.text || "", data: result?.data || {}, usage: result?.usage || {} };
}

/**
 * brief-generation-modal job body. job.data: { applicationId, orgId }.
 * Modal function fetches everything else (resume/JD/model config) directly via
 * its own asyncpg connection -- confirmed working in modal_app/generate_brief.py.
 */
export async function processBriefGenerationViaModal(job: Job, token: string | undefined): Promise<any> {
  const { applicationId, orgId } = job.data || {};
  if (!applicationId) throw new Error("Missing applicationId in brief-generation-modal job");
  console.log(`[MODAL-DISPATCH] Job ${job.id} picked up for ${applicationId} (brief-generation)`);

  const outcome = await withModalOrgSlot(
    "briefGeneration",
    orgId,
    MODAL_ORG_CONCURRENCY.briefGeneration,
    async () => {
      console.log(`[MODAL-DISPATCH] Slot acquired for org=${orgId}, generating brief for ${applicationId}`);
      const result = await callModalJsonEndpoint(MODAL_ENDPOINTS.briefGeneration, { applicationId }, 180_000);
      console.log(`[MODAL-DISPATCH] Brief generation done for ${applicationId}`);
      return result;
    },
  );

  if (outcome.queued === true) {
    console.log(`[MODAL-DISPATCH] Org=${orgId} at capacity (${MODAL_ORG_CONCURRENCY.briefGeneration}), re-queueing ${applicationId} in ${RETRY_DELAY_MS}ms`);
    await job.moveToDelayed(Date.now() + RETRY_DELAY_MS, token);
    throw new DelayedError();
  }
  return (outcome as { queued: false; result: any }).result;
}

/**
 * interview-report-modal job body. job.data is the full report payload
 * (appId, orgId, transcriptLines, answerScores, ... -- same shape report_worker.py
 * expects). Dispatched async since report generation runs up to ~300s+60s;
 * Modal's endpoint returns a call ID immediately via .spawn(), matching the
 * "attempts:1, non-idempotent side effects" semantics of today's queue.
 */
export async function processInterviewReportViaModal(job: Job, token: string | undefined): Promise<any> {
  const payload = job.data || {};
  const orgId = payload.orgId;
  const appId = payload.appId;
  if (!appId) throw new Error("Missing appId in interview-report-modal job");
  console.log(`[MODAL-DISPATCH] Job ${job.id} picked up for ${appId} (interview-report)`);

  const outcome = await withModalOrgSlot(
    "interviewReport",
    orgId,
    MODAL_ORG_CONCURRENCY.interviewReport,
    async () => {
      console.log(`[MODAL-DISPATCH] Slot acquired for org=${orgId}, dispatching report generation for ${appId}`);
      const result = await callModalJsonEndpoint(MODAL_ENDPOINTS.interviewReport, payload, 30_000);
      console.log(`[MODAL-DISPATCH] Report generation dispatched (async) for ${appId}, call_id=${result?.call_id}`);
      return result;
    },
  );

  if (outcome.queued === true) {
    console.log(`[MODAL-DISPATCH] Org=${orgId} at capacity (${MODAL_ORG_CONCURRENCY.interviewReport}), re-queueing ${appId} in ${RETRY_DELAY_MS}ms`);
    await job.moveToDelayed(Date.now() + RETRY_DELAY_MS, token);
    throw new DelayedError();
  }
  return (outcome as { queued: false; result: any }).result;
}
