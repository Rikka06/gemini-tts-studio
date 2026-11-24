export type ProviderId = "gemini" | "fish";
export type PoolMode = "round" | "pinned";
export type KeyHealth = "ok" | "cool" | "bad";
export type ThemeMode = "light" | "dark";
export type DeviceTarget = "desktop" | "mobile";
export type DeviceMode = "auto" | DeviceTarget;

export interface KeyEntry {
  id: string;
  value: string;
  enabled: boolean;
  cooldownUntil: number;
  state: KeyHealth;
  uses: number;
  lastError: string;
}

export interface KeyPoolState {
  keys: KeyEntry[];
  mode: PoolMode;
  cursor: number;
}

export interface GeminiVoice {
  id: string;
  tag: string;
  desc: string;
  gender: "female" | "male" | "neutral";
}

export interface FishSample {
  title: string;
  text: string;
  taskId: string;
  audio: string;
}

export interface FishVoiceModel {
  id: string;
  title: string;
  description: string;
  coverUrl: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  languages: string[];
  tags: string[];
  samples: FishSample[];
  likeCount: number;
  markCount: number;
  taskCount: number;
  createdAt?: string;
  updatedAt?: string;
  defaultText?: string;
  fetchedAt: number;
}

export interface FishBookmark {
  id: string;
  title: string;
  customName?: string;
  authorName?: string;
  coverUrl?: string;
  languages?: string[];
  tags?: string[];
  sampleAudio?: string;
  description?: string;
  addedAt: number;
}

export type FishFormat = "mp3" | "wav" | "opus" | "pcm";
export type FishLatency = "normal" | "balanced";

export interface FishTtsParams {
  model: string;
  format: FishFormat;
  mp3Bitrate: 64 | 128 | 192;
  opusBitrate: -1000 | 24 | 32 | 48 | 64;
  sampleRate: 0 | 24000 | 32000 | 44100 | 48000;
  speed: number;
  volume: number;
  normalize: boolean;
  temperature: number;
  topP: number;
  repetitionPenalty: number;
  chunkLength: number;
  latency: FishLatency;
}

export interface HistoryItem {
  id: string;
  provider: ProviderId;
  blob: Blob;
  url: string;
  mime: string;
  ext: string;
  base64: string;
  sampleRate: number;
  duration: number;
  peaks: number[];
  text: string;
  label: string;
  voiceId?: string;
  voiceCover?: string;
  time: Date;
  chunks: number;
}

export interface AppState {
  engine: ProviderId;
  geminiVoice: string;
  fishRefId: string;
  fish: FishTtsParams;
  rate: number;
  pause: number;
  emotion: number;
  useStyle: boolean;
  styleText: string;
  playSpeedIdx: number;
  busy: boolean;
  busyLabel: string;
  history: HistoryItem[];
  current: HistoryItem | null;
  playing: boolean;
  seq: number;
  chunkCount: number;
  pools: Record<ProviderId, KeyPoolState>;
  books: FishBookmark[];
  cors: string;
  corsExplicit: boolean;
  activeModel: string;
  _lastReq: number;
}

export interface FishSearchQuery {
  title?: string;
  language?: string;
  tag?: string;
  sortBy?: "score" | "task_count" | "created_at";
  self?: boolean;
  pageNumber?: number;
  pageSize?: number;
}

export interface FishSearchResponse {
  total: number;
  items: FishVoiceModel[];
  hasMore: boolean;
}
