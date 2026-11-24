import { makeKeyEntry, saveStateToStorage } from "./storage";
import type { AppState, KeyEntry, ProviderId } from "./types";

export function maskKey(v: string): string {
  const s = String(v || "");
  if (s.length <= 10) return `${s.slice(0, 2)}••••${s.slice(-2)}`;
  return `${s.slice(0, 6)}••••••••${s.slice(-4)}`;
}

export function isKeyUsable(k: KeyEntry): boolean {
  return k.enabled && (!k.cooldownUntil || k.cooldownUntil <= Date.now());
}

export function getPoolAvailableCount(state: AppState, provider: ProviderId): number {
  return state.pools[provider].keys.filter(isKeyUsable).length;
}

export function describeKey(k: KeyEntry): { cls: "ok" | "cool" | "bad" | "off"; text: string } {
  if (!k.enabled) return { cls: "off", text: "已禁用" };
  const left = k.cooldownUntil - Date.now();
  if (left > 0) return { cls: "cool", text: `冷却 ${Math.ceil(left / 1000)}s` };
  if (k.state === "bad") return { cls: "bad", text: "失效" };
  return { cls: "ok", text: "可用" };
}

export function markKey(
  state: AppState,
  provider: ProviderId,
  key: KeyEntry | null,
  reason: string,
  cooldownMs: number,
  onSync?: () => void,
): void {
  if (!key) return;
  key.uses = (key.uses || 0) + 1;
  key.lastError = reason || "";
  if (cooldownMs > 0) {
    key.cooldownUntil = Date.now() + cooldownMs;
    key.state = "cool";
  } else if (reason) {
    key.state = "bad";
  } else {
    key.state = "ok";
  }
  const pool = state.pools[provider];
  const idx = pool.keys.findIndex((k) => k.id === key.id);
  if (idx >= 0 && pool.keys.length > 0) {
    pool.cursor = (idx + 1) % pool.keys.length;
  }
  saveStateToStorage(state);
  onSync?.();
}

export function pickKey(state: AppState, provider: ProviderId): KeyEntry | null {
  const pool = state.pools[provider];
  const now = Date.now();
  pool.keys.forEach((k) => {
    if (k.cooldownUntil && k.cooldownUntil <= now) {
      k.cooldownUntil = 0;
      if (k.state === "cool") k.state = "ok";
    }
  });
  const usable = pool.keys.filter(isKeyUsable);
  if (!usable.length) return null;
  if (pool.mode === "pinned") return usable[0];

  const n = pool.keys.length;
  for (let i = 0; i < n; i++) {
    const k = pool.keys[(pool.cursor + i) % n];
    if (isKeyUsable(k)) return k;
  }
  return usable[0];
}

export function rotateToNextKey(
  state: AppState,
  provider: ProviderId,
  from: KeyEntry,
): KeyEntry | null {
  const pool = state.pools[provider];
  const n = pool.keys.length;
  const start = pool.keys.findIndex((k) => k.id === from.id);
  for (let i = 1; i <= n; i++) {
    const k = pool.keys[(start + i) % n];
    if (isKeyUsable(k)) return k;
  }
  return null;
}

export function addKeysToPool(
  state: AppState,
  provider: ProviderId,
  rawText: string,
): { added: number; dup: number; bad: number } {
  const pool = state.pools[provider];
  const lines = String(rawText || "")
    .split(/[\r\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const existing = new Set(pool.keys.map((k) => k.value));
  let added = 0;
  let dup = 0;
  let bad = 0;

  lines.forEach((v, idx) => {
    const clean = v.replace(/^["']|["']$/g, "").trim();
    if (clean.length < 12) {
      bad++;
      return;
    }
    if (existing.has(clean)) {
      dup++;
      return;
    }
    existing.add(clean);
    pool.keys.push(makeKeyEntry(provider, clean, idx));
    added++;
  });

  if (added > 0) saveStateToStorage(state);
  return { added, dup, bad };
}
