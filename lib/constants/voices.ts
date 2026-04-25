export interface Voice {
  id: string;
  name: string;
  provider: "CARTESIA" | "SARVAM" | "GOOGLE";
  description: string;
  gender: "male" | "female";
  tags?: string[];
}

export const CARTESIA_VOICES: Voice[] = [
  {
    id: "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
    name: "Jacqueline",
    provider: "CARTESIA",
    gender: "female",
    description: "Refined & Professional",
    tags: ["Verified", "Stable", "Corporate"]
  },
  {
    id: "95d51f79-c397-46f9-b49a-23763d3eaa2d",
    name: "Arushi",
    provider: "CARTESIA",
    gender: "female",
    description: "Hinglish Speaker",
    tags: ["Bilingual", "Indian Accent", "Warm"]
  },
  {
    id: "f786b574-daa5-4673-aa0c-cbe3e8534c02",
    name: "Katie",
    provider: "CARTESIA",
    gender: "female",
    description: "British Sophisticated",
    tags: ["Elegant", "Formal"]
  },
  {
    id: "e07c00bc-4134-4eae-9ea4-1a55fb45746b",
    name: "Brooke",
    provider: "CARTESIA",
    gender: "female",
    description: "Young & Casual",
    tags: ["Friendly", "Natural", "West Coast"]
  },
  {
    id: "5ee9feff-1265-424a-9d7f-8e4d431a12c7",
    name: "Ronald",
    provider: "CARTESIA",
    gender: "male",
    description: "Deep & Authoritative",
    tags: ["Professional", "Trustworthy"]
  },
  {
    id: "694f9389-aac1-45b6-b726-9d9369183238",
    name: "Sarah",
    provider: "CARTESIA",
    gender: "female",
    description: "Classical British",
    tags: ["Formal", "Traditional"]
  },
  {
    id: "638385f3-3333-4f5d-85a2-3f820c64b732",
    name: "Jessica",
    provider: "CARTESIA",
    gender: "female",
    description: "Bright & Energetic",
    tags: ["Engaging", "Upbeat"]
  },
  {
    id: "248be1fc-3d27-4452-9457-3705bf68bf8f",
    name: "Barista",
    provider: "CARTESIA",
    gender: "female",
    description: "Warm & Helpful",
    tags: ["Service-oriented", "Gentle"]
  },
];

export const SARVAM_VOICES: Voice[] = [
  { id: "shubh", name: "Shubh", provider: "SARVAM", gender: "male", description: "Conversational & Friendly", tags: ["Official", "Flagship"] },
  { id: "manan", name: "Manan", provider: "SARVAM", gender: "male", description: "Consistent & Reliable", tags: ["Conversational"] },
  { id: "ishita", name: "Ishitha", provider: "SARVAM", gender: "female", description: "Dynamic & Engaging", tags: ["Official", "Flagship"] },
  { id: "shreya", name: "Shreya", provider: "SARVAM", gender: "female", description: "Professional & Authoritative", tags: ["News Style"] },
  { id: "priya", name: "Priya", provider: "SARVAM", gender: "female", description: "Warm & Caring", tags: ["Customer Service", "Recommended"] },
  { id: "aditya", name: "Aditya", provider: "SARVAM", gender: "male", description: "Energetic & Enthusiastic", tags: ["Young", "Upbeat"] },
  { id: "ritu", name: "Ritu", provider: "SARVAM", gender: "female", description: "Clear & Articulate", tags: ["Educational"] },
  { id: "rahul", name: "Rahul", provider: "SARVAM", gender: "male", description: "Deep & Resonant", tags: ["Authoritative"] },
  { id: "neha", name: "Neha", provider: "SARVAM", gender: "female", description: "Soft & Gentle", tags: ["Calm"] },
  { id: "pooja", name: "Pooja", provider: "SARVAM", gender: "female", description: "Cheerful & Bright", tags: ["Friendly"] },
  { id: "rohan", name: "Rohan", provider: "SARVAM", gender: "male", description: "Smooth & Natural", tags: ["Conversational"] },
  { id: "simran", name: "Simran", provider: "SARVAM", gender: "female", description: "Calm & Composed", tags: ["Professional"] },
  { id: "kavya", name: "Kavya", provider: "SARVAM", gender: "female", description: "Young & Vibrant", tags: ["Playful"] },
  { id: "amit", name: "Amit", provider: "SARVAM", gender: "male", description: "Bold & Direct", tags: ["Confident"] },
  { id: "dev", name: "Dev", provider: "SARVAM", gender: "male", description: "Warm & Grounded", tags: ["Trustworthy"] },
  { id: "varun", name: "Varun", provider: "SARVAM", gender: "male", description: "Energetic Male", tags: ["Social Media"] },
  { id: "kabir", name: "Kabir", provider: "SARVAM", gender: "male", description: "Professional Tone", tags: ["Corporate"] },
  { id: "tanya", name: "Tanya", provider: "SARVAM", gender: "female", description: "Clear Female", tags: ["Concise"] },
  { id: "sunny", name: "Sunny", provider: "SARVAM", gender: "male", description: "Friendly Youth", tags: ["Casual"] },
];

export const GOOGLE_VOICES: Voice[] = [
  { id: "Zephyr", name: "Zephyr", provider: "GOOGLE", gender: "female", description: "Soft and airy", tags: ["Preview"] },
  { id: "Puck", name: "Puck", provider: "GOOGLE", gender: "male", description: "Bright and conversational", tags: ["Preview", "Official"] },
  { id: "Charon", name: "Charon", provider: "GOOGLE", gender: "male", description: "Rich and authoritative", tags: ["Preview"] },
  { id: "Kore", name: "Kore", provider: "GOOGLE", gender: "female", description: "Warm and clear", tags: ["Preview", "Official"] },
  { id: "Fenrir", name: "Fenrir", provider: "GOOGLE", gender: "male", description: "Deep and grounded", tags: ["Preview"] },
  { id: "Leda", name: "Leda", provider: "GOOGLE", gender: "female", description: "Smooth and polished", tags: ["Preview"] },
  { id: "Aoede", name: "Aoede", provider: "GOOGLE", gender: "female", description: "Friendly and expressive", tags: ["Preview"] },
  { id: "Orus", name: "Orus", provider: "GOOGLE", gender: "male", description: "Confident and crisp", tags: ["Preview"] },
  { id: "Mira", name: "Mira", provider: "GOOGLE", gender: "female", description: "Clear and present", tags: ["Preview"] },
  { id: "Lyra", name: "Lyra", provider: "GOOGLE", gender: "female", description: "Smooth and lyrical", tags: ["Preview"] },
  { id: "Vega", name: "Vega", provider: "GOOGLE", gender: "female", description: "Bright and energetic", tags: ["Preview"] },
  { id: "Cetus", name: "Cetus", provider: "GOOGLE", gender: "male", description: "Deep and steady", tags: ["Preview"] },
  { id: "Hadar", name: "Hadar", provider: "GOOGLE", gender: "male", description: "Warm and grounded", tags: ["Preview"] },
  { id: "Algieba", name: "Algieba", provider: "GOOGLE", gender: "male", description: "Crisp and articulate", tags: ["Preview"] },
  { id: "Eridani", name: "Eridani", provider: "GOOGLE", gender: "female", description: "Calm and polished", tags: ["Preview"] },
  { id: "Sulafat", name: "Sulafat", provider: "GOOGLE", gender: "female", description: "Soft and elegant", tags: ["Preview"] },
  { id: "Rasalgethi", name: "Rasalgethi", provider: "GOOGLE", gender: "male", description: "Rich and measured", tags: ["Preview"] },
  { id: "Sirius", name: "Sirius", provider: "GOOGLE", gender: "male", description: "Clear and confident", tags: ["Preview"] },
  { id: "Procyon", name: "Procyon", provider: "GOOGLE", gender: "male", description: "Friendly and natural", tags: ["Preview"] },
  { id: "Altair", name: "Altair", provider: "GOOGLE", gender: "male", description: "Sharp and lively", tags: ["Preview"] },
  { id: "Deneb", name: "Deneb", provider: "GOOGLE", gender: "female", description: "Smooth and radiant", tags: ["Preview"] },
  { id: "Rigel", name: "Rigel", provider: "GOOGLE", gender: "male", description: "Low and authoritative", tags: ["Preview"] },
  { id: "Bellatrix", name: "Bellatrix", provider: "GOOGLE", gender: "female", description: "Bold and expressive", tags: ["Preview"] },
  { id: "Spica", name: "Spica", provider: "GOOGLE", gender: "female", description: "Bright and crisp", tags: ["Preview"] },
  { id: "Arcturus", name: "Arcturus", provider: "GOOGLE", gender: "male", description: "Deep and reassuring", tags: ["Preview"] },
  { id: "Vela", name: "Vela", provider: "GOOGLE", gender: "female", description: "Gentle and open", tags: ["Preview"] },
  { id: "Polaris", name: "Polaris", provider: "GOOGLE", gender: "female", description: "Steady and clear", tags: ["Preview"] },
  { id: "Atria", name: "Atria", provider: "GOOGLE", gender: "female", description: "Warm and balanced", tags: ["Preview"] },
  { id: "Rana", name: "Rana", provider: "GOOGLE", gender: "female", description: "Friendly and bright", tags: ["Preview"] },
  { id: "Alnair", name: "Alnair", provider: "GOOGLE", gender: "male", description: "Polished and direct", tags: ["Preview"] },
  { id: "Gacrux", name: "Gacrux", provider: "GOOGLE", gender: "male", description: "Measured and calm", tags: ["Preview"] },
  { id: "Schedar", name: "Schedar", provider: "GOOGLE", gender: "female", description: "Clear and confident", tags: ["Preview"] },
];

export const GOOGLE_TTS_MODELS = [
  { value: "gemini-3.1-flash-tts-preview", label: "Gemini 3.1 Flash TTS Preview" },
  { value: "gemini-2.5-flash-preview-tts", label: "Gemini 2.5 Flash Preview TTS" },
  { value: "gemini-2.5-pro-preview-tts", label: "Gemini 2.5 Pro Preview TTS" },
] as const;

export const DEFAULT_GOOGLE_TTS_MODEL = GOOGLE_TTS_MODELS[0].value;
