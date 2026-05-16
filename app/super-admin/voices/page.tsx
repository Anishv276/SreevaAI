"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, Loader2, PlusCircle, Search, Sparkles, Volume2 } from "lucide-react";
import { toast } from "@/components/ui/toast-custom";

type BuiltInVoice = {
  id: string;
  name: string;
  provider: "CARTESIA" | "SARVAM" | "ELEVENLABS";
  model: string;
  description: string;
  gender: "male" | "female";
  tags?: string[];
  isSelectable: boolean;
};

type VoiceRegistry = {
  selectableVoices: BuiltInVoice[];
  customVoices: Array<{
    id: string;
    name: string;
    provider: string;
    model: string;
    description: string | null;
    gender: string | null;
    tags: string[];
    isBuiltIn: boolean;
    isActive: boolean;
    isSelectable: boolean;
  }>;
  builtInVoices: BuiltInVoice[];
};

export default function SuperAdminVoicesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showSarvamPicker, setShowSarvamPicker] = useState(false);
  const [selectedSarvamIds, setSelectedSarvamIds] = useState<string[]>([]);
  const [registry, setRegistry] = useState<VoiceRegistry | null>(null);
  const [form, setForm] = useState({
    provider: "CARTESIA",
    id: "",
  });

  const loadRegistry = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/super-admin/voices", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load voices");
      const data = await res.json();
      setRegistry(data);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to load voices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRegistry();
  }, []);

  const builtInMatch = useMemo(() => {
    const id = form.id.trim();
    if (!id || !registry) return null;
    return registry.builtInVoices.find((voice) => voice.id === id) || null;
  }, [form.id, registry]);

  const filteredSelectable = useMemo(() => {
    if (!registry) return [];
    const term = search.trim().toLowerCase();
    if (!term) return registry.selectableVoices;
    return registry.selectableVoices.filter((voice) =>
      [voice.id, voice.name, voice.description, voice.provider, voice.model].join(" ").toLowerCase().includes(term)
    );
  }, [registry, search]);

  const cartesiaSelectable = useMemo(
    () => filteredSelectable.filter((voice) => voice.provider === "CARTESIA"),
    [filteredSelectable]
  );

  const sarvamSelectable = useMemo(
    () => filteredSelectable.filter((voice) => voice.provider === "SARVAM"),
    [filteredSelectable]
  );
  const elevenlabsSelectable = useMemo(
    () => filteredSelectable.filter((voice) => voice.provider === "ELEVENLABS"),
    [filteredSelectable]
  );

  const missingSarvamVoices = useMemo(() => {
    if (!registry) return [];
    return registry.builtInVoices.filter((voice) => voice.provider === "SARVAM" && !voice.isSelectable);
  }, [registry]);

  const isCustomVoice = (voiceId: string) =>
    Boolean(registry?.customVoices.some((row) => row.id === voiceId && !row.isBuiltIn));

  const submitAction = async (action: "add" | "remove" | "delete", payload: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/super-admin/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Request failed");
      toast.success(
        action === "add"
          ? "Voice added to engine"
          : action === "remove"
            ? "Voice removed from engine"
            : "Voice permanently deleted from DB"
      );
      await loadRegistry();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setSaving(false);
    }
  };

  const onAdd = async () => {
    const id = form.id.trim();
    if (!id) {
      toast.error("Voice ID is required");
      return;
    }
    await submitAction("add", { id, provider: form.provider });
  };

  const addSelectedSarvamVoices = async () => {
    if (selectedSarvamIds.length === 0) {
      toast.error("Select at least one Sarvam voice");
      return;
    }

    setSaving(true);
    try {
      for (const id of selectedSarvamIds) {
        const res = await fetch("/api/super-admin/voices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "add", provider: "SARVAM", id }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || `Failed to add ${id}`);
      }
      toast.success(`${selectedSarvamIds.length} Sarvam voice(s) added to engine`);
      setSelectedSarvamIds([]);
      setShowSarvamPicker(false);
      await loadRegistry();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to add Sarvam voices");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !registry) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-4 sm:px-6 lg:px-0">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-2 text-sm font-bold text-gray-400 transition-colors hover:text-gray-600"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <div className="group">
        <div className="mb-3 flex items-center gap-4">
          <div className="h-12 w-1.5 rounded-full bg-gradient-to-b from-[#F97316] to-orange-400 shadow-[0_0_12px_rgba(249,115,22,0.4)] transition-all duration-300 group-hover:h-14" />
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">Voice Engine</h1>
            <p className="mt-1 text-base font-medium text-gray-500">Manage selectable Cartesia, Sarvam, and ElevenLabs voices by provider and voice ID.</p>
          </div>
        </div>
      </div>

      <div
        className="rounded-2xl bg-white p-8 transition-all duration-300"
        style={{ border: "1px solid #E5E7EB", borderTop: "4px solid #F97316", boxShadow: "0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)" }}
      >
        <div className="mb-6 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#F97316]" />
          <h2 className="text-base font-bold text-gray-900">Add Voice To Engine</h2>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500">Provider + Voice ID</h3>
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                  Provider
                  <select
                    value={form.provider}
                    onChange={(e) => {
                      const provider = e.target.value;
                      setForm((prev) => ({ ...prev, provider, id: provider === "SARVAM" ? "" : prev.id }));
                      setSelectedSarvamIds([]);
                      setShowSarvamPicker(false);
                    }}
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:border-orange-500"
                  >
                    <option value="CARTESIA">Cartesia</option>
                    <option value="SARVAM">Sarvam</option>
                    <option value="ELEVENLABS">ElevenLabs</option>
                  </select>
                </label>
                {form.provider !== "SARVAM" ? (
                  <label className="space-y-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                    Voice ID
                    <input
                      value={form.id}
                      onChange={(e) => setForm((prev) => ({ ...prev, id: e.target.value }))}
                      className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-900 outline-none focus:border-orange-500"
                      placeholder={form.provider === "CARTESIA" ? "Paste Cartesia voice ID" : "Paste ElevenLabs voice ID"}
                    />
                  </label>
                ) : (
                  <div className="space-y-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                    Missing Sarvam Voices
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowSarvamPicker((prev) => !prev)}
                        className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-left text-sm font-semibold text-slate-900 outline-none hover:border-orange-300"
                      >
                        <span>
                          {selectedSarvamIds.length > 0
                            ? `${selectedSarvamIds.length} selected`
                            : `${missingSarvamVoices.length} available`}
                        </span>
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      </button>
                      {showSarvamPicker ? (
                        <div className="absolute z-20 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                          {missingSarvamVoices.length === 0 ? (
                            <p className="px-2 py-3 text-xs font-medium text-slate-500">All Sarvam voices are already in engine.</p>
                          ) : (
                            missingSarvamVoices.map((voice) => {
                              const checked = selectedSarvamIds.includes(voice.id);
                              return (
                                <label
                                  key={voice.id}
                                  className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 hover:bg-slate-50"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      setSelectedSarvamIds((prev) =>
                                        checked ? prev.filter((id) => id !== voice.id) : [...prev, voice.id]
                                      );
                                    }}
                                    className="mt-0.5 h-4 w-4"
                                  />
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-slate-900">{voice.name}</p>
                                    <p className="truncate text-xs font-medium text-slate-500">{voice.id}</p>
                                  </div>
                                </label>
                              );
                            })
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>

              {form.provider !== "SARVAM" && builtInMatch ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-sm font-semibold text-emerald-800">
                    Matched built-in voice: {builtInMatch.name} ({builtInMatch.provider})
                  </p>
                  <p className="text-xs text-emerald-700">{builtInMatch.model}</p>
                </div>
              ) : form.provider !== "SARVAM" ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-medium text-slate-700">
                    {form.provider === "CARTESIA"
                      ? "If Cartesia metadata is available, name/details are auto-fetched."
                      : "If ElevenLabs metadata is available, name/details are auto-fetched."}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex gap-3">
              {form.provider !== "SARVAM" ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={onAdd}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                  Add
                </button>
              ) : (
                <button
                  type="button"
                  disabled={saving || selectedSarvamIds.length === 0}
                  onClick={addSelectedSarvamVoices}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                  Add Selected
                </button>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500">Active Registry</h3>
              <div className="relative w-56">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm font-medium text-slate-900 outline-none focus:border-orange-500"
                  placeholder="Search voices"
                />
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-orange-500" />
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-600">Cartesia Voices</p>
                </div>
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {cartesiaSelectable.map((voice) => (
                    <div key={voice.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">{voice.name}</p>
                        <p className="truncate text-xs text-slate-500">{voice.id}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => submitAction("remove", { id: voice.id })}
                          className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        >
                          Remove
                        </button>
                        {isCustomVoice(voice.id) ? (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => submitAction("delete", { id: voice.id })}
                            className="rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {cartesiaSelectable.length === 0 ? (
                    <p className="py-2 text-xs font-medium text-slate-500">No Cartesia voices active.</p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-emerald-500" />
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-600">Sarvam Voices</p>
                </div>
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {sarvamSelectable.map((voice) => (
                    <div key={voice.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">{voice.name}</p>
                        <p className="truncate text-xs text-slate-500">{voice.id}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => submitAction("remove", { id: voice.id })}
                          className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        >
                          Remove
                        </button>
                        {isCustomVoice(voice.id) ? (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => submitAction("delete", { id: voice.id })}
                            className="rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {sarvamSelectable.length === 0 ? (
                    <p className="py-2 text-xs font-medium text-slate-500">No Sarvam voices active.</p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-indigo-500" />
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-600">ElevenLabs Voices</p>
                </div>
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {elevenlabsSelectable.map((voice) => (
                    <div key={voice.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">{voice.name}</p>
                        <p className="truncate text-xs text-slate-500">{voice.id}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => submitAction("remove", { id: voice.id })}
                          className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        >
                          Remove
                        </button>
                        {isCustomVoice(voice.id) ? (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => submitAction("delete", { id: voice.id })}
                            className="rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {elevenlabsSelectable.length === 0 ? (
                    <p className="py-2 text-xs font-medium text-slate-500">No ElevenLabs voices active.</p>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

