# Schema Rename Reference

This document lists all proposed renames for the Prisma schema — from current names (that are hard to understand) to clearer, beginner-friendly names.

> **Status:** Pending implementation. These changes have NOT been applied to the database yet.

---

## Model Renames

| Current Model Name | Proposed Model Name | Reason |
|---|---|---|
| `Drive` | `JobPosting` | "Drive" is internal jargon — it's actually a job posting / hiring campaign |
| `EngineVoice` | `AIVoice` | "Engine" is internal jargon — these are AI voices available in the system |

---

## Field Renames by Model

### `Organization`

| Current Field | Proposed Field | Reason |
|---|---|---|
| `slug` | `urlSlug` | Makes clear it's used in URLs |
| `plan` | `billingPlan` | "plan" alone is vague |
| `maxActiveDrives` | `maxActiveJobPostings` | "Drives" is internal jargon |
| `maxConcurrentSlots` | `maxConcurrentInterviews` | Plain English |
| `proctoringSignals` | `enabledProctoringSignals` | Clarifies these are on/off toggles |
| `status` | `orgStatus` | Scoped so it's not confused with other status fields |
| `createdAt` | `orgCreatedAt` | What was created? The org |
| `updatedAt` | `orgUpdatedAt` | Same |
| `onboardingComplete` | `isOnboardingComplete` | Boolean clarity |
| `sttModel` | `speechToTextModel` | Spelled out fully |
| `ttsProvider` | `textToSpeechProvider` | Spelled out fully |
| `ttsModel` | `textToSpeechModel` | Spelled out fully |
| `voiceId` | `defaultVoiceId` | It's the default voice for the whole org |
| `allowedVoices` | `allowedVoiceIds` | Clarifies it's a list of voice IDs |
| `llmResumeExtraction` | `llmModelResumeExtraction` | Consistent `llmModel*` prefix across all model-selection fields |
| `llmJdExtraction` | `llmModelJdExtraction` | Same |
| `llmResumeReport` | `llmModelResumeReport` | Same |
| `llmInterviewLive` | `llmModelInterviewLive` | Same |
| `llmInterviewEval` | `llmModelInterviewEval` | Same |
| `llmInterviewBrief` | `llmModelInterviewBrief` | Same |
| `llmInterviewReport` | `llmModelInterviewReport` | Same |
| `interviewQuotaTotal` | `totalInterviewsAllowed` | Plain English |
| `interviewQuotaUsed` | `totalInterviewsUsed` | Plain English |
| `creditsUsed` | `billingCreditsUsed` | Scoped to billing |
| `statusControl` | `quotaControlMode` | Explains what this field actually controls |
| `usageMetrics` | `platformUsageMetrics` | Scoped to platform |
| `recordingEnabled` | `isRecordingEnabled` | Boolean fields read better as `is/has/can` |
| `recordingRetentionDays` | `recordingKeepForDays` | Plain English |
| `isDeleted` | `isDeleted` | No change — already clear (soft-delete flag) |

---

### `SuperAdmin`

| Current Field | Proposed Field | Reason |
|---|---|---|
| `resetOtp` | `passwordResetOtp` | What is the OTP resetting? The password |
| `resetOtpExpires` | `passwordResetOtpExpiresAt` | Makes clear it's a timestamp of expiry |
| `createdAt` | `accountCreatedAt` | What was created? The admin account |
| `updatedAt` | `accountUpdatedAt` | Same |
| `isDeleted` | `isDeleted` | No change — already clear |

---

### `User`

| Current Field | Proposed Field | Reason |
|---|---|---|
| `role` | `platformRole` | Distinguishes from org roles |
| `orgId` | `organizationId` | Spelled out fully |
| `createdAt` | `accountCreatedAt` | What was created? The user account |
| `updatedAt` | `accountUpdatedAt` | Same |
| `resetOtp` | `passwordResetOtp` | What is the OTP for? Password reset |
| `resetOtpExpires` | `passwordResetOtpExpiresAt` | Makes clear it's a timestamp |
| `isDeleted` | `isDeleted` | No change — already clear |

---

### `Drive` → (model renamed to `JobPosting`)

| Current Field | Proposed Field | Reason |
|---|---|---|
| `role` | `jobRole` | "role" alone is ambiguous |
| `screeningThreshold` | `aiScorePassThreshold` | What threshold? The AI screening pass score |
| `creatorId` | `createdByUserId` | Who created it? A user |
| `createdAt` | `jobPostingCreatedAt` | Scoped |
| `updatedAt` | `jobPostingUpdatedAt` | Scoped |
| `screeningCriteria` | `aiScreeningCriteria` | AI-based screening rules |
| `extractedDetails` | `jdExtractedDetails` | Extracted from the Job Description (JD) |
| `interviewQuestions` | `customInterviewQuestions` | "custom" clarifies these are recruiter-added questions |
| `jdFileName` | `jobDescriptionFileName` | Spelled out fully |
| `jdPreviewUrl` | `jobDescriptionPreviewUrl` | Spelled out fully |
| `orgId` | `organizationId` | Spelled out fully |
| `deadline` | `applicationDeadline` | Deadline for what? Applying |
| `aiName` | `aiInterviewerName` | The AI interviewer's display name |
| `voiceId` | `defaultVoiceId` | Default voice for this job posting |
| `interviewMode` | `jobPostingMode` | Scoped |
| `isDeleted` | `isDeleted` | No change — already clear |

---

### `Application`

| Current Field | Proposed Field | Reason |
|---|---|---|
| `resumeUrl` | `resumeFileUrl` | Clarifies it's a file URL |
| `aiScore` | `resumeAiScore` | Score from AI screening of the resume |
| `aiReport` | `resumeAiReport` | Report from AI screening |
| `createdAt` | `appliedAt` | Makes semantic sense — when did they apply |
| `updatedAt` | `applicationUpdatedAt` | Scoped |
| `resumeText` | `resumeRawText` | Raw extracted text from the resume |
| `resumeData` | `resumeParsedData` | Parsed/structured resume data |
| `driveId` | `jobPostingId` | After Drive → JobPosting rename |
| `resumeStatus` | `resumeScreeningStatus` | Screening status of the resume |
| `interviewStatus` | `interviewPhaseStatus` | Clarity |
| `fullScanReport` | `resumeFullScanReport` | Clarity |
| `fileName` | `resumeFileName` | Spelled out fully |
| `isDeleted` | `isDeleted` | No change — already clear |

---

### `Interview`

| Current Field | Proposed Field | Reason |
|---|---|---|
| `applicationId` | `applicationId` | No change — already clear |
| `accessToken` | `candidateInviteToken` | This token is what the candidate uses to join the interview |
| `inviteSentAt` | `inviteEmailSentAt` | What kind of invite? An email |
| `expiresAt` | `inviteLinkExpiresAt` | What expires? The invite link |
| `status` | `interviewStatus` | Scoped (consistent with other models) |
| `startedAt` | `interviewStartedAt` | Scoped |
| `completedAt` | `interviewCompletedAt` | Scoped |
| `interviewTranscript` | `fullTranscript` | "interview" prefix is redundant inside the Interview model |
| `createdAt` | `interviewCreatedAt` | Scoped |
| `updatedAt` | `interviewUpdatedAt` | Scoped |
| `interviewDuration` | `durationInSeconds` | Makes the unit explicit |
| `snapshots` | `proctoringSnapshotUrls` | Snapshots of what? Proctoring webcam screenshots |
| `candidateFeedback` | `candidateFeedbackText` | Type clarification |
| `candidateRating` | `candidateSelfRating` | Self-submitted rating by candidate |
| `billingSnapshot` | `billingMetricsSnapshot` | Clarifies it's a snapshot of billing metrics, not billing itself |
| `integritySignals` | `proctoringEvents` | Cheating/integrity detection events during interview |
| `signalAnalysis` | `proctoringAnalysis` | Analysis of proctoring events |
| `linkStatus` | `inviteLinkStatus` | What link? The candidate invite link |
| `questionByQuestionAnalysis` | `perQuestionAnalysis` | Plain English |
| `scoreBreakdown` | `aiScoreBreakdown` | Breakdown of the AI score |
| `interviewSummary` | `aiInterviewSummary` | Generated by AI |
| `recording` | `sessionRecording` | Recording of what? The interview session |
| `skillRatings` | `aiSkillRatings` | Rated by AI |
| `scheduledAt` | `interviewScheduledAt` | Scoped |
| `timezone` | `scheduledTimezone` | Clarifies it's the timezone the interview was scheduled in |
| `isDeleted` | `isDeleted` | No change — already clear |
| `isTest` | `isTestSession` | Clarity |
| `testBillingMetrics` | `testSessionBillingMetrics` | Scoped |
| `interviewBrief` | `aiInterviewBrief` | Pre-generated by AI (brief-generation worker, slot flow only) |

---

### `SupportTicket`

| Current Field | Proposed Field | Reason |
|---|---|---|
| `interviewId` | `interviewId` | No change — already clear |
| `applicationId` | `applicationId` | No change — already clear |
| `issueAbout` | `issueSummary` | "issueAbout" reads awkwardly |
| `status` | `ticketStatus` | Scoped |
| `createdAt` | `ticketCreatedAt` | Scoped |
| `updatedAt` | `ticketUpdatedAt` | Scoped |
| `resolvedAt` | `ticketResolvedAt` | Scoped |
| `isDeleted` | `isDeleted` | No change — already clear |

---

### `EngineVoice` → (model renamed to `AIVoice`)

| Current Field | Proposed Field | Reason |
|---|---|---|
| `provider` | `ttsProvider` | Clarifies it's the text-to-speech provider |
| `model` | `ttsModel` | Clarifies it's the text-to-speech model |
| `isActive` | `isAvailable` | More natural English |
| `isBuiltIn` | `isSystemDefault` | "Built-in" vs custom voice |
| `createdAt` | `voiceCreatedAt` | Scoped |
| `updatedAt` | `voiceUpdatedAt` | Scoped |
| `isDeleted` | `isDeleted` | No change — already clear |

---

## Summary Counts

| Category | Count |
|---|---|
| Model renames | 2 |
| Field renames | 88 |
| Fields kept as-is (already clear) | 12 |
| Total fields reviewed | 100 |

---

## Implementation Notes

When applying these renames:
1. Update `prisma/schema.prisma` with all new names
2. Run `prisma migrate dev --name descriptive-field-renames` to push to DB
3. Update all TypeScript files (API routes, `worker.ts`) that reference old field names
4. Update all Python files (`interview/agent_runtime.py`, `interview/agent_persistence.py`, etc.) that query these fields
5. Update any raw SQL queries or JSON key references
6. Update the async brief-generation worker's read/write of `interviewBrief` → `aiInterviewBrief`

> See `CLAUDE.md` for the full list of key files that will need updating.
