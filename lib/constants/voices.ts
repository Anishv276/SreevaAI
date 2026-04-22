export interface Voice {
  id: string;
  name: string;
  provider: "CARTESIA" | "SARVAM";
  description: string;
  tags?: string[];
}

export const CARTESIA_VOICES: Voice[] = [
  {
    id: "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
    name: "Jacqueline",
    provider: "CARTESIA",
    description: "Refined & Professional",
    tags: ["Verified", "Stable", "Corporate"]
  },
  {
    id: "95d51f79-c397-46f9-b49a-23763d3eaa2d",
    name: "Arushi",
    provider: "CARTESIA",
    description: "Hinglish Speaker",
    tags: ["Bilingual", "Indian Accent", "Warm"]
  },
  {
    id: "f786b574-daa5-4673-aa0c-cbe3e8534c02",
    name: "Katie",
    provider: "CARTESIA",
    description: "British Sophisticated",
    tags: ["Elegant", "Formal"]
  },
  {
    id: "e07c00bc-4134-4eae-9ea4-1a55fb45746b",
    name: "Brooke",
    provider: "CARTESIA",
    description: "Young & Casual",
    tags: ["Friendly", "Natural", "West Coast"]
  },
  {
    id: "5ee9feff-1265-424a-9d7f-8e4d431a12c7",
    name: "Ronald",
    provider: "CARTESIA",
    description: "Deep & Authoritative",
    tags: ["Professional", "Trustworthy"]
  },
  {
    id: "694f9389-aac1-45b6-b726-9d9369183238",
    name: "Sarah",
    provider: "CARTESIA",
    description: "Classical British",
    tags: ["Formal", "Traditional"]
  },
  {
    id: "638385f3-3333-4f5d-85a2-3f820c64b732",
    name: "Jessica",
    provider: "CARTESIA",
    description: "Bright & Energetic",
    tags: ["Engaging", "Upbeat"]
  },
  {
    id: "248be1fc-3d27-4452-9457-3705bf68bf8f",
    name: "Barista",
    provider: "CARTESIA",
    description: "Warm & Helpful",
    tags: ["Service-oriented", "Gentle"]
  },
];

export const SARVAM_VOICES: Voice[] = [
  { id: "shubh", name: "Shubh", provider: "SARVAM", description: "Conversational & Friendly", tags: ["Official", "Flagship"] },
  { id: "manan", name: "Manan", provider: "SARVAM", description: "Consistent & Reliable", tags: ["Conversational"] },
  { id: "ishita", name: "Ishitha", provider: "SARVAM", description: "Dynamic & Engaging", tags: ["Official", "Flagship"] },
  { id: "shreya", name: "Shreya", provider: "SARVAM", description: "Professional & Authoritative", tags: ["News Style"] },
  { id: "priya", name: "Priya", provider: "SARVAM", description: "Warm & Caring", tags: ["Customer Service", "Recommended"] },
  { id: "aditya", name: "Aditya", provider: "SARVAM", description: "Energetic & Enthusiastic", tags: ["Young", "Upbeat"] },
  { id: "ritu", name: "Ritu", provider: "SARVAM", description: "Clear & Articulate", tags: ["Educational"] },
  { id: "rahul", name: "Rahul", provider: "SARVAM", description: "Deep & Resonant", tags: ["Authoritative"] },
  { id: "neha", name: "Neha", provider: "SARVAM", description: "Soft & Gentle", tags: ["Calm"] },
  { id: "pooja", name: "Pooja", provider: "SARVAM", description: "Cheerful & Bright", tags: ["Friendly"] },
  { id: "rohan", name: "Rohan", provider: "SARVAM", description: "Smooth & Natural", tags: ["Conversational"] },
  { id: "simran", name: "Simran", provider: "SARVAM", description: "Calm & Composed", tags: ["Professional"] },
  { id: "kavya", name: "Kavya", provider: "SARVAM", description: "Young & Vibrant", tags: ["Playful"] },
  { id: "amit", name: "Amit", provider: "SARVAM", description: "Bold & Direct", tags: ["Confident"] },
  { id: "dev", name: "Dev", provider: "SARVAM", description: "Warm & Grounded", tags: ["Trustworthy"] },
  { id: "varun", name: "Varun", provider: "SARVAM", description: "Energetic Male", tags: ["Social Media"] },
  { id: "kabir", name: "Kabir", provider: "SARVAM", description: "Professional Tone", tags: ["Corporate"] },
  { id: "tanya", name: "Tanya", provider: "SARVAM", description: "Clear Female", tags: ["Concise"] },
  { id: "sunny", name: "Sunny", provider: "SARVAM", description: "Friendly Youth", tags: ["Casual"] },
];
