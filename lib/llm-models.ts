export type ModelOption = {
  value: string;
  label: string;
};

export const OPENAI_LLM_MODELS: ModelOption[] = [
  { value: "gpt-4.1-mini", label: "gpt-4.1-mini" },
  { value: "gpt-4.1", label: "gpt-4.1" },
  { value: "gpt-4.1-nano", label: "gpt-4.1-nano" },
  { value: "gpt-4o-mini", label: "gpt-4o mini" },
  { value: "gpt-4o", label: "gpt-4o" },
  { value: "gpt-3.5-turbo", label: "gpt-3.5-turbo" },
  { value: "gpt-5.4", label: "gpt-5.4" },
  { value: "gpt-5.4-mini", label: "gpt-5.4-mini" },
  { value: "gpt-5.4-nano", label: "gpt-5.4-nano" },
  { value: "gpt-5-mini", label: "gpt-5-mini" },
  { value: "gpt-5.2", label: "gpt-5.2" },
  { value: "gpt-5.1", label: "gpt-5.1" },
  { value: "gpt-5-nano", label: "gpt-5-nano" },
];
