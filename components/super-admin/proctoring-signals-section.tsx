"use client";

import { Activity } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

type SignalKey =
  | "tab_switch"
  | "camera_disabled"
  | "microphone_disabled"
  | "connection_lost"
  | "face_absence"
  | "multiple_faces"
  | "identity_mismatch"
  | "ownership_ambiguity"
  | "example_evasion"
  | "latency_mismatch"
  | "resume_claim_mismatch"
  | "ownership_clarified"
  | "example_given"
  | "strong_under_pressure"
  | "follow_up_collapse"
  | "duplicate_ip"
  | "depth_decay"
  | "complexity_latency_mismatch";

type ProctoringSignals = Record<SignalKey, boolean>;

type Group = {
  title: string;
  description: string;
  items: Array<{ key: SignalKey; label: string }>;
};

const SIGNAL_GROUPS: Group[] = [
  {
    title: "Browser and Session",
    description: "Signals that show the candidate is leaving the test or switching environments.",
    items: [
      { key: "tab_switch", label: "Tab Switch" },
      { key: "connection_lost", label: "Connection Lost" },
      { key: "duplicate_ip", label: "Duplicate IP" },
    ],
  },
  {
    title: "Device and Access",
    description: "Signals that indicate the camera, microphone, or device setup is not usable.",
    items: [
      { key: "camera_disabled", label: "Camera Disabled" },
      { key: "microphone_disabled", label: "Microphone Disabled" },
    ],
  },
  {
    title: "Face and Identity",
    description: "Signals used to verify the right person is present and behaving normally on camera.",
    items: [
      { key: "face_absence", label: "Face Absence" },
      { key: "multiple_faces", label: "Multiple Faces" },
      { key: "identity_mismatch", label: "Identity Mismatch" },
    ],
  },
  {
    title: "Ownership and Claim Checks",
    description: "Signals that question whether the candidate owns the resume or the response being discussed.",
    items: [
      { key: "ownership_ambiguity", label: "Ownership Ambiguity" },
      { key: "ownership_clarified", label: "Ownership Clarified" },
      { key: "resume_claim_mismatch", label: "Resume Claim Mismatch" },
    ],
  },
  {
    title: "Example and Evidence",
    description: "Signals that verify the candidate can back up claims with concrete examples.",
    items: [
      { key: "example_evasion", label: "Example Evasion" },
      { key: "example_given", label: "Example Given" },
      { key: "latency_mismatch", label: "Latency Mismatch" },
    ],
  },
  {
    title: "Pressure and Reasoning",
    description: "Signals that reveal depth, consistency, and resilience under follow-up questioning.",
    items: [
      { key: "strong_under_pressure", label: "Strong Under Pressure" },
      { key: "follow_up_collapse", label: "Follow-Up Collapse" },
      { key: "depth_decay", label: "Depth Decay" },
      { key: "complexity_latency_mismatch", label: "Complexity Latency Mismatch" },
    ],
  },
];

export function ProctoringSignalsSection({
  signals,
  onChange,
  disabled = false,
}: {
  signals: ProctoringSignals;
  onChange: (key: SignalKey, checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <section className="space-y-6 font-sans">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white shadow-md shadow-emerald-100">
          <Activity className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Behavioral and Proctoring Infrastructure</h2>
          <p className="text-sm font-medium text-gray-500">Grouped by what the signal is trying to detect, so it is easier to classify and review.</p>
        </div>
      </div>

      {disabled && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-600">
          Starter keeps all proctoring signals off. Switch to a higher plan to manage the signal groups below.
        </div>
      )}

      <div className={disabled ? "space-y-5 opacity-70" : "space-y-5"}>
        {SIGNAL_GROUPS.map((group) => (
          <div key={group.title} className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-900">{group.title}</h3>
              <p className="mt-1 text-xs font-medium text-gray-500">{group.description}</p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {group.items.map((signal) => (
                <label
                  key={signal.key}
                  className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50/70 px-4 py-3 shadow-sm transition-colors hover:border-gray-300 hover:bg-white"
                >
                  <Checkbox
                    checked={Boolean(signals[signal.key])}
                    disabled={disabled}
                    onCheckedChange={(checked) => onChange(signal.key, Boolean(checked))}
                  />
                  <span className="text-sm font-medium text-gray-800">{signal.label}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
