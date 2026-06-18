/**
 * Lightweight XSS sanitizer for client-side use.
 * Strips script/event-handler injections while preserving safe formatting.
 * Use this whenever rendering user-supplied or AI-generated content via
 * dangerouslySetInnerHTML or innerHTML.
 */
/** Tags considered safe to keep in rendered HTML */
const SAFE_TAGS = new Set([
  "br", "b", "i", "strong", "em", "u", "p", "ul", "ol", "li",
  "span", "h1", "h2", "h3", "h4", "h5", "h6",
]);
/** Attributes considered safe on the above tags */
const SAFE_ATTRS = new Set(["style", "class", "href", "target"]);
/**
 * Strips all HTML tags that are not in SAFE_TAGS, and removes all event
 * handler attributes (onXxx) and javascript: href values.
 *
 * This is intentionally conservative - use a proper library like DOMPurify
 * for richer HTML if needed.
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return "";
  // 1. Remove script blocks entirely (including content).
  let clean = dirty.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  // 2. Remove style blocks entirely.
  clean = clean.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
  // 3. Strip all event handler attributes (onclick, onload, onerror, etc.).
  clean = clean.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "");
  // 4. Strip javascript: protocol from href/src/action attributes.
  clean = clean.replace(/(href|src|action)\s*=\s*["']?\s*javascript:[^"'>\s]*/gi, "$1=\"#\"");
  // 5. Strip data: URIs in src attributes (potential XSS vector).
  clean = clean.replace(/(src)\s*=\s*["']?\s*data:[^"'>\s]*/gi, "$1=\"\"");
  // 6. Remove any remaining unsafe tags while keeping their inner text.
  clean = clean.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (match, tag: string) => {
    if (SAFE_TAGS.has(tag.toLowerCase())) return match;
    // Replace unsafe tag with nothing (strips the tag, keeps text content).
    return "";
  });
  return clean;
}
/**
 * Sanitize a plain-text string that should NOT contain any HTML.
 * Encodes < > & " ' to their HTML entity equivalents.
 */
export function escapeHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
/**
 * Converts newlines to <br /> tags in a sanitized string.
 * Safe to use with dangerouslySetInnerHTML.
 */
export function nl2br(text: string): string {
  return escapeHtml(text).replace(/\n/g, "<br />");
}
