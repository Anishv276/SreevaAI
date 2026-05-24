"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  AudioLines,
  Building2,
  CheckCircle2,
  Coins,
  Globe,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Mic,
  Pause,
  Play,
  RefreshCw,
  Search,
  Shield,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LocationAutocomplete } from "@/components/ui/location-autocomplete";
import { toast } from "@/components/ui/toast-custom";
import { ProctoringSignalsSection } from "@/components/super-admin/proctoring-signals-section";
import { ALL_VOICES, DEFAULT_VOICE_ID, getVoiceById, type Voice } from "@/lib/constants/voices";
import { DEFAULT_ORG_PLAN, ORG_PLAN_OPTIONS, type OrgPlanId } from "@/lib/org-plans";
import { getProctoringSignalsForPlan, type ProctoringSignalToggles } from "@/lib/proctoring-signals";
import { cn } from "@/lib/utils";

type OrgFormState = {
  orgName: string;
  slug: string;
  location: string;
  plan: OrgPlanId;
  maxActiveDrives: string;
  interviewQuotaTotal: string;
  proctoringSignals: ProctoringSignalToggles;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  voiceId: string;
  allowedVoices: string[];
  deepgramModel: string;
};

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3">
        <span className="h-6 w-1 rounded-full bg-[#F97316]" />
        <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-slate-900">{title}</p>
      </div>
      {description ? <p className="text-sm text-slate-500">{description}</p> : null}
    </div>
  );
}

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-slate-500">
        <Icon className="h-3.5 w-3.5 text-[#F97316]" />
        {label}
      </label>
      {children}
    </div>
  );
}

function TextInput({
  label,
  icon,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
  autoComplete,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  const Icon = icon;
  return (
    <Field label={label} icon={Icon}>
      <input
        type={type}
        required={required}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-[#F97316] focus:ring-4 focus:ring-orange-50"
      />
    </Field>
  );
}

function SelectInput({
  label,
  icon,
  value,
  onChange,
  options,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const Icon = icon;
  return (
    <Field label={label} icon={Icon}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-[#F97316] focus:ring-4 focus:ring-orange-50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

function LimitControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const isUnlimited = String(value).toLowerCase() === "unlimited" || Number(value) === 0;
  const inputValue = isUnlimited ? "" : String(value);

  return (
    <Field label={label} icon={Coins}>
      <div className="flex items-center gap-2">
        <div className="flex w-fit rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => onChange("Unlimited")}
            className={cn(
              "rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-widest transition",
              isUnlimited ? "bg-white text-[#F97316] shadow-sm" : "text-slate-400 hover:text-slate-700"
            )}
          >
            Unlimited
          </button>
          <button
            type="button"
            onClick={() => {
              if (isUnlimited) onChange("1");
            }}
            className={cn(
              "rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-widest transition",
              !isUnlimited ? "bg-white text-[#F97316] shadow-sm" : "text-slate-400 hover:text-slate-700"
            )}
          >
            Limited
          </button>
        </div>
        {!isUnlimited ? (
          <input
            type="number"
            min={1}
            value={inputValue}
            onChange={(e) => onChange(String(Math.max(1, Number(e.target.value) || 1)))}
            className="h-11 w-20 rounded-xl border border-slate-200 bg-white px-2 text-center text-sm font-bold text-slate-900 shadow-sm outline-none focus:border-[#F97316] focus:ring-4 focus:ring-orange-50"
          />
        ) : null}
      </div>
    </Field>
  );
}

export default function NewOrgPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{ orgName: string; adminEmail: string } | null>(null);
  const [voices, setVoices] = useState<Voice[]>(ALL_VOICES);
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugSuffix] = useState(() => Math.floor(1000 + Math.random() * 9000).toString());
  const [voiceSearch, setVoiceSearch] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const [form, setForm] = useState<OrgFormState>(() => ({
    orgName: "",
    slug: "",
    location: "",
    plan: DEFAULT_ORG_PLAN,
    maxActiveDrives: "Unlimited",
    interviewQuotaTotal: "100",
    proctoringSignals: getProctoringSignalsForPlan(DEFAULT_ORG_PLAN),
    adminName: "",
    adminEmail: "",
    adminPassword: "",
    voiceId: DEFAULT_VOICE_ID,
    allowedVoices: [DEFAULT_VOICE_ID],
    deepgramModel: "nova-3-general",
  }));

  const primaryVoiceId = form.voiceId || form.allowedVoices[0] || DEFAULT_VOICE_ID;
  const selectedVoice = useMemo(() => getVoiceById(primaryVoiceId) ?? getVoiceById(DEFAULT_VOICE_ID), [primaryVoiceId]);

  useEffect(() => {
    const loadVoices = async () => {
      try {
        const res = await fetch("/api/voices", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data?.voices) && data.voices.length > 0) {
          setVoices(data.voices);
        }
      } catch {
        // keep static fallback
      }
    };
    void loadVoices();
  }, []);

  const selectedVoiceFromCatalog = useMemo(
    () => voices.find((voice) => voice.id === primaryVoiceId) || selectedVoice,
    [voices, primaryVoiceId, selectedVoice]
  );

  const filteredVoices = useMemo(() => {
    const term = voiceSearch.trim().toLowerCase();
    if (!term) return voices;
    return voices.filter((voice) =>
      [voice.name, voice.provider, voice.model, voice.description, voice.id].join(" ").toLowerCase().includes(term)
    );
  }, [voices, voiceSearch]);

  const updateForm = (patch: Partial<OrgFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const setAllowedVoices = (nextAllowedVoices: string[]) => {
    const normalized = Array.from(
      new Set(nextAllowedVoices.map((id) => String(id || "").trim()).filter(Boolean))
    );
    const allowedVoices = normalized.length > 0 ? normalized : [DEFAULT_VOICE_ID];
    updateForm({
      allowedVoices,
      voiceId: allowedVoices[0] || DEFAULT_VOICE_ID,
    });
  };

  const toggleVoice = (voiceId: string) => {
    const current = form.allowedVoices;
    const nextAllowed = current.includes(voiceId)
      ? current.filter((id) => id !== voiceId)
      : [...current, voiceId];
    setAllowedVoices(nextAllowed);
  };

  const stopCurrentPreview = () => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.src = "";
      activeAudioRef.current = null;
    }
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    gainNodeRef.current?.disconnect();
    gainNodeRef.current = null;
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => { });
      audioContextRef.current = null;
    }
    setPlayingVoiceId(null);
  };

  const playSample = async (voiceId: string) => {
    if (playingVoiceId === voiceId) {
      stopCurrentPreview();
      return;
    }

    setPreviewLoading(true);
    try {
      stopCurrentPreview();
      const transcript = "Hello buddy, how are you doing? I'm ready to interview candidates.";
      const res = await fetch("/api/admin/voice/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceId,
          transcript,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Preview failed");
      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
      previewUrlRef.current = audioUrl;
      const audio = new Audio(audioUrl);
      const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        audioContextRef.current = ctx;
        const source = ctx.createMediaElementSource(audio);
        const gainNode = ctx.createGain();
        gainNode.gain.value = 2.5;
        gainNodeRef.current = gainNode;
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        audio.onended = () => {
          stopCurrentPreview();
          URL.revokeObjectURL(audioUrl);
        };
        await ctx.resume().catch(() => { });
      } else {
        audio.onended = () => {
          stopCurrentPreview();
          URL.revokeObjectURL(audioUrl);
        };
      }
      await audio.play();
      activeAudioRef.current = audio;
      setPlayingVoiceId(voiceId);
    } catch {
      toast.error("Preview failed.");
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      stopCurrentPreview();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const makeSlug = (value: string) => {
    const base = value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return base ? `${base}-${slugSuffix}` : "";
  };

  const validate = () => {
    if (!form.orgName.trim()) {
      toast.error("Client Name is required");
      return false;
    }
    if (!form.slug.trim()) {
      toast.error("URL Identifier is required");
      return false;
    }
    if (!form.adminEmail.trim()) {
      toast.error("Login Email is required");
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.adminEmail)) {
      toast.error("Invalid admin email format");
      return false;
    }
    if (!form.adminPassword) {
      toast.error("Password is required");
      return false;
    }
    if (form.adminPassword.length < 8) {
      toast.error("Password must be at least 8 characters long");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/super-admin/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgName: form.orgName.trim(),
          slug: form.slug.trim().toLowerCase(),
          plan: form.plan,
          location: form.location.trim() || null,
          adminName: form.adminName.trim() || null,
          adminEmail: form.adminEmail.trim(),
          adminPassword: form.adminPassword,
          maxActiveDrives: form.maxActiveDrives,
          interviewQuotaTotal: Number(form.interviewQuotaTotal || 0),
          proctoringSignals: form.proctoringSignals,
          voiceId: form.voiceId || DEFAULT_VOICE_ID,
          allowedVoices: form.allowedVoices.length > 0 ? form.allowedVoices : [form.voiceId || DEFAULT_VOICE_ID],
          deepgramModel: form.deepgramModel,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to create organization");
      }

      setSuccess({
        orgName: form.orgName.trim(),
        adminEmail: form.adminEmail.trim(),
      });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to create organization");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-[70vh] px-4 py-8">
        <div className="mx-auto flex w-full max-w-lg flex-col items-center rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">{success.orgName} created</h1>
          <p className="mt-3 text-sm font-medium text-slate-500">
            {success.adminEmail} can now access the portal.
          </p>
          <Button onClick={() => router.push("/super-admin/orgs")} className="mt-8 h-11 w-full rounded-xl bg-slate-900 text-white hover:bg-slate-800">
            Go to Organizations
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-0">
      <button
        type="button"
        onClick={() => router.back()}
        className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Organizations
      </button>

      <div className="mb-8">
        <div className="flex items-center gap-4">
          <div className="h-12 w-1.5 rounded-full bg-gradient-to-b from-[#F97316] to-orange-400 shadow-[0_0_12px_rgba(249,115,22,0.35)]" />
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Add Client</h1>
            <p className="mt-1 text-base font-medium text-slate-500 sm:text-lg">
              Configure the organization, admin access, AI defaults, and safety controls.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <SectionHeader title="Organization Profile" description="Core client metadata and URL slug." />
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <TextInput
              label="Client Name"
              icon={Building2}
              value={form.orgName}
              onChange={(value) => {
                updateForm({
                  orgName: value,
                  slug: slugTouched ? form.slug : makeSlug(value),
                });
              }}
              placeholder="e.g. Lumoscale"
              required
            />
            <TextInput
              label="URL Identifier"
              icon={Globe}
              value={form.slug}
              onChange={(value) => {
                setSlugTouched(true);
                updateForm({ slug: value.toLowerCase() });
              }}
              placeholder="client-slug"
              required
            />
            <div className="md:col-span-2">
              <Field label="Location" icon={MapPin}>
                <LocationAutocomplete
                  value={form.location}
                  onChange={(value) => updateForm({ location: value })}
                  placeholder="Mumbai, India"
                />
              </Field>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <SectionHeader title="Administrative Access" description="Primary login credentials for the new organization." />
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            <TextInput
              label="Admin Name"
              icon={User}
              value={form.adminName}
              onChange={(value) => updateForm({ adminName: value })}
              placeholder="Full name"
            />
            <TextInput
              label="Login Email"
              icon={Mail}
              value={form.adminEmail}
              onChange={(value) => updateForm({ adminEmail: value })}
              placeholder="admin@client.com"
              required
              autoComplete="email"
            />
            <TextInput
              label="Password"
              icon={Lock}
              type="password"
              value={form.adminPassword}
              onChange={(value) => updateForm({ adminPassword: value })}
              placeholder="Minimum 8 characters"
              required
              autoComplete="new-password"
            />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <SectionHeader title="AI Engine" description="The defaults that will be saved to the organization." />
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-slate-500">
                  <AudioLines className="h-3.5 w-3.5 text-[#F97316]" />
                  Allowed Voices
                </label>
                <p className="text-[10px] font-medium text-slate-400">
                  Select one or more voices. The first selected voice becomes the primary voice for this client.
                </p>
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={voiceSearch}
                    onChange={(e) => setVoiceSearch(e.target.value)}
                    placeholder="Search voices..."
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-[#F97316] focus:ring-4 focus:ring-orange-50"
                  />
                </div>
                <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                  {filteredVoices.map((voice) => {
                    const allowed = form.allowedVoices.includes(voice.id);
                    return (
                      <div
                        key={voice.id}
                        className={cn(
                          "flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5 last:border-b-0 transition-colors",
                          allowed ? "bg-orange-50/40" : "bg-white hover:bg-slate-50"
                        )}
                      >
                        <label className="flex min-w-0 flex-1 items-center gap-3">
                          <input
                            type="checkbox"
                            checked={allowed}
                            onChange={() => toggleVoice(voice.id)}
                            className="h-3.5 w-3.5 shrink-0 accent-[#F97316]"
                          />
                          <div className="min-w-0">
                            <p className={cn("truncate text-xs font-bold", allowed ? "text-orange-600" : "text-slate-800")}>
                              {voice.name}
                            </p>
                            <p className="truncate text-[9px] text-slate-400">
                              {voice.provider} · {voice.description}
                            </p>
                          </div>
                        </label>
                        <button
                          type="button"
                          onClick={() => void playSample(voice.id)}
                          className={cn(
                            "ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all",
                            playingVoiceId === voice.id
                              ? "bg-orange-600 text-white"
                              : "bg-slate-100 text-slate-500 hover:bg-orange-100 hover:text-orange-600"
                          )}
                        >
                          {previewLoading && playingVoiceId === voice.id ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : playingVoiceId === voice.id ? (
                            <Pause className="h-3 w-3 fill-current" />
                          ) : (
                            <Play className="h-3 w-3 fill-current ml-0.5" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-400">
                  {form.allowedVoices.length} voice{form.allowedVoices.length !== 1 ? "s" : ""} selected
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Primary voice</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {selectedVoiceFromCatalog?.name || "Unknown voice"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedVoiceFromCatalog?.provider || "CARTESIA"} | {selectedVoiceFromCatalog?.model || "cartesia/sonic-3"}
                </p>
              </div>
            </div>
            <div className="space-y-6">
              <SelectInput
                label="Transcription (STT)"
                icon={Mic}
                value={form.deepgramModel}
                onChange={(value) => updateForm({ deepgramModel: value })}
                options={[
                  { value: "nova-3-general", label: "Nova-3 (Latest)" },
                  { value: "nova-2-general", label: "Nova-2 (Legacy)" },
                ]}
              />
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <SectionHeader title="Billing and Quotas" description="Usage guardrails for the organization." />
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <LimitControl
              label="Job Limit"
              value={form.maxActiveDrives}
              onChange={(value) => updateForm({ maxActiveDrives: value })}
            />
            <TextInput
              label="Total Interviews Allocated"
              icon={Coins}
              value={form.interviewQuotaTotal}
              onChange={(value) => updateForm({ interviewQuotaTotal: value })}
              placeholder="100"
              type="number"
            />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <SectionHeader title="Plan and Safety" description="Choose a plan and enable proctoring signals." />
          <div className="mt-6 grid gap-6 lg:grid-cols-4">
            <div className="space-y-3 lg:col-span-1">
              <p className="text-[12px] font-bold uppercase tracking-widest text-slate-500">Client plan</p>
              {ORG_PLAN_OPTIONS.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() =>
                    updateForm({
                      plan: plan.id,
                      proctoringSignals: getProctoringSignalsForPlan(plan.id),
                    })
                  }
                  className={cn(
                    "w-full rounded-2xl border p-4 text-left transition",
                    form.plan === plan.id
                      ? "border-[#F97316] bg-orange-50 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  )}
                >
                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-900">{plan.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{plan.desc}</p>
                </button>
              ))}
            </div>
            <div className="lg:col-span-3">
              <ProctoringSignalsSection
                signals={form.proctoringSignals}
                disabled={form.plan === "STARTER"}
                onChange={(key, checked) =>
                  updateForm({
                    proctoringSignals: {
                      ...form.proctoringSignals,
                      [key]: checked,
                    },
                  })
                }
              />
            </div>
          </div>
        </section>

        <div className="flex items-center justify-end gap-3 pb-4">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-xl border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={loading}
            className="h-11 rounded-xl bg-[#F97316] px-6 text-sm font-semibold text-white shadow-sm hover:bg-orange-600"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Shield className="mr-2 h-4 w-4" />}
            {loading ? "Creating..." : "Create client"}
          </Button>
        </div>
      </form>
    </div>
  );
}
