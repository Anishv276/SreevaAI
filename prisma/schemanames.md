# Schema Rename Log

Renames applied in commit `c5d2c79` (Db changes with code). Only 3 models touched;
`Job`, `Application`, `Interview`, `SupportTicket`, `EngineVoice` are unchanged in name
(some got fields renamed as a side effect of the model renames below).

## Model renames

| Old name       | New name                 |
|----------------|---------------------------|
| `Organization` | `OrganizationDetails`     |
| `User`         | `OrganizationCredentials` |
| `Drive`        | `Job`                     |

## Field renames

### Organization → OrganizationDetails
| Old field                | New field                  |
|---------------------------|-----------------------------|
| `slug`                    | `urlSlug`                   |
| `plan`                     | `billingPlan`               |
| `maxActiveDrives`          | `maxActiveJobs`              |
| `maxConcurrentSlots`       | `maxConcurrentInterviews`    |
| `proctoringSignals`        | `enabledProctoringSignals`   |
| `status`                   | `orgStatus`                  |
| `createdAt`                | `orgCreatedAt`               |
| `updatedAt`                | `orgUpdatedAt`                |
| `onboardingComplete`       | `isOnboardingComplete`        |
| `voiceId`                  | `defaultVoiceId`              |
| `allowedVoices`            | `allowedVoiceIds`             |
| `interviewQuotaTotal`      | `totalInterviewsAllowed`      |
| `interviewQuotaUsed`       | `totalInterviewsUsed`         |
| `creditsUsed`               | `billingCreditsUsed`         |
| `statusControl`            | `quotaControlMode`            |
| `usageMetrics`             | `platformUsageMetrics`        |
| `recordingEnabled`         | `isRecordingEnabled`          |
| `recordingRetentionDays`   | `recordingKeepForDays`        |
| `drives`                   | `jobs`                        |
| `users`                    | `organizationCredentials`     |

### SuperAdmin
| Old field         | New field                  |
|---------------------|-----------------------------|
| `resetOtp`           | `passwordResetOtp`          |
| `resetOtpExpires`    | `passwordResetOtpExpiresAt` |
| `createdAt`          | `accountCreatedAt`          |
| `updatedAt`          | `accountUpdatedAt`          |

### User → OrganizationCredentials
| Old field         | New field                  |
|---------------------|-----------------------------|
| `createdAt`          | `accountCreatedAt`          |
| `updatedAt`          | `accountUpdatedAt`          |
| `role`               | `platformRole`              |
| `orgId`              | `organizationId`            |
| `resetOtp`           | `passwordResetOtp`          |
| `resetOtpExpires`    | `passwordResetOtpExpiresAt` |
| `drives`             | `jobs`                      |
| relation `"CreatedDrives"` | relation `"CreatedJobs"` |

### Drive → Job
No field renames — only the model itself was renamed (`Drive` → `Job`).
Relation to creator updated to point at `OrganizationCredentials` instead of `User`.

### Application
| Old field | New field |
|-----------|-----------|
| `driveId` | `jobId`   |
| `drive`   | `job`     |
