    "use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SuperAdminSettingsPage() {
    const router = useRouter();
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccess("");

        if (newPassword !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch("/api/auth/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword, newPassword }),
            });

            const data = await res.json();
            if (!res.ok) {
                setError(data.error || "Update failed");
                return;
            }

            setSuccess("Password updated successfully!");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch {
            setError("Connection error. Try again.");
        } finally {
            setLoading(false);
        }
    };

    const PasswordToggle = ({ visible, setVisible }: { visible: boolean; setVisible: (v: boolean) => void }) => (
        <button
            type="button"
            onClick={() => setVisible(!visible)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-[10px] font-black uppercase tracking-widest transition-colors"
        >
            {visible ? "Hide" : "Show"}
        </button>
    );

    return (
        <div className="p-8 max-w-2xl text-gray-900">
            {/* Header */}
            <div className="mb-10">
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Account Settings</h1>
                <p className="text-gray-400 font-bold mt-1 uppercase tracking-widest text-[10px]">Manage your administrator credentials.</p>
            </div>

            <div className="bg-white border border-gray-100 rounded-[2.5rem] p-8 lg:p-12 space-y-10 shadow-sm">
                <div className="space-y-2">
                    <h2 className="text-xl font-black text-gray-900 tracking-tight">Security</h2>
                    <p className="text-gray-400 text-sm font-medium">Update your password to keep your account secure.</p>
                </div>

                <form onSubmit={handleUpdate} className="grid grid-cols-1 gap-8">
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-[#F97316] uppercase tracking-[0.2em]">Current Password</label>
                        <div className="relative">
                            <input
                                type={showCurrent ? "text" : "password"}
                                value={currentPassword}
                                onChange={e => setCurrentPassword(e.target.value)}
                                placeholder="Confirm current password"
                                required
                                className="w-full h-14 px-6 pr-16 bg-gray-50 border border-gray-100 rounded-2xl text-gray-900 placeholder-gray-400 text-sm font-bold outline-none focus:border-[#F97316]/50 focus:bg-white transition-all shadow-sm"
                            />
                            <PasswordToggle visible={showCurrent} setVisible={setShowCurrent} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-[#F97316] uppercase tracking-[0.2em]">New Password</label>
                            <div className="relative">
                                <input
                                    type={showNew ? "text" : "password"}
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    placeholder="New password"
                                    required
                                    className="w-full h-14 px-6 pr-16 bg-gray-50 border border-gray-100 rounded-2xl text-gray-900 placeholder-gray-400 text-sm font-bold outline-none focus:border-[#F97316]/50 focus:bg-white transition-all shadow-sm"
                                />
                                <PasswordToggle visible={showNew} setVisible={setShowNew} />
                            </div>
                        </div>
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-[#F97316] uppercase tracking-[0.2em]">Confirm Password</label>
                            <div className="relative">
                                <input
                                    type={showConfirm ? "text" : "password"}
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    placeholder="Final confirmation"
                                    required
                                    className="w-full h-14 px-6 pr-16 bg-gray-50 border border-gray-100 rounded-2xl text-gray-900 placeholder-gray-400 text-sm font-bold outline-none focus:border-[#F97316]/50 focus:bg-white transition-all shadow-sm"
                                />
                                <PasswordToggle visible={showConfirm} setVisible={setShowConfirm} />
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="p-5 rounded-2xl bg-red-50 border border-red-100 text-red-600 text-[13px] font-bold animate-shake">
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className="p-5 rounded-2xl bg-green-50 border border-green-100 text-green-600 text-[13px] font-bold">
                            {success}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full h-14 rounded-2xl bg-gray-900 text-white font-black text-xs uppercase tracking-widest shadow-xl hover:bg-[#F97316] transition-all hover:-translate-y-1 active:scale-95 disabled:opacity-50 disabled:transform-none"
                    >
                        {loading ? "SAVING CHANGES..." : "UPDATE SECURITY CREDENTIALS"}
                    </button>
                </form>
            </div>
        </div>
    );
}
