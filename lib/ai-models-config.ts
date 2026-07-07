/**
 * Master config for all AI models available in the platform.
 * Super Admin picks from these options per org; no model is hardcoded elsewhere.
 */

export const LLM_MODELS = [
  // GPT-4.1 family
  { id: "gpt-4.1",        label: "GPT-4.1",        provider: "openai", tier: "premium",  description: "Highest quality, best for complex reasoning" },
  { id: "gpt-4.1-mini",   label: "GPT-4.1 Mini",   provider: "openai", tier: "balanced", description: "Fast and capable, best for live conversation" },
  { id: "gpt-4.1-nano",   label: "GPT-4.1 Nano",   provider: "openai", tier: "economy",  description: "Fastest, best for real-time evaluation" },
  // GPT-4o family
  { id: "gpt-4o",         label: "GPT-4o",          provider: "openai", tier: "premium",  description: "Multimodal flagship" },
  { id: "gpt-4o-mini",    label: "GPT-4o Mini",     provider: "openai", tier: "economy",  description: "Affordable and fast" },
  // GPT-5 family
  { id: "gpt-5.4-mini",   label: "GPT-5.4 Mini",   provider: "openai", tier: "balanced", description: "Next-gen mini, best for extraction tasks" },
] as const;

export const STT_MODELS = [
  { id: "flux-general-en",    label: "Flux English",       provider: "deepgram", description: "Best for English-only interviews" },
  { id: "flux-general-multi", label: "Flux Multilingual",  provider: "deepgram", description: "Hindi + English (code-switching)" },
] as const;

export const TTS_MODELS = [
  // ElevenLabs
  { id: "eleven_turbo_v2_5",     label: "Turbo v2.5",          provider: "ELEVENLABS", description: "Low latency, high quality" },
  { id: "eleven_flash_v2_5",     label: "Flash v2.5",          provider: "ELEVENLABS", description: "Fastest ElevenLabs model" },
  { id: "eleven_multilingual_v2",label: "Multilingual v2",     provider: "ELEVENLABS", description: "Best quality, supports 29 languages" },
  // Cartesia
  { id: "cartesia/sonic-3",      label: "Sonic 3",             provider: "CARTESIA",   description: "Latest Cartesia model, low latency" },
  { id: "cartesia/sonic-2",      label: "Sonic 2",             provider: "CARTESIA",   description: "Stable Cartesia model" },
  // Sarvam
  { id: "bulbul:v3",             label: "Bulbul v3",           provider: "SARVAM",     description: "Latest Sarvam model, Indian languages" },
  { id: "bulbul:v2",             label: "Bulbul v2",           provider: "SARVAM",     description: "Stable Sarvam model" },
] as const;

// Voices -- model field is the provider's default model (for backward compat with voice pickers).
// The org's actual ttsModel field overrides this at runtime.
const _EL  = "eleven_turbo_v2_5";
const _CAR = "cartesia/sonic-3";
const _SAR = "bulbul:v3";
export const ALL_VOICES = [
  // ElevenLabs
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Rachel",     provider: "ELEVENLABS" as const, model: _EL,  gender: "female" as const, description: "Calm & Professional",       tags: ["Default", "Recommended"] },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George",     provider: "ELEVENLABS" as const, model: _EL,  gender: "male"   as const, description: "Warm & Authoritative",      tags: ["Professional"] },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Chris",      provider: "ELEVENLABS" as const, model: _EL,  gender: "male"   as const, description: "Natural & Conversational",  tags: ["Casual"] },
  { id: "ODq5zmih8GrVes37Dizd", name: "Patrick",    provider: "ELEVENLABS" as const, model: _EL,  gender: "male"   as const, description: "Deep & Engaging",           tags: ["Confident"] },
  { id: "l7kNoIfnJKPg7779LI2t", name: "Aria",       provider: "ELEVENLABS" as const, model: _EL,  gender: "female" as const, description: "Bright & Energetic",        tags: ["Friendly"] },
  // Cartesia
  { id: "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc", name: "Jacqueline", provider: "CARTESIA" as const, model: _CAR, gender: "female" as const, description: "Refined & Professional",  tags: ["Verified", "Stable", "Corporate"] },
  { id: "95d51f79-c397-46f9-b49a-23763d3eaa2d", name: "Arushi",     provider: "CARTESIA" as const, model: _CAR, gender: "female" as const, description: "Hinglish Speaker",         tags: ["Bilingual", "Indian Accent", "Warm"] },
  { id: "f786b574-daa5-4673-aa0c-cbe3e8534c02", name: "Katie",      provider: "CARTESIA" as const, model: _CAR, gender: "female" as const, description: "British Sophisticated",     tags: ["Elegant", "Formal"] },
  { id: "e07c00bc-4134-4eae-9ea4-1a55fb45746b", name: "Brooke",     provider: "CARTESIA" as const, model: _CAR, gender: "female" as const, description: "Young & Casual",            tags: ["Friendly", "Natural", "West Coast"] },
  { id: "5ee9feff-1265-424a-9d7f-8e4d431a12c7", name: "Ronald",     provider: "CARTESIA" as const, model: _CAR, gender: "male"   as const, description: "Deep & Authoritative",     tags: ["Professional", "Trustworthy"] },
  { id: "694f9389-aac1-45b6-b726-9d9369183238", name: "Sarah",      provider: "CARTESIA" as const, model: _CAR, gender: "female" as const, description: "Classical British",         tags: ["Formal", "Traditional"] },
  { id: "638385f3-3333-4f5d-85a2-3f820c64b732", name: "Jessica",    provider: "CARTESIA" as const, model: _CAR, gender: "female" as const, description: "Bright & Energetic",        tags: ["Engaging", "Upbeat"] },
  { id: "248be1fc-3d27-4452-9457-3705bf68bf8f", name: "Barista",    provider: "CARTESIA" as const, model: _CAR, gender: "female" as const, description: "Warm & Helpful",            tags: ["Service-oriented", "Gentle"] },
  // Sarvam
  { id: "shubh",  name: "Shubh",  provider: "SARVAM" as const, model: _SAR, gender: "male"   as const, description: "Conversational & Friendly",    tags: ["Official", "Flagship"] },
  { id: "manan",  name: "Manan",  provider: "SARVAM" as const, model: _SAR, gender: "male"   as const, description: "Consistent & Reliable",        tags: ["Conversational"] },
  { id: "ishita", name: "Ishitha",provider: "SARVAM" as const, model: _SAR, gender: "female" as const, description: "Dynamic & Engaging",           tags: ["Official", "Flagship"] },
  { id: "shreya", name: "Shreya", provider: "SARVAM" as const, model: _SAR, gender: "female" as const, description: "Professional & Authoritative", tags: ["News Style"] },
  { id: "priya",  name: "Priya",  provider: "SARVAM" as const, model: _SAR, gender: "female" as const, description: "Warm & Caring",               tags: ["Customer Service", "Recommended"] },
  { id: "aditya", name: "Aditya", provider: "SARVAM" as const, model: _SAR, gender: "male"   as const, description: "Energetic & Enthusiastic",    tags: ["Young", "Upbeat"] },
  { id: "ritu",   name: "Ritu",   provider: "SARVAM" as const, model: _SAR, gender: "female" as const, description: "Clear & Articulate",          tags: ["Educational"] },
  { id: "rahul",  name: "Rahul",  provider: "SARVAM" as const, model: _SAR, gender: "male"   as const, description: "Deep & Resonant",             tags: ["Authoritative"] },
  { id: "neha",   name: "Neha",   provider: "SARVAM" as const, model: _SAR, gender: "female" as const, description: "Soft & Gentle",              tags: ["Calm"] },
  { id: "pooja",  name: "Pooja",  provider: "SARVAM" as const, model: _SAR, gender: "female" as const, description: "Cheerful & Bright",          tags: ["Friendly"] },
  { id: "rohan",  name: "Rohan",  provider: "SARVAM" as const, model: _SAR, gender: "male"   as const, description: "Smooth & Natural",           tags: ["Conversational"] },
  { id: "simran", name: "Simran", provider: "SARVAM" as const, model: _SAR, gender: "female" as const, description: "Calm & Composed",            tags: ["Professional"] },
  { id: "kavya",  name: "Kavya",  provider: "SARVAM" as const, model: _SAR, gender: "female" as const, description: "Young & Vibrant",            tags: ["Playful"] },
  { id: "amit",   name: "Amit",   provider: "SARVAM" as const, model: _SAR, gender: "male"   as const, description: "Bold & Direct",              tags: ["Confident"] },
  { id: "dev",    name: "Dev",    provider: "SARVAM" as const, model: _SAR, gender: "male"   as const, description: "Warm & Grounded",            tags: ["Trustworthy"] },
  { id: "varun",  name: "Varun",  provider: "SARVAM" as const, model: _SAR, gender: "male"   as const, description: "Energetic Male",             tags: ["Social Media"] },
  { id: "kabir",  name: "Kabir",  provider: "SARVAM" as const, model: _SAR, gender: "male"   as const, description: "Professional Tone",          tags: ["Corporate"] },
  { id: "tanya",  name: "Tanya",  provider: "SARVAM" as const, model: _SAR, gender: "female" as const, description: "Clear Female",              tags: ["Concise"] },
  { id: "sunny",  name: "Sunny",  provider: "SARVAM" as const, model: _SAR, gender: "male"   as const, description: "Friendly Youth",            tags: ["Casual"] },
];

export type LlmModelId = typeof LLM_MODELS[number]["id"];
export type SttModelId = typeof STT_MODELS[number]["id"];
export type TtsModelId = typeof TTS_MODELS[number]["id"];
export type TtsProvider = "ELEVENLABS" | "CARTESIA" | "SARVAM";

export const TTS_PROVIDERS: TtsProvider[] = ["ELEVENLABS", "CARTESIA", "SARVAM"];

export const DEFAULT_ORG_AI_CONFIG = {
  sttModel:              "flux-general-en",
  ttsProvider:           "ELEVENLABS"      as TtsProvider,
  ttsModel:              "eleven_turbo_v2_5",
  voiceId:               "EXAVITQu4vr4xnSDxMaL",
  llmResumeExtraction:   "gpt-5.4-mini",
  llmJdExtraction:       "gpt-5.4-mini",
  llmResumeReport:       "gpt-5.4-mini",
  llmInterviewLive:      "gpt-4.1-mini",
  llmInterviewEval:      "gpt-4.1-nano",
  llmInterviewBrief:     "gpt-4.1",
  llmInterviewReport:    "gpt-5.4-mini",
} as const;

export function getVoiceById(id: string) {
  return ALL_VOICES.find(v => v.id === id);
}

export function getVoicesForProvider(provider: TtsProvider) {
  return ALL_VOICES.filter(v => v.provider === provider);
}

export function getTtsModelsForProvider(provider: TtsProvider) {
  return TTS_MODELS.filter(m => m.provider === provider);
}
