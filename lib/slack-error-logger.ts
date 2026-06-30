/**
 * slack-error-logger.ts
 * Structured error alerting to Slack for all error categories:
 * - Login failures / successes
 * - Resume upload failures
 * - LiveKit session failures
 * - Drive operations
 * - General API errors
 *
 * Wire this into Next.js route handlers with try/catch:
 *   try { ... } catch (e) { await alertError(e, { type: 'login', orgName, reason }) }
 */

export interface ErrorAlert {
  type: 'login' | 'resume_upload' | 'livekit' | 'drive' | 'api' | 'database' | 'interview' | 'tts' | 'stt' | 'llm' | 'redis' | 'worker';
  orgName?: string;
  driveName?: string;
  candidateName?: string;
  userId?: string;
  error: Error | string;
  reason?: string;
  context?: Record<string, any>;
  timestamp?: Date;
}

const SLACK_ERROR_WEBHOOK = process.env.SLACK_ERROR_WEBHOOK_URL || '';
const SLACK_ERROR_CHANNEL = process.env.SLACK_ERROR_CHANNEL || '#debug-alerts';

type ErrorEmoji = {
  [key: string]: string;
};

const TYPE_EMOJIS: ErrorEmoji = {
  login: '🔐',
  resume_upload: '📄',
  livekit: '🎙️',
  drive: '💾',
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

  let details = `${emoji} **${alert.type.toUpperCase()} ERROR**\n`;
  details += `_${timestamp}_\n\n`;

  if (alert.orgName) details += `🏢 **Org:** ${alert.orgName}\n`;
  if (alert.driveName) details += `💾 **Drive:** ${alert.driveName}\n`;
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

  return details;
}

export async function alertError(alert: ErrorAlert): Promise<void> {
  if (!SLACK_ERROR_WEBHOOK) {
    console.error('[ERROR_LOG] Slack webhook not configured. Error:', alert.error);
    return;
  }

  try {
    const message = buildErrorMessage(alert);

    const payload = {
      channel: SLACK_ERROR_CHANNEL,
      text: `${alert.type.toUpperCase()} ERROR`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: message,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Error logged at ${new Date().toISOString()}`,
            },
          ],
        },
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

/**
 * Wrapper for login errors — logs both success and failure
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
  driveName: string;
  candidateName?: string;
  fileSize?: number;
  error: Error | string;
  reason?: string;
}): Promise<void> {
  await alertError({
    type: 'resume_upload',
    orgName: params.orgName,
    driveName: params.driveName,
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
 * Wrapper for drive operations (create, update, delete)
 */
export async function logDriveError(params: {
  orgName: string;
  driveName: string;
  operation: 'create' | 'update' | 'delete' | 'list' | 'upload_jd';
  error: Error | string;
  reason?: string;
}): Promise<void> {
  await alertError({
    type: 'drive',
    orgName: params.orgName,
    driveName: params.driveName,
    error: params.error,
    reason: params.reason || `Drive ${params.operation} operation failed`,
    context: { operation: params.operation },
    timestamp: new Date(),
  });
}

/**
 * Wrapper for TTS provider errors
 */
export async function logTTSError(params: {
  orgName?: string;
  driveName?: string;
  candidateName?: string;
  provider: string; // cartesia, elevenlabs, sarvam, etc.
  error: Error | string;
  reason?: string;
}): Promise<void> {
  await alertError({
    type: 'tts',
    orgName: params.orgName,
    driveName: params.driveName,
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
  driveName?: string;
  candidateName?: string;
  provider: string; // deepgram, etc.
  error: Error | string;
  reason?: string;
}): Promise<void> {
  await alertError({
    type: 'stt',
    orgName: params.orgName,
    driveName: params.driveName,
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
  driveName?: string;
  candidateName?: string;
  provider: string; // openai, etc.
  error: Error | string;
  reason?: string;
}): Promise<void> {
  await alertError({
    type: 'llm',
    orgName: params.orgName,
    driveName: params.driveName,
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
