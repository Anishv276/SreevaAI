# Phase 5: Automated Communication & Recruitment Notifications

This module handles the automated delivery of status updates and personalized interview links to candidates based on their AI screening results.

## 1. How this works
The **Automated Communication** module acts as the bridge between AI analysis and candidate interaction. Once the background worker finishes scoring a candidate, it automatically triggers an email notification. Shortlisted candidates receive a "Congratulations" email with a secure link to their interview session, while others receive a professional rejection notice.

## 2. Technical Flow
1. **Trigger**: The background worker (`worker.ts`) completes the scoring process.
2. **Status Determination**:
   - Depending on whether the score meets the drive's threshold, the system sets the status to either `ACCEPTED` (Shortlisted) or `REJECTED`.
3. **Interview Invite Preparation (Conditional)**:
   - If accepted, the system creates or refreshes an `Interview` record in the database.
   - A unique `accessToken` and a 48-hour expiration window are assigned to the interview session.
4. **Email Dispatch**:
   - The system calls the `sendApplicationStatusEmail` function.
   - For accepted candidates, the email includes a call-to-action (CTA) button linking to: `https://[domain]/interview/[applicationId]?token=[accessToken]`.
5. **Security logic**: Access tokens are single-use/session-based to ensure test integrity.

## 3. Tech Stack
- **Email Service**: Resend API.
- **Backend Trigger**: Node.js Worker (`worker.ts`).
- **Templating**: Dynamic HTML templates with inline styles (for cross-client compatibility).
- **Security**: UUID-based access tokens for interview security.

## 4. Tools & Open-Source Models
- **Resend SDK**: For reliable transactional email delivery.

## 5. Related Code (File Map)
- **Email Service**:
  - `lib/mail.ts` [Line 6-69] - Core logic for sending acceptance and rejection emails using the Resend API.
- **Worker Logic (Trigger)**:
  - `worker.ts` [Line 115-117] - Dynamic import of the mail library in the worker.
  - `worker.ts` - Logic for choosing the email type and providing the interview link based on job status.
- **Interview Record Creation**:
  - `worker.ts` - Creating/updating the `Interview` entry in the DB with its auto-generated token.
- **Environment Configuration**:
  - `.env` - `RESEND_API_KEY` and `FROM_EMAIL` configuration.
