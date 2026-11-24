import type { FishTtsParams, FishVoiceModel, GeminiVoice } from "./types";

export const GEMINI_MODEL = "gemini-3.8-flash-tts";
export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
export const GEMINI_FALLBACK = ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"];

export const FISH_API_ORIGIN = "https://api.fish.audio";
export const FISH_TTS_ENDPOINT = "https://api.fish.audio/v1/tts";
export const FISH_ASSET_ORIGIN = "https://public-platform.r2.fish.audio";
export const FISH_DEFAULT_MODEL = "s2.1-pro-free";
export const FISH_FALLBACK_MODELS = ["s2.1-pro-free"];

export const LOCAL_DEFAULT_CORS = "http://127.0.0.1:8080/";
export const CLOUD_DEFAULT_CORS = "https://tts-studio-gateway.rikkai.workers.dev/api/fish";

export const STORE_KEY = "tts-studio-state-v1";
export const THEME_KEY = "tts-studio-theme";
export const FISH_CACHE_KEY = "tts-studio-fish-voice-cache-v1";
export const DEVICE_MODE_KEY = "tts-studio-device-mode";
export const DEVICE_COOKIE_NAME = "tts_device_mode";

export const MAX_CHARS = 12000;
export const GEMINI_CHUNK = 2400;
export const FISH_CHUNK = 1800;
export const REQUEST_TIMEOUT = 150000;
export const MAX_RETRY = 3;
export const COOLDOWN_429 = 45000;
export const COOLDOWN_401 = 3600000;
export const MIN_GAP_MS = 700;

export const PLAY_SPEEDS = [0.75, 1.0, 1.25, 1.5, 1.8];

export const DEFAULT_FISH_PARAMS: FishTtsParams = {
  model: FISH_DEFAULT_MODEL,
  format: "mp3",
  mp3Bitrate: 128,
  opusBitrate: 32,
  sampleRate: 0,
  speed: 1.0,
  volume: 0,
  normalize: true,
  temperature: 0.7,
  topP: 0.7,
  repetitionPenalty: 1.2,
  chunkLength: 200,
  latency: "balanced",
};

export const VOICES: GeminiVoice[] = [
  { id: "Zephyr", tag: "清亮女声", desc: "明亮通透，适合旁白", gender: "female" },
  { id: "Puck", tag: "活力男声", desc: "轻快有弹性，适合口播", gender: "male" },
  { id: "Charon", tag: "沉稳男声", desc: "低沉稳重，适合纪实", gender: "male" },
  { id: "Kore", tag: "温柔女声", desc: "干净中性，通用首选", gender: "female" },
  { id: "Fenrir", tag: "浑厚男声", desc: "力量感强，适合大片", gender: "male" },
  { id: "Leda", tag: "少女声线", desc: "轻柔年轻，适合叙事", gender: "female" },
  { id: "Orus", tag: "磁性男声", desc: "成熟稳重，适合商务", gender: "male" },
  { id: "Aoede", tag: "空灵女声", desc: "轻盈飘逸，适合文艺", gender: "female" },
  { id: "Callirrhoe", tag: "亲和女声", desc: "自然放松，适合日常", gender: "female" },
  { id: "Autonoe", tag: "沉稳女声", desc: "冷静克制，适合播报", gender: "female" },
  { id: "Enceladus", tag: "气声男声", desc: "柔和带气声，适合私语", gender: "male" },
  { id: "Iapetus", tag: "清晰男声", desc: "咬字清楚，适合教学", gender: "male" },
  { id: "Umbriel", tag: "低沉中性", desc: "安静内敛，适合冥想", gender: "neutral" },
  { id: "Algieba", tag: "明亮男声", desc: "阳光外向，适合广告", gender: "male" },
  { id: "Despina", tag: "柔和女声", desc: "平滑温暖，适合陪伴", gender: "female" },
  { id: "Erinome", tag: "标准女声", desc: "中性平稳，适合资讯", gender: "female" },
  { id: "Algenib", tag: "冷峻男声", desc: "略带沙哑，适合悬疑", gender: "male" },
  { id: "Rasalgethi", tag: "学者男声", desc: "信息密度高，适合讲解", gender: "male" },
  { id: "Laomedeia", tag: "朝气女声", desc: "活泼明快，适合社媒", gender: "female" },
  { id: "Achernar", tag: "轻快女声", desc: "上扬语调，适合种草", gender: "female" },
  { id: "Alnilam", tag: "庄重男声", desc: "厚重权威，适合公告", gender: "male" },
  { id: "Schedar", tag: "均衡中性", desc: "平实耐听，适合长文", gender: "neutral" },
  { id: "Gacrux", tag: "成熟女声", desc: "从容淡定，适合访谈", gender: "female" },
  { id: "Pulcherrima", tag: "灵动女声", desc: "俏皮明亮，适合短视频", gender: "female" },
  { id: "Achird", tag: "随性男声", desc: "口语感强，适合聊天", gender: "male" },
  { id: "Zubenelgenubi", tag: "质朴男声", desc: "自然不做作，适合记录", gender: "male" },
  { id: "Vindemiatrix", tag: "知性女声", desc: "温和克制，适合读书", gender: "female" },
  { id: "Sadachbia", tag: "灵动男声", desc: "节奏跳跃，适合解说", gender: "male" },
  { id: "Sadaltager", tag: "浩荡男声", desc: "声场开阔，适合史诗", gender: "male" },
  { id: "Sulafat", tag: "温润中性", desc: "柔和不刺耳，适合陪伴", gender: "neutral" },
];

export const STYLE_PRESETS = [
  "用新闻联播的严肃语气朗读",
  "温柔低沉地讲睡前故事",
  "像老朋友聊天一样随意",
  "纪录片旁白，节奏舒缓克制",
  "情绪饱满，像在演讲",
  "快速清晰地报读资讯",
];

export const FISH_TAGS = [
  "(laughing)",
  "(sighing)",
  "(excited)",
  "(whispering)",
  "(angry)",
  "(crying)",
  "(happy)",
  "(sad)",
  "(surprised)",
  "(break)",
];

export const FISH_MODEL_OPTIONS = [
  { id: "s2.1-pro-free", name: "S2.1 Pro Free", badge: "免费默认", note: "官方免费额度模型" },
  { id: "s2.1-pro", name: "S2.1 Pro", badge: "旗舰", note: "最新高自然度模型（需账户余额）" },
  { id: "s2-pro", name: "S2 Pro", badge: "多角色", note: "支持情绪标签与多说话人" },
  { id: "s1", name: "S1", badge: "经典", note: "经典通用模型" },
  { id: "drama-3", name: "Drama 3", badge: "演绎", note: "强化戏剧张力与对话表现" },
];

export const FISH_LANGUAGE_FILTERS = [
  { id: "", label: "全部语言" },
  { id: "zh", label: "中文" },
  { id: "en", label: "English" },
  { id: "ja", label: "日本語" },
  { id: "ko", label: "한국어" },
  { id: "fr", label: "Français" },
  { id: "de", label: "Deutsch" },
  { id: "es", label: "Español" },
];

export const FISH_TAG_FILTERS = [
  { id: "", label: "全部风格" },
  { id: "female", label: "女声" },
  { id: "male", label: "男声" },
  { id: "young", label: "青年" },
  { id: "deep", label: "沉稳" },
  { id: "narration", label: "旁白" },
  { id: "character-voice", label: "角色/游戏" },
  { id: "energetic", label: "活力" },
  { id: "friendly", label: "亲和" },
];

export const FISH_SORT_OPTIONS: Array<{ id: "score" | "task_count" | "created_at"; label: string }> = [
  { id: "score", label: "综合推荐" },
  { id: "task_count", label: "使用最多" },
  { id: "created_at", label: "最新发布" },
];

export const LANG_DISPLAY_MAP: Record<string, string> = {
  zh: "中文",
  "zh-cn": "简体中文",
  "zh-tw": "繁體中文",
  en: "English",
  ja: "日本語",
  ko: "한국어",
  fr: "法语",
  de: "德语",
  es: "西班牙语",
  pt: "葡萄牙语",
  ru: "俄语",
  ar: "阿拉伯语",
  it: "意大利语",
};

/**
 * 保留原始 3 个示例 ID 并预置真实名称与元数据，同时补充热门中文与多语种示例音色。
 * 运行时会自动调用 GET /model/{id} 拉取并刷新最新封面、作者与试听样例。
 */
export const FISH_PRESET_VOICES: FishVoiceModel[] = [
  {
    id: "7f92f8afb8ec43bf81429cc1c9199cb1",
    title: "AD学姐",
    description: "温柔自然的中文青年女声，适合陪伴对话与故事朗读。",
    coverUrl: `${FISH_ASSET_ORIGIN}/coverimage/7f92f8afb8ec43bf81429cc1c9199cb1`,
    authorId: "",
    authorName: "Fish Community",
    authorAvatar: "",
    languages: ["zh"],
    tags: ["female", "young", "女友感", "御姐"],
    samples: [],
    likeCount: 0,
    markCount: 0,
    taskCount: 0,
    fetchedAt: 0,
  },
  {
    id: "90e65eaaf50e4470b8e6d43ee6afd7d5",
    title: "Super Smash Bros. 4/Ultimate Announcer",
    description: "A powerful and authoritative middle-aged male voice with a dramatic, cinematic quality.",
    coverUrl: `${FISH_ASSET_ORIGIN}/coverimage/90e65eaaf50e4470b8e6d43ee6afd7d5`,
    authorId: "4fc33e0b0d314efca22a5dcabebaa526",
    authorName: "Club RM Studios Latinoamérica",
    authorAvatar: `${FISH_ASSET_ORIGIN}/avatars/4fc33e0b0d314efca22a5dcabebaa526`,
    languages: ["en"],
    tags: ["male", "announcer", "gaming", "dramatic"],
    samples: [
      {
        title: "Default Sample",
        text: "Choose your fighter! Mario! Link! Samus!",
        taskId: "265105e4556b4c0f906b0f426de988da",
        audio: "https://platform.r2.fish.audio/task/265105e4556b4c0f906b0f426de988da.mp3",
      },
    ],
    likeCount: 33134,
    markCount: 8077,
    taskCount: 21128005,
    fetchedAt: 0,
  },
  {
    id: "52e0660e03fe4f9a8d2336f67cab5440",
    title: "ALEX_CHIKNA",
    description: "Energetic male English social-media voice.",
    coverUrl: `${FISH_ASSET_ORIGIN}/coverimage/52e0660e03fe4f9a8d2336f67cab5440`,
    authorId: "",
    authorName: "Zaindesignes",
    authorAvatar: "",
    languages: ["en"],
    tags: ["male", "middle-aged", "social-media", "energetic"],
    samples: [],
    likeCount: 0,
    markCount: 0,
    taskCount: 0,
    fetchedAt: 0,
  },
  {
    id: "d13f84b987ad4f22b56d2b47f4eb838e",
    title: "Mortal Kombat",
    description: "Deep low character announcer voice.",
    coverUrl: `${FISH_ASSET_ORIGIN}/coverimage/d13f84b987ad4f22b56d2b47f4eb838e`,
    authorId: "",
    authorName: "Pedro Paulo Góes",
    authorAvatar: "",
    languages: ["en"],
    tags: ["male", "character-voice", "deep", "low"],
    samples: [],
    likeCount: 0,
    markCount: 0,
    taskCount: 0,
    fetchedAt: 0,
  },
  {
    id: "54a5170264694bfc8e9ad98df7bd89c3",
    title: "丁真",
    description: "亲和自然青年男声。",
    coverUrl: `${FISH_ASSET_ORIGIN}/coverimage/54a5170264694bfc8e9ad98df7bd89c3`,
    authorId: "",
    authorName: "Fish Community",
    authorAvatar: "",
    languages: ["zh"],
    tags: ["male", "young", "social-media", "friendly"],
    samples: [],
    likeCount: 0,
    markCount: 0,
    taskCount: 0,
    fetchedAt: 0,
  },
  {
    id: "0eb38bc974e1459facca38b359e13511",
    title: "赛马娘",
    description: "充满活力的青年女声。",
    coverUrl: `${FISH_ASSET_ORIGIN}/coverimage/0eb38bc974e1459facca38b359e13511`,
    authorId: "",
    authorName: "Fish Community",
    authorAvatar: "",
    languages: ["zh"],
    tags: ["female", "young", "energetic"],
    samples: [],
    likeCount: 0,
    markCount: 0,
    taskCount: 0,
    fetchedAt: 0,
  },
];

export const SAMPLE_TEXT =
  "各位好，这里是 TTS Studio 的试听样张。\n\n" +
  "这是一段中英文混合的测试文本：The quick brown fox jumps over the lazy dog，而这句话之后，应该能听出明显的停顿。\n\n" +
  "数字测试：2026 年 11 月 16 日，温度 23.5 摄氏度，订单号 A-88217。\n\n" +
  "标点测试：逗号，产生短停顿；句号。产生长停顿；问号呢？换行则留出更明显的呼吸空间。";
