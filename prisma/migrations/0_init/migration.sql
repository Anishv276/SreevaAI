-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "OrganizationDetails" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "urlSlug" TEXT NOT NULL,
    "billingPlan" TEXT NOT NULL DEFAULT 'STARTER',
    "maxActiveJobs" TEXT NOT NULL DEFAULT 'Unlimited',
    "maxConcurrentInterviews" INTEGER NOT NULL DEFAULT 5,
    "enabledProctoringSignals" JSONB DEFAULT '{"tab_switch": false, "fullscreen_exit": false, "window_focus_loss": false, "face_absence": false, "multiple_faces": false, "camera_disabled": false, "connection_lost": false, "latency_mismatch": false, "identity_mismatch": false, "microphone_disabled": false, "answer_integrity": false, "session_fingerprint": false}',
    "orgStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "orgCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orgUpdatedAt" TIMESTAMP(3) NOT NULL,
    "isOnboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "sttModel" TEXT NOT NULL DEFAULT 'flux-general-en',
    "ttsProvider" TEXT NOT NULL DEFAULT 'ELEVENLABS',
    "ttsModel" TEXT NOT NULL DEFAULT 'eleven_turbo_v2_5',
    "ttsSpeed" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "defaultVoiceId" TEXT NOT NULL DEFAULT 'EXAVITQu4vr4xnSDxMaL',
    "allowedVoiceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "llmResumeExtraction" TEXT NOT NULL DEFAULT 'gpt-5.4-mini',
    "llmJdExtraction" TEXT NOT NULL DEFAULT 'gpt-5.4-mini',
    "llmResumeReport" TEXT NOT NULL DEFAULT 'gpt-5.4-mini',
    "llmInterviewLive" TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
    "llmInterviewEval" TEXT NOT NULL DEFAULT 'gpt-4.1-nano',
    "llmInterviewBrief" TEXT NOT NULL DEFAULT 'gpt-4.1',
    "llmInterviewReport" TEXT NOT NULL DEFAULT 'gpt-5.4-mini',
    "totalInterviewsAllowed" INTEGER NOT NULL DEFAULT 0,
    "totalInterviewsUsed" INTEGER NOT NULL DEFAULT 0,
    "billingCreditsUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quotaControlMode" TEXT NOT NULL DEFAULT 'QUOTA',
    "platformUsageMetrics" JSONB DEFAULT '{}',
    "isRecordingEnabled" BOOLEAN,
    "recordingKeepForDays" INTEGER,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OrganizationDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuperAdmin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordResetOtp" TEXT,
    "passwordResetOtpExpiresAt" TIMESTAMP(3),
    "accountCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountUpdatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SuperAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "testAccessKey" TEXT,
    "testAccessKeyOtp" TEXT,
    "testAccessKeyOtpExpiresAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationCredentials" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "accountCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountUpdatedAt" TIMESTAMP(3) NOT NULL,
    "password" TEXT,
    "platformRole" TEXT DEFAULT 'ADMIN',
    "organizationId" TEXT,
    "passwordResetOtp" TEXT,
    "passwordResetOtpExpiresAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OrganizationCredentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "jobRole" TEXT,
    "resumeScreeningThreshold" INTEGER NOT NULL DEFAULT 0,
    "createdByCredentialId" TEXT NOT NULL,
    "jobCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobUpdatedAt" TIMESTAMP(3) NOT NULL,
    "resumeScreeningCriteria" TEXT DEFAULT '{}',
    "jdExtractedDetails" TEXT DEFAULT '{}',
    "aiGeneratedInterviewQuestions" TEXT DEFAULT '[]',
    "jdFileName" TEXT,
    "jdPreviewUrl" TEXT,
    "organizationId" TEXT,
    "applicationDeadline" TIMESTAMP(3),
    "aiInterviewerName" TEXT DEFAULT 'Ishitha',
    "aiInterviewerVoiceId" TEXT DEFAULT '9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
    "interviewMode" TEXT DEFAULT 'ats',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "candidateFullName" TEXT NOT NULL,
    "candidateEmail" TEXT NOT NULL,
    "candidatePhone" TEXT NOT NULL,
    "resumeFileUrl" TEXT NOT NULL,
    "resumeAiScore" INTEGER,
    "resumeAiReport" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicationUpdatedAt" TIMESTAMP(3) NOT NULL,
    "resumeRawText" TEXT,
    "resumeParsedData" TEXT,
    "jobId" TEXT NOT NULL,
    "resumeScreeningStatus" TEXT NOT NULL DEFAULT 'pending',
    "interviewPhaseStatus" TEXT NOT NULL DEFAULT 'pending',
    "resumeFullScanReport" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "resumeFileName" TEXT,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "candidateInviteToken" TEXT NOT NULL,
    "inviteEmailSentAt" TIMESTAMP(3),
    "inviteLinkExpiresAt" TIMESTAMP(3),
    "interviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "interviewStartedAt" TIMESTAMP(3),
    "interviewCompletedAt" TIMESTAMP(3),
    "fullTranscript" TEXT,
    "interviewCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "interviewUpdatedAt" TIMESTAMP(3) NOT NULL,
    "durationInSeconds" INTEGER,
    "proctoringSnapshotUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "candidateFeedbackText" TEXT,
    "candidateSelfRating" JSONB,
    "billingSnapshotAtCompletion" JSONB DEFAULT '{}',
    "proctoringEvents" JSONB DEFAULT '[]',
    "proctoringAnalysis" JSONB DEFAULT '{}',
    "perQuestionAnalysis" JSONB DEFAULT '[]',
    "aiScoreBreakdown" JSONB DEFAULT '{}',
    "aiInterviewSummary" JSONB DEFAULT '{}',
    "sessionRecording" JSONB DEFAULT '{}',
    "aiSkillRatings" JSONB DEFAULT '[]',
    "interviewScheduledAt" TIMESTAMP(3),
    "interviewTimezone" TEXT DEFAULT 'Asia/Kolkata',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "isTestSession" BOOLEAN NOT NULL DEFAULT false,
    "testSessionBillingMetrics" JSONB DEFAULT '{}',
    "aiInterviewBrief" JSONB,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT,
    "applicationId" TEXT,
    "reporterName" TEXT NOT NULL,
    "reporterEmail" TEXT NOT NULL,
    "issueDescription" TEXT NOT NULL,
    "ticketStatus" TEXT NOT NULL DEFAULT 'OPEN',
    "ticketResolvedAt" TIMESTAMP(3),
    "ticketCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ticketUpdatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIVoice" (
    "id" TEXT NOT NULL,
    "voiceName" TEXT NOT NULL,
    "voiceProvider" TEXT NOT NULL,
    "voiceModel" TEXT NOT NULL,
    "voiceDescription" TEXT,
    "voiceGender" TEXT,
    "voiceTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "isSystemDefault" BOOLEAN NOT NULL DEFAULT false,
    "voiceCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voiceUpdatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AIVoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationDetails_urlSlug_key" ON "OrganizationDetails"("urlSlug");

-- CreateIndex
CREATE INDEX "OrganizationDetails_orgStatus_idx" ON "OrganizationDetails"("orgStatus");

-- CreateIndex
CREATE INDEX "OrganizationDetails_orgCreatedAt_idx" ON "OrganizationDetails"("orgCreatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "SuperAdmin_email_key" ON "SuperAdmin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationCredentials_email_key" ON "OrganizationCredentials"("email");

-- CreateIndex
CREATE INDEX "Job_organizationId_idx" ON "Job"("organizationId");

-- CreateIndex
CREATE INDEX "Job_organizationId_jobCreatedAt_idx" ON "Job"("organizationId", "jobCreatedAt" DESC);

-- CreateIndex
CREATE INDEX "Application_jobId_resumeScreeningStatus_applicationUpdatedA_idx" ON "Application"("jobId", "resumeScreeningStatus", "applicationUpdatedAt");

-- CreateIndex
CREATE INDEX "Application_jobId_resumeAiScore_applicationUpdatedAt_idx" ON "Application"("jobId", "resumeAiScore" DESC, "applicationUpdatedAt" DESC);

-- CreateIndex
CREATE INDEX "Application_appliedAt_idx" ON "Application"("appliedAt" DESC);

-- CreateIndex
CREATE INDEX "Application_applicationUpdatedAt_idx" ON "Application"("applicationUpdatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Interview_applicationId_key" ON "Interview"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Interview_candidateInviteToken_key" ON "Interview"("candidateInviteToken");

-- CreateIndex
CREATE INDEX "Interview_interviewStatus_idx" ON "Interview"("interviewStatus");

-- CreateIndex
CREATE INDEX "Interview_interviewStatus_interviewCompletedAt_idx" ON "Interview"("interviewStatus", "interviewCompletedAt" DESC);

-- CreateIndex
CREATE INDEX "Interview_interviewStatus_interviewUpdatedAt_idx" ON "Interview"("interviewStatus", "interviewUpdatedAt" DESC);

-- CreateIndex
CREATE INDEX "Interview_interviewUpdatedAt_idx" ON "Interview"("interviewUpdatedAt" DESC);

-- CreateIndex
CREATE INDEX "Interview_isTestSession_idx" ON "Interview"("isTestSession");

-- CreateIndex
CREATE INDEX "SupportTicket_ticketStatus_ticketCreatedAt_idx" ON "SupportTicket"("ticketStatus", "ticketCreatedAt");

-- CreateIndex
CREATE INDEX "SupportTicket_interviewId_ticketCreatedAt_idx" ON "SupportTicket"("interviewId", "ticketCreatedAt");

-- CreateIndex
CREATE INDEX "SupportTicket_applicationId_idx" ON "SupportTicket"("applicationId");

-- CreateIndex
CREATE INDEX "AIVoice_isAvailable_idx" ON "AIVoice"("isAvailable");

-- CreateIndex
CREATE INDEX "AIVoice_voiceProvider_idx" ON "AIVoice"("voiceProvider");

-- AddForeignKey
ALTER TABLE "OrganizationCredentials" ADD CONSTRAINT "OrganizationCredentials_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "OrganizationDetails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_createdByCredentialId_fkey" FOREIGN KEY ("createdByCredentialId") REFERENCES "OrganizationCredentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "OrganizationDetails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE SET NULL ON UPDATE CASCADE;

