import {
  clamp,
  downloadBlob,
  estimateDuration,
  fmtClock,
  fmtCompactCount,
  fmtTime,
  pcmToWav,
  parseMime,
  b64ToBytes,
  slug,
  splitText,
  stamp,
} from "../shared/audio";
import {
  FISH_CHUNK,
  FISH_MODEL_OPTIONS,
  FISH_PRESET_VOICES,
  FISH_TAGS,
  GEMINI_CHUNK,
  MAX_CHARS,
  PLAY_SPEEDS,
  SAMPLE_TEXT,
  STYLE_PRESETS,
  VOICES,
} from "../shared/constants";
import { switchDeviceExperience } from "../shared/device";
import {
  fetchFishModelById,
  fishGenerate,
  formatFishLanguage,
  getCachedFishModel,
  getFishDisplayTitle,
  hydrateFishModelIds,
  searchFishModels,
  testFishProxyConnectivity,
} from "../shared/fishApi";
import { geminiChunk, geminiGenerate, type ApiError, type GeneratedAudioResult } from "../shared/geminiApi";
import { ICONS } from "../shared/icons";
import {
  addKeysToPool,
  describeKey,
  getPoolAvailableCount,
  maskKey,
  pickKey,
} from "../shared/keyPool";
import {
  createInitialState,
  getDefaultCorsForEnv,
  getInitialTheme,
  loadStateFromStorage,
  saveStateToStorage,
  setDocumentTheme,
  tryHydrateLocalServerKeys,
} from "../shared/storage";
import type {
  FishFormat,
  FishLatency,
  FishVoiceModel,
  HistoryItem,
  ProviderId,
  ThemeMode,
} from "../shared/types";
import { createFishExplorerController } from "./fishDiscovery";
import "./styles.css";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const state = createInitialState();

const el = {
  topbar: $("topbar"),
  engineSub: $("engineSub"),
  engineSeg: $("engineSeg"),
  segThumb: $("segThumb"),
  btnKeyPool: $("btnKeyPool"),
  keyCountChip: $("keyCountChip"),
  btnSwitchMobile: $("btnSwitchMobile"),
  btnTheme: $("btnTheme"),
  themeIcon: $("themeIcon"),

  textInput: $<HTMLTextAreaElement>("textInput"),
  counter: $("counter"),
  chunkHint: $("chunkHint"),
  btnSample: $("btnSample"),
  btnPaste: $("btnPaste"),
  btnClear: $("btnClear"),
  fishTagRow: $("fishTagRow"),
  engBadge: $("engBadge"),
  estDur: $("estDur"),
  curVoiceLabel: $("curVoiceLabel"),

  panelGemini: $("panelGemini"),
  panelFish: $("panelFish"),
  voiceGrid: $("voiceGrid"),
  activeFishCard: $("activeFishCard"),
  fishQuickSearchInput: $<HTMLInputElement>("fishQuickSearchInput"),
  btnQuickSearchGo: $("btnQuickSearchGo"),
  quickSearchResults: $("quickSearchResults"),
  refInput: $<HTMLInputElement>("refInput"),
  refPresets: $("refPresets"),
  bookName: $<HTMLInputElement>("bookName"),
  btnSaveBook: $("btnSaveBook"),
  bookList: $("bookList"),
  fishModelRow: $("fishModelRow"),
  rngFishSpeed: $<HTMLInputElement>("rngFishSpeed"),
  rngFishVolume: $<HTMLInputElement>("rngFishVolume"),
  valFishSpeed: $("valFishSpeed"),
  valFishVolume: $("valFishVolume"),
  fishAdvSummaryText: $("fishAdvSummaryText"),
  selFishFormat: $<HTMLSelectElement>("selFishFormat"),
  wrapFishBitrate: $("wrapFishBitrate"),
  selFishBitrate: $<HTMLSelectElement>("selFishBitrate"),
  selFishSampleRate: $<HTMLSelectElement>("selFishSampleRate"),
  selFishLatency: $<HTMLSelectElement>("selFishLatency"),
  rngFishTemp: $<HTMLInputElement>("rngFishTemp"),
  valFishTemp: $("valFishTemp"),
  rngFishTopP: $<HTMLInputElement>("rngFishTopP"),
  valFishTopP: $("valFishTopP"),
  rngFishRep: $<HTMLInputElement>("rngFishRep"),
  valFishRep: $("valFishRep"),
  rngFishChunk: $<HTMLInputElement>("rngFishChunk"),
  valFishChunk: $("valFishChunk"),
  btnFishNorm: $("btnFishNorm"),
  fishNormLabel: $("fishNormLabel"),
  corsStateText: $("corsStateText"),
  hintFishCors: $("hintFishCors"),

  rngRate: $<HTMLInputElement>("rngRate"),
  valRate: $("valRate"),
  rngPause: $<HTMLInputElement>("rngPause"),
  valPause: $("valPause"),
  rngEmotion: $<HTMLInputElement>("rngEmotion"),
  valEmotion: $("valEmotion"),
  geminiExtra: $("geminiExtra"),
  btnStyleToggle: $("btnStyleToggle"),
  styleToggleLabel: $("styleToggleLabel"),
  styleWrap: $("styleWrap"),
  styleInput: $<HTMLTextAreaElement>("styleInput"),
  stylePresets: $("stylePresets"),

  btnGenerate: $<HTMLButtonElement>("btnGenerate"),
  genIcon: $("genIcon"),
  genLabel: $("genLabel"),
  genNote: $("genNote"),

  hisList: $("hisList"),
  hisEmpty: $("hisEmpty"),
  hisHint: $("hisHint"),
  btnClearHistory: $("btnClearHistory"),

  player: $("player"),
  pArt: $("pArt"),
  pTitle: $("pTitle"),
  pSub: $("pSub"),
  btnPlay: $<HTMLButtonElement>("btnPlay"),
  playIcon: $("playIcon"),
  tCur: $("tCur"),
  tDur: $("tDur"),
  pWave: $("pWave"),
  seek: $<HTMLInputElement>("seek"),
  btnSpeed: $("btnSpeed"),
  speedLabel: $("speedLabel"),
  btnDownload: $<HTMLButtonElement>("btnDownload"),
  btnDlMore: $<HTMLButtonElement>("btnDlMore"),
  dlMenu: $("dlMenu"),
  miNative: $("miNative"),
  nativeFmtSub: $("nativeFmtSub"),
  miWav: $("miWav"),
  miCopyB64: $("miCopyB64"),

  scrim: $("scrim"),
  drawer: $("drawer"),
  btnDrawerClose: $("btnDrawerClose"),
  tabCntGemini: $("tabCntGemini"),
  tabCntFish: $("tabCntFish"),
  modeSeg: $("modeSeg"),
  keyList: $("keyList"),
  keyEmpty: $("keyEmpty"),
  keyInput: $<HTMLTextAreaElement>("keyInput"),
  btnAddKeys: $("btnAddKeys"),
  btnClearPoolKeys: $("btnClearPoolKeys"),
  corsInput: $<HTMLInputElement>("corsInput"),
  btnSaveCors: $("btnSaveCors"),
  btnTestCors: $("btnTestCors"),
  proxyTestBadge: $("proxyTestBadge"),
  btnUseLocalCors: $("btnUseLocalCors"),
  btnCopyWorker: $("btnCopyWorker"),

  audio: $<HTMLAudioElement>("audioEl"),
  previewAudio: $<HTMLAudioElement>("previewAudioEl"),
  toasts: $("toasts"),
};

let keyTab: ProviderId = "gemini";
let playingPreviewId = "";
let refLookupTimer: number | undefined;
let quickSearchTimer: number | undefined;

const TOAST_ICONS: Record<string, string> = {
  ok: '<path d="M20 6L9 17l-5-5"></path>',
  err: '<circle cx="12" cy="12" r="9"></circle><path d="M15 9l-6 6M9 9l6 6"></path>',
  warn: '<path d="M12 9v4M12 17h.01"></path><path d="M10.3 3.9L2.5 17.4A2 2 0 0 0 4.2 20.5h15.6a2 2 0 0 0 1.7-3.1L13.7 3.9a2 2 0 0 0-3.4 0z"></path>',
  info: '<circle cx="12" cy="12" r="9"></circle><path d="M12 11v5M12 8h.01"></path>',
};

function toast(
  kind: "ok" | "err" | "warn" | "info",
  title: string,
  desc = "",
  ttl?: number,
): void {
  const node = document.createElement("div");
  node.className = `toast ${kind}`;
  node.innerHTML =
    `<svg class="t-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${TOAST_ICONS[kind] || TOAST_ICONS.info}</svg>` +
    `<div class="t-body"><div class="t-title"></div>${desc ? '<div class="t-desc"></div>' : ""}</div>`;
  node.querySelector(".t-title")!.textContent = title;
  if (desc) node.querySelector(".t-desc")!.textContent = desc;
  el.toasts.appendChild(node);
  const life = ttl || (kind === "err" ? 6400 : 3600);
  setTimeout(() => {
    node.classList.add("out");
    setTimeout(() => node.remove(), 300);
  }, life);
  while (el.toasts.children.length > 4) el.toasts.firstChild?.remove();
}

/* ==================================================================
   Theme & Range painting
   ================================================================== */
function applyTheme(mode: ThemeMode): void {
  setDocumentTheme(mode);
  el.themeIcon.innerHTML = mode === "dark" ? ICONS.moon : ICONS.sun;
}

function paintRange(input: HTMLInputElement): void {
  const min = parseFloat(input.min);
  const max = parseFloat(input.max);
  const val = parseFloat(input.value);
  input.style.setProperty("--p", String(clamp(((val - min) / (max - min)) * 100, 0, 100)));
}

/* ==================================================================
   Preview Playback (mutually exclusive)
   ================================================================== */
function stopSamplePreview(): void {
  if (!el.previewAudio.paused) el.previewAudio.pause();
  el.previewAudio.removeAttribute("src");
  playingPreviewId = "";
  renderActiveFishCard();
  renderPresets();
  renderBookList();
  explorer.refreshView();
}

function toggleFishSamplePreview(model: FishVoiceModel): void {
  const sampleUrl = model.samples[0]?.audio || "";
  if (!sampleUrl) {
    toast("warn", "暂无官方试听样音", "该模型未附带样例音频，可直接点击「生成语音」测试。");
    return;
  }
  if (playingPreviewId === model.id) {
    stopSamplePreview();
    return;
  }
  if (!el.audio.paused) el.audio.pause();
  playingPreviewId = model.id;
  el.previewAudio.src = sampleUrl;
  el.previewAudio.playbackRate = state.rate;
  el.previewAudio.play().catch(() => {
    playingPreviewId = "";
    toast("err", "试听播放失败", "样音链接暂不可用，请稍后重试。");
  });
  renderActiveFishCard();
  renderPresets();
  renderBookList();
  explorer.refreshView();
}

el.previewAudio.addEventListener("ended", stopSamplePreview);
el.previewAudio.addEventListener("error", () => {
  if (playingPreviewId) {
    playingPreviewId = "";
    renderActiveFishCard();
    renderPresets();
    renderBookList();
    explorer.refreshView();
  }
});

/* ==================================================================
   Fish Voice Selection / Bookmarks / Active Card
   ================================================================== */
function isBookmarked(id: string): boolean {
  return state.books.some((b) => b.id === id);
}

function selectFishVoice(model: FishVoiceModel | string): void {
  const id = typeof model === "string" ? model.trim() : model.id;
  state.fishRefId = id;
  el.refInput.value = id;
  if (state.engine !== "fish") setEngine("fish");
  else {
    el.curVoiceLabel.textContent = getFishDisplayTitle(state);
    saveStateToStorage(state);
  }
  renderActiveFishCard();
  renderPresets();
  renderBookList();
  explorer.refreshView();
  if (id && !getCachedFishModel(id)?.fetchedAt) {
    void fetchFishModelById(id, {
      apiKey: pickKey(state, "fish")?.value,
      corsPrefix: state.cors,
    }).then((resolved) => {
      if (resolved) {
        syncBookmarkMeta(resolved);
        renderActiveFishCard();
        renderBookList();
        if (state.engine === "fish") {
          el.curVoiceLabel.textContent = getFishDisplayTitle(state);
        }
      }
    });
  }
}

function toggleBookmarkModel(model: FishVoiceModel): void {
  const idx = state.books.findIndex((b) => b.id === model.id);
  if (idx >= 0) {
    state.books.splice(idx, 1);
    toast("info", "已取消收藏", model.title);
  } else {
    state.books.unshift({
      id: model.id,
      title: model.title,
      authorName: model.authorName,
      coverUrl: model.coverUrl,
      languages: model.languages,
      tags: model.tags,
      sampleAudio: model.samples[0]?.audio,
      description: model.description,
      addedAt: Date.now(),
    });
    toast("ok", "已收藏音色", model.title);
  }
  saveStateToStorage(state);
  renderBookList();
  renderActiveFishCard();
  explorer.refreshView();
}

function syncBookmarkMeta(model: FishVoiceModel): void {
  const book = state.books.find((b) => b.id === model.id);
  if (!book) return;
  book.title = model.title || book.title;
  book.authorName = model.authorName || book.authorName;
  book.coverUrl = model.coverUrl || book.coverUrl;
  book.languages = model.languages.length ? model.languages : book.languages;
  book.tags = model.tags.length ? model.tags : book.tags;
  book.sampleAudio = model.samples[0]?.audio || book.sampleAudio;
  book.description = model.description || book.description;
  saveStateToStorage(state);
}

function renderActiveFishCard(): void {
  const id = state.fishRefId.trim();
  if (!id) {
    el.activeFishCard.innerHTML =
      `<div class="af-cover">S2</div>` +
      `<div class="af-body">` +
        `<div class="af-title-row"><span class="af-title">默认音色 · ${state.fish.model}</span><span class="af-lang">自动</span></div>` +
        `<div class="af-meta">未指定 reference_id，将使用模型内置均衡音色</div>` +
        `<div class="af-desc">可点击右上角「探索音色库」或下方热门音色一键选用</div>` +
      `</div>`;
    return;
  }

  const cached = getCachedFishModel(id);
  const book = state.books.find((b) => b.id === id);
  const title = book?.customName || cached?.title || book?.title || `解析中 (${id.slice(0, 8)}…)`;
  const author = cached?.authorName || book?.authorName || "Fish Audio 社区";
  const coverUrl = cached?.coverUrl || book?.coverUrl || "";
  const langs = cached?.languages?.length ? cached.languages : book?.languages || [];
  const desc = cached?.description || book?.description || `ID: ${id}`;
  const hasSample = Boolean(cached?.samples?.[0]?.audio || book?.sampleAudio);
  const isPlaying = playingPreviewId === id;
  const liked = isBookmarked(id);

  el.activeFishCard.innerHTML = "";
  const cov = document.createElement("div");
  cov.className = "af-cover";
  if (coverUrl) {
    const img = document.createElement("img");
    img.src = coverUrl;
    img.alt = title;
    img.onerror = () => {
      img.remove();
      cov.textContent = title.slice(0, 1).toUpperCase();
    };
    cov.appendChild(img);
  } else {
    cov.textContent = title.slice(0, 1).toUpperCase();
  }

  const body = document.createElement("div");
  body.className = "af-body";
  const tRow = document.createElement("div");
  tRow.className = "af-title-row";
  const tSpan = document.createElement("span");
  tSpan.className = "af-title";
  tSpan.textContent = title;
  tRow.appendChild(tSpan);
  if (langs[0]) {
    const lSpan = document.createElement("span");
    lSpan.className = "af-lang";
    lSpan.textContent = formatFishLanguage(langs[0]);
    tRow.appendChild(lSpan);
  }
  const meta = document.createElement("div");
  meta.className = "af-meta";
  meta.textContent = `${author}${cached?.taskCount ? ` · 使用 ${fmtCompactCount(cached.taskCount)}` : ""}`;
  const dEl = document.createElement("div");
  dEl.className = "af-desc";
  dEl.textContent = desc;
  body.append(tRow, meta, dEl);

  const acts = document.createElement("div");
  acts.className = "af-actions";

  if (hasSample) {
    const pBtn = document.createElement("button");
    pBtn.type = "button";
    pBtn.className = `af-icon-btn${isPlaying ? " playing" : ""}`;
    pBtn.title = isPlaying ? "停止试听" : "试听样音";
    pBtn.innerHTML = isPlaying ? ICONS.pause : ICONS.play;
    pBtn.addEventListener("click", () => {
      const m: FishVoiceModel = cached || {
        id,
        title,
        description: desc,
        coverUrl,
        authorId: "",
        authorName: author,
        authorAvatar: "",
        languages: langs,
        tags: book?.tags || [],
        samples: book?.sampleAudio ? [{ title: "样音", text: "", taskId: "", audio: book.sampleAudio }] : [],
        likeCount: 0,
        markCount: 0,
        taskCount: 0,
        fetchedAt: 0,
      };
      toggleFishSamplePreview(m);
    });
    acts.appendChild(pBtn);
  }

  const fBtn = document.createElement("button");
  fBtn.type = "button";
  fBtn.className = `af-icon-btn${liked ? " liked" : ""}`;
  fBtn.title = liked ? "取消收藏" : "收藏音色";
  fBtn.innerHTML = liked ? ICONS.heartFilled : ICONS.heart;
  fBtn.addEventListener("click", () => {
    const m: FishVoiceModel = cached || {
      id,
      title,
      description: desc,
      coverUrl,
      authorId: "",
      authorName: author,
      authorAvatar: "",
      languages: langs,
      tags: book?.tags || [],
      samples: book?.sampleAudio ? [{ title: "样音", text: "", taskId: "", audio: book.sampleAudio }] : [],
      likeCount: 0,
      markCount: 0,
      taskCount: 0,
      fetchedAt: 0,
    };
    toggleBookmarkModel(m);
  });
  acts.appendChild(fBtn);

  const clrBtn = document.createElement("button");
  clrBtn.type = "button";
  clrBtn.className = "af-icon-btn";
  clrBtn.title = "恢复默认音色";
  clrBtn.innerHTML = ICONS.close;
  clrBtn.addEventListener("click", () => selectFishVoice(""));
  acts.appendChild(clrBtn);

  el.activeFishCard.append(cov, body, acts);
}

function renderPresets(): void {
  el.refPresets.innerHTML = "";
  const curId = state.fishRefId.trim();

  FISH_PRESET_VOICES.forEach((p) => {
    const model = getCachedFishModel(p.id) || p;
    const card = document.createElement("div");
    card.className = `voice-mini-card${curId === model.id ? " selected" : ""}`;
    card.title = `${model.title} (${model.id})`;

    const av = document.createElement("div");
    av.className = "vmc-avatar";
    if (model.coverUrl) {
      const img = document.createElement("img");
      img.src = model.coverUrl;
      img.alt = model.title;
      img.loading = "lazy";
      img.onerror = () => {
        img.remove();
        av.textContent = model.title.slice(0, 1).toUpperCase();
      };
      av.appendChild(img);
    } else {
      av.textContent = model.title.slice(0, 1).toUpperCase();
    }

    const info = document.createElement("div");
    info.className = "vmc-info";
    const t = document.createElement("div");
    t.className = "vmc-title";
    t.textContent = model.title;
    const s = document.createElement("div");
    s.className = "vmc-sub";
    const langLabel = model.languages[0] ? formatFishLanguage(model.languages[0]) : "多语";
    s.textContent = `${langLabel} · ${model.authorName}`;
    info.append(t, s);

    const playBtn = document.createElement("button");
    playBtn.type = "button";
    const isPlaying = playingPreviewId === model.id;
    playBtn.className = `vmc-play${isPlaying ? " playing" : ""}`;
    playBtn.title = "试听音色";
    playBtn.innerHTML = isPlaying ? ICONS.pause : ICONS.play;
    playBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFishSamplePreview(model);
    });

    card.addEventListener("click", () => {
      selectFishVoice(model);
      toast("ok", "已选中音色", model.title);
    });

    card.append(av, info, playBtn);
    el.refPresets.appendChild(card);
  });
}

function renderBookList(): void {
  el.bookList.innerHTML = "";
  const curId = state.fishRefId.trim();
  state.books.forEach((b) => {
    const cached = getCachedFishModel(b.id);
    const title = b.customName || cached?.title || b.title;
    const cover = cached?.coverUrl || b.coverUrl || "";
    const lang = cached?.languages?.[0] || b.languages?.[0] || "";
    const author = cached?.authorName || b.authorName || b.id.slice(0, 10);

    const row = document.createElement("div");
    row.className = `book-item${curId === b.id ? " selected" : ""}`;

    const av = document.createElement("div");
    av.className = "bk-avatar";
    if (cover) {
      const img = document.createElement("img");
      img.src = cover;
      img.alt = title;
      img.loading = "lazy";
      img.onerror = () => {
        img.remove();
        av.textContent = title.slice(0, 1).toUpperCase();
      };
      av.appendChild(img);
    } else {
      av.textContent = title.slice(0, 1).toUpperCase();
    }

    const main = document.createElement("div");
    main.className = "bk-main";
    const tEl = document.createElement("div");
    tEl.className = "bk-title";
    tEl.textContent = title;
    const subEl = document.createElement("div");
    subEl.className = "bk-sub";
    subEl.textContent = `${lang ? `${formatFishLanguage(lang)} · ` : ""}${author}`;
    main.append(tEl, subEl);

    const useBtn = document.createElement("button");
    useBtn.type = "button";
    useBtn.className = "bk-use";
    useBtn.textContent = curId === b.id ? "使用中" : "选用";
    useBtn.addEventListener("click", () => {
      selectFishVoice(b.id);
      toast("ok", "已切换音色", title);
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "bk-del";
    delBtn.title = "删除";
    delBtn.innerHTML = ICONS.close;
    delBtn.addEventListener("click", () => {
      state.books = state.books.filter((x) => x.id !== b.id);
      saveStateToStorage(state);
      renderBookList();
      renderActiveFishCard();
      explorer.refreshView();
    });

    row.append(av, main, useBtn, delBtn);
    el.bookList.appendChild(row);
  });
}

function addBookmarkFromInput(): void {
  const id = el.refInput.value.trim();
  if (!id) {
    toast("warn", "音色 ID 为空", "先选择音色或填入 reference_id 再收藏。");
    return;
  }
  if (isBookmarked(id)) {
    toast("info", "已在收藏列表中", getFishDisplayTitle(state));
    return;
  }
  const cached = getCachedFishModel(id);
  const custom = el.bookName.value.trim();
  state.books.unshift({
    id,
    title: cached?.title || custom || `音色 ${state.books.length + 1}`,
    customName: custom || undefined,
    authorName: cached?.authorName,
    coverUrl: cached?.coverUrl,
    languages: cached?.languages,
    tags: cached?.tags,
    sampleAudio: cached?.samples?.[0]?.audio,
    description: cached?.description,
    addedAt: Date.now(),
  });
  el.bookName.value = "";
  saveStateToStorage(state);
  renderBookList();
  renderActiveFishCard();
  toast("ok", "已收藏音色", custom || cached?.title || id.slice(0, 8));
}

async function runQuickSearch(q: string): Promise<void> {
  const clean = q.trim();
  if (!clean) {
    el.quickSearchResults.hidden = true;
    el.quickSearchResults.innerHTML = "";
    return;
  }
  el.quickSearchResults.hidden = false;
  el.quickSearchResults.innerHTML = '<div style="font-size:12px;color:var(--text-3);padding:6px 4px">搜索中…</div>';
  try {
    const res = await searchFishModels(
      { title: clean, pageNumber: 1, pageSize: 6, sortBy: "score" },
      { apiKey: pickKey(state, "fish")?.value, corsPrefix: state.cors },
    );
    el.quickSearchResults.innerHTML = "";
    if (!res.items.length) {
      el.quickSearchResults.innerHTML = '<div style="font-size:12px;color:var(--text-3);padding:6px 4px">未找到匹配音色</div>';
      return;
    }
    res.items.forEach((m) => {
      const card = document.createElement("div");
      card.className = `voice-mini-card${state.fishRefId.trim() === m.id ? " selected" : ""}`;

      const av = document.createElement("div");
      av.className = "vmc-avatar";
      if (m.coverUrl) {
        const img = document.createElement("img");
        img.src = m.coverUrl;
        img.alt = m.title;
        img.onerror = () => {
          img.remove();
          av.textContent = m.title.slice(0, 1).toUpperCase();
        };
        av.appendChild(img);
      } else av.textContent = m.title.slice(0, 1).toUpperCase();

      const info = document.createElement("div");
      info.className = "vmc-info";
      info.innerHTML = `<div class="vmc-title"></div><div class="vmc-sub"></div>`;
      info.querySelector(".vmc-title")!.textContent = m.title;
      info.querySelector(".vmc-sub")!.textContent = `${m.languages.map(formatFishLanguage).join("/")} · ${m.authorName}`;

      const pBtn = document.createElement("button");
      pBtn.type = "button";
      pBtn.className = `vmc-play${playingPreviewId === m.id ? " playing" : ""}`;
      pBtn.innerHTML = playingPreviewId === m.id ? ICONS.pause : ICONS.play;
      pBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFishSamplePreview(m);
      });

      card.addEventListener("click", () => {
        selectFishVoice(m);
        el.quickSearchResults.hidden = true;
        toast("ok", "已选中音色", m.title);
      });

      card.append(av, info, pBtn);
      el.quickSearchResults.appendChild(card);
    });
  } catch (err) {
    el.quickSearchResults.innerHTML = `<div style="font-size:12px;color:var(--red);padding:6px 4px">${err instanceof Error ? err.message : "搜索失败"}</div>`;
  }
}

/* ==================================================================
   Key Pool Drawer
   ================================================================== */
function updateKeyChip(): void {
  const provider = state.engine;
  const avail = getPoolAvailableCount(state, provider);
  const total = state.pools[provider].keys.length;
  el.keyCountChip.textContent = `在线 ${avail} 个`;
  el.keyCountChip.classList.toggle("zero", avail === 0);
  el.keyCountChip.title = `${provider === "gemini" ? "Gemini" : "Fish Audio"} Key 池：可用 ${avail} / 共 ${total}`;
  el.tabCntGemini.textContent = `${getPoolAvailableCount(state, "gemini")}/${state.pools.gemini.keys.length}`;
  el.tabCntFish.textContent = `${getPoolAvailableCount(state, "fish")}/${state.pools.fish.keys.length}`;
}

function syncModeSeg(): void {
  const pool = state.pools[keyTab];
  Array.from(el.modeSeg.children).forEach((b) => {
    b.setAttribute("aria-selected", (b as HTMLElement).dataset.mode === pool.mode ? "true" : "false");
  });
}

function renderKeys(): void {
  const pool = state.pools[keyTab];
  el.keyList.innerHTML = "";
  el.keyEmpty.hidden = pool.keys.length > 0;

  pool.keys.forEach((k, i) => {
    const d = describeKey(k);
    const row = document.createElement("div");
    row.className = `k-row${i === 0 && pool.mode === "pinned" && k.enabled ? " active" : ""}${k.enabled ? "" : " disabled"}`;
    row.innerHTML =
      `<span class="k-radio" aria-hidden="true"></span>` +
      `<div class="k-body"><div class="k-key"></div><div class="k-info"><span class="k-state ${d.cls}"></span><span class="k-note"></span></div></div>` +
      `<div class="k-acts">` +
        `<button class="k-act pin" type="button" title="设为主用"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"></path><path d="M9 3h6l-1 6 4 3v2H6v-2l4-3-1-6z"></path></svg></button>` +
        `<button class="k-act tog" type="button" title="启用/禁用"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${k.enabled ? '<path d="M18 6L6 18M6 6l12 12"></path>' : '<path d="M20 6L9 17l-5-5"></path>'}</svg></button>` +
        `<button class="k-act del" type="button" title="删除"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4.8A1.8 1.8 0 0 1 10.8 3h2.4A1.8 1.8 0 0 1 15 4.8V7M6.5 7l.8 12.2A1.8 1.8 0 0 0 9.1 21h5.8a1.8 1.8 0 0 0 1.8-1.8L17.5 7"></path></svg></button>` +
      `</div>`;
    row.querySelector(".k-key")!.textContent = maskKey(k.value);
    row.querySelector(".k-state")!.textContent = d.text;
    const note: string[] = [];
    if (k.uses) note.push(`已用 ${k.uses} 次`);
    if (k.lastError) note.push(String(k.lastError).slice(0, 22));
    row.querySelector(".k-note")!.textContent = note.join(" · ");

    row.querySelector(".k-act.pin")!.addEventListener("click", (e) => {
      e.stopPropagation();
      pool.mode = "pinned";
      const idx = pool.keys.findIndex((x) => x.id === k.id);
      if (idx > 0) {
        pool.keys.splice(idx, 1);
        pool.keys.unshift(k);
      }
      saveStateToStorage(state);
      renderKeys();
      syncModeSeg();
      toast("ok", "已设为主用", maskKey(k.value));
    });
    row.querySelector(".k-act.tog")!.addEventListener("click", (e) => {
      e.stopPropagation();
      k.enabled = !k.enabled;
      if (k.enabled) {
        k.state = "ok";
        k.cooldownUntil = 0;
        k.lastError = "";
      }
      saveStateToStorage(state);
      renderKeys();
      updateKeyChip();
    });
    row.querySelector(".k-act.del")!.addEventListener("click", (e) => {
      e.stopPropagation();
      pool.keys = pool.keys.filter((x) => x.id !== k.id);
      saveStateToStorage(state);
      renderKeys();
      updateKeyChip();
      toast("info", "已删除 Key", maskKey(k.value));
    });
    el.keyList.appendChild(row);
  });
  updateKeyChip();
  syncModeSeg();
}

function openDrawer(): void {
  el.drawer.classList.add("open");
  el.scrim.classList.add("open");
  el.drawer.setAttribute("aria-hidden", "false");
  keyTab = state.engine;
  document.querySelectorAll<HTMLButtonElement>(".k-tab").forEach((b) => {
    b.setAttribute("aria-selected", b.dataset.pool === keyTab ? "true" : "false");
  });
  el.corsInput.value = state.cors;
  renderKeys();
  document.body.style.overflow = "hidden";
}

function closeDrawer(): void {
  el.drawer.classList.remove("open");
  el.scrim.classList.remove("open");
  el.drawer.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

/* ==================================================================
   Engine & Parameter Sync
   ================================================================== */
function moveSegThumb(): void {
  const active = el.engineSeg.querySelector<HTMLButtonElement>('button[aria-selected="true"]');
  if (!active) return;
  const box = el.engineSeg.getBoundingClientRect();
  const r = active.getBoundingClientRect();
  el.segThumb.style.width = `${r.width}px`;
  el.segThumb.style.transform = `translateX(${r.left - box.left - 3}px)`;
}

function refreshStats(): void {
  const raw = el.textInput.value;
  el.counter.textContent = `${raw.length} / ${MAX_CHARS}`;
  el.counter.classList.toggle("warn", raw.length > MAX_CHARS * 0.9);
  const limit = state.engine === "fish" ? FISH_CHUNK : GEMINI_CHUNK;
  const chunks = splitText(raw, limit);
  state.chunkCount = Math.max(1, chunks.length);
  el.chunkHint.textContent = chunks.length > 1 ? `分段 ${chunks.length} 次请求` : "单段直出";
  el.estDur.textContent = `${Math.round(estimateDuration(raw))} 秒`;
  el.engBadge.textContent = state.engine === "fish" ? "Fish Audio" : "Gemini";
  el.engBadge.classList.toggle("fish", state.engine === "fish");
}

function setEngine(engine: ProviderId): void {
  state.engine = engine;
  el.engineSeg.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
    b.setAttribute("aria-selected", b.dataset.engine === engine ? "true" : "false");
  });
  el.panelGemini.hidden = engine !== "gemini";
  el.panelFish.hidden = engine !== "fish";
  el.fishTagRow.hidden = engine !== "fish";
  el.geminiExtra.hidden = engine !== "gemini";
  el.btnGenerate.classList.toggle("fish", engine === "fish");
  el.engineSub.textContent =
    engine === "fish"
      ? `Fish Audio · ${state.fish.model} · 桌面工作台`
      : `${state.activeModel} · 桌面工作台`;
  el.genNote.textContent =
    engine === "fish"
      ? `Fish Audio (${state.fish.model}) · 搜索/试听直连官方；若合成报 CORS 错误请在 Key 池设置代理`
      : "Gemini 免费层级每分钟 3 次 / 每天 10 次；触发限流会自动切换 Key 池中的下一个可用 Key";
  el.curVoiceLabel.textContent =
    engine === "fish"
      ? getFishDisplayTitle(state)
      : (VOICES.find((v) => v.id === state.geminiVoice)?.tag || state.geminiVoice);
  el.corsStateText.textContent = state.cors
    ? `CORS 代理：${state.cors}`
    : "CORS 代理：未启用（直连）";
  saveStateToStorage(state);
  refreshStats();
  updateKeyChip();
  requestAnimationFrame(moveSegThumb);
}

function syncFishModelPills(): void {
  el.fishModelRow.innerHTML = "";
  FISH_MODEL_OPTIONS.forEach((opt) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "model-pill";
    b.title = opt.note;
    b.setAttribute("aria-checked", state.fish.model === opt.id ? "true" : "false");
    b.innerHTML = `<span>${opt.name}</span><span class="mp-badge">${opt.badge}</span>`;
    b.addEventListener("click", () => {
      state.fish.model = opt.id;
      syncFishModelPills();
      setEngine(state.engine);
      renderActiveFishCard();
    });
    el.fishModelRow.appendChild(b);
  });
}

function syncFishBitrateSelect(): void {
  const fmt = state.fish.format;
  el.wrapFishBitrate.hidden = fmt === "wav" || fmt === "pcm";
  el.selFishBitrate.innerHTML = "";
  const opts =
    fmt === "opus"
      ? [
          { v: "-1000", l: "自动码率" },
          { v: "24", l: "24 kbps" },
          { v: "32", l: "32 kbps" },
          { v: "48", l: "48 kbps" },
          { v: "64", l: "64 kbps" },
        ]
      : [
          { v: "64", l: "64 kbps" },
          { v: "128", l: "128 kbps" },
          { v: "192", l: "192 kbps" },
        ];
  opts.forEach((o) => {
    const opt = document.createElement("option");
    opt.value = o.v;
    opt.textContent = o.l;
    el.selFishBitrate.appendChild(opt);
  });
  el.selFishBitrate.value = String(fmt === "opus" ? state.fish.opusBitrate : state.fish.mp3Bitrate);
}

function syncFishControls(): void {
  state.fish.speed = parseInt(el.rngFishSpeed.value, 10) / 100;
  state.fish.volume = parseInt(el.rngFishVolume.value, 10);
  state.fish.temperature = parseInt(el.rngFishTemp.value, 10) / 100;
  state.fish.topP = parseInt(el.rngFishTopP.value, 10) / 100;
  state.fish.repetitionPenalty = parseInt(el.rngFishRep.value, 10) / 100;
  state.fish.chunkLength = parseInt(el.rngFishChunk.value, 10);

  el.valFishSpeed.textContent = `${state.fish.speed.toFixed(2)}×`;
  el.valFishVolume.textContent = `${state.fish.volume > 0 ? "+" : ""}${state.fish.volume} dB`;
  el.valFishTemp.textContent = state.fish.temperature.toFixed(2);
  el.valFishTopP.textContent = state.fish.topP.toFixed(2);
  el.valFishRep.textContent = state.fish.repetitionPenalty.toFixed(2);
  el.valFishChunk.textContent = String(state.fish.chunkLength);

  paintRange(el.rngFishSpeed);
  paintRange(el.rngFishVolume);
  paintRange(el.rngFishTemp);
  paintRange(el.rngFishTopP);
  paintRange(el.rngFishRep);
  paintRange(el.rngFishChunk);

  const brLabel =
    state.fish.format === "mp3"
      ? `${state.fish.mp3Bitrate}k`
      : state.fish.format === "opus"
        ? `${state.fish.opusBitrate === -1000 ? "auto" : `${state.fish.opusBitrate}k`}`
        : "PCM";
  el.fishAdvSummaryText.textContent = `${state.fish.format.toUpperCase()} ${brLabel} · T=${state.fish.temperature.toFixed(2)}`;
  saveStateToStorage(state);
}

function syncRate(): void {
  state.rate = parseInt(el.rngRate.value, 10) / 100;
  el.valRate.textContent = `${state.rate.toFixed(2)}×`;
  paintRange(el.rngRate);
  el.audio.playbackRate = state.rate;
  saveStateToStorage(state);
}

function syncPause(): void {
  state.pause = parseInt(el.rngPause.value, 10);
  el.valPause.textContent = String(state.pause);
  paintRange(el.rngPause);
  saveStateToStorage(state);
}

function syncEmotion(): void {
  state.emotion = parseInt(el.rngEmotion.value, 10);
  el.valEmotion.textContent = String(state.emotion);
  paintRange(el.rngEmotion);
  saveStateToStorage(state);
}

function setStyleEnabled(on: boolean): void {
  state.useStyle = on;
  el.btnStyleToggle.setAttribute("aria-checked", on ? "true" : "false");
  el.styleToggleLabel.textContent = on ? "已启用" : "已关闭";
  el.styleWrap.classList.toggle("off", !on);
  el.stylePresets.classList.toggle("off", !on);
  saveStateToStorage(state);
}

/* ==================================================================
   Gemini Voices
   ================================================================== */
function selectGeminiVoice(id: string): void {
  state.geminiVoice = id;
  const v = VOICES.find((x) => x.id === id);
  if (state.engine === "gemini") el.curVoiceLabel.textContent = v ? v.tag : id;
  Array.from(el.voiceGrid.children).forEach((n) => {
    (n as HTMLElement).setAttribute("aria-checked", (n as HTMLElement).dataset.voice === id ? "true" : "false");
  });
  saveStateToStorage(state);
}

async function previewGeminiVoice(v: (typeof VOICES)[number], btn: HTMLElement): Promise<void> {
  if (btn.classList.contains("busy")) return;
  if (state.busy) {
    toast("warn", "正在合成", "请等待当前任务完成。");
    return;
  }
  const prev = state.geminiVoice;
  btn.classList.add("busy");
  try {
    selectGeminiVoice(v.id);
    const out = await geminiChunk(state, `你好，我是 ${v.id}，这是一段音色试听。`, {
      onNotify: toast,
      onKeySync: () => {
        renderKeys();
        updateKeyChip();
      },
      onStyleDisabled: () => setStyleEnabled(false),
    });
    const meta = parseMime(out.mimeType);
    const bytes = b64ToBytes(out.data);
    let blob: Blob;
    if (meta.isMp3) blob = new Blob([bytes.buffer as ArrayBuffer], { type: "audio/mpeg" });
    else if (meta.isWav && bytes[0] === 0x52) blob = new Blob([bytes.buffer as ArrayBuffer], { type: "audio/wav" });
    else {
      const usable = bytes.length - (bytes.length % 2);
      const wav = pcmToWav(new Uint8Array(bytes.buffer, bytes.byteOffset, usable), meta.sampleRate, meta.channels);
      blob = new Blob([wav.buffer as ArrayBuffer], { type: "audio/wav" });
    }
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    a.playbackRate = state.rate;
    a.addEventListener("ended", () => URL.revokeObjectURL(url));
    await a.play();
    toast("info", `试听中 · ${v.id}`, v.tag);
  } catch (err) {
    selectGeminiVoice(prev);
    handleError(err as ApiError, "gemini");
  } finally {
    btn.classList.remove("busy");
  }
}

function buildGeminiVoices(): void {
  const frag = document.createDocumentFragment();
  VOICES.forEach((v) => {
    const node = document.createElement("div");
    node.className = "voice";
    node.setAttribute("role", "radio");
    node.setAttribute("tabindex", "0");
    node.dataset.voice = v.id;
    node.setAttribute("aria-checked", v.id === state.geminiVoice ? "true" : "false");
    node.innerHTML =
      `<div class="v-top"><span class="v-name"></span>` +
      `<button class="v-play" type="button" tabindex="-1" title="试听">${ICONS.play}</button></div>` +
      `<span class="v-tag"></span><div class="v-desc"></div>`;
    node.querySelector(".v-name")!.textContent = v.id;
    node.querySelector(".v-tag")!.textContent = v.tag;
    node.querySelector(".v-desc")!.textContent = v.desc;
    node.addEventListener("click", () => selectGeminiVoice(v.id));
    node.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectGeminiVoice(v.id);
      }
    });
    const playBtn = node.querySelector<HTMLElement>(".v-play")!;
    playBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      void previewGeminiVoice(v, playBtn);
    });
    frag.appendChild(node);
  });
  el.voiceGrid.innerHTML = "";
  el.voiceGrid.appendChild(frag);
}

/* ==================================================================
   Generation & Player & History
   ================================================================== */
function setBusy(on: boolean, label = "正在合成语音..."): void {
  state.busy = on;
  el.btnGenerate.disabled = on;
  if (on) {
    el.genIcon.innerHTML = '<span class="spinner"></span>';
    el.genLabel.textContent = label;
  } else {
    el.genIcon.innerHTML = ICONS.spark;
    el.genLabel.textContent = "生成语音";
  }
}

function handleError(e: ApiError, provider: ProviderId): void {
  const msg = String(e?.message || e);
  if (e?.cors) {
    toast(
      "err",
      "Fish Audio 跨域被拦截",
      "请在「Key 池管理」中配置 CORS 代理（本地 server.py 可填 http://127.0.0.1:8080/，线上可填 Cloudflare Worker 地址）。",
      10000,
    );
    openDrawer();
    return;
  }
  if (e?.status === 429) {
    toast("warn", e.daily ? "每日额度已用完" : "触发限流", msg, 8000);
    return;
  }
  if (e?.status === 402) {
    toast("warn", "Fish 额度不足", msg, 8500);
    return;
  }
  if (e?.status === 401) {
    toast("err", "Key 无效", `${msg}（已标记该 Key 失效）`, 8000);
    return;
  }
  toast("err", "合成失败", msg, 7000);
  if (provider === "fish" && /fetch|cors|network/i.test(msg)) openDrawer();
}

function renderPlayerWave(peaks: number[], progressRatio = 0): void {
  el.pWave.innerHTML = "";
  const list = peaks.length ? peaks : Array.from({ length: 32 }, (_, i) => 0.25 + ((i * 19) % 70) / 100);
  const slice = list.slice(0, 32);
  slice.forEach((amp, idx) => {
    const bar = document.createElement("span");
    bar.style.height = `${Math.round(clamp(amp, 0.16, 1) * 100)}%`;
    if (idx / slice.length <= progressRatio) bar.classList.add("played");
    el.pWave.appendChild(bar);
  });
}

function syncPlayIcon(): void {
  if (state.playing) {
    el.playIcon.innerHTML =
      '<path d="M7 4.5h3.2a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM14 4.5h3.2a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H14a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z"/>';
    el.btnPlay.setAttribute("aria-label", "暂停");
    el.player.classList.add("playing");
  } else {
    el.playIcon.innerHTML =
      '<path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.29-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14z"/>';
    el.btnPlay.setAttribute("aria-label", "播放");
    el.player.classList.remove("playing");
  }
}

function markHistoryActive(id: string): void {
  el.hisList.querySelectorAll<HTMLElement>(".h-item").forEach((n) => {
    n.classList.toggle("active", n.dataset.id === id);
  });
}

function loadIntoPlayer(item: HistoryItem, autoplay: boolean): void {
  stopSamplePreview();
  state.current = item;
  el.audio.src = item.url;
  el.audio.playbackRate = state.rate;

  el.pTitle.textContent = item.text.replace(/\s+/g, " ").slice(0, 46) + (item.text.length > 46 ? "…" : "");
  const fmt =
    item.ext === "mp3"
      ? "MP3"
      : item.ext === "opus"
        ? "OPUS"
        : `WAV ${item.sampleRate ? `${item.sampleRate / 1000}kHz` : ""}`;
  el.pSub.textContent = `${item.provider === "fish" ? "Fish Audio" : "Gemini"} · ${item.label} · ${fmtClock(item.time)} · ${fmt}`;
  el.pArt.classList.toggle("fish", item.provider === "fish");

  el.btnPlay.disabled = false;
  el.seek.disabled = false;
  el.btnDownload.disabled = false;
  el.btnDlMore.disabled = false;
  el.player.classList.add("live");
  el.nativeFmtSub.textContent = item.ext.toUpperCase();

  el.tDur.textContent = fmtTime(item.duration);
  el.tCur.textContent = "0:00";
  el.seek.value = "0";
  el.seek.style.setProperty("--p", "0");
  renderPlayerWave(item.peaks, 0);
  markHistoryActive(item.id);

  if (autoplay) {
    el.audio.play().catch(() => {});
  }
}

function renderHistory(): void {
  el.hisHint.textContent = `${state.history.length} 条`;
  el.btnClearHistory.hidden = state.history.length === 0;
  el.hisList.querySelectorAll(".h-item").forEach((n) => n.remove());
  el.hisEmpty.hidden = state.history.length > 0;
  if (!state.history.length) return;

  state.history.forEach((item) => {
    const row = document.createElement("div");
    row.className = "h-item";
    row.dataset.id = item.id;
    row.innerHTML =
      `<div class="h-eng ${item.provider}">${item.provider === "fish" ? "FISH" : "GEMINI"}</div>` +
      `<div class="h-main"><div class="h-text"></div>` +
        `<div class="h-meta"><span class="tag"></span><span class="tm"></span><span class="du"></span></div></div>` +
      `<div class="h-actions">` +
        `<button class="h-btn act-play" type="button" title="回放">${ICONS.play}</button>` +
        `<button class="h-btn act-dl" type="button" title="下载">${ICONS.download}</button>` +
      `</div>`;
    const plain = item.text.replace(/\s+/g, " ").trim();
    row.querySelector(".h-text")!.textContent = plain.slice(0, 18) + (plain.length > 18 ? "…" : "");
    row.querySelector(".tag")!.textContent = item.label;
    row.querySelector(".tm")!.textContent = fmtClock(item.time);
    row.querySelector(".du")!.textContent = fmtTime(item.duration);

    row.addEventListener("click", () => loadIntoPlayer(item, true));
    row.querySelector(".act-play")!.addEventListener("click", (e) => {
      e.stopPropagation();
      if (state.current?.id === item.id && !el.audio.paused) el.audio.pause();
      else loadIntoPlayer(item, true);
    });
    row.querySelector(".act-dl")!.addEventListener("click", (e) => {
      e.stopPropagation();
      downloadBlob(item.blob, `${slug(item.text)}-${stamp(item.time)}.${item.ext}`);
      toast("ok", "已下载", item.label);
    });
    el.hisList.appendChild(row);
  });
  if (state.current) markHistoryActive(state.current.id);
}

async function commitResult(provider: ProviderId, out: GeneratedAudioResult, text: string): Promise<void> {
  const id = `h${++state.seq}`;
  const url = URL.createObjectURL(out.blob);
  const label = provider === "fish" ? getFishDisplayTitle(state) : state.geminiVoice;
  const item: HistoryItem = {
    id,
    provider,
    blob: out.blob,
    url,
    mime: out.mime,
    ext: out.ext,
    base64: out.base64,
    sampleRate: out.sampleRate,
    duration: out.duration || estimateDuration(text),
    peaks: out.peaks,
    text,
    label,
    voiceId: provider === "fish" ? state.fishRefId.trim() : state.geminiVoice,
    time: new Date(),
    chunks: out.chunks || 1,
  };

  state.history.unshift(item);
  if (state.history.length > 30) {
    const dropped = state.history.pop();
    if (dropped?.url && state.current?.id !== dropped.id) URL.revokeObjectURL(dropped.url);
  }
  renderHistory();
  loadIntoPlayer(item, true);
  toast(
    "ok",
    "合成完成",
    `${item.chunks > 1 ? `${item.chunks} 段已拼接 · ` : ""}${fmtTime(item.duration)} · ${provider === "fish" ? "Fish" : "Gemini"} · ${item.label}`,
  );
}

async function generate(): Promise<void> {
  if (state.busy) return;
  const raw = el.textInput.value.trim();
  if (!raw) {
    toast("warn", "文本为空", "先输入或粘贴要朗读的内容。");
    el.textInput.focus();
    return;
  }
  if (raw.length > MAX_CHARS) {
    toast("err", "文本过长", `请控制在 ${MAX_CHARS} 字符以内。`);
    return;
  }
  const provider = state.engine;
  if (!pickKey(state, provider)) {
    toast("err", "没有可用 Key", `请在「Key 池管理」中添加 ${provider === "fish" ? "Fish Audio" : "Gemini"} Key。`);
    openDrawer();
    return;
  }

  setBusy(true, "正在合成语音...");
  try {
    const opts = {
      onNotify: toast,
      onKeySync: () => {
        renderKeys();
        updateKeyChip();
      },
      onStyleDisabled: () => setStyleEnabled(false),
    };
    const out =
      provider === "fish"
        ? await fishGenerate(state, raw, (l) => (el.genLabel.textContent = l), opts)
        : await geminiGenerate(state, raw, (l) => (el.genLabel.textContent = l), opts);
    await commitResult(provider, out, raw);
  } catch (err) {
    handleError(err as ApiError, provider);
  } finally {
    setBusy(false);
  }
}

/* ==================================================================
   Explorer & Initialization
   ================================================================== */
const explorer = createFishExplorerController({
  getState: () => state,
  isBookmarked,
  onSelectVoice: (m) => {
    selectFishVoice(m);
    toast("ok", "已选中音色", m.title);
  },
  onToggleBookmark: toggleBookmarkModel,
  onTogglePreview: (m) => toggleFishSamplePreview(m),
  getPlayingPreviewId: () => playingPreviewId,
  onNotify: toast,
});

function initPresetsAndTags(): void {
  el.fishTagRow.innerHTML = "";
  FISH_TAGS.forEach((tag) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tag-pill";
    b.dataset.tag = tag;
    b.textContent = tag;
    el.fishTagRow.appendChild(b);
  });

  el.stylePresets.innerHTML = "";
  STYLE_PRESETS.forEach((t) => {
    const b = document.createElement("button");
    b.className = "preset";
    b.type = "button";
    b.dataset.text = t;
    b.textContent = t;
    b.title = t;
    el.stylePresets.appendChild(b);
  });
}

function bindEvents(): void {
  el.btnTheme.addEventListener("click", () => {
    applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
  });

  el.btnSwitchMobile.addEventListener("click", () => switchDeviceExperience("mobile"));

  window.addEventListener(
    "scroll",
    () => el.topbar.classList.toggle("scrolled", window.scrollY > 4),
    { passive: true },
  );

  el.engineSeg.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-engine]");
    if (b?.dataset.engine) setEngine(b.dataset.engine as ProviderId);
  });

  el.textInput.addEventListener("input", refreshStats);
  el.btnSample.addEventListener("click", () => {
    el.textInput.value = SAMPLE_TEXT;
    refreshStats();
    el.textInput.focus();
    toast("info", "已填入示例", "含中英文混排、数字与标点停顿。");
  });
  el.btnPaste.addEventListener("click", async () => {
    try {
      const txt = await navigator.clipboard.readText();
      if (!txt) {
        toast("warn", "剪贴板为空");
        return;
      }
      el.textInput.value = (el.textInput.value ? `${el.textInput.value}\n` : "") + txt.slice(0, MAX_CHARS);
      refreshStats();
      toast("ok", "已粘贴", `共 ${txt.length} 字符`);
    } catch {
      el.textInput.focus();
      toast("warn", "需要手动粘贴", "请按 Ctrl / ⌘ + V 粘贴文本。");
    }
  });
  el.btnClear.addEventListener("click", () => {
    el.textInput.value = "";
    refreshStats();
    el.textInput.focus();
  });

  el.fishTagRow.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".tag-pill");
    if (!b?.dataset.tag) return;
    const tag = b.dataset.tag;
    const ta = el.textInput;
    const start = ta.selectionStart || 0;
    ta.value = ta.value.slice(0, start) + tag + ta.value.slice(ta.selectionEnd || start);
    const pos = start + tag.length;
    ta.setSelectionRange(pos, pos);
    ta.focus();
    refreshStats();
  });

  el.fishQuickSearchInput.addEventListener("input", () => {
    window.clearTimeout(quickSearchTimer);
    quickSearchTimer = window.setTimeout(
      () => void runQuickSearch(el.fishQuickSearchInput.value),
      350,
    );
  });
  el.btnQuickSearchGo.addEventListener("click", () => {
    explorer.open(el.fishQuickSearchInput.value);
  });

  el.refInput.addEventListener("input", () => {
    state.fishRefId = el.refInput.value.trim();
    if (state.engine === "fish") el.curVoiceLabel.textContent = getFishDisplayTitle(state);
    saveStateToStorage(state);
    renderActiveFishCard();
    renderPresets();
    renderBookList();

    window.clearTimeout(refLookupTimer);
    if (state.fishRefId.length >= 16) {
      refLookupTimer = window.setTimeout(() => {
        void fetchFishModelById(state.fishRefId, {
          apiKey: pickKey(state, "fish")?.value,
          corsPrefix: state.cors,
        }).then((m) => {
          if (m) {
            renderActiveFishCard();
            if (state.engine === "fish") el.curVoiceLabel.textContent = getFishDisplayTitle(state);
          }
        });
      }, 420);
    }
  });

  el.btnSaveBook.addEventListener("click", addBookmarkFromInput);

  el.rngFishSpeed.addEventListener("input", syncFishControls);
  el.rngFishVolume.addEventListener("input", syncFishControls);
  el.rngFishTemp.addEventListener("input", syncFishControls);
  el.rngFishTopP.addEventListener("input", syncFishControls);
  el.rngFishRep.addEventListener("input", syncFishControls);
  el.rngFishChunk.addEventListener("input", syncFishControls);

  el.selFishFormat.addEventListener("change", () => {
    state.fish.format = el.selFishFormat.value as FishFormat;
    syncFishBitrateSelect();
    syncFishControls();
  });
  el.selFishBitrate.addEventListener("change", () => {
    const val = parseInt(el.selFishBitrate.value, 10);
    if (state.fish.format === "opus") state.fish.opusBitrate = val as -1000 | 24 | 32 | 48 | 64;
    else state.fish.mp3Bitrate = val as 64 | 128 | 192;
    syncFishControls();
  });
  el.selFishSampleRate.addEventListener("change", () => {
    state.fish.sampleRate = parseInt(el.selFishSampleRate.value, 10) as 0 | 24000 | 32000 | 44100 | 48000;
    syncFishControls();
  });
  el.selFishLatency.addEventListener("change", () => {
    state.fish.latency = el.selFishLatency.value as FishLatency;
    syncFishControls();
  });
  el.btnFishNorm.addEventListener("click", () => {
    state.fish.normalize = !state.fish.normalize;
    el.btnFishNorm.setAttribute("aria-checked", state.fish.normalize ? "true" : "false");
    el.fishNormLabel.textContent = state.fish.normalize ? "已启用" : "已关闭";
    syncFishControls();
  });

  el.rngRate.addEventListener("input", syncRate);
  el.rngPause.addEventListener("input", syncPause);
  el.rngEmotion.addEventListener("input", syncEmotion);
  el.btnStyleToggle.addEventListener("click", () => setStyleEnabled(!state.useStyle));
  el.styleInput.addEventListener("input", () => {
    state.styleText = el.styleInput.value;
    saveStateToStorage(state);
  });
  el.stylePresets.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".preset");
    if (!b?.dataset.text) return;
    el.styleInput.value = b.dataset.text;
    state.styleText = b.dataset.text;
    if (!state.useStyle) setStyleEnabled(true);
    saveStateToStorage(state);
    el.styleInput.focus();
  });

  el.btnGenerate.addEventListener("click", () => void generate());
  el.btnClearHistory.addEventListener("click", () => {
    state.history.forEach((it) => URL.revokeObjectURL(it.url));
    state.history = [];
    state.current = null;
    el.audio.pause();
    el.audio.removeAttribute("src");
    el.audio.load();
    el.pTitle.textContent = "暂无音频";
    el.pSub.textContent = "输入文本后点击「生成语音」";
    el.btnPlay.disabled = true;
    el.seek.disabled = true;
    el.btnDownload.disabled = true;
    el.btnDlMore.disabled = true;
    el.seek.value = "0";
    el.seek.style.setProperty("--p", "0");
    el.tCur.textContent = "0:00";
    el.tDur.textContent = "0:00";
    renderPlayerWave([], 0);
    renderHistory();
    toast("info", "历史已清空", "内存中的音频已释放。");
  });

  // Player controls
  el.audio.addEventListener("play", () => {
    state.playing = true;
    syncPlayIcon();
  });
  el.audio.addEventListener("pause", () => {
    state.playing = false;
    syncPlayIcon();
  });
  el.audio.addEventListener("ended", () => {
    state.playing = false;
    syncPlayIcon();
    el.seek.value = "0";
    el.seek.style.setProperty("--p", "0");
    el.tCur.textContent = "0:00";
    if (state.current) renderPlayerWave(state.current.peaks, 0);
  });
  el.audio.addEventListener("loadedmetadata", () => {
    if (state.current && Number.isFinite(el.audio.duration) && el.audio.duration > 0) {
      state.current.duration = el.audio.duration;
      el.tDur.textContent = fmtTime(el.audio.duration);
    }
  });
  el.audio.addEventListener("timeupdate", () => {
    const d = el.audio.duration || state.current?.duration || 0;
    if (!d) return;
    const ratio = clamp(el.audio.currentTime / d, 0, 1);
    el.seek.value = String(Math.round(ratio * 1000));
    el.seek.style.setProperty("--p", String(ratio * 100));
    el.tCur.textContent = fmtTime(el.audio.currentTime);
    el.tDur.textContent = fmtTime(d);
    if (state.current) renderPlayerWave(state.current.peaks, ratio);
  });
  el.btnPlay.addEventListener("click", () => {
    if (!state.current) return;
    if (el.audio.paused) {
      stopSamplePreview();
      el.audio.play().catch(() => toast("err", "无法播放", "请再次点击播放。"));
    } else {
      el.audio.pause();
    }
  });
  el.seek.addEventListener("input", () => {
    const d = el.audio.duration || state.current?.duration || 0;
    if (!d) return;
    const ratio = parseInt(el.seek.value, 10) / 1000;
    el.seek.style.setProperty("--p", String(ratio * 100));
    el.audio.currentTime = ratio * d;
    el.tCur.textContent = fmtTime(ratio * d);
    if (state.current) renderPlayerWave(state.current.peaks, ratio);
  });
  el.btnSpeed.addEventListener("click", () => {
    state.playSpeedIdx = (state.playSpeedIdx + 1) % PLAY_SPEEDS.length;
    const s = PLAY_SPEEDS[state.playSpeedIdx];
    el.speedLabel.textContent = `${s.toFixed(1)}×`;
    el.rngRate.value = String(clamp(Math.round(s * 100), 60, 180));
    syncRate();
  });

  // Download menu
  const dlNative = () => {
    const c = state.current;
    if (!c) return;
    downloadBlob(c.blob, `${slug(c.text)}-${stamp(c.time)}.${c.ext}`);
    toast("ok", `已下载 ${c.ext.toUpperCase()}`);
  };
  el.btnDownload.addEventListener("click", (e) => {
    e.stopPropagation();
    dlNative();
  });
  el.btnDlMore.addEventListener("click", (e) => {
    e.stopPropagation();
    el.dlMenu.classList.toggle("open");
  });
  document.addEventListener("click", () => el.dlMenu.classList.remove("open"));
  el.dlMenu.addEventListener("click", (e) => e.stopPropagation());
  el.miNative.addEventListener("click", () => {
    el.dlMenu.classList.remove("open");
    dlNative();
  });
  el.miWav.addEventListener("click", () => {
    el.dlMenu.classList.remove("open");
    const c = state.current;
    if (!c) return;
    if (c.ext !== "wav") {
      toast("warn", `当前为 ${c.ext.toUpperCase()}`, "请使用「下载原始音频」，或在合成高级参数里直接选 WAV/PCM 格式。");
      return;
    }
    dlNative();
  });
  el.miCopyB64.addEventListener("click", async () => {
    el.dlMenu.classList.remove("open");
    const c = state.current;
    if (!c) return;
    try {
      await navigator.clipboard.writeText(c.base64);
      toast("ok", "Base64 已复制", `长度 ${c.base64.length} 字符`);
    } catch {
      toast("err", "复制失败", "浏览器拒绝剪贴板写入。");
    }
  });

  // Drawer
  el.btnKeyPool.addEventListener("click", openDrawer);
  el.btnDrawerClose.addEventListener("click", closeDrawer);
  el.scrim.addEventListener("click", closeDrawer);
  el.hintFishCors.addEventListener("click", () => {
    openDrawer();
    setTimeout(() => el.corsInput.focus(), 120);
  });

  document.querySelectorAll<HTMLButtonElement>(".k-tab").forEach((b) => {
    b.addEventListener("click", () => {
      keyTab = b.dataset.pool as ProviderId;
      document.querySelectorAll<HTMLButtonElement>(".k-tab").forEach((x) => {
        x.setAttribute("aria-selected", x.dataset.pool === keyTab ? "true" : "false");
      });
      renderKeys();
    });
  });

  el.modeSeg.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!b?.dataset.mode) return;
    state.pools[keyTab].mode = b.dataset.mode as "round" | "pinned";
    saveStateToStorage(state);
    renderKeys();
  });

  el.btnAddKeys.addEventListener("click", () => {
    const raw = el.keyInput.value.trim();
    if (!raw) {
      toast("warn", "内容为空", "请每行粘贴一个 API Key。");
      return;
    }
    const { added, dup, bad } = addKeysToPool(state, keyTab, raw);
    el.keyInput.value = "";
    renderKeys();
    updateKeyChip();
    if (added) {
      toast("ok", `已添加 ${added} 个 Key`, dup || bad ? `跳过重复 ${dup} 个，无效 ${bad} 个` : "");
    } else {
      toast("warn", "没有新增", `重复 ${dup} 个，无效 ${bad} 个`);
    }
  });

  el.btnClearPoolKeys.addEventListener("click", () => {
    state.pools[keyTab].keys = [];
    state.pools[keyTab].cursor = 0;
    saveStateToStorage(state);
    renderKeys();
    updateKeyChip();
    toast("info", "已清空当前 Key 池");
  });

  el.btnSaveCors.addEventListener("click", () => {
    state.cors = el.corsInput.value.trim();
    state.corsExplicit = true;
    saveStateToStorage(state);
    el.corsStateText.textContent = state.cors ? `CORS 代理：${state.cors}` : "CORS 代理：未启用（直连）";
    toast(state.cors ? "ok" : "info", state.cors ? "代理已保存" : "已切换为直连", state.cors || "");
  });

  el.btnTestCors.addEventListener("click", async () => {
    const prefix = el.corsInput.value.trim();
    el.proxyTestBadge.textContent = "测试中…";
    const res = await testFishProxyConnectivity(prefix);
    el.proxyTestBadge.textContent = res.ok ? `正常 ${res.latencyMs}ms` : "异常";
    toast(res.ok ? "ok" : "err", res.ok ? "代理连通正常" : "代理连通失败", res.message);
  });

  el.btnUseLocalCors.addEventListener("click", () => {
    el.corsInput.value = getDefaultCorsForEnv() || "http://127.0.0.1:8080/";
  });

  el.btnCopyWorker.addEventListener("click", async () => {
    const snippet = `export default { async fetch(req) { const u = new URL(req.url); if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "*", "Access-Control-Allow-Headers": "*" } }); const target = "https://api.fish.audio" + u.pathname.replace(/^\\/api\\/fish/, "") + u.search; const h = new Headers(req.headers); h.delete("host"); const r = await fetch(target, { method: req.method, headers: h, body: req.method === "GET" ? undefined : req.body }); const out = new Response(r.body, r); out.headers.set("Access-Control-Allow-Origin", "*"); return out; } };`;
    try {
      await navigator.clipboard.writeText(snippet);
      toast("ok", "已复制 Cloudflare Worker 代理代码", "完整网关脚本见仓库 deploy/cloudflare-worker.js");
    } catch {
      toast("info", "请查看仓库内 deploy/cloudflare-worker.js");
    }
  });

  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void generate();
    } else if (e.key === "Escape") {
      if (explorer.isOpen()) explorer.close();
      else if (el.drawer.classList.contains("open")) closeDrawer();
      el.dlMenu.classList.remove("open");
    }
  });

  window.addEventListener("resize", moveSegThumb);
  window.addEventListener("beforeunload", () => {
    state.history.forEach((it) => URL.revokeObjectURL(it.url));
  });
}

async function init(): Promise<void> {
  applyTheme(getInitialTheme());
  loadStateFromStorage(state);
  await tryHydrateLocalServerKeys(state);

  // Hydrate input UI from loaded state
  el.refInput.value = state.fishRefId;
  el.rngRate.value = String(clamp(Math.round(state.rate * 100), 60, 180));
  el.rngPause.value = String(state.pause);
  el.rngEmotion.value = String(state.emotion);
  el.styleInput.value = state.styleText;
  el.rngFishSpeed.value = String(clamp(Math.round(state.fish.speed * 100), 50, 200));
  el.rngFishVolume.value = String(clamp(state.fish.volume, -20, 20));
  el.rngFishTemp.value = String(clamp(Math.round(state.fish.temperature * 100), 0, 100));
  el.rngFishTopP.value = String(clamp(Math.round(state.fish.topP * 100), 0, 100));
  el.rngFishRep.value = String(clamp(Math.round(state.fish.repetitionPenalty * 100), 100, 200));
  el.rngFishChunk.value = String(clamp(state.fish.chunkLength, 100, 300));
  el.selFishFormat.value = state.fish.format;
  el.selFishSampleRate.value = String(state.fish.sampleRate);
  el.selFishLatency.value = state.fish.latency;
  el.btnFishNorm.setAttribute("aria-checked", state.fish.normalize ? "true" : "false");
  el.fishNormLabel.textContent = state.fish.normalize ? "已启用" : "已关闭";
  el.corsInput.value = state.cors;

  buildGeminiVoices();
  initPresetsAndTags();
  syncFishModelPills();
  syncFishBitrateSelect();
  bindEvents();

  syncRate();
  syncPause();
  syncEmotion();
  syncFishControls();
  setStyleEnabled(state.useStyle);
  setEngine(state.engine);
  renderActiveFishCard();
  renderPresets();
  renderBookList();
  renderHistory();
  renderKeys();
  updateKeyChip();
  renderPlayerWave([], 0);
  syncPlayIcon();

  requestAnimationFrame(moveSegThumb);
  setTimeout(moveSegThumb, 120);

  // 自动拉取预设、收藏及当前已选 ID 的真实 Fish Audio 元数据并缓存
  const idsToHydrate = [
    state.fishRefId,
    ...FISH_PRESET_VOICES.map((p) => p.id),
    ...state.books.map((b) => b.id),
  ].filter(Boolean);
  void hydrateFishModelIds(
    idsToHydrate,
    { apiKey: pickKey(state, "fish")?.value, corsPrefix: state.cors },
    (resolved) => {
      syncBookmarkMeta(resolved);
      renderActiveFishCard();
      renderPresets();
      renderBookList();
      if (state.engine === "fish") {
        el.curVoiceLabel.textContent = getFishDisplayTitle(state);
      }
    },
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void init());
} else {
  void init();
}
