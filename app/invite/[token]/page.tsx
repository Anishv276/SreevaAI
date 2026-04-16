"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type InvitePayload = {
    id: string;
    email: string;
    role: "ADMIN" | "HR" | "TEAM";
    orgName: string;
    expiresAt: string;
    status: "PENDING";
};

export default function InviteAcceptPage() {
    const params = useParams<{ token: string }>();
    const router = useRouter();

    const token = useMemo(() => String(params?.token || ""), [params]);

    const [loading, setLoading] = useState(true);
    const [invite, setInvite] = useState<InvitePayload | null>(null);
    const [error, setError] = useState("");
    const [name, setName] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [rejected, setRejected] = useState(false);

    useEffect(() => {
        if (!token) return;

        const fetchInvite = async () => {
            setLoading(true);
            setError("");
            try {
                const res = await fetch(`/api/invitations/${encodeURIComponent(token)}`);
                const data = await res.json();

                if (!res.ok) {
                    setError(data.error || "Invitation is invalid or expired");
                    return;
                }

                setInvite(data);
            } catch {
                setError("Unable to load invitation");
            } finally {
                setLoading(false);
            }
        };

        fetchInvite();
    }, [token]);

    const handleAccept = async () => {
        if (!invite) return;
        if (!name.trim()) {
            setError("Name is required");
            return;
        }
        if (password.length < 8) {
            setError("Password must be at least 8 characters");
            return;
        }
        if (password !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        setSubmitting(true);
        setError("");

        try {
            const res = await fetch(`/api/invitations/${encodeURIComponent(token)}/accept`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), password }),
            });

            const data = await res.json();
            if (!res.ok) {
                setError(data.error || "Failed to accept invitation");
                return;
            }

            router.replace(data.redirectTo || "/admin");
        } catch {
            setError("Unable to accept invitation right now");
        } finally {
            setSubmitting(false);
        }
    };

    const handleReject = async () => {
        if (!invite) return;
        setSubmitting(true);
        setError("");

        try {
            const res = await fetch(`/api/invitations/${encodeURIComponent(token)}/reject`, {
                method: "POST",
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || "Failed to reject invitation");
                return;
            }
            setRejected(true);
        } catch {
            setError("Unable to reject invitation right now");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F7F6F3] flex items-center justify-center px-4 py-10">
            <div className="w-full max-w-xl bg-white border border-gray-100 rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.05)] p-8">
                <h1 className="text-2xl font-black text-gray-900 tracking-tight">Team Invitation</h1>

                {loading ? (
                    <p className="mt-4 text-sm text-gray-500 font-bold">Loading invitation...</p>
                ) : error ? (
                    <div className="mt-5 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-600 text-sm font-bold">
                        {error}
                    </div>
                ) : rejected ? (
                    <div className="mt-5 p-4 rounded-2xl bg-gray-50 border border-gray-100 text-gray-700 text-sm font-bold">
                        Invitation rejected. You can close this tab.
                    </div>
                ) : invite ? (
                    <div className="mt-6 space-y-5">
                        <div className="p-4 rounded-2xl border border-gray-100 bg-gray-50/60">
                            <p className="text-xs text-gray-500 font-black uppercase tracking-widest">Organization</p>
                            <p className="text-sm text-gray-900 font-bold mt-1">{invite.orgName}</p>
                            <p className="text-xs text-gray-500 font-black uppercase tracking-widest mt-3">Role</p>
                            <p className="text-sm text-gray-900 font-bold mt-1">{invite.role}</p>
                            <p className="text-xs text-gray-500 font-black uppercase tracking-widest mt-3">Email</p>
                            <p className="text-sm text-gray-900 font-bold mt-1">{invite.email}</p>
                        </div>

                        <div className="space-y-3">
                            <input
                                type="text"
                                placeholder="Your full name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full h-11 px-4 rounded-xl border border-gray-200 focus:outline-none focus:border-orange-300"
                            />
                            <input
                                type="password"
                                placeholder="8+ chars (A, a, 1, @)"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full h-11 px-4 rounded-xl border border-gray-200 focus:outline-none focus:border-orange-300"
                            />
                            <input
                                type="password"
                                placeholder="Confirm password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full h-11 px-4 rounded-xl border border-gray-200 focus:outline-none focus:border-orange-300"
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={handleAccept}
                                disabled={submitting}
                                className="flex-1 h-11 rounded-xl bg-[#F97316] text-white font-black disabled:opacity-60"
                            >
                                {submitting ? "Processing..." : "Accept Invitation"}
                            </button>
                            <button
                                type="button"
                                onClick={handleReject}
                                disabled={submitting}
                                className="flex-1 h-11 rounded-xl bg-gray-100 text-gray-700 font-black disabled:opacity-60"
                            >
                                Reject
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
