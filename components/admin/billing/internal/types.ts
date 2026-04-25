export type InterviewStatus = "completed" | "in-progress" | "no-show" | "abandoned";

export type InterviewRow = {
  id: string;
  candidate: string;
  role: string;
  interviewer: string;
  type: string;
  durationSec: number;
  credits: number;
  status: InterviewStatus;
  date: string;
  cost: number;
  recording: boolean;
  transcript: boolean;
};

export type CreditPack = {
  id: string;
  credits: number;
  mins: number;
  price: number;
  blurb: string;
  popular?: boolean;
  save?: string;
};

export type HistorySort = { key: keyof InterviewRow; dir: "asc" | "desc" };
