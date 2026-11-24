import {
  b64ToBytes,
  bytesToBase64,
  concatInt16,
  extractWaveformPeaks,
  parseMime,
  pcmToWav,
  sleep,
  splitText,
  wavToPcm,
} from "./audio";
import {
  COOLDOWN_401,
  COOLDOWN_429,
  GEMINI_BASE,
  GEMINI_CHUNK,
  GEMINI_FALLBACK,
  MAX_RETRY,
  MIN_GAP_MS,
  REQUEST_TIMEOUT,
} from "./constants";
import { markKey, maskKey, pickKey, rotateToNextKey } from "./keyPool";
import type { AppState } from "./types";

export interface TtsNotify {
  (kind: "ok" | "err" | "warn" | "info", title: string, desc?: string, ttl?: number): void;
}

export interface ApiError extends Error {
  status?: number;
  detail?: string;
  retryAfterMs?: number;
  daily?: boolean;
  noAudio?: boolean;
  cors?: boolean;
}

export interface GeneratedAudioResult {
  blob: Blob;
  mime: string;
  ext: string;
  sampleRate: number;
  duration: number;
  peaks: number[];
  base64: string;
  chunks: number;
}

export function composeGeminiStyle(state: AppState): string {
  const parts: string[] = [];
  const base = state.styleText.trim();
  if (base) parts.push(base);
  if (state.pause <= 25) parts.push("语速偏快、句中几乎不停顿");
  else if (state.pause >= 78) parts.push("语速放慢、句间留出明显的呼吸停顿");
  if (state.emotion <= 25) parts.push("情绪克制、语气平实");
  else if (state.emotion >= 80) parts.push("情绪饱满、语气起伏明显");
  return parts.join("，");
}

function buildGeminiBody(state: AppState, text: string) {
  const style = state.useStyle ? composeGeminiStyle(state) : "";
  const prompt = style ? `${style}\n${text}` : text;
  return {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: state.geminiVoice } },
      },
    },
  };
}

function extractGeminiAudio(payload: Record<string, unknown>): { data: string; mimeType: string } {
  const cands = (payload?.candidates as Array<{ content?: { parts?: Array<Record<string, unknown>> } }>) || [];
  for (const c of cands) {
    const parts = c?.content?.parts || [];
    for (const p of parts) {
      const inline = (p.inlineData || p.inline_data) as { data?: string; mimeType?: string; mime_type?: string } | undefined;
      if (inline?.data) {
        return {
          data: inline.data,
          mimeType: inline.mimeType || inline.mime_type || "",
        };
      }
    }
  }
  let textOut = "";
  for (const c of cands) {
    for (const p of c?.content?.parts || []) {
      if (typeof p.text === "string") textOut += p.text;
    }
  }
  const pf = payload?.promptFeedback as { blockReason?: string } | undefined;
  const blocked = pf?.blockReason;
  const err: ApiError = new Error(
    textOut
      ? `模型返回文本：${textOut.slice(0, 160)}`
      : blocked
        ? `请求被拦截：${blocked}`
        : "响应中没有 inlineData 音频",
  );
  err.noAudio = true;
  throw err;
}

async function geminiOnce(
  state: AppState,
  text: string,
  apiKey: string,
  model: string,
): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT);
  try {
    const res = await fetch(`${GEMINI_BASE}${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(buildGeminiBody(state, text)),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      let detail = "";
      try {
        const j = (await res.json()) as { error?: { message?: string; status?: string } };
        detail = j?.error?.message || j?.error?.status || "";
      } catch {
        try {
          detail = await res.text();
        } catch {
          detail = "";
        }
      }
      const e: ApiError = new Error(
        `HTTP ${res.status}${detail ? ` · ${String(detail).slice(0, 380)}` : ""}`,
      );
      e.status = res.status;
      e.detail = String(detail);
      const m = String(detail).match(/retry in\s+(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*([\d.]+)\s*s/i);
      if (m) {
        const hh = m[1] ? parseInt(m[1], 10) : 0;
        const mm = m[2] ? parseInt(m[2], 10) : 0;
        const ss = m[3] ? parseFloat(m[3]) : 0;
        e.retryAfterMs = Math.round((hh * 3600 + mm * 60 + ss) * 1000) + 800;
      }
      e.daily = /per day limit/i.test(detail);
      throw e;
    }
    return (await res.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

export async function geminiChunk(
  state: AppState,
  text: string,
  opts?: {
    onNotify?: TtsNotify;
    onKeySync?: () => void;
    onStyleDisabled?: () => void;
  },
): Promise<{ data: string; mimeType: string }> {
  const poolName = "gemini";
  let key = pickKey(state, poolName);
  if (!key) {
    throw new Error("Gemini Key 池中没有可用 Key，请在「Key 池管理」中添加或启用 Key。");
  }

  let attempt = 0;
  let lastErr: unknown = null;
  let modelIdx = 0;
  const chain = [state.activeModel, ...GEMINI_FALLBACK.filter((m) => m !== state.activeModel)];

  while (attempt < MAX_RETRY) {
    attempt++;
    const gap = (state._lastReq || 0) + MIN_GAP_MS - Date.now();
    if (gap > 0) await sleep(gap);
    state._lastReq = Date.now();

    try {
      const payload = await geminiOnce(state, text, key.value, chain[modelIdx]);
      state.activeModel = chain[modelIdx];
      markKey(state, poolName, key, "", 0, opts?.onKeySync);
      return extractGeminiAudio(payload);
    } catch (err) {
      const e = err as ApiError;
      lastErr = e;
      const st = e.status;

      if (st === 429) {
        const cool = e.daily ? 86400000 : e.retryAfterMs || COOLDOWN_429;
        markKey(
          state,
          poolName,
          key,
          e.daily ? "今日额度用尽" : "429 限流",
          cool,
          opts?.onKeySync,
        );
        const next = rotateToNextKey(state, poolName, key);
        if (next) {
          opts?.onNotify?.(
            "info",
            "已自动切换 Key",
            `当前 Key 触发限流，改用 ${maskKey(next.value)} 重试。`,
          );
          key = next;
          attempt--;
          continue;
        }
        const outErr: ApiError = new Error(
          e.daily
            ? "Gemini 免费层级每日额度已用完，请在次日重置后使用，或换一个 Key。"
            : "Gemini 免费层级每分钟 3 次请求，所有 Key 均在冷却中。",
        );
        outErr.status = 429;
        outErr.daily = e.daily;
        outErr.retryAfterMs = e.retryAfterMs;
        throw outErr;
      }

      if (st === 401 || st === 403) {
        markKey(
          state,
          poolName,
          key,
          st === 403 ? "无权限" : "Key 无效",
          COOLDOWN_401,
          opts?.onKeySync,
        );
        const next = rotateToNextKey(state, poolName, key);
        if (next) {
          opts?.onNotify?.(
            "warn",
            "Key 不可用，已切换",
            `${maskKey(key.value)} ${st === 403 ? "无权限" : "无效"}，改用 ${maskKey(next.value)}。`,
          );
          key = next;
          attempt--;
          continue;
        }
        throw e;
      }

      if (
        (st === 404 || st === 400) &&
        /model|not found|not supported|unsupported|invalid/i.test(String(e.detail || e.message)) &&
        !/developer instruction|instruction is not enabled/i.test(String(e.detail || ""))
      ) {
        if (modelIdx < chain.length - 1) {
          modelIdx++;
          attempt--;
          continue;
        }
      }

      if (st === 400 && state.useStyle) {
        state.useStyle = false;
        opts?.onStyleDisabled?.();
        attempt--;
        opts?.onNotify?.("warn", "已关闭风格指令", "服务端拒绝了风格提示，本次改用纯正文朗读。");
        continue;
      }

      const retriable =
        st === 500 ||
        st === 503 ||
        st === 504 ||
        e.name === "AbortError" ||
        e instanceof TypeError;
      if (retriable && attempt < MAX_RETRY) {
        await sleep(900 * attempt);
        continue;
      }
      markKey(state, poolName, key, `错误 ${st || "network"}`, 0, opts?.onKeySync);
      throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Gemini 请求失败");
}

export async function geminiGenerate(
  state: AppState,
  text: string,
  onChunk: (label: string, idx: number, total: number) => void,
  opts?: {
    onNotify?: TtsNotify;
    onKeySync?: () => void;
    onStyleDisabled?: () => void;
  },
): Promise<GeneratedAudioResult> {
  const chunks = splitText(text, GEMINI_CHUNK);
  const pcmParts: Int16Array[] = [];
  let sampleRate = 24000;
  let channels = 1;

  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) {
      for (let wait = 21; wait > 0; wait--) {
        onChunk(`排队 ${wait}s · 第 ${i + 1}/${chunks.length} 段`, i, chunks.length);
        await sleep(1000);
        if (!state.busy) throw new Error("已取消");
      }
    }
    onChunk(`正在合成 ${i + 1} / ${chunks.length}...`, i, chunks.length);
    const out = await geminiChunk(state, chunks[i], opts);
    const meta = parseMime(out.mimeType);
    const bytes = b64ToBytes(out.data);

    let samples: Int16Array | null = null;
    if (meta.isWav) {
      const parsed = wavToPcm(bytes);
      if (parsed) {
        samples = parsed.samples;
        sampleRate = parsed.sampleRate;
        channels = parsed.channels;
      }
    }
    if (!samples) {
      sampleRate = meta.sampleRate || sampleRate;
      channels = meta.channels || channels;
      const usable = bytes.length - (bytes.length % 2);
      const dv = new DataView(bytes.buffer, bytes.byteOffset, usable);
      samples = new Int16Array(usable / 2);
      for (let k = 0; k < samples.length; k++) samples[k] = dv.getInt16(k * 2, true);
    }
    if (pcmParts.length > 0) {
      const gapLen = Math.round(sampleRate * Math.max(1, channels) * 0.13);
      if (gapLen > 0) pcmParts.push(new Int16Array(gapLen));
    }
    pcmParts.push(samples);
  }

  const merged = concatInt16(pcmParts);
  const pcmBytes = new Uint8Array(merged.buffer, merged.byteOffset, merged.byteLength);
  const wav = pcmToWav(pcmBytes, sampleRate, channels);
  const blob = new Blob([wav.buffer as ArrayBuffer], { type: "audio/wav" });
  const peaks = await extractWaveformPeaks(blob, text);
  return {
    blob,
    mime: "audio/wav",
    ext: "wav",
    sampleRate,
    duration: merged.length / (sampleRate * Math.max(1, channels)),
    peaks,
    base64: bytesToBase64(wav),
    chunks: chunks.length,
  };
}
