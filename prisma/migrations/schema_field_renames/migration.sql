-- Manual migration: rename ~125 fields + 3 table renames.
-- Drive→Job was handled in migration manual_rename_drive_to_job; skip it here.
--
-- ALL renames use ALTER ... RENAME which preserves data (no drop/recreate).
-- Run via Supabase SQL editor or:
--   prisma db execute --file prisma/migrations/schema_field_renames/migration.sql
--
-- After running: execute prisma generate to rebuild the Prisma client.

BEGIN;

-- ================================================================
-- PHASE 1: Table Renames (must come before column renames below)
-- ================================================================

ALTER TABLE "Organization"  RENAME TO "OrganizationDetails";
ALTER TABLE "User"          RENAME TO "OrganizationCredentials";
ALTER TABLE "EngineVoice"   RENAME TO "AIVoice";

-- ================================================================
-- PHASE 2: Column Renames
-- ================================================================

-- OrganizationDetails (formerly Organization)
-- maxActiveJobs was already renamed in migration manual_rename_drive_to_job
ALTER TABLE "OrganizationDetails" RENAME COLUMN "slug"                  TO "urlSlug";
ALTER TABLE "OrganizationDetails" RENAME COLUMN "plan"                  TO "billingPlan";
ALTER TABLE "OrganizationDetails" RENAME COLUMN "maxConcurrentSlots"    TO "maxConcurrentInterviews";
ALTER TABLE "OrganizationDetails" RENAME COLUMN "proctoringSignals"     TO "enabledProctoringSignals";
ALTER TABLE "OrganizationDetails" RENAME COLUMN "status"                TO "orgStatus";
ALTER TABLE "OrganizationDetails" RENAME COLUMN "createdAt"             TO "orgCreatedAt";
ALTER TABLE "OrganizationDetails" RENAME COLUMN "updatedAt"             TO "orgUpdatedAt";
ALTER TABLE "OrganizationDetails" RENAME COLUMN "onboardingComplete"    TO "isOnboardingComplete";
ALTER TABLE "OrganizationDetails" RENAME COLUMN "voiceId"               TO "defaultVoiceId";
ALTER TABLE "OrganizationDetails" RENAME COLUMN "allowedVoices"         TO "allowedVoiceIds";
ALTER TABLE "OrganizationDetails" RENAME COLUMN "interviewQuotaTotal"   TO "totalInterviewsAllowed";
ALTER TABLE "OrganizationDetails" RENAME COLUMN "interviewQuotaUsed"    TO "totalInterviewsUsed";
ALTER TABLE "OrganizationDetails" RENAME COLUMN "creditsUsed"           TO "billingCreditsUsed";
ALTER TABLE "OrganizationDetails" RENAME COLUMN "statusControl"         TO "quotaControlMode";
ALTER TABLE "OrganizationDetails" RENAME COLUMN "usageMetrics"          TO "platformUsageMetrics";
ALTER TABLE "OrganizationDetails" RENAME COLUMN "recordingEnabled"      TO "isRecordingEnabled";
ALTER TABLE "OrganizationDetails" RENAME COLUMN "recordingRetentionDays" TO "recordingKeepForDays";

-- SuperAdmin
ALTER TABLE "SuperAdmin" RENAME COLUMN "resetOtp"         TO "passwordResetOtp";
ALTER TABLE "SuperAdmin" RENAME COLUMN "resetOtpExpires"  TO "passwordResetOtpExpiresAt";
ALTER TABLE "SuperAdmin" RENAME COLUMN "createdAt"        TO "accountCreatedAt";
ALTER TABLE "SuperAdmin" RENAME COLUMN "updatedAt"        TO "accountUpdatedAt";

-- OrganizationCredentials (formerly User)
ALTER TABLE "OrganizationCredentials" RENAME COLUMN "role"              TO "platformRole";
ALTER TABLE "OrganizationCredentials" RENAME COLUMN "orgId"             TO "organizationId";
ALTER TABLE "OrganizationCredentials" RENAME COLUMN "createdAt"         TO "accountCreatedAt";
ALTER TABLE "OrganizationCredentials" RENAME COLUMN "updatedAt"         TO "accountUpdatedAt";
ALTER TABLE "OrganizationCredentials" RENAME COLUMN "resetOtp"          TO "passwordResetOtp";
ALTER TABLE "OrganizationCredentials" RENAME COLUMN "resetOtpExpires"   TO "passwordResetOtpExpiresAt";

-- Job (formerly Drive — table rename was in manual_rename_drive_to_job)
ALTER TABLE "Job" RENAME COLUMN "role"               TO "jobRole";
ALTER TABLE "Job" RENAME COLUMN "screeningThreshold" TO "resumeScreeningThreshold";
ALTER TABLE "Job" RENAME COLUMN "creatorId"          TO "createdByCredentialId";
ALTER TABLE "Job" RENAME COLUMN "createdAt"          TO "jobCreatedAt";
ALTER TABLE "Job" RENAME COLUMN "updatedAt"          TO "jobUpdatedAt";
ALTER TABLE "Job" RENAME COLUMN "screeningCriteria"  TO "resumeScreeningCriteria";
ALTER TABLE "Job" RENAME COLUMN "extractedDetails"   TO "jdExtractedDetails";
ALTER TABLE "Job" RENAME COLUMN "interviewQuestions" TO "aiGeneratedInterviewQuestions";
ALTER TABLE "Job" RENAME COLUMN "orgId"              TO "organizationId";
ALTER TABLE "Job" RENAME COLUMN "deadline"           TO "applicationDeadline";
ALTER TABLE "Job" RENAME COLUMN "aiName"             TO "aiInterviewerName";
ALTER TABLE "Job" RENAME COLUMN "voiceId"            TO "aiInterviewerVoiceId";

-- Application
ALTER TABLE "Application" RENAME COLUMN "fullName"         TO "candidateFullName";
ALTER TABLE "Application" RENAME COLUMN "email"            TO "candidateEmail";
ALTER TABLE "Application" RENAME COLUMN "phone"            TO "candidatePhone";
ALTER TABLE "Application" RENAME COLUMN "resumeUrl"        TO "resumeFileUrl";
ALTER TABLE "Application" RENAME COLUMN "aiScore"          TO "resumeAiScore";
ALTER TABLE "Application" RENAME COLUMN "aiReport"         TO "resumeAiReport";
ALTER TABLE "Application" RENAME COLUMN "createdAt"        TO "appliedAt";
ALTER TABLE "Application" RENAME COLUMN "updatedAt"        TO "applicationUpdatedAt";
ALTER TABLE "Application" RENAME COLUMN "resumeText"       TO "resumeRawText";
ALTER TABLE "Application" RENAME COLUMN "resumeData"       TO "resumeParsedData";
ALTER TABLE "Application" RENAME COLUMN "resumeStatus"     TO "resumeScreeningStatus";
ALTER TABLE "Application" RENAME COLUMN "interviewStatus"  TO "interviewPhaseStatus";
ALTER TABLE "Application" RENAME COLUMN "fullScanReport"   TO "resumeFullScanReport";
ALTER TABLE "Application" RENAME COLUMN "fileName"         TO "resumeFileName";

-- Interview
ALTER TABLE "Interview" RENAME COLUMN "accessToken"               TO "candidateInviteToken";
ALTER TABLE "Interview" RENAME COLUMN "inviteSentAt"              TO "inviteEmailSentAt";
ALTER TABLE "Interview" RENAME COLUMN "expiresAt"                 TO "inviteLinkExpiresAt";
ALTER TABLE "Interview" RENAME COLUMN "status"                    TO "interviewStatus";
ALTER TABLE "Interview" RENAME COLUMN "startedAt"                 TO "interviewStartedAt";
ALTER TABLE "Interview" RENAME COLUMN "completedAt"               TO "interviewCompletedAt";
ALTER TABLE "Interview" RENAME COLUMN "interviewTranscript"       TO "fullTranscript";
ALTER TABLE "Interview" RENAME COLUMN "createdAt"                 TO "interviewCreatedAt";
ALTER TABLE "Interview" RENAME COLUMN "updatedAt"                 TO "interviewUpdatedAt";
ALTER TABLE "Interview" RENAME COLUMN "interviewDuration"         TO "durationInSeconds";
ALTER TABLE "Interview" RENAME COLUMN "snapshots"                 TO "proctoringSnapshotUrls";
ALTER TABLE "Interview" RENAME COLUMN "candidateFeedback"         TO "candidateFeedbackText";
ALTER TABLE "Interview" RENAME COLUMN "candidateRating"           TO "candidateSelfRating";
ALTER TABLE "Interview" RENAME COLUMN "billingSnapshot"           TO "billingSnapshotAtCompletion";
ALTER TABLE "Interview" RENAME COLUMN "integritySignals"          TO "proctoringEvents";
ALTER TABLE "Interview" RENAME COLUMN "signalAnalysis"            TO "proctoringAnalysis";
ALTER TABLE "Interview" RENAME COLUMN "questionByQuestionAnalysis" TO "perQuestionAnalysis";
ALTER TABLE "Interview" RENAME COLUMN "recording"                 TO "sessionRecording";
ALTER TABLE "Interview" RENAME COLUMN "linkStatus"                TO "inviteLinkStatus";
ALTER TABLE "Interview" RENAME COLUMN "skillRatings"              TO "aiSkillRatings";
ALTER TABLE "Interview" RENAME COLUMN "interviewSummary"          TO "aiInterviewSummary";
ALTER TABLE "Interview" RENAME COLUMN "scoreBreakdown"            TO "aiScoreBreakdown";
ALTER TABLE "Interview" RENAME COLUMN "scheduledAt"               TO "interviewScheduledAt";
ALTER TABLE "Interview" RENAME COLUMN "timezone"                  TO "interviewTimezone";
ALTER TABLE "Interview" RENAME COLUMN "isTest"                    TO "isTestSession";
ALTER TABLE "Interview" RENAME COLUMN "testBillingMetrics"        TO "testSessionBillingMetrics";
ALTER TABLE "Interview" RENAME COLUMN "interviewBrief"            TO "aiInterviewBrief";

-- SupportTicket
ALTER TABLE "SupportTicket" RENAME COLUMN "name"        TO "reporterName";
ALTER TABLE "SupportTicket" RENAME COLUMN "email"       TO "reporterEmail";
ALTER TABLE "SupportTicket" RENAME COLUMN "issueAbout"  TO "issueDescription";
ALTER TABLE "SupportTicket" RENAME COLUMN "status"      TO "ticketStatus";
ALTER TABLE "SupportTicket" RENAME COLUMN "resolvedAt"  TO "ticketResolvedAt";
ALTER TABLE "SupportTicket" RENAME COLUMN "createdAt"   TO "ticketCreatedAt";
ALTER TABLE "SupportTicket" RENAME COLUMN "updatedAt"   TO "ticketUpdatedAt";

-- AIVoice (formerly EngineVoice)
ALTER TABLE "AIVoice" RENAME COLUMN "name"        TO "voiceName";
ALTER TABLE "AIVoice" RENAME COLUMN "provider"    TO "voiceProvider";
ALTER TABLE "AIVoice" RENAME COLUMN "model"       TO "voiceModel";
ALTER TABLE "AIVoice" RENAME COLUMN "description" TO "voiceDescription";
ALTER TABLE "AIVoice" RENAME COLUMN "gender"      TO "voiceGender";
ALTER TABLE "AIVoice" RENAME COLUMN "tags"        TO "voiceTags";
ALTER TABLE "AIVoice" RENAME COLUMN "isActive"    TO "isAvailable";
ALTER TABLE "AIVoice" RENAME COLUMN "isBuiltIn"   TO "isSystemDefault";
ALTER TABLE "AIVoice" RENAME COLUMN "createdAt"   TO "voiceCreatedAt";
ALTER TABLE "AIVoice" RENAME COLUMN "updatedAt"   TO "voiceUpdatedAt";

COMMIT;

-- ================================================================
-- PHASE 3 (best-effort): Rename constraints and indexes
-- ================================================================
-- These align internal constraint/index names with what Prisma now
-- expects. Failures are silently swallowed — they do NOT affect
-- data integrity. Run these even if some fail.

-- OrganizationDetails (was Organization)
DO $$ BEGIN ALTER TABLE "OrganizationDetails" RENAME CONSTRAINT "Organization_pkey" TO "OrganizationDetails_pkey"; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "OrganizationDetails" RENAME CONSTRAINT "Organization_slug_key" TO "OrganizationDetails_urlSlug_key"; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER INDEX "Organization_status_idx"    RENAME TO "OrganizationDetails_orgStatus_idx"; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER INDEX "Organization_createdAt_idx" RENAME TO "OrganizationDetails_orgCreatedAt_idx"; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- OrganizationCredentials (was User)
DO $$ BEGIN ALTER TABLE "OrganizationCredentials" RENAME CONSTRAINT "User_pkey"       TO "OrganizationCredentials_pkey"; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "OrganizationCredentials" RENAME CONSTRAINT "User_email_key"  TO "OrganizationCredentials_email_key"; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "OrganizationCredentials" RENAME CONSTRAINT "User_orgId_fkey" TO "OrganizationCredentials_organizationId_fkey"; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- AIVoice (was EngineVoice)
DO $$ BEGIN ALTER TABLE "AIVoice" RENAME CONSTRAINT "EngineVoice_pkey" TO "AIVoice_pkey"; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER INDEX "EngineVoice_isActive_idx"   RENAME TO "AIVoice_isAvailable_idx"; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER INDEX "EngineVoice_provider_idx"   RENAME TO "AIVoice_voiceProvider_idx"; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Job (column renames affect FK and index names; table name was already Job)
DO $$ BEGIN ALTER TABLE "Job" RENAME CONSTRAINT "Job_creatorId_fkey" TO "Job_createdByCredentialId_fkey"; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Job" RENAME CONSTRAINT "Job_orgId_fkey"     TO "Job_organizationId_fkey"; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER INDEX "Job_orgId_idx"           RENAME TO "Job_organizationId_idx"; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER INDEX "Job_orgId_createdAt_idx"  RENAME TO "Job_organizationId_jobCreatedAt_idx"; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Application (column renames affect index names)
DO $$ BEGIN ALTER INDEX "Application_jobId_resumeStatus_updatedAt_idx" RENAME TO "Application_jobId_resumeScreeningStatus_applicationUpdatedAt_idx"; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER INDEX "Application_jobId_aiScore_updatedAt_idx"      RENAME TO "Application_jobId_resumeAiScore_applicationUpdatedAt_idx"; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER INDEX "Application_createdAt_idx"                    RENAME TO "Application_appliedAt_idx"; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER INDEX "Application_updatedAt_idx"                    RENAME TO "Application_applicationUpdatedAt_idx"; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Interview (column renames affect index names)
DO $$ BEGIN ALTER INDEX "Interview_status_idx"              RENAME TO "Interview_interviewStatus_idx"; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER INDEX "Interview_status_completedAt_idx"  RENAME TO "Interview_interviewStatus_interviewCompletedAt_idx"; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER INDEX "Interview_status_updatedAt_idx"    RENAME TO "Interview_interviewStatus_interviewUpdatedAt_idx"; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER INDEX "Interview_updatedAt_idx"           RENAME TO "Interview_interviewUpdatedAt_idx"; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER INDEX "Interview_isTest_idx"              RENAME TO "Interview_isTestSession_idx"; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- SupportTicket (column renames affect index names)
DO $$ BEGIN ALTER INDEX "SupportTicket_status_createdAt_idx"     RENAME TO "SupportTicket_ticketStatus_ticketCreatedAt_idx"; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER INDEX "SupportTicket_interviewId_createdAt_idx" RENAME TO "SupportTicket_interviewId_ticketCreatedAt_idx"; EXCEPTION WHEN OTHERS THEN NULL; END $$;
