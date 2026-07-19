"use client";

import { Component, type ReactNode, useEffect } from "react";
import { installGlobalErrorReporting, reportClientError } from "@/lib/client-error-reporter";

function GlobalErrorListeners() {
    useEffect(() => {
        installGlobalErrorReporting();
    }, []);
    return null;
}

class ErrorBoundaryInner extends Component<{ children: ReactNode }, { hasError: boolean }> {
    state = { hasError: false };

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error: Error) {
        reportClientError(error, { action: "react_render" });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center p-8 text-center">
                    <div>
                        <p className="text-lg font-semibold text-slate-900">Something went wrong.</p>
                        <p className="text-slate-500 mt-1">Please refresh the page. Our team has been notified.</p>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

export default function ClientErrorBoundary({ children }: { children: ReactNode }) {
    return (
        <ErrorBoundaryInner>
            <GlobalErrorListeners />
            {children}
        </ErrorBoundaryInner>
    );
}
