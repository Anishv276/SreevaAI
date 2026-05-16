export interface Voice {
  id: string;
  name: string;
  provider: "CARTESIA" | "SARVAM" | "ELEVENLABS";
  model: string;
  description: string;
  gender: "male" | "female";
  tags?: string[];
}

export const ALL_VOICES: Voice[] = [
  // Cartesia
  { id: "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc", name: "Jacqueline", provider: "CARTESIA", model: "cartesia/sonic-3", gender: "female", description: "Refined & Professional", tags: ["Verified", "Stable", "Corporate"] },
  { id: "95d51f79-c397-46f9-b49a-23763d3eaa2d", name: "Arushi",     provider: "CARTESIA", model: "cartesia/sonic-3", gender: "female", description: "Hinglish Speaker",        tags: ["Bilingual", "Indian Accent", "Warm"] },
  { id: "f786b574-daa5-4673-aa0c-cbe3e8534c02", name: "Katie",       provider: "CARTESIA", model: "cartesia/sonic-3", gender: "female", description: "British Sophisticated",    tags: ["Elegant", "Formal"] },
  { id: "e07c00bc-4134-4eae-9ea4-1a55fb45746b", name: "Brooke",      provider: "CARTESIA", model: "cartesia/sonic-3", gender: "female", description: "Young & Casual",           tags: ["Friendly", "Natural", "West Coast"] },
  { id: "5ee9feff-1265-424a-9d7f-8e4d431a12c7", name: "Ronald",      provider: "CARTESIA", model: "cartesia/sonic-3", gender: "male",   description: "Deep & Authoritative",    tags: ["Professional", "Trustworthy"] },
  { id: "694f9389-aac1-45b6-b726-9d9369183238", name: "Sarah",       provider: "CARTESIA", model: "cartesia/sonic-3", gender: "female", description: "Classical British",       tags: ["Formal", "Traditional"] },
  { id: "638385f3-3333-4f5d-85a2-3f820c64b732", name: "Jessica",     provider: "CARTESIA", model: "cartesia/sonic-3", gender: "female", description: "Bright & Energetic",      tags: ["Engaging", "Upbeat"] },
  { id: "248be1fc-3d27-4452-9457-3705bf68bf8f", name: "Barista",     provider: "CARTESIA", model: "cartesia/sonic-3", gender: "female", description: "Warm & Helpful",          tags: ["Service-oriented", "Gentle"] },
  // Sarvam
  { id: "shubh",   name: "Shubh",   provider: "SARVAM", model: "bulbul:v3", gender: "male",   description: "Conversational & Friendly",      tags: ["Official", "Flagship"] },
  { id: "manan",   name: "Manan",   provider: "SARVAM", model: "bulbul:v3", gender: "male",   description: "Consistent & Reliable",          tags: ["Conversational"] },
  { id: "ishita",  name: "Ishitha", provider: "SARVAM", model: "bulbul:v3", gender: "female", description: "Dynamic & Engaging",             tags: ["Official", "Flagship"] },
  { id: "shreya",  name: "Shreya",  provider: "SARVAM", model: "bulbul:v3", gender: "female", description: "Professional & Authoritative",   tags: ["News Style"] },
  { id: "priya",   name: "Priya",   provider: "SARVAM", model: "bulbul:v3", gender: "female", description: "Warm & Caring",                  tags: ["Customer Service", "Recommended"] },
  { id: "aditya",  name: "Aditya",  provider: "SARVAM", model: "bulbul:v3", gender: "male",   description: "Energetic & Enthusiastic",       tags: ["Young", "Upbeat"] },
  { id: "ritu",    name: "Ritu",    provider: "SARVAM", model: "bulbul:v3", gender: "female", description: "Clear & Articulate",             tags: ["Educational"] },
  { id: "rahul",   name: "Rahul",   provider: "SARVAM", model: "bulbul:v3", gender: "male",   description: "Deep & Resonant",                tags: ["Authoritative"] },
  { id: "neha",    name: "Neha",    provider: "SARVAM", model: "bulbul:v3", gender: "female", description: "Soft & Gentle",                  tags: ["Calm"] },
  { id: "pooja",   name: "Pooja",   provider: "SARVAM", model: "bulbul:v3", gender: "female", description: "Cheerful & Bright",              tags: ["Friendly"] },
  { id: "rohan",   name: "Rohan",   provider: "SARVAM", model: "bulbul:v3", gender: "male",   description: "Smooth & Natural",               tags: ["Conversational"] },
  { id: "simran",  name: "Simran",  provider: "SARVAM", model: "bulbul:v3", gender: "female", description: "Calm & Composed",                tags: ["Professional"] },
  { id: "kavya",   name: "Kavya",   provider: "SARVAM", model: "bulbul:v3", gender: "female", description: "Young & Vibrant",                tags: ["Playful"] },
  { id: "amit",    name: "Amit",    provider: "SARVAM", model: "bulbul:v3", gender: "male",   description: "Bold & Direct",                  tags: ["Confident"] },
  { id: "dev",     name: "Dev",     provider: "SARVAM", model: "bulbul:v3", gender: "male",   description: "Warm & Grounded",                tags: ["Trustworthy"] },
  { id: "varun",   name: "Varun",   provider: "SARVAM", model: "bulbul:v3", gender: "male",   description: "Energetic Male",                 tags: ["Social Media"] },
  { id: "kabir",   name: "Kabir",   provider: "SARVAM", model: "bulbul:v3", gender: "male",   description: "Professional Tone",              tags: ["Corporate"] },
  { id: "tanya",   name: "Tanya",   provider: "SARVAM", model: "bulbul:v3", gender: "female", description: "Clear Female",                   tags: ["Concise"] },
  { id: "sunny",   name: "Sunny",   provider: "SARVAM", model: "bulbul:v3", gender: "male",   description: "Friendly Youth",                 tags: ["Casual"] },
];

export const DEFAULT_VOICE_ID = "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc";

export function getVoiceById(id: string): Voice | undefined {
  return ALL_VOICES.find(v => v.id === id);
}

export function getProviderForVoice(id: string): "CARTESIA" | "SARVAM" | "ELEVENLABS" {
  return getVoiceById(id)?.provider ?? "CARTESIA";
}
