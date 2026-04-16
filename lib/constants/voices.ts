export interface Voice {
  id: string;
  name: string;
  provider: "CARTESIA" | "SARVAM";
  description: string;
}

export const CARTESIA_VOICES: Voice[] = [
  {
    id: "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
    name: "Jacqueline",
    provider: "CARTESIA",
    description: "Verified Agent (Stable)",
  },
  {
    id: "95d51f79-c397-46f9-b49a-23763d3eaa2d",
    name: "Arushi",
    provider: "CARTESIA",
    description: "Hinglish Speaker (Indian Accent)",
  },
  {
    id: "f786b574-daa5-4673-aa0c-cbe3e8534c02",
    name: "Katie",
    provider: "CARTESIA",
    description: "British Sophisticated",
  },
  {
    id: "e07c00bc-4134-4eae-9ea4-1a55fb45746b",
    name: "Brooke",
    provider: "CARTESIA",
    description: "California Girl (Casual)",
  },
  {
    id: "5ee9feff-1265-424a-9d7f-8e4d431a12c7",
    name: "Ronald",
    provider: "CARTESIA",
    description: "Professional Male (Deep)",
  },
  {
    id: "694f9389-aac1-45b6-b726-9d9369183238",
    name: "Sarah",
    provider: "CARTESIA",
    description: "British Lady (Classical)",
  },
  {
    id: "638385f3-3333-4f5d-85a2-3f820c64b732",
    name: "Jessica",
    provider: "CARTESIA",
    description: "California Girl (Legacy)",
  },
  {
    id: "248be1fc-3d27-4452-9457-3705bf68bf8f",
    name: "Barista",
    provider: "CARTESIA",
    description: "Warm Helper",
  },
];
