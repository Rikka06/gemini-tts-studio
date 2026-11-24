export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

export function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function fmtClock(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function slug(text: string): string {
  return String(text).replace(/[\s\\/:*?"<>|]+/g, "").slice(0, 22) || "tts";
}

export function fmtCompactCount(num: number): string {
  if (!num || num < 0) return "0";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

export function b64ToBytes(b64: string): Uint8Array {
  const clean = String(b64 || "")
    .replace(/^data:[^;]+;base64,/, "")
    .replace(/\s+/g, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    out += String.fromCharCode(...bytes.subarray(i, i + CH));
  }
  return btoa(out);
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const s = String(fr.result || "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    fr.onerror = () => reject(new Error("读取音频数据失败"));
    fr.readAsDataURL(blob);
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1400);
}

export function pcmToWav(
  pcmBytes: Uint8Array,
  sampleRate = 24000,
  channels = 1,
): Uint8Array {
  const ch = channels || 1;
  const bits = 16;
  const blockAlign = (ch * bits) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataLen = pcmBytes.length;
  const buffer = new ArrayBuffer(44 + dataLen);
  const v = new DataView(buffer);
  const w = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  w(0, "RIFF");
  v.setUint32(4, 36 + dataLen, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, byteRate, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, bits, true);
  w(36, "data");
  v.setUint32(40, dataLen, true);
  new Uint8Array(buffer, 44).set(pcmBytes);
  return new Uint8Array(buffer);
}

export function wavToPcm(
  bytes: Uint8Array,
): { samples: Int16Array; sampleRate: number; channels: number } | null {
  if (bytes.length < 44) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) =>
    String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let pos = 12;
  let fmt: { format: number; channels: number; sampleRate: number; bits: number } | null = null;
  let data: Uint8Array | null = null;

  while (pos + 8 <= bytes.length) {
    const id = tag(pos);
    const size = dv.getUint32(pos + 4, true);
    const body = pos + 8;
    if (id === "fmt " && body + 16 <= bytes.length) {
      fmt = {
        format: dv.getUint16(body, true),
        channels: dv.getUint16(body + 2, true),
        sampleRate: dv.getUint32(body + 4, true),
        bits: dv.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      data = bytes.subarray(body, Math.min(bytes.length, body + size));
      if (fmt) break;
    }
    pos = body + size + (size % 2);
  }
  if (!data || !fmt || fmt.bits !== 16 || fmt.format !== 1) return null;
  const usable = data.length - (data.length % 2);
  const pdv = new DataView(data.buffer, data.byteOffset, usable);
  const i16 = new Int16Array(usable / 2);
  for (let k = 0; k < i16.length; k++) i16[k] = pdv.getInt16(k * 2, true);
  return {
    samples: i16,
    sampleRate: fmt.sampleRate || 24000,
    channels: fmt.channels || 1,
  };
}

export function concatInt16(list: Int16Array[]): Int16Array {
  let total = 0;
  for (const a of list) total += a.length;
  const out = new Int16Array(total);
  let off = 0;
  for (const a of list) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

export function concatBytes(list: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const b of list) total += b.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of list) {
    out.set(b, off);
    off += b.length;
  }
  return out;
}

export function parseMime(mime: string) {
  const m = String(mime || "").toLowerCase();
  const rate = m.match(/rate=(\d+)/);
  const ch = m.match(/channels=(\d+)/);
  return {
    isMp3: m.includes("mpeg") || m.includes("mp3"),
    isWav: m.includes("wav"),
    isOgg: m.includes("ogg") || m.includes("opus"),
    sampleRate: rate ? parseInt(rate[1], 10) : 24000,
    channels: ch ? parseInt(ch[1], 10) : 1,
    raw: mime || "",
  };
}

export function probeDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const a = new Audio();
    let done = false;
    const fin = (v: number) => {
      if (done) return;
      done = true;
      a.src = "";
      URL.revokeObjectURL(url);
      resolve(v || 0);
    };
    a.preload = "metadata";
    a.addEventListener("loadedmetadata", () => fin(a.duration));
    a.addEventListener("error", () => fin(0));
    setTimeout(() => fin(0), 6000);
    a.src = url;
  });
}

export function fallbackPeaks(seedText: string, count = 44): number[] {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    const norm = ((h >>> 0) % 1000) / 1000;
    const env = Math.sin(((i + 1) / (count + 1)) * Math.PI);
    out.push(clamp(0.18 + norm * 0.65 * (0.45 + 0.55 * env), 0.16, 1));
  }
  return out;
}

export async function extractWaveformPeaks(
  blob: Blob,
  seedText: string,
  barCount = 44,
): Promise<number[]> {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return fallbackPeaks(seedText, barCount);
    const ctx = new AudioCtx();
    try {
      const ab = await blob.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(ab);
      const data = audioBuf.getChannelData(0);
      const step = Math.max(1, Math.floor(data.length / barCount));
      const raw: number[] = [];
      let peakMax = 0.001;
      for (let i = 0; i < barCount; i++) {
        const start = i * step;
        const end = Math.min(data.length, start + step);
        let sum = 0;
        let count = 0;
        const stride = Math.max(1, Math.floor((end - start) / 64));
        for (let j = start; j < end; j += stride) {
          sum += Math.abs(data[j]);
          count++;
        }
        const avg = count ? sum / count : 0;
        if (avg > peakMax) peakMax = avg;
        raw.push(avg);
      }
      return raw.map((v) => clamp(0.16 + (v / peakMax) * 0.84, 0.16, 1));
    } finally {
      ctx.close().catch(() => {});
    }
  } catch {
    return fallbackPeaks(seedText, barCount);
  }
}

export function splitText(raw: string, limit: number): string[] {
  const text = String(raw || "").replace(/\r\n?/g, "\n").trim();
  if (!text) return [];
  const pieces: string[] = [];
  text.split(/\n+/).forEach((p) => {
    const sents = p.match(/[^。！？!?；;.\n]+[。！？!?；;.]*["'」』）)]?/g);
    if (!sents) {
      pieces.push(p);
      return;
    }
    sents.forEach((s) => pieces.push(s));
  });
  const chunks: string[] = [];
  let buf = "";
  for (let piece of pieces) {
    piece = piece.trim();
    if (!piece) continue;
    while (piece.length > limit) {
      if (buf) {
        chunks.push(buf);
        buf = "";
      }
      chunks.push(piece.slice(0, limit));
      piece = piece.slice(limit);
    }
    if (!piece) continue;
    if ((buf + piece).length > limit) {
      if (buf) chunks.push(buf);
      buf = piece;
    } else {
      buf += piece;
    }
  }
  if (buf) chunks.push(buf);
  return chunks.filter((c) => c.trim().length > 0);
}

export function estimateDuration(text: string): number {
  const s = String(text || "");
  if (!s.trim()) return 0;
  const cjk = (s.match(/[\u3400-\u9FFF\u3040-\u30FF]/g) || []).length;
  const words = (s.match(/[A-Za-z0-9']+/g) || []).length;
  const pauses = (s.match(/[，。！？；,.!?;]/g) || []).length * 0.16;
  return cjk / 4.6 + words / 2.4 + pauses;
}
