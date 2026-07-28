/**
 * lib/demo-email-gate.ts
 * ─────────────────────
 * Validates that an email belongs to a business domain:
 *   1. Not a known free/consumer provider (gmail, yahoo, etc.)
 *   2. Not a known disposable/burner-mail domain (open-source blocklist)
 *
 * No live DNS/MX lookup -- outbound DNS from the deployed environment isn't
 * reliable enough to gate on, and a failed lookup was blocking real company
 * domains. Proving mailbox ownership (and implicitly that the domain
 * actually receives mail) happens via the OTP-to-email step (see
 * /api/demo/otp/*).
 */
import disposableDomains from "disposable-email-domains";

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.in",
  "yahoo.co.uk",
  "hotmail.com",
  "hotmail.co.uk",
  "outlook.com",
  "outlook.in",
  "live.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "pm.me",
  "zoho.com",
  "rediffmail.com",
  "yandex.com",
  "yandex.ru",
  "mail.com",
  "gmx.com",
  "gmx.de",
  "inbox.com",
  "fastmail.com",
  "hey.com",
  "tutanota.com",
]);

const DISPOSABLE_DOMAINS = new Set(disposableDomains);

export function extractDomain(email: string): string | null {
  if (!email || !email.includes("@")) return null;
  const domain = email.split("@")[1]?.toLowerCase().trim();
  return domain || null;
}

export async function isBusinessEmail(email: string): Promise<boolean> {
  const domain = extractDomain(email);
  if (!domain) return false;
  return !FREE_EMAIL_DOMAINS.has(domain) && !DISPOSABLE_DOMAINS.has(domain);
}
