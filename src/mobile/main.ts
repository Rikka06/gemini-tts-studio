import {
  clamp,
  downloadBlob,
  estimateDuration,
  fmtClock,
  fmtCompactCount,
  fmtTime,
  slug,
  splitText,
  stamp,
} from "../shared/audio";
import {
  FISH_CHUNK,
  FISH_LANGUAGE_FILTERS,
  FISH_MODEL_OPTIONS,
  FISH_PRESET_VOICES,
  FISH_SORT_OPTIONS,
  FISH_TAG_FILTERS,
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
import { geminiGenerate, type ApiError, type GeneratedAudioResult } from "../shared/geminiApi";
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
import "./styles.css";

type TabId = "studio" | "voices" | "library";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const state = createInitialState();
let activeTab: TabId = "studio";
let activeKeyTab: ProviderId = "gemini";
let playingPreviewId = "";

// Voices tab query state
let voiceKeyword = "";
let fishLang = "";
let fishTag = "";
let fishSort: "score" | "task_count" | "created_at" = "score";
let fishSelfOnly = false;
let fishPage = 1;
let fishHasMore = false;
let fishLoading = false;
let fishItems: FishVoiceModel[] = [];
let geminiGenderFilter: "all" | "female" | "male" | "neutral" = "all";
let voiceSearchTimer: number | undefined;

const el = {
  mShell: $("mShell"),
  mHeaderTitle: $("mHeaderTitle"),
  mHeaderSub: $("mHeaderSub"),
  mEngineSeg: $("mEngineSeg"),
  mBtnKeyJump: $("mBtnKeyJump"),
  mKeyDot: $("mKeyDot"),
  mBtnTheme: $("mBtnTheme"),
  mThemeIcon: $("mThemeIcon"),

  pageStudio: $("pageStudio"),
  pageVoices: $("pageVoices"),
  pageLibrary: $("pageLibrary"),

  mTextInput: $<HTMLTextAreaElement>("mTextInput"),
  mChunkBadge: $("mChunkBadge"),
  mCharStat: $("mCharStat"),
  mBtnSample: $("mBtnSample"),
  mBtnPaste: $("mBtnPaste"),
  mBtnClear: $("mBtnClear"),
  mFishTagRow: $("mFishTagRow"),
  mBtnVoiceCapsule: $("mBtnVoiceCapsule"),
  mCapsuleAvatar: $("mCapsuleAvatar"),
  mCapsuleName: $("mCapsuleName"),
  mBtnParams: $("mBtnParams"),
  mBtnGenerate: $<HTMLButtonElement>("mBtnGenerate"),
  mGenIcon: $("mGenIcon"),
  mGenLabel: $("mGenLabel"),

  mVoiceSearch: $<HTMLInputElement>("mVoiceSearch"),
  mVoiceSearchClear: $("mVoiceSearchClear"),
  mFilterRow1: $("mFilterRow1"),
  mFilterRow2: $("mFilterRow2"),
  mVoiceList: $("mVoiceList"),
  mBtnLoadMore: $<HTMLButtonElement>("mBtnLoadMore"),

  mHistoryList: $("mHistoryList"),
  mBtnClearHistory: $("mBtnClearHistory"),
  mFavCount: $("mFavCount"),
  mFavList: $("mFavList"),
  mKeyPoolTabs: $("mKeyPoolTabs"),
  mKeyModeSeg: $("mKeyModeSeg"),
  mKeyList: $("mKeyList"),
  mKeyInput: $<HTMLTextAreaElement>("mKeyInput"),
  mBtnAddKeys: $("mBtnAddKeys"),
  mBtnClearPoolKeys: $("mBtnClearPoolKeys"),
  mCorsInput: $<HTMLInputElement>("mCorsInput"),
  mBtnSaveCors: $("mBtnSaveCors"),
  mBtnTestCors: $("mBtnTestCors"),
  mBtnDefaultCors: $("mBtnDefaultCors"),
  mBtnSwitchDesktop: $("mBtnSwitchDesktop"),

  mMiniPlayer: $("mMiniPlayer"),
  mMiniProgress: $("mMiniProgress"),
  mMiniOpenArea: $("mMiniOpenArea"),
  mMiniArt: $("mMiniArt"),
  mMiniTitle: $("mMiniTitle"),
  mMiniSub: $("mMiniSub"),
  mMiniPlayBtn: $("mMiniPlayBtn"),

  mSheetScrim: $("mSheetScrim"),
  sheetVoiceDetail: $("sheetVoiceDetail"),
  sheetVoiceDetailBody: $("sheetVoiceDetailBody"),
  sheetVoiceDetailFooter: $("sheetVoiceDetailFooter"),
  sheetParams: $("sheetParams"),
  sheetParamsTitle: $("sheetParamsTitle"),
  sheetParamsBody: $("sheetParamsBody"),
  sheetQuickVoice: $("sheetQuickVoice"),
  sheetQuickVoiceBody: $("sheetQuickVoiceBody"),
  sheetFullPlayer: $("sheetFullPlayer"),
  sheetFullPlayerBody: $("sheetFullPlayerBody"),

  mToasts: $("mToasts"),
  audio: $<HTMLAudioElement>("mAudioEl"),
  previewAudio: $<HTMLAudioElement>("mPreviewAudioEl"),
};

function toast(kind: "ok" | "err" | "warn" | "info", title: string, desc = "", ttl = 3200): void {
  const node = document.createElement("div");
  node.className = `m-toast ${kind}`;
  node.innerHTML = `<div class="m-toast-title"></div>${desc ? '<div class="m-toast-desc"></div>' : ""}`;
  node.querySelector(".m-toast-title")!.textContent = title;
  if (desc) node.querySelector(".m-toast-desc")!.textContent = desc;
  el.mToasts.appendChild(node);
  setTimeout(() => node.remove(), kind === "err" ? 5600 : ttl);
  while (el.mToasts.children.length > 3) el.mToasts.firstChild?.remove();
}

function applyTheme(mode: ThemeMode): void {
  setDocumentTheme(mode);
  el.mThemeIcon.innerHTML = mode === "dark" ? ICONS.moon : ICONS.sun;
}

/* ==================================================================
   L2 Bottom Sheet Engine + Swipe-to-Dismiss
   ================================================================== */
const allSheets = [
  el.sheetVoiceDetail,
  el.sheetParams,
  el.sheetQuickVoice,
  el.sheetFullPlayer,
];

function closeAllSheets(): void {
  allSheets.forEach((s) => {
    s.classList.remove("open");
    s.style.transform = "";
    s.setAttribute("aria-hidden", "true");
  });
  el.mSheetScrim.classList.remove("open");
}

function openSheet(sheet: HTMLElement): void {
  allSheets.forEach((s) => {
    if (s !== sheet) {
      s.classList.remove("open");
      s.setAttribute("aria-hidden", "true");
    }
  });
  sheet.style.transform = "";
  sheet.classList.add("open");
  sheet.setAttribute("aria-hidden", "false");
  el.mSheetScrim.classList.add("open");
}

function bindSheetGestures(): void {
  el.mSheetScrim.addEventListener("click", closeAllSheets);
  document.querySelectorAll<HTMLElement>("[data-close-sheet]").forEach((btn) => {
    if (!btn.classList.contains("m-sheet-handle") && !btn.innerHTML.trim()) {
      btn.innerHTML = ICONS.close;
    }
    if (!btn.classList.contains("m-sheet-handle")) {
      btn.addEventListener("click", closeAllSheets);
    }
  });

  allSheets.forEach((sheet) => {
    const handle = sheet.querySelector<HTMLElement>(".m-sheet-handle");
    if (!handle) return;
    let startY = 0;
    let deltaY = 0;
    let dragging = false;

    handle.addEventListener(
      "touchstart",
      (e) => {
        if (!sheet.classList.contains("open")) return;
        startY = e.touches[0].clientY;
        deltaY = 0;
        dragging = true;
        sheet.classList.add("dragging");
      },
      { passive: true },
    );
    handle.addEventListener(
      "touchmove",
      (e) => {
        if (!dragging) return;
        deltaY = Math.max(0, e.touches[0].clientY - startY);
        sheet.style.transform = `translate(-50%, ${deltaY}px)`;
      },
      { passive: true },
    );
    handle.addEventListener("touchend", () => {
      if (!dragging) return;
      dragging = false;
      sheet.classList.remove("dragging");
      if (deltaY > 95) {
        closeAllSheets();
      } else {
        sheet.style.transform = "";
      }
    });
  });
}

/* ==================================================================
   L1 Navigation & Header State
   ================================================================== */
function switchTab(tab: TabId): void {
  activeTab = tab;
  el.pageStudio.hidden = tab !== "studio";
  el.pageVoices.hidden = tab !== "voices";
  el.pageLibrary.hidden = tab !== "library";
  document.querySelectorAll<HTMLButtonElement>(".m-tab").forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });

  const titles: Record<TabId, string> = {
    studio: "合成工作台",
    voices: state.engine === "fish" ? "Fish 音色库" : "Gemini 音色库",
    library: "记录与设置",
  };
  el.mHeaderTitle.textContent = titles[tab];

  if (tab === "voices") {
    renderVoiceFilters();
    if (state.engine === "fish" && fishItems.length === 0) {
      void fetchMobileFishVoices(true);
    } else if (state.engine === "gemini") {
      renderGeminiMobileVoices();
    }
  } else if (tab === "library") {
    renderLibraryTab();
  }
}

function updateHeaderAndStudio(): void {
  document.documentElement.setAttribute("data-engine", state.engine);
  el.mEngineSeg.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
    b.setAttribute("aria-selected", b.dataset.engine === state.engine ? "true" : "false");
  });
  el.mHeaderSub.textContent =
    state.engine === "fish" ? `Fish Audio · ${state.fish.model}` : state.activeModel;
  el.mFishTagRow.hidden = state.engine !== "fish";
  el.mKeyDot.classList.toggle("zero", getPoolAvailableCount(state, state.engine) === 0);

  if (activeTab === "voices") {
    el.mHeaderTitle.textContent = state.engine === "fish" ? "Fish 音色库" : "Gemini 音色库";
  }

  // Update Studio Voice Capsule
  if (state.engine === "fish") {
    const id = state.fishRefId.trim();
    const cached = id ? getCachedFishModel(id) : null;
    const title = getFishDisplayTitle(state);
    el.mCapsuleName.textContent = title;
    el.mCapsuleAvatar.innerHTML = "";
    if (cached?.coverUrl) {
      const img = document.createElement("img");
      img.src = cached.coverUrl;
      img.alt = title;
      img.onerror = () => {
        img.remove();
        el.mCapsuleAvatar.textContent = title.slice(0, 1).toUpperCase();
      };
      el.mCapsuleAvatar.appendChild(img);
    } else {
      el.mCapsuleAvatar.textContent = id ? title.slice(0, 1).toUpperCase() : "F";
    }
  } else {
    const v = VOICES.find((x) => x.id === state.geminiVoice);
    el.mCapsuleAvatar.innerHTML = "";
    el.mCapsuleAvatar.textContent = state.geminiVoice.slice(0, 1).toUpperCase();
    el.mCapsuleName.textContent = v ? `${v.id} · ${v.tag}` : state.geminiVoice;
  }

  refreshStudioStats();
}

function refreshStudioStats(): void {
  const raw = el.mTextInput.value;
  const limit = state.engine === "fish" ? FISH_CHUNK : GEMINI_CHUNK;
  const chunks = splitText(raw, limit);
  state.chunkCount = Math.max(1, chunks.length);
  el.mChunkBadge.textContent = chunks.length > 1 ? `自动分 ${chunks.length} 段` : "单段直出";
  el.mCharStat.textContent = `${raw.length} / ${MAX_CHARS} · ${Math.round(estimateDuration(raw))}s`;
}

/* ==================================================================
   Sample Preview (Mutually Exclusive)
   ================================================================== */
function stopSamplePreview(): void {
  if (!el.previewAudio.paused) el.previewAudio.pause();
  el.previewAudio.removeAttribute("src");
  playingPreviewId = "";
  refreshPlayingStatesInUI();
}

function toggleFishPreview(model: FishVoiceModel): void {
  const url = model.samples[0]?.audio || "";
  if (!url) {
    toast("warn", "暂无官方试听样音", "可直接设为当前音色后合成体验。");
    return;
  }
  if (playingPreviewId === model.id) {
    stopSamplePreview();
    return;
  }
  if (!el.audio.paused) el.audio.pause();
  playingPreviewId = model.id;
  el.previewAudio.src = url;
  el.previewAudio.playbackRate = state.rate;
  el.previewAudio.play().catch(() => {
    playingPreviewId = "";
    refreshPlayingStatesInUI();
    toast("err", "试听播放失败");
  });
  refreshPlayingStatesInUI();
}

el.previewAudio.addEventListener("ended", stopSamplePreview);
el.previewAudio.addEventListener("error", () => {
  if (playingPreviewId) stopSamplePreview();
});

function refreshPlayingStatesInUI(): void {
  if (activeTab === "voices" && state.engine === "fish") renderFishMobileCards();
  if (el.sheetVoiceDetail.classList.contains("open")) {
    const id = el.sheetVoiceDetail.dataset.voiceId || "";
    const m = getCachedFishModel(id) || fishItems.find((x) => x.id === id);
    if (m) renderVoiceDetailSheet(m);
  }
}

/* ==================================================================
   L1 Voices Tab (Fish Discovery & Gemini Grid)
   ================================================================== */
function renderVoiceFilters(): void {
  el.mFilterRow1.innerHTML = "";
  el.mFilterRow2.innerHTML = "";

  if (state.engine === "gemini") {
    el.mVoiceSearch.placeholder = "搜索 Gemini 音色名或风格描述…";
    const genders: Array<{ id: typeof geminiGenderFilter; label: string }> = [
      { id: "all", label: "全部 (30)" },
      { id: "female", label: "女声" },
      { id: "male", label: "男声" },
      { id: "neutral", label: "中性" },
    ];
    genders.forEach((g) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `m-fchip${geminiGenderFilter === g.id ? " active" : ""}`;
      b.textContent = g.label;
      b.addEventListener("click", () => {
        geminiGenderFilter = g.id;
        renderVoiceFilters();
        renderGeminiMobileVoices();
      });
      el.mFilterRow1.appendChild(b);
    });
    return;
  }

  el.mVoiceSearch.placeholder = "搜索 Fish 音色名称、角色、风格或 ID…";
  FISH_LANGUAGE_FILTERS.forEach((f) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `m-fchip${fishLang === f.id ? " active" : ""}`;
    b.textContent = f.label;
    b.addEventListener("click", () => {
      fishLang = f.id;
      renderVoiceFilters();
      void fetchMobileFishVoices(true);
    });
    el.mFilterRow1.appendChild(b);
  });

  FISH_SORT_OPTIONS.forEach((s) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `m-fchip${!fishSelfOnly && fishSort === s.id ? " active" : ""}`;
    b.textContent = s.label;
    b.addEventListener("click", () => {
      fishSelfOnly = false;
      fishSort = s.id;
      renderVoiceFilters();
      void fetchMobileFishVoices(true);
    });
    el.mFilterRow2.appendChild(b);
  });

  const selfBtn = document.createElement("button");
  selfBtn.type = "button";
  selfBtn.className = `m-fchip${fishSelfOnly ? " active" : ""}`;
  selfBtn.textContent = "我的音色";
  selfBtn.addEventListener("click", () => {
    if (!fishSelfOnly && !pickKey(state, "fish")) {
      toast("warn", "需要 Fish Key", "请先在「记录与设置」中添加 Fish Audio API Key。");
      return;
    }
    fishSelfOnly = !fishSelfOnly;
    renderVoiceFilters();
    void fetchMobileFishVoices(true);
  });
  el.mFilterRow2.appendChild(selfBtn);

  FISH_TAG_FILTERS.filter((t) => t.id).forEach((t) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `m-fchip${fishTag === t.id ? " active" : ""}`;
    b.textContent = t.label;
    b.addEventListener("click", () => {
      fishTag = fishTag === t.id ? "" : t.id;
      renderVoiceFilters();
      void fetchMobileFishVoices(true);
    });
    el.mFilterRow2.appendChild(b);
  });
}

function renderGeminiMobileVoices(): void {
  el.mBtnLoadMore.hidden = true;
  el.mVoiceList.innerHTML = "";
  const kw = voiceKeyword.toLowerCase();
  const filtered = VOICES.filter((v) => {
    if (geminiGenderFilter !== "all" && v.gender !== geminiGenderFilter) return false;
    if (!kw) return true;
    return `${v.id} ${v.tag} ${v.desc}`.toLowerCase().includes(kw);
  });

  if (!filtered.length) {
    el.mVoiceList.innerHTML = '<div class="m-empty-box">没有匹配的 Gemini 音色</div>';
    return;
  }

  filtered.forEach((v) => {
    const selected = state.geminiVoice === v.id;
    const card = document.createElement("div");
    card.className = `m-vcard${selected ? " selected" : ""}`;
    card.innerHTML =
      `<div class="m-vc-cover">${v.id.slice(0, 1)}</div>` +
      `<div class="m-vc-body">` +
        `<div class="m-vc-title">${v.id} · ${v.tag}</div>` +
        `<div class="m-vc-sub">${v.desc}</div>` +
      `</div>`;
    card.addEventListener("click", () => {
      state.geminiVoice = v.id;
      saveStateToStorage(state);
      updateHeaderAndStudio();
      renderGeminiMobileVoices();
      toast("ok", "已选中 Gemini 音色", `${v.id} (${v.tag})`);
    });
    el.mVoiceList.appendChild(card);
  });
}

function renderFishMobileCards(): void {
  el.mVoiceList.innerHTML = "";
  if (!fishItems.length && !fishLoading) {
    el.mVoiceList.innerHTML = '<div class="m-empty-box">未找到匹配的 Fish 音色，换个关键词或筛选条件试试</div>';
    return;
  }
  const curId = state.fishRefId.trim();
  const frag = document.createDocumentFragment();

  fishItems.forEach((m) => {
    const selected = curId === m.id;
    const isPlaying = playingPreviewId === m.id;
    const card = document.createElement("div");
    card.className = `m-vcard${selected ? " selected" : ""}`;

    const cov = document.createElement("div");
    cov.className = "m-vc-cover";
    if (m.coverUrl) {
      const img = document.createElement("img");
      img.src = m.coverUrl;
      img.alt = m.title;
      img.loading = "lazy";
      img.onerror = () => {
        img.remove();
        cov.textContent = m.title.slice(0, 1).toUpperCase();
      };
      cov.appendChild(img);
    } else cov.textContent = m.title.slice(0, 1).toUpperCase();

    const body = document.createElement("div");
    body.className = "m-vc-body";
    const t = document.createElement("div");
    t.className = "m-vc-title";
    t.textContent = m.title;
    const sub = document.createElement("div");
    sub.className = "m-vc-sub";
    sub.textContent = `${m.authorName} · ${fmtCompactCount(m.taskCount)} 次使用`;
    const tags = document.createElement("div");
    tags.className = "m-vc-tags";
    if (m.languages[0]) {
      const lt = document.createElement("span");
      lt.className = "m-vc-tag lang";
      lt.textContent = formatFishLanguage(m.languages[0]);
      tags.appendChild(lt);
    }
    m.tags.slice(0, 2).forEach((tg) => {
      const s = document.createElement("span");
      s.className = "m-vc-tag";
      s.textContent = tg;
      tags.appendChild(s);
    });
    body.append(t, sub, tags);

    const playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.className = `m-vc-play${isPlaying ? " playing" : ""}`;
    playBtn.setAttribute("aria-label", isPlaying ? "停止试听" : "试听音色");
    playBtn.innerHTML = isPlaying ? ICONS.pause : ICONS.play;
    playBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFishPreview(m);
    });

    card.addEventListener("click", () => {
      renderVoiceDetailSheet(m);
      openSheet(el.sheetVoiceDetail);
    });

    card.append(cov, body, playBtn);
    frag.appendChild(card);
  });

  el.mVoiceList.appendChild(frag);
}

async function fetchMobileFishVoices(reset: boolean): Promise<void> {
  if (fishLoading) return;
  if (reset) {
    fishPage = 1;
    fishItems = [];
    el.mVoiceList.innerHTML = '<div class="m-skeleton"></div><div class="m-skeleton"></div><div class="m-skeleton"></div><div class="m-skeleton"></div>';
  }
  fishLoading = true;
  el.mBtnLoadMore.hidden = true;

  try {
    // 如果用户直接输入 32 位 ID 搜索，精准拉取单个模型详情
    if (/^[0-9a-f]{24,40}$/i.test(voiceKeyword.trim())) {
      const single = await fetchFishModelById(voiceKeyword.trim(), {
        apiKey: pickKey(state, "fish")?.value,
        corsPrefix: state.cors,
      });
      fishItems = single ? [single] : [];
      fishHasMore = false;
    } else {
      const res = await searchFishModels(
        {
          title: voiceKeyword,
          language: fishLang,
          tag: fishTag,
          sortBy: fishSort,
          self: fishSelfOnly,
          pageNumber: fishPage,
          pageSize: 18,
        },
        { apiKey: pickKey(state, "fish")?.value, corsPrefix: state.cors },
      );
      if (reset) fishItems = res.items;
      else {
        const seen = new Set(fishItems.map((x) => x.id));
        res.items.forEach((x) => {
          if (!seen.has(x.id)) fishItems.push(x);
        });
      }
      fishHasMore = res.hasMore;
      fishPage++;
    }
  } catch (err) {
    toast("err", "加载音色失败", err instanceof Error ? err.message : String(err));
  } finally {
    fishLoading = false;
    if (state.engine === "fish") {
      renderFishMobileCards();
      el.mBtnLoadMore.hidden = !fishHasMore;
    }
  }
}

/* ==================================================================
   L2 Bottom Sheets: Voice Detail / Quick Voice / Pro Params / Full Player
   ================================================================== */
function isBookmarked(id: string): boolean {
  return state.books.some((b) => b.id === id);
}

function toggleBookmark(m: FishVoiceModel): void {
  const idx = state.books.findIndex((b) => b.id === m.id);
  if (idx >= 0) {
    state.books.splice(idx, 1);
    toast("info", "已取消收藏", m.title);
  } else {
    state.books.unshift({
      id: m.id,
      title: m.title,
      authorName: m.authorName,
      coverUrl: m.coverUrl,
      languages: m.languages,
      tags: m.tags,
      sampleAudio: m.samples[0]?.audio,
      description: m.description,
      addedAt: Date.now(),
    });
    toast("ok", "已收藏音色", m.title);
  }
  saveStateToStorage(state);
}

function selectFishModel(m: FishVoiceModel): void {
  state.fishRefId = m.id;
  if (state.engine !== "fish") state.engine = "fish";
  saveStateToStorage(state);
  updateHeaderAndStudio();
  if (activeTab === "voices") renderFishMobileCards();
}

function renderVoiceDetailSheet(m: FishVoiceModel): void {
  el.sheetVoiceDetail.dataset.voiceId = m.id;
  const liked = isBookmarked(m.id);
  const isPlaying = playingPreviewId === m.id;
  const sample = m.samples[0];

  el.sheetVoiceDetailBody.innerHTML = "";
  const hero = document.createElement("div");
  hero.className = "msd-hero";
  const cov = document.createElement("div");
  cov.className = "msd-cover";
  if (m.coverUrl) {
    const img = document.createElement("img");
    img.src = m.coverUrl;
    img.alt = m.title;
    img.onerror = () => {
      img.remove();
      cov.textContent = m.title.slice(0, 1).toUpperCase();
    };
    cov.appendChild(img);
  } else cov.textContent = m.title.slice(0, 1).toUpperCase();

  const hInfo = document.createElement("div");
  hInfo.style.minWidth = "0";
  const t = document.createElement("div");
  t.className = "msd-title";
  t.textContent = m.title;
  const au = document.createElement("div");
  au.className = "msd-author";
  au.textContent = `作者 ${m.authorName} · 使用 ${fmtCompactCount(m.taskCount)}`;
  hInfo.append(t, au);
  hero.append(cov, hInfo);

  const tags = document.createElement("div");
  tags.className = "m-vc-tags";
  m.languages.forEach((l) => {
    const s = document.createElement("span");
    s.className = "m-vc-tag lang";
    s.textContent = formatFishLanguage(l);
    tags.appendChild(s);
  });
  m.tags.slice(0, 8).forEach((tg) => {
    const s = document.createElement("span");
    s.className = "m-vc-tag";
    s.textContent = tg;
    tags.appendChild(s);
  });

  const desc = document.createElement("p");
  desc.className = "msd-desc";
  desc.textContent = m.description || "暂无简介描述";

  el.sheetVoiceDetailBody.append(hero, tags, desc);

  if (sample?.audio) {
    const sBox = document.createElement("div");
    sBox.className = "msd-sample-box";
    const pBtn = document.createElement("button");
    pBtn.type = "button";
    pBtn.className = `m-vc-play${isPlaying ? " playing" : ""}`;
    pBtn.innerHTML = isPlaying ? ICONS.pause : ICONS.play;
    pBtn.addEventListener("click", () => toggleFishPreview(m));
    const sText = document.createElement("div");
    sText.style.minWidth = "0";
    sText.innerHTML = `<div style="font-size:13px;font-weight:660">${isPlaying ? "正在试听样音…" : "点击试听官方样音"}</div><div style="font-size:12px;color:var(--m-text-2);margin-top:2px"></div>`;
    sText.lastElementChild!.textContent = sample.text ? sample.text.slice(0, 80) : "官方试听音频";
    sBox.append(pBtn, sText);
    el.sheetVoiceDetailBody.appendChild(sBox);
  }

  el.sheetVoiceDetailFooter.innerHTML = "";
  const row = document.createElement("div");
  row.className = "msd-cta-row";

  const favBtn = document.createElement("button");
  favBtn.type = "button";
  favBtn.className = "m-tonal-btn";
  favBtn.innerHTML = `${liked ? ICONS.heartFilled : ICONS.heart}<span>${liked ? "已收藏" : "收藏"}</span>`;
  if (liked) favBtn.style.color = "var(--m-red)";
  favBtn.addEventListener("click", () => {
    toggleBookmark(m);
    renderVoiceDetailSheet(m);
  });

  const useBtn = document.createElement("button");
  useBtn.type = "button";
  useBtn.className = "m-tonal-btn primary";
  useBtn.textContent = "设为当前音色";
  useBtn.addEventListener("click", () => {
    selectFishModel(m);
    closeAllSheets();
    switchTab("studio");
    toast("ok", "已设为当前音色", m.title);
  });

  row.append(favBtn, useBtn);
  el.sheetVoiceDetailFooter.appendChild(row);
}

function openQuickVoiceSheet(): void {
  el.sheetQuickVoiceBody.innerHTML = "";

  if (state.engine === "fish") {
    const defRow = document.createElement("div");
    defRow.className = `m-vcard${!state.fishRefId.trim() ? " selected" : ""}`;
    defRow.style.marginBottom = "10px";
    defRow.innerHTML = `<div class="m-vc-cover">S2</div><div class="m-vc-body"><div class="m-vc-title">默认音色 (${state.fish.model})</div><div class="m-vc-sub">不指定 reference_id</div></div>`;
    defRow.addEventListener("click", () => {
      state.fishRefId = "";
      saveStateToStorage(state);
      updateHeaderAndStudio();
      closeAllSheets();
    });
    el.sheetQuickVoiceBody.appendChild(defRow);

    const list: FishVoiceModel[] = [];
    state.books.forEach((b) => {
      const c = getCachedFishModel(b.id);
      list.push(
        c || {
          id: b.id,
          title: b.customName || b.title,
          description: b.description || "",
          coverUrl: b.coverUrl || "",
          authorId: "",
          authorName: b.authorName || "已收藏",
          authorAvatar: "",
          languages: b.languages || [],
          tags: b.tags || [],
          samples: b.sampleAudio ? [{ title: "样音", text: "", taskId: "", audio: b.sampleAudio }] : [],
          likeCount: 0,
          markCount: 0,
          taskCount: 0,
          fetchedAt: 0,
        },
      );
    });
    FISH_PRESET_VOICES.forEach((p) => {
      if (!list.some((x) => x.id === p.id)) list.push(getCachedFishModel(p.id) || p);
    });

    list.forEach((m) => {
      const card = document.createElement("div");
      card.className = `m-vcard${state.fishRefId.trim() === m.id ? " selected" : ""}`;
      card.style.marginBottom = "8px";
      card.innerHTML = `<div class="m-vc-cover">${m.coverUrl ? `<img src="${m.coverUrl}" alt="">` : m.title.slice(0, 1)}</div><div class="m-vc-body"><div class="m-vc-title"></div><div class="m-vc-sub"></div></div>`;
      card.querySelector(".m-vc-title")!.textContent = m.title;
      card.querySelector(".m-vc-sub")!.textContent = `${m.languages.map(formatFishLanguage).join("/") || "多语"} · ${m.authorName}`;
      card.addEventListener("click", () => {
        selectFishModel(m);
        closeAllSheets();
        toast("ok", "已切换音色", m.title);
      });
      el.sheetQuickVoiceBody.appendChild(card);
    });
  } else {
    VOICES.slice(0, 12).forEach((v) => {
      const card = document.createElement("div");
      card.className = `m-vcard${state.geminiVoice === v.id ? " selected" : ""}`;
      card.style.marginBottom = "8px";
      card.innerHTML = `<div class="m-vc-cover">${v.id.slice(0, 1)}</div><div class="m-vc-body"><div class="m-vc-title">${v.id} · ${v.tag}</div><div class="m-vc-sub">${v.desc}</div></div>`;
      card.addEventListener("click", () => {
        state.geminiVoice = v.id;
        saveStateToStorage(state);
        updateHeaderAndStudio();
        closeAllSheets();
      });
      el.sheetQuickVoiceBody.appendChild(card);
    });
  }

  const goBtn = document.createElement("button");
  goBtn.type = "button";
  goBtn.className = "m-tonal-btn primary";
  goBtn.style.width = "100%";
  goBtn.style.marginTop = "10px";
  goBtn.textContent = "前往完整音色库搜索全部 →";
  goBtn.addEventListener("click", () => {
    closeAllSheets();
    switchTab("voices");
  });
  el.sheetQuickVoiceBody.appendChild(goBtn);
  openSheet(el.sheetQuickVoice);
}

function openParamsSheet(): void {
  el.sheetParamsTitle.textContent = state.engine === "fish" ? "Fish Audio 专业参数" : "Gemini 合成参数";
  el.sheetParamsBody.innerHTML = "";

  const mkRange = (label: string, min: number, max: number, step: number, val: number, fmt: (v: number) => string, onInput: (v: number) => void) => {
    const wrap = document.createElement("div");
    wrap.className = "m-param-group";
    wrap.innerHTML = `<div class="m-param-head"><span>${label}</span><span class="m-param-val">${fmt(val)}</span></div><input type="range" min="${min}" max="${max}" step="${step}" value="${val}">`;
    const rng = wrap.querySelector("input")!;
    const badge = wrap.querySelector(".m-param-val")!;
    rng.addEventListener("input", () => {
      const n = parseFloat(rng.value);
      badge.textContent = fmt(n);
      onInput(n);
      saveStateToStorage(state);
    });
    el.sheetParamsBody.appendChild(wrap);
  };

  mkRange("播放倍速", 60, 180, 5, Math.round(state.rate * 100), (v) => `${(v / 100).toFixed(2)}×`, (v) => {
    state.rate = v / 100;
    el.audio.playbackRate = state.rate;
  });

  if (state.engine === "fish") {
    const modelWrap = document.createElement("div");
    modelWrap.className = "m-param-group";
    modelWrap.innerHTML = `<div class="m-param-head"><span>模型引擎 model</span></div><div class="m-chip-scroll"></div>`;
    const row = modelWrap.querySelector(".m-chip-scroll")!;
    FISH_MODEL_OPTIONS.forEach((opt) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `m-fchip${state.fish.model === opt.id ? " active" : ""}`;
      b.textContent = `${opt.name} (${opt.badge})`;
      b.addEventListener("click", () => {
        state.fish.model = opt.id;
        saveStateToStorage(state);
        updateHeaderAndStudio();
        openParamsSheet();
      });
      row.appendChild(b);
    });
    el.sheetParamsBody.appendChild(modelWrap);

    mkRange("合成语速 prosody.speed", 50, 200, 5, Math.round(state.fish.speed * 100), (v) => `${(v / 100).toFixed(2)}×`, (v) => (state.fish.speed = v / 100));
    mkRange("音量增益 prosody.volume", -20, 20, 1, state.fish.volume, (v) => `${v > 0 ? "+" : ""}${v} dB`, (v) => (state.fish.volume = v));

    const fmtGrid = document.createElement("div");
    fmtGrid.className = "m-grid-2";
    fmtGrid.innerHTML =
      `<div><div class="m-param-head"><span>输出格式</span></div><select id="mpFmt"><option value="mp3">MP3</option><option value="wav">WAV</option><option value="opus">Opus</option><option value="pcm">PCM→WAV</option></select></div>` +
      `<div><div class="m-param-head"><span>采样率</span></div><select id="mpSr"><option value="0">自动</option><option value="24000">24kHz</option><option value="32000">32kHz</option><option value="44100">44.1kHz</option><option value="48000">48kHz</option></select></div>`;
    el.sheetParamsBody.appendChild(fmtGrid);
    const selFmt = fmtGrid.querySelector<HTMLSelectElement>("#mpFmt")!;
    const selSr = fmtGrid.querySelector<HTMLSelectElement>("#mpSr")!;
    selFmt.value = state.fish.format;
    selSr.value = String(state.fish.sampleRate);
    selFmt.addEventListener("change", () => {
      state.fish.format = selFmt.value as FishFormat;
      saveStateToStorage(state);
    });
    selSr.addEventListener("change", () => {
      state.fish.sampleRate = parseInt(selSr.value, 10) as 0 | 24000 | 32000 | 44100 | 48000;
      saveStateToStorage(state);
    });

    const latGrid = document.createElement("div");
    latGrid.className = "m-grid-2";
    latGrid.innerHTML =
      `<div><div class="m-param-head"><span>延迟模式</span></div><select id="mpLat"><option value="balanced">balanced</option><option value="normal">normal</option></select></div>` +
      `<div><div class="m-param-head"><span>正则化</span></div><select id="mpNorm"><option value="1">开启</option><option value="0">关闭</option></select></div>`;
    el.sheetParamsBody.appendChild(latGrid);
    const selLat = latGrid.querySelector<HTMLSelectElement>("#mpLat")!;
    const selNorm = latGrid.querySelector<HTMLSelectElement>("#mpNorm")!;
    selLat.value = state.fish.latency;
    selNorm.value = state.fish.normalize ? "1" : "0";
    selLat.addEventListener("change", () => {
      state.fish.latency = selLat.value as FishLatency;
      saveStateToStorage(state);
    });
    selNorm.addEventListener("change", () => {
      state.fish.normalize = selNorm.value === "1";
      saveStateToStorage(state);
    });

    mkRange("随机度 Temperature", 0, 100, 5, Math.round(state.fish.temperature * 100), (v) => (v / 100).toFixed(2), (v) => (state.fish.temperature = v / 100));
    mkRange("核采样 Top-P", 0, 100, 5, Math.round(state.fish.topP * 100), (v) => (v / 100).toFixed(2), (v) => (state.fish.topP = v / 100));
    mkRange("重复惩罚 Repetition Penalty", 100, 200, 5, Math.round(state.fish.repetitionPenalty * 100), (v) => (v / 100).toFixed(2), (v) => (state.fish.repetitionPenalty = v / 100));
  } else {
    mkRange("停顿密度", 0, 100, 1, state.pause, (v) => String(v), (v) => (state.pause = v));
    mkRange("情绪强度", 0, 100, 1, state.emotion, (v) => String(v), (v) => (state.emotion = v));

    const styleWrap = document.createElement("div");
    styleWrap.className = "m-param-group";
    styleWrap.innerHTML =
      `<div class="m-param-head"><span>语气 / 风格指令</span>` +
      `<button class="m-pill-btn" id="mpToggleStyle" type="button" style="min-height:36px">${state.useStyle ? "已启用" : "已关闭"}</button></div>` +
      `<textarea id="mpStyleTxt" rows="3" placeholder="例如：温柔低沉地讲睡前故事…"></textarea>` +
      `<div class="m-chip-scroll" id="mpStylePresets" style="margin-top:8px"></div>`;
    el.sheetParamsBody.appendChild(styleWrap);

    const ta = styleWrap.querySelector<HTMLTextAreaElement>("#mpStyleTxt")!;
    ta.value = state.styleText;
    ta.addEventListener("input", () => {
      state.styleText = ta.value;
      saveStateToStorage(state);
    });
    const tog = styleWrap.querySelector<HTMLButtonElement>("#mpToggleStyle")!;
    tog.addEventListener("click", () => {
      state.useStyle = !state.useStyle;
      tog.textContent = state.useStyle ? "已启用" : "已关闭";
      saveStateToStorage(state);
    });
    const presetsRow = styleWrap.querySelector("#mpStylePresets")!;
    STYLE_PRESETS.forEach((p) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "m-fchip";
      b.textContent = p;
      b.addEventListener("click", () => {
        ta.value = p;
        state.styleText = p;
        state.useStyle = true;
        tog.textContent = "已启用";
        saveStateToStorage(state);
      });
      presetsRow.appendChild(b);
    });
  }

  openSheet(el.sheetParams);
}

function renderFullPlayerSheet(): void {
  const item = state.current;
  if (!item) return;
  const d = el.audio.duration || item.duration || 0;
  const ratio = d > 0 ? clamp(el.audio.currentTime / d, 0, 1) : 0;

  el.sheetFullPlayerBody.innerHTML = "";
  const title = document.createElement("div");
  title.style.cssText = "font-size:17px;font-weight:720;line-height:1.35";
  title.textContent = item.text.replace(/\s+/g, " ").slice(0, 72) + (item.text.length > 72 ? "…" : "");

  const sub = document.createElement("div");
  sub.style.cssText = "font-size:12.5px;color:var(--m-text-2);margin-top:4px";
  sub.textContent = `${item.provider === "fish" ? "Fish Audio" : "Gemini"} · ${item.label} · ${item.ext.toUpperCase()}`;

  const wave = document.createElement("div");
  wave.className = "mfp-wave";
  const peaks = item.peaks.length ? item.peaks : Array.from({ length: 36 }, () => 0.4);
  peaks.slice(0, 36).forEach((amp, idx) => {
    const s = document.createElement("span");
    s.style.height = `${Math.round(clamp(amp, 0.16, 1) * 100)}%`;
    if (idx / 36 <= ratio) s.classList.add("played");
    wave.appendChild(s);
  });

  const seek = document.createElement("input");
  seek.type = "range";
  seek.min = "0";
  seek.max = "1000";
  seek.value = String(Math.round(ratio * 1000));
  seek.addEventListener("input", () => {
    const dur = el.audio.duration || item.duration || 0;
    if (dur > 0) {
      el.audio.currentTime = (parseInt(seek.value, 10) / 1000) * dur;
    }
  });

  const times = document.createElement("div");
  times.className = "mfp-times";
  times.innerHTML = `<span id="mfpCur">${fmtTime(el.audio.currentTime)}</span><span id="mfpDur">${fmtTime(d)}</span>`;

  const ctrls = document.createElement("div");
  ctrls.className = "mfp-controls";
  const spdBtn = document.createElement("button");
  spdBtn.type = "button";
  spdBtn.className = "m-pill-btn";
  spdBtn.textContent = `${state.rate.toFixed(2)}×`;
  spdBtn.addEventListener("click", () => {
    state.playSpeedIdx = (state.playSpeedIdx + 1) % PLAY_SPEEDS.length;
    state.rate = PLAY_SPEEDS[state.playSpeedIdx];
    el.audio.playbackRate = state.rate;
    spdBtn.textContent = `${state.rate.toFixed(2)}×`;
    saveStateToStorage(state);
  });

  const mainPlay = document.createElement("button");
  mainPlay.type = "button";
  mainPlay.className = "mfp-main-play";
  mainPlay.innerHTML = state.playing ? ICONS.pause : ICONS.play;
  mainPlay.addEventListener("click", () => toggleMainPlay());

  const dlBtn = document.createElement("button");
  dlBtn.type = "button";
  dlBtn.className = "m-pill-btn";
  dlBtn.innerHTML = `${ICONS.download}<span style="margin-left:5px">下载</span>`;
  dlBtn.addEventListener("click", () => {
    downloadBlob(item.blob, `${slug(item.text)}-${stamp(item.time)}.${item.ext}`);
    toast("ok", `已下载 ${item.ext.toUpperCase()}`);
  });

  ctrls.append(spdBtn, mainPlay, dlBtn);

  const shareRow = document.createElement("div");
  shareRow.className = "m-row-gap";
  const shareBtn = document.createElement("button");
  shareBtn.type = "button";
  shareBtn.className = "m-tonal-btn";
  shareBtn.style.flex = "1 1 0";
  shareBtn.innerHTML = `${ICONS.share}<span>分享音频</span>`;
  shareBtn.addEventListener("click", async () => {
    try {
      const file = new File([item.blob], `${slug(item.text)}.${item.ext}`, { type: item.mime });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: "TTS Studio 音频", files: [file] });
      } else {
        await navigator.clipboard.writeText(item.text);
        toast("info", "当前浏览器不支持文件分享", "已将文本复制到剪贴板，可直接点击下载按钮保存音频。");
      }
    } catch {
      // cancelled
    }
  });

  const b64Btn = document.createElement("button");
  b64Btn.type = "button";
  b64Btn.className = "m-tonal-btn";
  b64Btn.style.flex = "1 1 0";
  b64Btn.textContent = "复制 Base64";
  b64Btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(item.base64);
      toast("ok", "Base64 已复制");
    } catch {
      toast("err", "复制失败");
    }
  });

  shareRow.append(shareBtn, b64Btn);
  el.sheetFullPlayerBody.append(title, sub, wave, seek, times, ctrls, shareRow);
}

/* ==================================================================
   L1 Library & Settings Tab
   ================================================================== */
function renderLibraryTab(): void {
  // History
  el.mBtnClearHistory.hidden = state.history.length === 0;
  el.mHistoryList.innerHTML = "";
  if (!state.history.length) {
    el.mHistoryList.innerHTML = '<div class="m-empty-box">还没有合成记录</div>';
  } else {
    state.history.forEach((item) => {
      const row = document.createElement("div");
      row.className = "m-hist-row";
      row.innerHTML =
        `<span class="m-hist-badge">${item.provider === "fish" ? "FISH" : "GEMINI"}</span>` +
        `<div class="m-hist-main"><div class="m-hist-title"></div><div class="m-hist-meta"></div></div>` +
        `<button class="m-icon-btn act-p" type="button" aria-label="播放">${ICONS.play}</button>` +
        `<button class="m-icon-btn act-d" type="button" aria-label="下载">${ICONS.download}</button>`;
      row.querySelector(".m-hist-title")!.textContent = item.text.replace(/\s+/g, " ").slice(0, 26);
      row.querySelector(".m-hist-meta")!.textContent = `${item.label} · ${fmtClock(item.time)} · ${fmtTime(item.duration)}`;
      row.querySelector(".act-p")!.addEventListener("click", () => loadIntoPlayer(item, true));
      row.querySelector(".act-d")!.addEventListener("click", () => {
        downloadBlob(item.blob, `${slug(item.text)}-${stamp(item.time)}.${item.ext}`);
        toast("ok", "已下载", item.label);
      });
      el.mHistoryList.appendChild(row);
    });
  }

  // Favorites
  el.mFavCount.textContent = `${state.books.length} 个`;
  el.mFavList.innerHTML = "";
  if (!state.books.length) {
    el.mFavList.innerHTML = '<div class="m-empty-box">还没有收藏音色，在音色库点击收藏即可加入</div>';
  } else {
    state.books.forEach((b) => {
      const cached = getCachedFishModel(b.id);
      const title = b.customName || cached?.title || b.title;
      const author = cached?.authorName || b.authorName || b.id.slice(0, 10);
      const row = document.createElement("div");
      row.className = "m-fav-row";
      row.innerHTML =
        `<div class="m-vc-cover" style="width:42px;height:42px;flex:0 0 42px;border-radius:12px;font-size:15px">${(cached?.coverUrl || b.coverUrl) ? `<img src="${cached?.coverUrl || b.coverUrl}" alt="">` : title.slice(0, 1)}</div>` +
        `<div class="m-hist-main"><div class="m-hist-title"></div><div class="m-hist-meta"></div></div>` +
        `<button class="m-pill-btn act-use" type="button">使用</button>` +
        `<button class="m-icon-btn act-del" type="button" aria-label="删除">${ICONS.close}</button>`;
      row.querySelector(".m-hist-title")!.textContent = title;
      row.querySelector(".m-hist-meta")!.textContent = author;
      row.querySelector(".act-use")!.addEventListener("click", () => {
        state.fishRefId = b.id;
        state.engine = "fish";
        saveStateToStorage(state);
        updateHeaderAndStudio();
        switchTab("studio");
        toast("ok", "已选中音色", title);
      });
      row.querySelector(".act-del")!.addEventListener("click", () => {
        state.books = state.books.filter((x) => x.id !== b.id);
        saveStateToStorage(state);
        renderLibraryTab();
      });
      el.mFavList.appendChild(row);
    });
  }

  // Keys
  el.mKeyPoolTabs.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
    b.setAttribute("aria-selected", b.dataset.pool === activeKeyTab ? "true" : "false");
  });
  const pool = state.pools[activeKeyTab];
  el.mKeyModeSeg.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
    b.setAttribute("aria-selected", b.dataset.mode === pool.mode ? "true" : "false");
  });
  el.mKeyList.innerHTML = "";
  if (!pool.keys.length) {
    el.mKeyList.innerHTML = '<div style="font-size:12.5px;color:var(--m-text-3);padding:4px 0">当前池暂无 Key，在下方输入框粘贴添加（仅存本地浏览器）</div>';
  } else {
    pool.keys.forEach((k) => {
      const d = describeKey(k);
      const r = document.createElement("div");
      r.className = "m-krow";
      r.innerHTML =
        `<div class="m-krow-main"><div class="m-krow-val"></div><div class="m-krow-sub"></div></div>` +
        `<button class="m-pill-btn act-tog" type="button">${k.enabled ? "禁用" : "启用"}</button>` +
        `<button class="m-icon-btn act-del" type="button" aria-label="删除">${ICONS.close}</button>`;
      r.querySelector(".m-krow-val")!.textContent = maskKey(k.value);
      r.querySelector(".m-krow-sub")!.textContent = `${d.text}${k.uses ? ` · 已用 ${k.uses} 次` : ""}`;
      r.querySelector(".act-tog")!.addEventListener("click", () => {
        k.enabled = !k.enabled;
        if (k.enabled) {
          k.state = "ok";
          k.cooldownUntil = 0;
        }
        saveStateToStorage(state);
        renderLibraryTab();
        updateHeaderAndStudio();
      });
      r.querySelector(".act-del")!.addEventListener("click", () => {
        pool.keys = pool.keys.filter((x) => x.id !== k.id);
        saveStateToStorage(state);
        renderLibraryTab();
        updateHeaderAndStudio();
      });
      el.mKeyList.appendChild(r);
    });
  }
  el.mCorsInput.value = state.cors;
}

/* ==================================================================
   Player & Synthesis
   ================================================================== */
function syncMiniPlayerIcons(): void {
  el.mMiniPlayBtn.innerHTML = state.playing ? ICONS.pause : ICONS.play;
  el.mMiniPlayer.classList.toggle("playing", state.playing);
  if (el.sheetFullPlayer.classList.contains("open")) {
    const mp = el.sheetFullPlayerBody.querySelector<HTMLButtonElement>(".mfp-main-play");
    if (mp) mp.innerHTML = state.playing ? ICONS.pause : ICONS.play;
  }
}

function toggleMainPlay(): void {
  if (!state.current) return;
  if (el.audio.paused) {
    stopSamplePreview();
    el.audio.play().catch(() => toast("err", "播放失败", "请再点击一次播放。"));
  } else {
    el.audio.pause();
  }
}

function loadIntoPlayer(item: HistoryItem, autoplay: boolean): void {
  stopSamplePreview();
  state.current = item;
  el.audio.src = item.url;
  el.audio.playbackRate = state.rate;

  el.mMiniPlayer.hidden = false;
  el.mShell.classList.add("has-player");
  el.mMiniTitle.textContent = item.text.replace(/\s+/g, " ").slice(0, 34) + (item.text.length > 34 ? "…" : "");
  el.mMiniSub.textContent = `${item.provider === "fish" ? "Fish" : "Gemini"} · ${item.label} · ${fmtTime(item.duration)}`;
  el.mMiniProgress.style.width = "0%";
  syncMiniPlayerIcons();

  if (autoplay) el.audio.play().catch(() => {});
}

async function generate(): Promise<void> {
  if (state.busy) return;
  const raw = el.mTextInput.value.trim();
  if (!raw) {
    toast("warn", "文本为空", "先输入要合成的文本。");
    el.mTextInput.focus();
    return;
  }
  if (raw.length > MAX_CHARS) {
    toast("err", "文本过长", `请控制在 ${MAX_CHARS} 字以内。`);
    return;
  }
  const provider = state.engine;
  if (!pickKey(state, provider)) {
    toast("err", "缺少 API Key", "请先在「记录与设置」中添加可用 Key。");
    switchTab("library");
    return;
  }

  state.busy = true;
  el.mBtnGenerate.disabled = true;
  el.mGenIcon.innerHTML = '<span class="m-spinner"></span>';
  el.mGenLabel.textContent = "正在合成…";

  try {
    const opts = {
      onNotify: toast,
      onKeySync: () => {
        updateHeaderAndStudio();
        if (activeTab === "library") renderLibraryTab();
      },
      onStyleDisabled: () => {
        state.useStyle = false;
        saveStateToStorage(state);
      },
    };
    const out: GeneratedAudioResult =
      provider === "fish"
        ? await fishGenerate(state, raw, (l) => (el.mGenLabel.textContent = l), opts)
        : await geminiGenerate(state, raw, (l) => (el.mGenLabel.textContent = l), opts);

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
      duration: out.duration || estimateDuration(raw),
      peaks: out.peaks,
      text: raw,
      label,
      voiceId: provider === "fish" ? state.fishRefId.trim() : state.geminiVoice,
      time: new Date(),
      chunks: out.chunks || 1,
    };
    state.history.unshift(item);
    if (state.history.length > 30) {
      const drop = state.history.pop();
      if (drop?.url && state.current?.id !== drop.id) URL.revokeObjectURL(drop.url);
    }
    loadIntoPlayer(item, true);
    if (activeTab === "library") renderLibraryTab();
    toast("ok", "合成完成", `${item.label} · ${fmtTime(item.duration)}`);
  } catch (err) {
    const e = err as ApiError;
    if (e?.cors) {
      toast("err", "Fish 合成跨域受限", "请在「记录与设置」配置 Cloudflare Worker 或本地代理地址。");
      switchTab("library");
    } else {
      toast("err", "合成失败", e?.message || String(err));
    }
  } finally {
    state.busy = false;
    el.mBtnGenerate.disabled = false;
    el.mGenIcon.innerHTML = ICONS.spark;
    el.mGenLabel.textContent = "生成语音";
  }
}

/* ==================================================================
   Events & Bootstrap
   ================================================================== */
function bindEvents(): void {
  el.mBtnTheme.addEventListener("click", () => {
    applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
  });

  el.mEngineSeg.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-engine]");
    if (!b?.dataset.engine) return;
    state.engine = b.dataset.engine as ProviderId;
    saveStateToStorage(state);
    updateHeaderAndStudio();
    if (activeTab === "voices") {
      renderVoiceFilters();
      if (state.engine === "fish") {
        if (fishItems.length === 0) void fetchMobileFishVoices(true);
        else renderFishMobileCards();
      } else {
        renderGeminiMobileVoices();
      }
    }
  });

  el.mBtnKeyJump.addEventListener("click", () => {
    activeKeyTab = state.engine;
    switchTab("library");
    setTimeout(() => document.getElementById("mKeySection")?.scrollIntoView({ behavior: "smooth" }), 60);
  });

  document.querySelectorAll<HTMLButtonElement>(".m-tab").forEach((b) => {
    b.addEventListener("click", () => switchTab(b.dataset.tab as TabId));
  });

  el.mTextInput.addEventListener("input", refreshStudioStats);
  el.mBtnSample.addEventListener("click", () => {
    el.mTextInput.value = SAMPLE_TEXT;
    refreshStudioStats();
  });
  el.mBtnPaste.addEventListener("click", async () => {
    try {
      const txt = await navigator.clipboard.readText();
      if (!txt) {
        toast("warn", "剪贴板为空");
        return;
      }
      el.mTextInput.value = (el.mTextInput.value ? `${el.mTextInput.value}\n` : "") + txt.slice(0, MAX_CHARS);
      refreshStudioStats();
    } catch {
      el.mTextInput.focus();
      toast("warn", "请长按文本框手动粘贴");
    }
  });
  el.mBtnClear.addEventListener("click", () => {
    el.mTextInput.value = "";
    refreshStudioStats();
  });

  el.mFishTagRow.innerHTML = "";
  FISH_TAGS.forEach((tag) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "m-tag-chip";
    b.textContent = tag;
    b.addEventListener("click", () => {
      const ta = el.mTextInput;
      const start = ta.selectionStart || 0;
      ta.value = ta.value.slice(0, start) + tag + ta.value.slice(ta.selectionEnd || start);
      const pos = start + tag.length;
      ta.setSelectionRange(pos, pos);
      refreshStudioStats();
    });
    el.mFishTagRow.appendChild(b);
  });

  el.mBtnVoiceCapsule.addEventListener("click", openQuickVoiceSheet);
  el.mBtnParams.addEventListener("click", openParamsSheet);
  el.mBtnGenerate.addEventListener("click", () => void generate());

  // Voices tab search & infinite scroll
  el.mVoiceSearch.addEventListener("input", () => {
    voiceKeyword = el.mVoiceSearch.value.trim();
    el.mVoiceSearchClear.hidden = !voiceKeyword;
    window.clearTimeout(voiceSearchTimer);
    voiceSearchTimer = window.setTimeout(() => {
      if (state.engine === "fish") void fetchMobileFishVoices(true);
      else renderGeminiMobileVoices();
    }, 320);
  });
  el.mVoiceSearchClear.addEventListener("click", () => {
    voiceKeyword = "";
    el.mVoiceSearch.value = "";
    el.mVoiceSearchClear.hidden = true;
    if (state.engine === "fish") void fetchMobileFishVoices(true);
    else renderGeminiMobileVoices();
  });
  el.mBtnLoadMore.addEventListener("click", () => void fetchMobileFishVoices(false));
  el.pageVoices.addEventListener(
    "scroll",
    () => {
      if (state.engine !== "fish" || !fishHasMore || fishLoading) return;
      if (el.pageVoices.scrollTop + el.pageVoices.clientHeight >= el.pageVoices.scrollHeight - 240) {
        void fetchMobileFishVoices(false);
      }
    },
    { passive: true },
  );

  // Library & Settings
  el.mBtnClearHistory.addEventListener("click", () => {
    state.history.forEach((it) => URL.revokeObjectURL(it.url));
    state.history = [];
    state.current = null;
    el.audio.pause();
    el.audio.removeAttribute("src");
    el.mMiniPlayer.hidden = true;
    el.mShell.classList.remove("has-player");
    renderLibraryTab();
    toast("info", "已清空历史记录");
  });

  el.mKeyPoolTabs.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-pool]");
    if (!b?.dataset.pool) return;
    activeKeyTab = b.dataset.pool as ProviderId;
    renderLibraryTab();
  });
  el.mKeyModeSeg.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-mode]");
    if (!b?.dataset.mode) return;
    state.pools[activeKeyTab].mode = b.dataset.mode as "round" | "pinned";
    saveStateToStorage(state);
    renderLibraryTab();
  });
  el.mBtnAddKeys.addEventListener("click", () => {
    const raw = el.mKeyInput.value.trim();
    if (!raw) return toast("warn", "请先输入 API Key");
    const { added, dup, bad } = addKeysToPool(state, activeKeyTab, raw);
    el.mKeyInput.value = "";
    renderLibraryTab();
    updateHeaderAndStudio();
    toast(added ? "ok" : "warn", added ? `已添加 ${added} 个 Key` : "未新增", `重复 ${dup} · 无效 ${bad}`);
  });
  el.mBtnClearPoolKeys.addEventListener("click", () => {
    state.pools[activeKeyTab].keys = [];
    state.pools[activeKeyTab].cursor = 0;
    saveStateToStorage(state);
    renderLibraryTab();
    updateHeaderAndStudio();
  });
  el.mBtnSaveCors.addEventListener("click", () => {
    state.cors = el.mCorsInput.value.trim();
    state.corsExplicit = true;
    saveStateToStorage(state);
    toast(state.cors ? "ok" : "info", state.cors ? "代理已保存" : "已设为直连");
  });
  el.mBtnTestCors.addEventListener("click", async () => {
    const res = await testFishProxyConnectivity(el.mCorsInput.value.trim());
    toast(res.ok ? "ok" : "err", res.ok ? "代理连通正常" : "代理连通失败", res.message);
  });
  el.mBtnDefaultCors.addEventListener("click", () => {
    const def = getDefaultCorsForEnv();
    el.mCorsInput.value = def;
    state.cors = def;
    state.corsExplicit = false;
    saveStateToStorage(state);
    toast("ok", "已恢复默认云端代理", def);
  });
  el.mBtnSwitchDesktop.addEventListener("click", () => switchDeviceExperience("desktop"));

  // L3 Mini Player & Audio Events
  el.mMiniPlayBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMainPlay();
  });
  el.mMiniOpenArea.addEventListener("click", () => {
    if (!state.current) return;
    renderFullPlayerSheet();
    openSheet(el.sheetFullPlayer);
  });
  el.audio.addEventListener("play", () => {
    state.playing = true;
    syncMiniPlayerIcons();
  });
  el.audio.addEventListener("pause", () => {
    state.playing = false;
    syncMiniPlayerIcons();
  });
  el.audio.addEventListener("ended", () => {
    state.playing = false;
    syncMiniPlayerIcons();
    el.mMiniProgress.style.width = "0%";
  });
  el.audio.addEventListener("timeupdate", () => {
    const d = el.audio.duration || state.current?.duration || 0;
    if (!d) return;
    const ratio = clamp(el.audio.currentTime / d, 0, 1);
    el.mMiniProgress.style.width = `${(ratio * 100).toFixed(1)}%`;
    if (el.sheetFullPlayer.classList.contains("open")) {
      const curEl = document.getElementById("mfpCur");
      const rng = el.sheetFullPlayerBody.querySelector<HTMLInputElement>('input[type="range"]');
      if (curEl) curEl.textContent = fmtTime(el.audio.currentTime);
      if (rng) rng.value = String(Math.round(ratio * 1000));
    }
  });
}

async function init(): Promise<void> {
  applyTheme(getInitialTheme());
  loadStateFromStorage(state);
  await tryHydrateLocalServerKeys(state);

  el.mGenIcon.innerHTML = ICONS.spark;
  el.mMiniPlayBtn.innerHTML = ICONS.play;
  bindSheetGestures();
  bindEvents();
  updateHeaderAndStudio();
  switchTab("studio");

  // 自动拉取当前音色及收藏的真实 Fish Audio 名称与元数据
  const idsToHydrate = [
    state.fishRefId,
    ...FISH_PRESET_VOICES.map((p) => p.id),
    ...state.books.map((b) => b.id),
  ].filter(Boolean);
  void hydrateFishModelIds(
    idsToHydrate,
    { apiKey: pickKey(state, "fish")?.value, corsPrefix: state.cors },
    () => updateHeaderAndStudio(),
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void init());
} else {
  void init();
}
