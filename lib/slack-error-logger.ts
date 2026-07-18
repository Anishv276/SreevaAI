/**
 * slack-error-logger.ts
 * Structured error alerting to Slack for all error categories:
 * - Login failures / successes
 * - Resume upload failures
 * - LiveKit session failures
 * - Job operations
 * - General API errors
 *
 * Wire this into Next.js route handlers with try/catch:
 *   try { ... } catch (e) { await alertError(e, { type: 'login', orgName, reason }) }
 */

export interface ErrorAlert {
  type: 'login' | 'resume_upload' | 'livekit' | 'job' | 'api' | 'database' | 'interview' | 'tts' | 'stt' | 'llm' | 'redis' | 'worker';
  orgName?: string;
  jobName?: string;
  candidateName?: string;
  userId?: string;
  error: Error | string;
  reason?: string;
  context?: Record<string, any>;
  timestamp?: Date;
}

const SLACK_ERROR_WEBHOOK = process.env.SLACK_ERROR_WEBHOOK_URL || '';
const SLACK_ERROR_CHANNEL = process.env.SLACK_ERROR_CHANNEL || '#debug-alerts';

// Dedup: same (type, error message) within this window posts once immediately,
// then repeats are counted and flushed as a single "happened N times" summary
// when the window closes, instead of spamming one Slack message per occurrence.
const DEDUP_WINDOW_MS = 10 * 60 * 1000;
type DedupEntry = { count: number; firstAlert: ErrorAlert; timer: ReturnType<typeof setTimeout> };
const dedupCache = new Map<string, DedupEntry>();

function dedupKey(alert: ErrorAlert): string {
  const msg = alert.error instanceof Error ? alert.error.message : String(alert.error);
  return `${alert.type}:${msg}`;
}

async function sendToSlack(alert: ErrorAlert, repeatCount?: number): Promise<void> {
  try {
    const message = buildErrorMessage(alert);
    const suffix = repeatCount ? `\n\n🔁 *This error happened ${repeatCount} times in the last 10 minutes.*` : '';

    const payload = {
      channel: SLACK_ERROR_CHANNEL,
      text: `${alert.type.toUpperCase()} ERROR`,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: message + suffix } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `Error logged at ${new Date().toISOString()}` }] },
      ],
    };

    const response = await fetch(SLACK_ERROR_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error('[SLACK_ERROR_LOG] Failed to send to Slack:', response.statusText);
    }
  } catch (e) {
    console.error('[SLACK_ERROR_LOG] Exception sending error alert:', e);
  }
}

type ErrorEmoji = {
  [key: string]: string;
};

const TYPE_EMOJIS: ErrorEmoji = {
  login: '🔐',
  resume_upload: '📄',
  livekit: '🎙️',
  job: '💾',
  api: '⚠️',
  database: '🗄️',
  interview: '🎤',
  tts: '🔊',
  stt: '🎧',
  llm: '🧠',
  redis: '🟥',
  worker: '⚙️',
};

function formatTimestamp(date: Date): string {
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function buildErrorMessage(alert: ErrorAlert): string {
  const emoji = TYPE_EMOJIS[alert.type] || '❌';
  const timestamp = alert.timestamp ? formatTimestamp(alert.timestamp) : new Date().toISOString();

  const errorMsg = alert.error instanceof Error ? alert.error.message : String(alert.error);
  const errorStack = alert.error instanceof Error ? alert.error.stack : '';

  let details = `\`\`\`\n=======\n\`\`\`\n`;
  details += `${emoji} **${alert.type.toUpperCase()} ERROR**\n`;
  details += `_${timestamp}_\n\n`;

  if (alert.orgName) details += `🏢 **Org:** ${alert.orgName}\n`;
  if (alert.jobName) details += `💾 **Job:** ${alert.jobName}\n`;
  if (alert.candidateName) details += `👤 **Candidate:** ${alert.candidateName}\n`;
  if (alert.userId) details += `👨‍💼 **User ID:** ${alert.userId}\n`;

  details += `\n**Error Message:**\n\`\`\`\n${errorMsg}\n\`\`\`\n`;

  if (alert.reason) {
    details += `\n**Reason/Context:**\n${alert.reason}\n`;
  }

  if (alert.context && Object.keys(alert.context).length > 0) {
    details += `\n**Additional Context:**\n`;
    for (const [key, value] of Object.entries(alert.context)) {
      const val = typeof value === 'object' ? JSON.stringify(value) : String(value);
      details += `• **${key}:** ${val}\n`;
    }
  }

  if (errorStack && errorStack.length < 500) {
    details += `\n**Stack Trace:**\n\`\`\`\n${errorStack.split('\n').slice(0, 5).join('\n')}\n\`\`\`\n`;
  }

  details += `\n\`\`\`\n=======\n\`\`\`\n`;

  return details;
}

export async function alertError(alert: ErrorAlert): Promise<void> {
  if (!SLACK_ERROR_WEBHOOK) {
    console.error('[ERROR_LOG] Slack webhook not configured. Error:', alert.error);
    return;
  }

  const key = dedupKey(alert);
  const existing = dedupCache.get(key);

  if (existing) {
    existing.count += 1;
    return; // suppressed -- counted, flushed as a summary when the window closes
  }

  dedupCache.set(key, {
    count: 1,
    firstAlert: alert,
    timer: setTimeout(async () => {
      const entry = dedupCache.get(key);
      dedupCache.delete(key);
      if (entry && entry.count > 1) {
        await sendToSlack(entry.firstAlert, entry.count);
      }
    }, DEDUP_WINDOW_MS),
  });

  await sendToSlack(alert);
}

/**
 * Wrapper for login errors -- logs both success and failure
 */
export async function logLoginAttempt(params: {
  userId: string;
  email: string;
  success: boolean;
  error?: Error | string;
  reason?: string;
}): Promise<void> {
  if (!params.success) {
    await alertError({
      type: 'login',
      userId: params.userId,
      error: params.error || 'Login failed',
      reason: params.reason || 'Authentication credentials invalid or service unavailable',
      context: { email: params.email },
      timestamp: new Date(),
    });
  } else {
    console.log(`[LOGIN] User ${params.userId} (${params.email}) logged in successfully`);
  }
}

/**
 * Wrapper for resume upload errors
 */
export async function logResumeUploadError(params: {
  orgName: string;
  jobName: string;
  candidateName?: string;
  fileSize?: number;
  error: Error | string;
  reason?: string;
}): Promise<void> {
  await alertError({
    type: 'resume_upload',
    orgName: params.orgName,
    jobName: params.jobName,
    candidateName: params.candidateName,
    error: params.error,
    reason: params.reason || 'Resume upload processing failed',
    context: { fileSize: params.fileSize },
    timestamp: new Date(),
  });
}

/**
 * Wrapper for LiveKit errors
 */
export async function logLiveKitError(params: {
  orgName?: string;
  applicationId?: string;
  candidateName?: string;
  error: Error | string;
  reason?: string;
  phase?: string; // 'connection', 'recording', 'transcription', etc.
}): Promise<void> {
  await alertError({
    type: 'livekit',
    orgName: params.orgName,
    candidateName: params.candidateName,
    error: params.error,
    reason: params.reason || 'LiveKit session failed',
    context: {
      applicationId: params.applicationId,
      phase: params.phase,
    },
    timestamp: new Date(),
  });
}

/**
 * Wrapper for job operations (create, update, delete)
 */
export async function logJobError(params: {
  orgName: string;
  jobName: string;
  operation: 'create' | 'update' | 'delete' | 'list' | 'upload_jd';
  error: Error | string;
  reason?: string;
}): Promise<void> {
  await alertError({
    type: 'job',
    orgName: params.orgName,
    jobName: params.jobName,
    error: params.error,
    reason: params.reason || `Job ${params.operation} operation failed`,
    context: { operation: params.operation },
    timestamp: new Date(),
  });
}

/**
 * Wrapper for TTS provider errors
 */
export async function logTTSError(params: {
  orgName?: string;
  jobName?: string;
  candidateName?: string;
  provider: string; // elevenlabs, sarvam, etc.
  error: Error | string;
  reason?: string;
}): Promise<void> {
  await alertError({
    type: 'tts',
    orgName: params.orgName,
    jobName: params.jobName,
    candidateName: params.candidateName,
    error: params.error,
    reason: params.reason || 'TTS provider failed',
    context: { provider: params.provider },
    timestamp: new Date(),
  });
}

/**
 * Wrapper for STT provider errors
 */
export async function logSTTError(params: {
  orgName?: string;
  jobName?: string;
  candidateName?: string;
  provider: string; // deepgram, etc.
  error: Error | string;
  reason?: string;
}): Promise<void> {
  await alertError({
    type: 'stt',
    orgName: params.orgName,
    jobName: params.jobName,
    candidateName: params.candidateName,
    error: params.error,
    reason: params.reason || 'STT provider failed',
    context: { provider: params.provider },
    timestamp: new Date(),
  });
}

/**
 * Wrapper for LLM provider errors
 */
export async function logLLMError(params: {
  orgName?: string;
  jobName?: string;
  candidateName?: string;
  provider: string; // openai, etc.
  error: Error | string;
  reason?: string;
}): Promise<void> {
  await alertError({
    type: 'llm',
    orgName: params.orgName,
    jobName: params.jobName,
    candidateName: params.candidateName,
    error: params.error,
    reason: params.reason || 'LLM call failed',
    context: { provider: params.provider },
    timestamp: new Date(),
  });
}

/**
 * Wrapper for Redis errors
 */
export async function logRedisError(params: {
  error: Error | string;
  reason?: string;
  context?: Record<string, any>;
}): Promise<void> {
  await alertError({
    type: 'redis',
    error: params.error,
    reason: params.reason || 'Redis connection/operation failed',
    context: params.context,
    timestamp: new Date(),
  });
}

/**
 * Wrapper for background worker/job errors
 */
export async function logWorkerError(params: {
  error: Error | string;
  reason?: string;
  context?: Record<string, any>;
}): Promise<void> {
  await alertError({
    type: 'worker',
    error: params.error,
    reason: params.reason || 'Background worker job failed',
    context: params.context,
    timestamp: new Date(),
  });
}

/**
 * Wrapper for generic API errors
 */
export async function logAPIError(params: {
  route: string;
  method: string;
  statusCode?: number;
  error: Error | string;
  userId?: string;
  orgName?: string;
}): Promise<void> {
  await alertError({
    type: 'api',
    userId: params.userId,
    orgName: params.orgName,
    error: params.error,
    reason: `API error on ${params.method} ${params.route}`,
    context: {
      route: params.route,
      method: params.method,
      statusCode: params.statusCode,
    },
    timestamp: new Date(),
  });
}

/**
 * One-liner for route handler catch blocks: logs to console, alerts Slack
 * (via the same dedup path as alertError), and returns the NextResponse --
 * so `catch (error) { console.error(...); return NextResponse.json(...) }`
 * becomes `catch (error) { return apiErrorResponse(...) }`.
 *
 * Only call this for real failures (5xx) -- expected 4xx (validation, auth,
 * not-found) should keep returning NextResponse.json directly, not go through
 * here, or Slack fills up with routine client errors.
 */
export async function apiErrorResponse(params: {
  route: string;
  method: string;
  error: unknown;
  body: Record<string, any>;
  status?: number;
  logLabel?: string;
}): Promise<Response> {
  const { NextResponse } = await import('next/server');
  console.error(params.logLabel || `[${params.method} ${params.route}]`, params.error);
  await logAPIError({
    route: params.route,
    method: params.method,
    statusCode: params.status ?? 500,
    error: params.error instanceof Error ? params.error : String(params.error),
  });
  return NextResponse.json(params.body, { status: params.status ?? 500 });
}
