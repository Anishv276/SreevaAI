/**
 * device-fingerprint.ts
 * -----------------------------------------------------------------------------
 * Collects CAPABILITY entropy from the browser - screen specs, browser
 * engine, CPU count - and packages it for server-side hashing.
 *
 * No PII is collected:
 *   • No cookies, no cross-site tracking
 *   • No installed fonts, no canvas fingerprinting
 *   • All data is freely exposed by any browser to any JS running in a tab
 *
 * The server hashes this data and NEVER stores raw values.
 *
 * Why this is useful:
 *   Two candidates on the SAME university WiFi (same IP) will still have
 *   different screen resolutions, different browser versions, and different
 *   CPU counts -> only their ipHash matches, so severity = low.
 *
 *   Two sessions where the SAME laptop is reused will match BOTH ipHash AND
 *   deviceHash -> simultaneous match = high, sequential match = medium.
 */

export interface DeviceFingerprint {
  /** e.g. "1920x1080x24" - width × height × colorDepth */
  screen: string;
  /** number of logical CPU cores exposed by navigator.hardwareConcurrency */
  cpuCores: number;
  /** browser platform family derived from User-Agent (coarse, not granular) */
  platform: string;
  /** pixel device ratio (1, 1.5, 2, 3...) - differs across screen types */
  dpr: number;
  /** browser timezone offset in minutes - same campus -> same timezone */
  tzOffset: number;
}

/**
 * Collect the device fingerprint synchronously.
 * Safe to call from any client component (returns empty values on SSR).
 */
export function collectDeviceFingerprint(): DeviceFingerprint {
  if (typeof window === "undefined") {
    // SSR-safe fallback - should never reach the token API in this state
    return { screen: "unknown", cpuCores: 0, platform: "unknown", dpr: 1, tzOffset: 0 };
  }

  const s = window.screen;
  return {
    screen:    `${s.width}x${s.height}x${s.colorDepth}`,
    cpuCores:  navigator.hardwareConcurrency || 0,
    platform:  getPlatformFamily(navigator.userAgent),
    dpr:       Math.round((window.devicePixelRatio || 1) * 10) / 10,
    tzOffset:  new Date().getTimezoneOffset(),
  };
}

/**
 * Returns a coarse platform family string.
 * We deliberately keep this coarse - we want to distinguish LAPTOPS,
 * not individual browser builds. Matching to the patch-level would
 * be too volatile (browser updates daily).
 *
 * Examples:
 *   "Windows / Chrome"
 *   "macOS / Safari"
 *   "Linux / Firefox"
 */
function getPlatformFamily(ua: string): string {
  const os =
    /windows/i.test(ua) ? "Windows" :
    /macintosh|mac os x/i.test(ua) ? "macOS"   :
    /android/i.test(ua) ? "Android" :
    /iphone|ipad|ipod/i.test(ua) ? "iOS"   :
    /linux/i.test(ua) ? "Linux"   : "Unknown";

  const browser =
    /edg\//i.test(ua)     ? "Edge"    :
    /opr\/|opera/i.test(ua) ? "Opera"   :
    /chrome/i.test(ua)    ? "Chrome"  :
    /firefox/i.test(ua)   ? "Firefox" :
    /safari/i.test(ua)    ? "Safari"  : "Unknown";

  return `${os} / ${browser}`;
}
