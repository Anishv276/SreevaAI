export type InterviewStatus = "completed" | "in-progress" | "no-show" | "abandoned" | "pending";

export type InterviewRow = {
  id: string;
  candidate: string;
  role: string;
  interviews: number;
  creditsUsed: number;
  status: InterviewStatus;
  date: string;
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
