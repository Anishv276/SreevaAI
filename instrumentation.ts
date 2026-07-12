// Global safety net: catches any server-side error Next.js sees that wasn't
// already routed to Slack by an explicit alertError()/log*Error() call --
// Route Handler throws, Server Component render errors, middleware errors.
// https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation#onrequesterror-optional
export async function register() {}

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return; // edge/middleware errors are reported separately by the platform
  const { alertError } = await import('./lib/slack-error-logger');
  await alertError({
    type: 'api',
    error: err instanceof Error ? err : String(err),
    reason: `Unhandled error on ${request.method} ${request.path}`,
  });
}
