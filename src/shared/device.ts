import { DEVICE_COOKIE_NAME, DEVICE_MODE_KEY } from "./constants";
import type { DeviceMode, DeviceTarget } from "./types";

const MOBILE_UA_RE =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|HarmonyOS|MicroMessenger|Windows Phone/i;

export function detectDeviceTarget(
  ua: string = typeof navigator !== "undefined" ? navigator.userAgent : "",
  maxTouchPoints: number = typeof navigator !== "undefined" ? navigator.maxTouchPoints || 0 : 0,
  viewportWidth: number = typeof window !== "undefined" ? window.innerWidth : 1280,
): DeviceTarget {
  const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { userAgentData?: { mobile?: boolean } }) : undefined;
  if (nav?.userAgentData?.mobile === true) return "mobile";
  if (MOBILE_UA_RE.test(ua)) return "mobile";
  // iPadOS Safari reports MacIntel with touch points > 1
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return "mobile";
  if (viewportWidth > 0 && viewportWidth <= 768 && maxTouchPoints > 0) return "mobile";
  return "desktop";
}

function readCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

export function writeDeviceOverride(mode: DeviceMode): void {
  try {
    if (mode === "auto") {
      localStorage.removeItem(DEVICE_MODE_KEY);
      document.cookie = `${DEVICE_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
    } else {
      localStorage.setItem(DEVICE_MODE_KEY, mode);
      document.cookie = `${DEVICE_COOKIE_NAME}=${encodeURIComponent(mode)}; path=/; max-age=2592000; SameSite=Lax`;
    }
  } catch {
    // Ignore storage restriction
  }
}

export function getSavedDeviceMode(): DeviceMode {
  try {
    const ls = localStorage.getItem(DEVICE_MODE_KEY);
    if (ls === "desktop" || ls === "mobile") return ls;
  } catch {
    // ignore
  }
  const ck = readCookie(DEVICE_COOKIE_NAME);
  if (ck === "desktop" || ck === "mobile") return ck;
  return "auto";
}

/**
 * 切换访问端版本（同时兼容 GitHub Pages 子目录与 Edge Gateway 同 URL 动态分发）
 */
export function switchDeviceExperience(target: DeviceTarget): void {
  writeDeviceOverride(target);
  const { pathname, search, hash } = window.location;
  const params = new URLSearchParams(search);
  params.set("view", target);

  // 如果当前 URL 显式处于 /desktop/ 或 /mobile/ 子目录下（如 GitHub Pages 静态分发）
  const subBundleMatch = pathname.match(/^(.*\/)(desktop|mobile)(?:\/(?:index\.html)?)?$/);
  if (subBundleMatch) {
    const basePrefix = subBundleMatch[1];
    window.location.assign(`${basePrefix}${target}/?${params.toString()}${hash}`);
    return;
  }

  // 如果处于同 URL Edge Gateway / local server.py 根路径下，带参重载由网关或分发器处理
  window.location.assign(`${pathname}?${params.toString()}${hash}`);
}

export function resetDeviceExperienceToAuto(): void {
  writeDeviceOverride("auto");
  const target = detectDeviceTarget();
  const { pathname, hash } = window.location;
  const subBundleMatch = pathname.match(/^(.*\/)(desktop|mobile)(?:\/(?:index\.html)?)?$/);
  if (subBundleMatch) {
    window.location.assign(`${subBundleMatch[1]}${target}/${hash}`);
    return;
  }
  window.location.assign(`${pathname}${hash}`);
}
