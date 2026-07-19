"use client";

// Client-side counterpart to lib/slack-error-logger.ts. Posts to
// /api/log-client-error, which alerts Slack the same way API routes do.
// Covers: uncaught exceptions, unhandled promise rejections (both installed
// globally in ClientErrorBoundary below), and explicit reports from
// component catch blocks (modals, delete/create actions, etc via reportClientError).

let installed = false;

function post(message: string, stack?: string, source?: string, context?: Record<string, any>) {
    try {
        fetch("/api/log-client-error", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            keepalive: true,
            body: JSON.stringify({
                message,
                stack,
                source,
                url: typeof window !== "undefined" ? window.location.href : undefined,
                context,
            }),
        }).catch(() => {});
    } catch {
        // never let error reporting break the app
    }
}

export function reportClientError(error: unknown, context?: { action?: string; [key: string]: any }) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    post(message, stack, context?.action || "manual", context);
}

export function installGlobalErrorReporting() {
    if (installed || typeof window === "undefined") return;
    installed = true;

    window.addEventListener("error", (event) => {
        post(event.message || "Uncaught error", event.error?.stack, "window.onerror");
    });

    window.addEventListener("unhandledrejection", (event) => {
        const reason = event.reason;
        const message = reason instanceof Error ? reason.message : String(reason);
        const stack = reason instanceof Error ? reason.stack : undefined;
        post(message, stack, "unhandledrejection");
    });
}
