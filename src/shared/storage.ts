import {
  DEFAULT_FISH_PARAMS,
  GEMINI_MODEL,
  LOCAL_DEFAULT_CORS,
  STORE_KEY,
  THEME_KEY,
} from "./constants";
import type {
  AppState,
  FishBookmark,
  FishTtsParams,
  KeyEntry,
  ProviderId,
  ThemeMode,
} from "./types";

export function isLoopbackHost(host: string): boolean {
  return /^(127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])$/i.test(host);
}

export function getDefaultCorsForEnv(): string {
  if (typeof window === "undefined") return "";
  const { protocol, hostname } = window.location;
  if (protocol === "file:" || isLoopbackHost(hostname)) {
    return LOCAL_DEFAULT_CORS;
  }
  return "";
}

export function createInitialState(): AppState {
  return {
    engine: "gemini",
    geminiVoice: "Kore",
    fishRefId: "",
    fish: { ...DEFAULT_FISH_PARAMS },
    rate: 1.0,
    pause: 50,
    emotion: 60,
    useStyle: true,
    styleText: "",
    playSpeedIdx: 1,
    busy: false,
    busyLabel: "",
    history: [],
    current: null,
    playing: false,
    seq: 0,
    chunkCount: 1,
    pools: {
      gemini: { keys: [], mode: "round", cursor: 0 },
      fish: { keys: [], mode: "round", cursor: 0 },
    },
    books: [],
    cors: getDefaultCorsForEnv(),
    corsExplicit: false,
    activeModel: GEMINI_MODEL,
    _lastReq: 0,
  };
}

export function makeKeyEntry(provider: ProviderId, value: string, idx = 0): KeyEntry {
  return {
    id: `${provider}-${Date.now() + idx}-${Math.random().toString(36).slice(2, 7)}`,
    value,
    enabled: true,
    cooldownUntil: 0,
    state: "ok",
    uses: 0,
    lastError: "",
  };
}

export function loadStateFromStorage(state: AppState): void {
  let saved: Record<string, unknown> | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
  } catch {
    saved = null;
  }
  if (!saved || typeof saved !== "object") return;

  const pools = saved.pools as Record<string, { keys?: unknown[]; mode?: string; cursor?: number }> | undefined;
  if (pools) {
    (["gemini", "fish"] as ProviderId[]).forEach((p) => {
      const src = pools[p];
      if (src && Array.isArray(src.keys)) {
        state.pools[p].keys = src.keys
          .map((item) => {
            const k = item as Partial<KeyEntry>;
            return {
              id: k.id || `${p}-${Math.random().toString(36).slice(2, 9)}`,
              value: String(k.value || ""),
              enabled: k.enabled !== false,
              cooldownUntil: Number(k.cooldownUntil) || 0,
              state: k.state === "cool" || k.state === "bad" ? k.state : "ok",
              uses: Number(k.uses) || 0,
              lastError: String(k.lastError || ""),
            } satisfies KeyEntry;
          })
          .filter((k) => k.value.length > 0);
        state.pools[p].mode = src.mode === "pinned" ? "pinned" : "round";
        state.pools[p].cursor = Number(src.cursor) || 0;
      }
    });
  }

  if (Array.isArray(saved.books)) {
    state.books = (saved.books as Array<Partial<FishBookmark>>)
      .filter((b) => b && typeof b.id === "string" && b.id.trim().length > 0)
      .map((b) => ({
        id: String(b.id).trim(),
        title: String(b.title || b.id),
        customName: b.customName ? String(b.customName) : undefined,
        authorName: b.authorName ? String(b.authorName) : undefined,
        coverUrl: b.coverUrl ? String(b.coverUrl) : undefined,
        languages: Array.isArray(b.languages) ? b.languages.map(String) : undefined,
        tags: Array.isArray(b.tags) ? b.tags.map(String) : undefined,
        sampleAudio: b.sampleAudio ? String(b.sampleAudio) : undefined,
        description: b.description ? String(b.description) : undefined,
        addedAt: Number(b.addedAt) || Date.now(),
      }));
  }

  if (saved.corsExplicit === true && typeof saved.cors === "string") {
    state.cors = saved.cors;
    state.corsExplicit = true;
  } else {
    state.cors = getDefaultCorsForEnv();
    state.corsExplicit = false;
  }

  const ui = saved.ui as Record<string, unknown> | undefined;
  if (ui) {
    if (ui.engine === "fish" || ui.engine === "gemini") state.engine = ui.engine;
    if (typeof ui.geminiVoice === "string" && ui.geminiVoice) {
      state.geminiVoice = ui.geminiVoice;
    }
    if (typeof ui.refId === "string") state.fishRefId = ui.refId;
    if (typeof ui.rate === "number") state.rate = ui.rate;
    if (typeof ui.pause === "number") state.pause = ui.pause;
    if (typeof ui.emotion === "number") state.emotion = ui.emotion;
    if (typeof ui.useStyle === "boolean") state.useStyle = ui.useStyle;
    if (typeof ui.styleText === "string") state.styleText = ui.styleText;
    if (ui.fish && typeof ui.fish === "object") {
      state.fish = {
        ...DEFAULT_FISH_PARAMS,
        ...(ui.fish as Partial<FishTtsParams>),
      };
    }
  }
}

export function saveStateToStorage(state: AppState): void {
  const data = {
    pools: {
      gemini: {
        mode: state.pools.gemini.mode,
        cursor: state.pools.gemini.cursor,
        keys: state.pools.gemini.keys,
      },
      fish: {
        mode: state.pools.fish.mode,
        cursor: state.pools.fish.cursor,
        keys: state.pools.fish.keys,
      },
    },
    books: state.books,
    cors: state.cors,
    corsExplicit: state.corsExplicit,
    ui: {
      engine: state.engine,
      geminiVoice: state.geminiVoice,
      refId: state.fishRefId,
      rate: state.rate,
      pause: state.pause,
      emotion: state.emotion,
      useStyle: state.useStyle,
      styleText: state.styleText,
      fish: state.fish,
    },
  };
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage quota errors
  }
}

/**
 * 仅在本地伴随服务（server.py, port 8080 或明确标记）下静默拉取 .local-keys.json，
 * 避免公开部署到 GitHub Pages 时携带硬编码密钥或触发 404 控制台报错。
 */
export async function tryHydrateLocalServerKeys(state: AppState): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const isLocalServer =
    isLoopbackHost(window.location.hostname) &&
    (window.location.port === "8080" ||
      document.documentElement.dataset.localServer === "1");
  if (!isLocalServer) return false;
  if (state.pools.gemini.keys.length > 0 || state.pools.fish.keys.length > 0) {
    return false;
  }
  try {
    const res = await fetch("/api/local-keys", { cache: "no-store" });
    if (!res.ok) return false;
    const json = (await res.json()) as { gemini?: string[]; fish?: string[] };
    let changed = false;
    (["gemini", "fish"] as ProviderId[]).forEach((p) => {
      const list = Array.isArray(json[p]) ? json[p] : [];
      if (list.length && state.pools[p].keys.length === 0) {
        state.pools[p].keys = list
          .map((v, i) => makeKeyEntry(p, String(v).trim(), i))
          .filter((k) => k.value.length >= 12);
        changed = true;
      }
    });
    if (changed) saveStateToStorage(state);
    return changed;
  } catch {
    return false;
  }
}

export function getInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") return saved;
    if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  } catch {
    // ignore
  }
  return "light";
}

export function setDocumentTheme(mode: ThemeMode): void {
  document.documentElement.setAttribute("data-theme", mode);
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    // ignore
  }
}
