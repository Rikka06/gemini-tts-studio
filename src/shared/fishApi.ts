import {
  blobToBase64,
  bytesToBase64,
  concatBytes,
  concatInt16,
  extractWaveformPeaks,
  pcmToWav,
  probeDuration,
  sleep,
  splitText,
  wavToPcm,
} from "./audio";
import {
  COOLDOWN_401,
  COOLDOWN_429,
  FISH_API_ORIGIN,
  FISH_ASSET_ORIGIN,
  FISH_CACHE_KEY,
  FISH_CHUNK,
  FISH_DEFAULT_MODEL,
  FISH_FALLBACK_MODELS,
  FISH_PRESET_VOICES,
  LANG_DISPLAY_MAP,
  MAX_RETRY,
  REQUEST_TIMEOUT,
} from "./constants";
import type { ApiError, GeneratedAudioResult, TtsNotify } from "./geminiApi";
import { markKey, maskKey, pickKey, rotateToNextKey } from "./keyPool";
import { isLoopbackHost } from "./storage";
import type {
  AppState,
  FishSearchQuery,
  FishSearchResponse,
  FishVoiceModel,
} from "./types";

const VOICE_CACHE_TTL = 24 * 60 * 60 * 1000;
const VOICE_CACHE_LIMIT = 240;

const memoryCache = new Map<string, FishVoiceModel>();
const inFlightModelReq = new Map<string, Promise<FishVoiceModel | null>>();
let cacheLoaded = false;

function seedPresets(): void {
  for (const p of FISH_PRESET_VOICES) {
    if (!memoryCache.has(p.id)) {
      memoryCache.set(p.id, p);
    }
  }
}

function loadVoiceCache(): void {
  if (cacheLoaded) return;
  cacheLoaded = true;
  seedPresets();
  try {
    const raw = JSON.parse(localStorage.getItem(FISH_CACHE_KEY) || "null") as
      | Record<string, FishVoiceModel>
      | null;
    if (raw && typeof raw === "object") {
      for (const [id, v] of Object.entries(raw)) {
        if (v && typeof v === "object" && v.title) {
          memoryCache.set(id, v);
        }
      }
    }
  } catch {
    // ignore
  }
}

function persistVoiceCache(): void {
  try {
    const entries = Array.from(memoryCache.entries())
      .sort((a, b) => (b[1].fetchedAt || 0) - (a[1].fetchedAt || 0))
      .slice(0, VOICE_CACHE_LIMIT);
    const obj: Record<string, FishVoiceModel> = {};
    for (const [k, v] of entries) obj[k] = v;
    localStorage.setItem(FISH_CACHE_KEY, JSON.stringify(obj));
  } catch {
    // ignore quota errors
  }
}

export function resolveFishAssetUrl(path: string | undefined | null): string {
  const s = String(path || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `${FISH_ASSET_ORIGIN}/${s.replace(/^\/+/, "")}`;
}

export function formatFishLanguage(code: string): string {
  const k = String(code || "").toLowerCase();
  return LANG_DISPLAY_MAP[k] || code.toUpperCase();
}

export function normalizeFishModel(raw: Record<string, unknown>): FishVoiceModel {
  const id = String(raw._id || raw.id || "");
  const author = (raw.author as Record<string, unknown> | undefined) || {};
  const samplesRaw = Array.isArray(raw.samples) ? raw.samples : [];
  const samples = samplesRaw
    .map((s) => {
      const item = s as Record<string, unknown>;
      const taskId = String(item.task_id || item.taskId || "");
      const audioUrl = String(item.audio || "") || (taskId ? `https://platform.r2.fish.audio/task/${taskId}.mp3` : "");
      return {
        title: String(item.title || "试听样音"),
        text: String(item.text || ""),
        taskId,
        audio: audioUrl,
      };
    })
    .filter((s) => Boolean(s.audio));

  return {
    id,
    title: String(raw.title || id || "未命名音色"),
    description: String(raw.description || ""),
    coverUrl: resolveFishAssetUrl(String(raw.cover_image || raw.coverUrl || "")),
    authorId: String(author._id || author.id || ""),
    authorName: String(author.nickname || raw.authorName || "Fish Creator"),
    authorAvatar: resolveFishAssetUrl(String(author.avatar || "")),
    languages: Array.isArray(raw.languages) ? raw.languages.map(String) : [],
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    samples,
    likeCount: Number(raw.like_count ?? raw.likeCount ?? 0),
    markCount: Number(raw.mark_count ?? raw.markCount ?? 0),
    taskCount: Number(raw.task_count ?? raw.taskCount ?? 0),
    createdAt: raw.created_at ? String(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? String(raw.updated_at) : undefined,
    defaultText: raw.default_text ? String(raw.default_text) : undefined,
    fetchedAt: Date.now(),
  };
}

export function getCachedFishModel(id: string): FishVoiceModel | null {
  loadVoiceCache();
  if (!id) return null;
  return memoryCache.get(id.trim()) || null;
}

export function getFishDisplayTitle(state: AppState): string {
  const id = state.fishRefId.trim();
  if (!id) return "默认音色 (S2.1)";
  const book = state.books.find((b) => b.id === id);
  const cached = getCachedFishModel(id);
  if (book?.customName) return book.customName;
  if (cached?.title) return cached.title;
  if (book?.title && book.title !== id) return book.title;
  return `ID · ${id.slice(0, 8)}…`;
}

/**
 * 解析 Fish API 代理地址：
 * 1) 留空 -> 直连 https://api.fish.audio<path>
 * 2) 本地回环 (127.0.0.1 / localhost) -> <origin><path>
 * 3) 自定义反向代理路径（如 https://my-worker.workers.dev/api/fish）-> <prefix><path>
 * 4) 正向 CORS 代理前缀（如 https://corsproxy.io/? 或 https://proxy/）-> <prefix>https://api.fish.audio<path>
 */
export function resolveFishApiUrl(endpointPath: string, corsPrefix: string): string {
  const cleanPath = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
  const prefix = String(corsPrefix || "").trim();
  if (!prefix) return `${FISH_API_ORIGIN}${cleanPath}`;

  if (prefix.includes("?")) {
    return `${prefix}${encodeURIComponent(`${FISH_API_ORIGIN}${cleanPath}`)}`;
  }

  let parsed: URL | null = null;
  try {
    parsed = new URL(prefix);
  } catch {
    parsed = null;
  }

  if (parsed) {
    const trimmed = prefix.replace(/\/+$/, "");
    if (isLoopbackHost(parsed.hostname)) {
      return `${trimmed}${cleanPath}`;
    }
    if (/\/api\/fish$/i.test(parsed.pathname.replace(/\/+$/, ""))) {
      return `${trimmed}${cleanPath}`;
    }
    if (/workers\.dev$/i.test(parsed.hostname) && (parsed.pathname === "/" || parsed.pathname === "")) {
      return `${trimmed}${cleanPath}`;
    }
  }

  const base = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return `${base}${FISH_API_ORIGIN}${cleanPath}`;
}

export async function searchFishModels(
  query: FishSearchQuery,
  options?: { apiKey?: string; corsPrefix?: string },
): Promise<FishSearchResponse> {
  loadVoiceCache();
  const params = new URLSearchParams();
  params.set("page_number", String(query.pageNumber || 1));
  params.set("page_size", String(query.pageSize || 20));
  params.set("sort_by", query.sortBy || "score");
  if (query.title?.trim()) params.set("title", query.title.trim());
  if (query.language) params.set("language", query.language);
  if (query.tag) params.set("tag", query.tag);
  if (query.self) params.set("self", "true");

  const path = `/model?${params.toString()}`;
  const headers: Record<string, string> = {};
  if (query.self && options?.apiKey) {
    headers.Authorization = `Bearer ${options.apiKey}`;
  }

  let res: Response | null = null;
  // GET /model 原生支持 CORS；若直连失败且用户配置了代理，则兜底尝试代理
  try {
    res = await fetch(`${FISH_API_ORIGIN}${path}`, { headers });
  } catch (err) {
    if (options?.corsPrefix) {
      res = await fetch(resolveFishApiUrl(path, options.corsPrefix), { headers });
    } else {
      throw err;
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`搜索音色失败 (HTTP ${res.status})${text ? ` · ${text.slice(0, 120)}` : ""}`);
  }

  const json = (await res.json()) as {
    total?: number;
    items?: Array<Record<string, unknown>>;
  };
  const rawItems = Array.isArray(json.items) ? json.items : [];
  const items = rawItems.map(normalizeFishModel);
  items.forEach((m) => {
    if (m.id) memoryCache.set(m.id, m);
  });
  persistVoiceCache();

  const total = Number(json.total ?? items.length);
  const page = query.pageNumber || 1;
  const pageSize = query.pageSize || 20;
  return {
    total,
    items,
    hasMore: items.length >= pageSize && page * pageSize < total,
  };
}

export async function fetchFishModelById(
  id: string,
  options?: { apiKey?: string; corsPrefix?: string; force?: boolean },
): Promise<FishVoiceModel | null> {
  loadVoiceCache();
  const cleanId = id.trim();
  if (!cleanId) return null;

  const existing = memoryCache.get(cleanId);
  if (
    existing &&
    !options?.force &&
    existing.fetchedAt > 0 &&
    Date.now() - existing.fetchedAt < VOICE_CACHE_TTL
  ) {
    return existing;
  }

  const inflight = inFlightModelReq.get(cleanId);
  if (inflight) return inflight;

  const task = (async () => {
    const path = `/model/${encodeURIComponent(cleanId)}`;
    const attemptFetch = async (useAuth: boolean, useProxy: boolean) => {
      const headers: Record<string, string> = {};
      if (useAuth && options?.apiKey) headers.Authorization = `Bearer ${options.apiKey}`;
      const url = useProxy && options?.corsPrefix
        ? resolveFishApiUrl(path, options.corsPrefix)
        : `${FISH_API_ORIGIN}${path}`;
      return fetch(url, { headers });
    };

    try {
      let res = await attemptFetch(false, false);
      if ((res.status === 401 || res.status === 403 || res.status === 404) && options?.apiKey) {
        res = await attemptFetch(true, false);
      }
      if (!res.ok) return existing || null;
      const raw = (await res.json()) as Record<string, unknown>;
      const model = normalizeFishModel(raw);
      if (model.id) {
        memoryCache.set(model.id, model);
        persistVoiceCache();
      }
      return model;
    } catch {
      if (options?.corsPrefix) {
        try {
          const res = await attemptFetch(Boolean(options?.apiKey), true);
          if (res.ok) {
            const raw = (await res.json()) as Record<string, unknown>;
            const model = normalizeFishModel(raw);
            if (model.id) {
              memoryCache.set(model.id, model);
              persistVoiceCache();
            }
            return model;
          }
        } catch {
          // ignore
        }
      }
      return existing || null;
    } finally {
      inFlightModelReq.delete(cleanId);
    }
  })();

  inFlightModelReq.set(cleanId, task);
  return task;
}

export async function hydrateFishModelIds(
  ids: string[],
  options?: { apiKey?: string; corsPrefix?: string },
  onModelResolved?: (model: FishVoiceModel) => void,
): Promise<void> {
  const unique = Array.from(new Set(ids.map((s) => s.trim()).filter(Boolean)));
  const concurrency = 4;
  for (let i = 0; i < unique.length; i += concurrency) {
    const slice = unique.slice(i, i + concurrency);
    await Promise.all(
      slice.map(async (id) => {
        const model = await fetchFishModelById(id, options);
        if (model) onModelResolved?.(model);
      }),
    );
  }
}

export async function testFishProxyConnectivity(
  corsPrefix: string,
): Promise<{ ok: boolean; latencyMs: number; message: string }> {
  const t0 = performance.now();
  const target = resolveFishApiUrl("/model?page_size=1&page_number=1", corsPrefix);
  try {
    const res = await fetch(target, { method: "GET" });
    const ms = Math.round(performance.now() - t0);
    if (!res.ok) {
      return {
        ok: false,
        latencyMs: ms,
        message: `代理返回 HTTP ${res.status}（${target}）`,
      };
    }
    return {
      ok: true,
      latencyMs: ms,
      message: `代理连通正常 (${ms} ms)`,
    };
  } catch (err) {
    const ms = Math.round(performance.now() - t0);
    return {
      ok: false,
      latencyMs: ms,
      message: err instanceof Error ? err.message : "代理网络不可达或 CORS 未放行",
    };
  }
}

function buildFishBody(state: AppState, text: string): Record<string, unknown> {
  const f = state.fish;
  const body: Record<string, unknown> = {
    text,
    format: f.format,
    chunk_length: f.chunkLength,
    normalize: f.normalize,
    temperature: Number(f.temperature.toFixed(2)),
    top_p: Number(f.topP.toFixed(2)),
    repetition_penalty: Number(f.repetitionPenalty.toFixed(2)),
    latency: f.latency,
  };

  if (f.format === "mp3") body.mp3_bitrate = f.mp3Bitrate;
  if (f.format === "opus") body.opus_bitrate = f.opusBitrate;
  if (f.sampleRate > 0) body.sample_rate = f.sampleRate;

  const ref = state.fishRefId.trim();
  if (ref) {
    const multi = ref.split(/[,，\s]+/).filter((x) => x.length >= 16);
    body.reference_id = multi.length > 1 ? multi : ref;
  }

  if (Math.abs(f.speed - 1) > 0.001 || f.volume !== 0) {
    body.prosody = {
      speed: Number(f.speed.toFixed(2)),
      volume: f.volume,
    };
  }

  return body;
}

async function fishOnce(
  state: AppState,
  text: string,
  apiKey: string,
  model: string,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT);
  try {
    let res: Response;
    const url = resolveFishApiUrl("/v1/tts", state.cors);
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          model,
        },
        body: JSON.stringify(buildFishBody(state, text)),
        signal: ctrl.signal,
      });
    } catch (netErr) {
      const e: ApiError = new Error(
        "Failed to fetch · 浏览器拦截了跨域请求（CORS）或代理不可达。",
      );
      e.cors = true;
      e.cause = netErr;
      throw e;
    }

    if (!res.ok) {
      const ct = String(res.headers.get("content-type") || "");
      let detail = "";
      if (ct.includes("application/json")) {
        try {
          const j = (await res.json()) as { message?: string; detail?: string; error?: string };
          detail = j.message || j.detail || j.error || JSON.stringify(j);
        } catch {
          detail = "";
        }
      } else {
        try {
          detail = await res.text();
        } catch {
          detail = "";
        }
      }
      const e: ApiError = new Error(
        `HTTP ${res.status}${detail ? ` · ${String(detail).slice(0, 300)}` : ""}`,
      );
      e.status = res.status;
      e.detail = String(detail);
      throw e;
    }

    const buf = await res.arrayBuffer();
    const ct = String(res.headers.get("content-type") || "audio/mpeg");
    const bytes = new Uint8Array(buf);
    if (bytes.length && bytes[0] === 0x7b) {
      let msg = "";
      try {
        msg = (JSON.parse(new TextDecoder().decode(bytes)) as { message?: string }).message || "";
      } catch {
        // ignore
      }
      const e: ApiError = new Error(msg ? `Fish 返回错误：${msg}` : "Fish 返回了 JSON 而不是音频");
      e.status = 402;
      e.detail = msg;
      throw e;
    }
    return { bytes, contentType: ct };
  } finally {
    clearTimeout(timer);
  }
}

async function fishChunk(
  state: AppState,
  text: string,
  opts?: { onNotify?: TtsNotify; onKeySync?: () => void },
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const poolName = "fish";
  let key = pickKey(state, poolName);
  if (!key) {
    throw new Error("Fish Audio Key 池中没有可用 Key，请在「Key 池管理」中添加或启用 Key。");
  }

  let attempt = 0;
  let lastErr: unknown = null;
  let modelIdx = 0;
  const chosenModel = state.fish.model || FISH_DEFAULT_MODEL;
  const chain = [chosenModel, ...FISH_FALLBACK_MODELS.filter((m) => m !== chosenModel)];

  while (attempt < MAX_RETRY) {
    attempt++;
    try {
      const out = await fishOnce(state, text, key.value, chain[modelIdx]);
      markKey(state, poolName, key, "", 0, opts?.onKeySync);
      return out;
    } catch (err) {
      const e = err as ApiError;
      lastErr = e;
      if (e.cors) throw e;

      const st = e.status;
      if (st === 401 || st === 403) {
        markKey(state, poolName, key, "Key 无效", COOLDOWN_401, opts?.onKeySync);
        const next = rotateToNextKey(state, poolName, key);
        if (next) {
          opts?.onNotify?.(
            "warn",
            "Fish Key 不可用，已切换",
            `${maskKey(key.value)} → ${maskKey(next.value)}`,
          );
          key = next;
          attempt--;
          continue;
        }
        throw e;
      }

      if (st === 402) {
        if (modelIdx < chain.length - 1) {
          opts?.onNotify?.(
            "info",
            "自动回退免费模型",
            `当前模型 ${chain[modelIdx]} 额度不足，改用 ${chain[modelIdx + 1]}。`,
          );
          modelIdx++;
          attempt--;
          continue;
        }
        const outErr: ApiError = new Error(
          `Fish Audio 该模型额度不足。免费模型为 ${FISH_DEFAULT_MODEL}，付费模型需在 fish.audio 充值后使用。`,
        );
        outErr.status = 402;
        throw outErr;
      }

      if (st === 429) {
        markKey(state, poolName, key, "429 限流", COOLDOWN_429, opts?.onKeySync);
        const next = rotateToNextKey(state, poolName, key);
        if (next) {
          opts?.onNotify?.(
            "info",
            "已自动切换 Key",
            `Fish Key 触发限流，改用 ${maskKey(next.value)}。`,
          );
          key = next;
          attempt--;
          continue;
        }
        throw e;
      }

      if (st === 500 || st === 503 || st === 504 || e.name === "AbortError") {
        if (attempt < MAX_RETRY) {
          await sleep(900 * attempt);
          continue;
        }
      }
      markKey(state, poolName, key, `错误 ${st || "network"}`, 0, opts?.onKeySync);
      throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Fish 请求失败");
}

export async function fishGenerate(
  state: AppState,
  text: string,
  onChunk: (label: string, idx: number, total: number) => void,
  opts?: { onNotify?: TtsNotify; onKeySync?: () => void },
): Promise<GeneratedAudioResult> {
  const chunks = splitText(text, FISH_CHUNK);
  const parts: Uint8Array[] = [];

  for (let i = 0; i < chunks.length; i++) {
    onChunk(
      chunks.length > 1 ? `正在合成 ${i + 1} / ${chunks.length}...` : "正在合成语音...",
      i,
      chunks.length,
    );
    if (i > 0) await sleep(400);
    const out = await fishChunk(state, chunks[i], opts);
    parts.push(out.bytes);
  }

  const fmt = state.fish.format;
  if (fmt === "pcm") {
    const rawPcm = concatBytes(parts);
    const sr = state.fish.sampleRate || 44100;
    const wav = pcmToWav(rawPcm, sr, 1);
    const blob = new Blob([wav.buffer as ArrayBuffer], { type: "audio/wav" });
    const peaks = await extractWaveformPeaks(blob, text);
    return {
      blob,
      mime: "audio/wav",
      ext: "wav",
      sampleRate: sr,
      duration: rawPcm.length / (sr * 2),
      peaks,
      base64: bytesToBase64(wav),
      chunks: chunks.length,
    };
  }

  if (fmt === "wav") {
    const pcmParts: Int16Array[] = [];
    let sr: number = state.fish.sampleRate || 44100;
    let ch = 1;
    for (const part of parts) {
      const parsed = wavToPcm(part);
      if (parsed) {
        pcmParts.push(parsed.samples);
        sr = parsed.sampleRate;
        ch = parsed.channels;
      }
    }
    if (pcmParts.length === 0) {
      const blob = new Blob(parts.map((p) => p.buffer as ArrayBuffer), { type: "audio/wav" });
      const duration = await probeDuration(URL.createObjectURL(blob)).catch(() => 0);
      const peaks = await extractWaveformPeaks(blob, text);
      return {
        blob,
        mime: "audio/wav",
        ext: "wav",
        sampleRate: sr,
        duration,
        peaks,
        base64: await blobToBase64(blob),
        chunks: chunks.length,
      };
    }
    const merged = concatInt16(pcmParts);
    const pcmBytes = new Uint8Array(merged.buffer, merged.byteOffset, merged.byteLength);
    const wav = pcmToWav(pcmBytes, sr, ch);
    const blob = new Blob([wav.buffer as ArrayBuffer], { type: "audio/wav" });
    const peaks = await extractWaveformPeaks(blob, text);
    return {
      blob,
      mime: "audio/wav",
      ext: "wav",
      sampleRate: sr,
      duration: merged.length / (sr * Math.max(1, ch)),
      peaks,
      base64: bytesToBase64(wav),
      chunks: chunks.length,
    };
  }

  const mime = fmt === "opus" ? "audio/ogg; codecs=opus" : "audio/mpeg";
  const ext = fmt === "opus" ? "opus" : "mp3";
  const blob = new Blob(parts.map((p) => p.buffer as ArrayBuffer), { type: mime });
  const duration = await probeDuration(URL.createObjectURL(blob)).catch(() => 0);
  const peaks = await extractWaveformPeaks(blob, text);
  return {
    blob,
    mime,
    ext,
    sampleRate: state.fish.sampleRate || 0,
    duration: duration || 0,
    peaks,
    base64: await blobToBase64(blob),
    chunks: chunks.length,
  };
}
