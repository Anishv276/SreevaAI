import { extractJDFromText } from "./openai";

type ExtractedSkill = { skill?: string; name?: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function uniqueStrings(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function toBulletText(items: string[]): string | null {
  const cleaned = uniqueStrings(items);
  if (cleaned.length === 0) return null;
  return cleaned
    .map((item) => (item.startsWith("•") ? item : `• ${item}`))
    .join("\n");
}

function flattenSkills(skills: unknown): string[] {
  if (!skills || typeof skills !== "object") return [];
  const record = skills as Record<string, any>;
  const mustHave = Array.isArray(record.must_have) ? record.must_have : [];
  const goodToHave = Array.isArray(record.good_to_have) ? record.good_to_have : [];

  const required = mustHave.map((item: ExtractedSkill) => String(item?.skill || item?.name || "").trim());
  const optional = goodToHave.map((item: ExtractedSkill | string) => {
    if (typeof item === "string") return item.trim();
    return String(item?.skill || item?.name || "").trim();
  });

  return uniqueStrings([...required, ...optional]);
}

export type DriveJdExtractionResult = {
  extractedDetails: string;
  skills: string | null;
  responsibilities: string | null;
};

export async function deriveDriveJdFieldsFromDescription(
  description: string,
  modelOverride = "gpt-5.4-mini",
): Promise<DriveJdExtractionResult | null> {
  const text = description.trim();
  if (text.length < 80) return null;

  try {
    console.log("[DRIVE-JD] Extracting drive fields from description", {
      descriptionLength: text.length,
      model: modelOverride,
    });

    const result = await extractJDFromText(text, modelOverride);
    const extracted = result?.data || {};

    return {
      extractedDetails: JSON.stringify(extracted),
      skills: toBulletText(flattenSkills(extracted.skills)),
      responsibilities: toBulletText(
        Array.isArray(extracted.responsibilities)
          ? extracted.responsibilities.map((item: unknown) => String(item || "").trim()).filter(Boolean)
          : [],
      ),
    };
  } catch (error: any) {
    console.warn("[DRIVE-JD] Failed to derive JD fields from description:", error?.message || error);
    return null;
  }
}

export function shouldBackfillDriveJdFields(input: {
  description?: string | null;
  skills?: string | null;
  responsibilities?: string | null;
  extractedDetails?: string | null;
}): boolean {
  return Boolean(
    isNonEmptyString(input.description) &&
      (!isNonEmptyString(input.skills) ||
        !isNonEmptyString(input.responsibilities) ||
        !isNonEmptyString(input.extractedDetails)),
  );
}
