"use client";
import { Activity } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { ALWAYS_ON_PROCTORING_SIGNALS } from "@/lib/proctoring-signals";
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
  | "depth_decay"
  | "complexity_latency_mismatch";
// Sanity guard: every key in ALWAYS_ON_PROCTORING_SIGNALS must be a SignalKey.
// If a future refactor adds a new always-on signal without updating SignalKey,
// this `satisfies` check will fail compilation -- catching the drift at build
// time instead of silently rendering an unlocked checkbox.
const _ALWAYS_ON_KEYS_TYPECHECK = ALWAYS_ON_PROCTORING_SIGNALS satisfies readonly SignalKey[];
void _ALWAYS_ON_KEYS_TYPECHECK;
type ProctoringSignals = Record<SignalKey, boolean>;
type SignalRow = {
  key: SignalKey;
  label: string;
  group: string;
  description: string;
};
const SIGNAL_ROWS: SignalRow[] = [
  {
    key: "tab_switch",
    label: "Tab Switch",
    group: "Browser and Session",
    description: "Leaving the assessment tab or switching away from the interview.",
  },
  {
    key: "connection_lost",
    label: "Connection Lost",
    group: "Browser and Session",
    description: "The session drops connection long enough to matter.",
  },
  {
    key: "camera_disabled",
    label: "Camera Disabled",
    group: "Device and Access",
    description: "The camera is turned off or blocked during the session.",
  },
  {
    key: "microphone_disabled",
    label: "Microphone Disabled",
    group: "Device and Access",
    description: "The microphone is muted or unavailable when it should be active.",
  },
  {
    key: "face_absence",
    label: "Face Absence",
    group: "Face and Identity",
    description: "No face is visible in the frame for a meaningful stretch.",
  },
  {
    key: "multiple_faces",
    label: "Multiple Faces",
    group: "Face and Identity",
    description: "More than one face is detected in the camera view.",
  },
  {
    key: "identity_mismatch",
    label: "Identity Mismatch",
    group: "Face and Identity",
    description: "The person on camera does not match the expected identity.",
  },
  {
    key: "latency_mismatch",
    label: "Latency Mismatch",
    group: "Reasoning and Timing",
    description: "The answer latency does not match the complexity of the question.",
  },
  {
    key: "complexity_latency_mismatch",
    label: "Complexity Latency Mismatch",
    group: "Reasoning and Timing",
    description: "The timing of the response looks off for the complexity of the topic.",
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
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-md shadow-emerald-100">
          <Activity className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Behavioral and Proctoring Infrastructure</h2>
          <p className="text-sm font-medium text-gray-500">All signals in one place. Green toggles mean enabled, and required signals stay locked on.</p>
        </div>
      </div>
      {disabled && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-600">
          Starter keeps these plan-controlled proctoring signals locked. Upgrade the plan to enable the browser, device, face, and timing checks below.
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Signal toggles</p>
              <p className="mt-0.5 text-xs font-medium text-gray-500">One row per signal, with the toggle aligned on the right.</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">
              Green = on
            </span>
          </div>
        </div>
        <div className="divide-y divide-gray-100">
          {SIGNAL_ROWS.map((signal) => {
            return (
              <div key={signal.key} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">{signal.label}</span>
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-600">
                      {signal.group}
                    </span>
                  </div>
                  <p className="text-xs font-medium leading-5 text-gray-500">{signal.description}</p>
                </div>
                <div className="flex items-center gap-3 sm:shrink-0">
                  {disabled ? (
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-500">
                      Locked by plan
                    </span>
                  ) : null}
                  <Switch
                    checked={Boolean(signals[signal.key])}
                    disabled={disabled}
                    onCheckedChange={(next) => onChange(signal.key, Boolean(next))}
                    className={cn(
                      "data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-gray-200",
                      "data-[state=checked]:border-emerald-500 data-[state=unchecked]:border-gray-200",
                      "focus-visible:ring-emerald-500/30"
                    )}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
