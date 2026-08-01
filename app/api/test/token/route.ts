import { AccessToken, AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { prisma, isLive } from "@/lib/prisma";
import { FIXED_INTERVIEW_DURATION_MINUTES } from "@/lib/job-limits";
import { normalizeProctoringSignals } from "@/lib/proctoring-signals";
import { isTestAccessAuthorized } from "@/lib/test-key";
import { apiErrorResponse } from "@/lib/slack-error-logger";

export async function POST(request: Request) {
    try {
        const { applicationId, skipReport = false, key, disableProctoring = false } = await request.json();

        if (!(await isTestAccessAuthorized(key))) {
            return NextResponse.json({ error: "Invalid test key" }, { status: 403 });
        }

        if (!applicationId) {
            return NextResponse.json({ error: "applicationId required" }, { status: 400 });
        }

        const application = await prisma.application.findUnique({
            where: { id: applicationId },
            include: {
                job: { include: { organization: { select: { id: true, name: true, enabledProctoringSignals: true, isDeleted: true } } } },
                interview: true,
            },
        });

        if (!application || !isLive(application.job, application.job?.organization)) {
            return NextResponse.json({ error: "Application not found" }, { status: 404 });
        }

        // Create or reset interview row for test. Tech interviews always freeze
        // a fresh question-bank snapshot from the job's CURRENT bank on every
        // test run (no live brief-generation fallback -- that path is retired
        // for tech interviews, see agent_runtime.py's tech branch).
        const interviewId = `test_${applicationId}_${Date.now()}`;
        const isTechJob = application.job?.interviewType === "tech";
        const questionBankFields = isTechJob
            ? {
                jdQuestionBankSnapshot: (application.job?.questionBank ?? null) as any,
                jdQuestionBankVersionUsed: application.job?.questionBankVersion ?? null,
            }
            : {};
        const interview = await prisma.interview.upsert({
            where: { applicationId },
            create: {
                id: interviewId,
                applicationId,
                interviewStatus: "PENDING",
                isTestSession: true,
                ...questionBankFields,
            },
            update: {
                interviewStatus: "PENDING",
                isTestSession: true,
                interviewStartedAt: null,
                interviewCompletedAt: null,
                fullTranscript: null,
                perQuestionAnalysis: [],
                aiScoreBreakdown: {},
                aiInterviewSummary: {},
                aiSkillRatings: [],
                ...questionBankFields,
            },
            select: { candidateInviteToken: true },
        });

        const proctoringSignals = normalizeProctoringSignals(application.job?.organization?.enabledProctoringSignals);

        const roomName = `interview_${applicationId}`;
        const participantIdentity = `candidate_${applicationId}`;
        const durationSeconds = Math.floor(FIXED_INTERVIEW_DURATION_MINUTES * 60);
        const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL;
        const agentName = process.env.LIVEKIT_AGENT_NAME || "ai_interviewer";

        void (async () => {
            try {
                const apiKey = process.env.LIVEKIT_API_KEY;
                const apiSecret = process.env.LIVEKIT_API_SECRET;
                const rawUrl = process.env.LIVEKIT_URL;
                if (!apiKey || !apiSecret || !rawUrl) return;

                const host = `https://${rawUrl.trim().replace(/^(wss?|https?):\/\//, "")}`;
                const roomClient = new RoomServiceClient(host, apiKey, apiSecret);
                const dispatchClient = new AgentDispatchClient(host, apiKey, apiSecret);

                try {
                    await roomClient.createRoom({ name: roomName, emptyTimeout: 10 * 60, departureTimeout: 60 });
                } catch (e) {
                    const msg = e instanceof Error ? e.message.toLowerCase() : "";
                    if (!msg.includes("already exists")) console.error("[TEST_TOKEN] Room creation failed:", e);
                }

                try {
                    const existing = await dispatchClient.listDispatch(roomName);
                    for (const d of existing) await dispatchClient.deleteDispatch(d.id, roomName).catch(() => {});
                } catch {}

                await dispatchClient.createDispatch(roomName, agentName, {
                    metadata: JSON.stringify({
                        applicationId,
                        candidateName: application.candidateFullName,
                        roleLabel: application.job?.jobRole || application.job?.title || "Interview",
                        timeLimitMins: FIXED_INTERVIEW_DURATION_MINUTES,
                        isTest: true,
                        skipReport,
                        testEventKey: key,
                        disableProctoring,
                    }),
                });
            } catch (e) {
                console.error("[TEST_TOKEN] Dispatch error:", e);
            }
        })();

        const at = new AccessToken(
            process.env.LIVEKIT_API_KEY,
            process.env.LIVEKIT_API_SECRET,
            { identity: participantIdentity, ttl: "2h" }
        );
        at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canPublishData: true, canSubscribe: true });

        return NextResponse.json({
            token: await at.toJwt(),
            url: serverUrl,
            duration: durationSeconds,
            roleLabel: application.job?.jobRole || application.job?.title || "Interview",
            candidateName: application.candidateFullName,
            applicationId,
            interviewToken: interview.candidateInviteToken,
            proctoringSignals,
        });
    } catch (error) {
        return apiErrorResponse({
            route: "/api/test/token",
            method: "POST",
            error,
            body: { error: "Failed to generate test token" },
            status: 500,
            logLabel: "[TEST_TOKEN] Error:",
        });
    }
}
