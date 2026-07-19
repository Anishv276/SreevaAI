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

/** Retry a billing write a few times with backoff before giving up -- a
 * transient DB/subprocess hiccup must not permanently drop real, already-
 * incurred cost with no recovery path (unlike jdExtraction's usageBilled
 * flag, resume screening has no job-data field to retry from on a later
 * poll, so this call site needs its own retry). Never throws -- returns
 * whether the write ultimately succeeded so callers can gate follow-up state
 * (e.g. jdExtraction's usageBilled flag) without a redundant try/catch. */
async function recordBillingWithRetry(opts: Parameters<typeof recordOrgBillingUsage>[0], label: string): Promise<boolean> {
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await recordOrgBillingUsage(opts);
      return true;
    } catch (err) {
      if (attempt === attempts) {
        console.error(`[MODAL-DISPATCH] ${label} billing failed after ${attempts} attempts:`, err);
        return false;
      }
      console.warn(`[MODAL-DISPATCH] ${label} billing attempt ${attempt}/${attempts} failed, retrying:`, err);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  return false;
}

const MODAL_ENDPOINTS = {
  resumeExtraction: process.env.MODAL_EXTRACT_RESUME_URL || "",
  jdExtraction: process.env.MODAL_EXTRACT_JD_URL || "",
  resumeAndScore: process.env.MODAL_EXTRACT_RESUME_AND_SCORE_URL || "",
  briefGeneration: process.env.MODAL_GENERATE_BRIEF_URL || "",
  interviewReport: process.env.MODAL_GENERATE_REPORT_URL || "",
  demoBriefGeneration: process.env.MODAL_GENERATE_DEMO_BRIEF_URL || "",
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
        data: { resumeScreeningStatus: isInterviewOnly ? "parsing" : "scoring", applicationUpdatedAt: new Date() },
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
        // fetch timeout > Modal fn timeout (180s) so Modal fails cleanly with a
        // real error instead of racing our AbortError at the same instant.
        result = await callModalFormEndpoint(MODAL_ENDPOINTS.resumeAndScore, form, 200_000);
      } else {
        form.append("model", org.llmResumeExtraction);
        result = await callModalFormEndpoint(MODAL_ENDPOINTS.resumeExtraction, form, 140_000);
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
  // Per-call breakdown behind each merged total above -- usagesExtract is the 2
  // real resume-extraction LLM calls (structural + semantic pass); usagesScore
  // is the report-generation LLM call + the embeddings call scorer.py's
  // semantic matching makes (previously untracked/unbilled entirely). Falls
  // back to the single merged entry above if an un-redeployed Modal app
  // doesn't send these yet.
  const usagesExtract: any[] = Array.isArray(result?.usages_extract) && result.usages_extract.length
    ? result.usages_extract
    : usageExtract ? [usageExtract] : [];
  const usagesScore: any[] = Array.isArray(result?.usages_score) && result.usages_score.length
    ? result.usages_score
    : usageScore ? [usageScore] : [];
  // Per-event ledger attribution: this resume belongs to a known application/job/candidate.
  const resumeCtxBase = {
    applicationId,
    jobId: application?.job?.id ?? null,
    jobTitle: application?.job?.title ?? null,
    candidateName: parsedName || null,
  };
  if (usagesExtract.length) {
    await Promise.all(usagesExtract.map((u, i) =>
      recordBillingWithRetry({
        orgId,
        feature: "resumeExtraction",
        usage: {
          model: u.model,
          inputTokens: u.inputTokens || 0,
          outputTokens: u.outputTokens || 0,
          cachedInputTokens: u.cachedInputTokens || 0,
          eventId: `resume-extraction:${job.id}:${i}`,
          context: { ...resumeCtxBase, label: u.callLabel ?? null, eventId: `resume-extraction:${job.id}:${i}` },
        },
      }, "resumeExtraction")
    ));
  } else {
    // Modal returned no usage_extract/usage field -- this app data is unbilled.
    // Most likely cause: the deployed Modal app is stale (predates usage
    // tracking) -- redeploy via `modal deploy modal_app/extract_and_score.py`.
    console.error(`[MODAL-DISPATCH] resumeExtraction billing SKIPPED for ${applicationId}: Modal response had no usage_extract/usage field. Result keys: ${Object.keys(result || {}).join(", ")}`);
  }
  if (usagesScore.length) {
    await Promise.all(usagesScore.map((u, i) =>
      recordBillingWithRetry({
        orgId,
        feature: "resumeReport",
        usage: {
          model: u.model,
          inputTokens: u.inputTokens || 0,
          outputTokens: u.outputTokens || 0,
          cachedInputTokens: u.cachedInputTokens || 0,
          isEmbedding: !!u.isEmbedding,
          eventId: `resume-report:${job.id}:${i}`,
          context: { ...resumeCtxBase, label: u.callLabel ?? null, eventId: `resume-report:${job.id}:${i}` },
        },
      }, "resumeReport")
    ));
  } else if (hasJd) {
    // Only expected when hasJd is true (resumeAndScore endpoint) -- extraction-only
    // calls never populate usage_score, so skip logging noise for that path.
    console.error(`[MODAL-DISPATCH] resumeReport billing SKIPPED for ${applicationId}: Modal response had no usage_score field. Result keys: ${Object.keys(result || {}).join(", ")}`);
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
      const result = await callModalFormEndpoint(MODAL_ENDPOINTS.resumeExtraction, form, 140_000);
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
        context: { label: fileName, eventId: `resume-file-extraction:${job.id}` },
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
      const result = await callModalFormEndpoint(MODAL_ENDPOINTS.jdExtraction, form, 140_000);
      console.log(`[MODAL-DISPATCH] JD extraction done, job=${job.id}`);

      if (orgId && result?.usage) {
        // Bill JD extraction HERE (worker) and mark the job billed so the status
        // poller (app/api/extract/status/[jobId]) sees the flag and skips its own
        // billing — previously BOTH billed, double-charging the org blob. Retries
        // a few times before falling back to the poller's own retry-on-next-poll.
        const billed = await recordBillingWithRetry({
          orgId,
          feature: "jdExtraction",
          usage: {
            model: result.usage.model,
            inputTokens: result.usage.inputTokens || 0,
            outputTokens: result.usage.outputTokens || 0,
            cachedInputTokens: result.usage.cachedInputTokens || 0,
            eventId: `jd-extraction:${job.id}`,
            context: {
              // No real Job record exists yet at JD-extraction time (jobs/route.ts
              // mints its own id later, unrelated to this queue job) -- the BullMQ
              // queue id is only used as the UsageEvent entity key, never shown as
              // a real Job id. jobTitle (from the extracted JD) is what's displayed.
              jobId: `extraction:${job.id}`,
              jobTitle: result?.data?.job_title ?? null,
              label: fileName ?? null,
              eventId: `jd-extraction:${job.id}`,
            },
          },
        }, "jdExtraction");
        if (billed) {
          try {
            await job.updateData({ ...(job.data as Record<string, unknown>), usageBilled: true, usageBilledAt: new Date().toISOString() });
          } catch {
            // Redis unavailable — status poller's own billing (guarded by the same
            // flag) will bill exactly once instead. Not fatal.
          }
        }
      } else if (orgId) {
        // Modal returned no usage field -- this JD extraction is unbilled.
        // Most likely cause: the deployed Modal app is stale (predates usage
        // tracking) -- redeploy via `modal deploy modal_app/extract_and_score.py`.
        console.error(`[MODAL-DISPATCH] jdExtraction billing SKIPPED for job=${job.id}: Modal response had no usage field. Result keys: ${Object.keys(result || {}).join(", ")}`);
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
      // fetch timeout > Modal fn timeout (180s) so Modal fails cleanly instead of racing our AbortError.
      const result = await callModalJsonEndpoint(MODAL_ENDPOINTS.briefGeneration, { applicationId }, 200_000);
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
 * demo-brief-generation job body. job.data: { roleTitle, jdText, mode, orgId }.
 * Unlike briefGeneration, the Modal function is stateless (JD text in, JSON
 * out) -- no DB access on the Modal side. The caller (worker.ts) persists the
 * returned JSON to DemoTemplate.briefJson.
 */
export async function processDemoBriefGenerationViaModal(
  { roleTitle, jdText, mode, orgId }: { roleTitle: string; jdText: string; mode: string; orgId?: string },
  job: Job,
  token: string | undefined,
): Promise<any> {
  console.log(`[MODAL-DISPATCH] Job ${job.id} picked up (demo-brief-generation) roleTitle=${roleTitle}`);

  const outcome = await withModalOrgSlot(
    "demoBriefGeneration",
    orgId,
    MODAL_ORG_CONCURRENCY.demoBriefGeneration,
    async () => {
      console.log(`[MODAL-DISPATCH] Slot acquired, generating demo brief for roleTitle=${roleTitle}`);
      const result = await callModalJsonEndpoint(MODAL_ENDPOINTS.demoBriefGeneration, { roleTitle, jdText, mode }, 60_000);
      console.log(`[MODAL-DISPATCH] Demo brief generation done for roleTitle=${roleTitle}`);
      return result;
    },
  );

  if (outcome.queued === true) {
    console.log(`[MODAL-DISPATCH] At capacity, re-queueing demo brief job ${job.id} in ${RETRY_DELAY_MS}ms`);
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
