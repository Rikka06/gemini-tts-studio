import { fmtCompactCount } from "../shared/audio";
import {
  FISH_LANGUAGE_FILTERS,
  FISH_SORT_OPTIONS,
  FISH_TAG_FILTERS,
} from "../shared/constants";
import { formatFishLanguage, searchFishModels } from "../shared/fishApi";
import { ICONS } from "../shared/icons";
import { pickKey } from "../shared/keyPool";
import type { AppState, FishVoiceModel } from "../shared/types";

export interface ExplorerCallbacks {
  getState: () => AppState;
  isBookmarked: (id: string) => boolean;
  onSelectVoice: (model: FishVoiceModel) => void;
  onToggleBookmark: (model: FishVoiceModel) => void;
  onTogglePreview: (model: FishVoiceModel, btn?: HTMLElement) => void;
  getPlayingPreviewId: () => string;
  onNotify: (kind: "ok" | "err" | "warn" | "info", title: string, desc?: string) => void;
}

export function createFishExplorerController(cb: ExplorerCallbacks) {
  const scrim = document.getElementById("explorerScrim")!;
  const modal = document.getElementById("explorerModal")!;
  const btnOpen = document.getElementById("btnOpenExplorer")!;
  const btnClose = document.getElementById("btnCloseExplorer")!;
  const searchInput = document.getElementById("expSearchInput") as HTMLInputElement;
  const searchClear = document.getElementById("expSearchClear") as HTMLButtonElement;
  const langStrip = document.getElementById("expLangStrip")!;
  const tagStrip = document.getElementById("expTagStrip")!;
  const sortSeg = document.getElementById("expSortSeg")!;
  const selfOnly = document.getElementById("expSelfOnly") as HTMLInputElement;
  const totalCountEl = document.getElementById("expTotalCount")!;
  const bodyEl = document.getElementById("explorerBody")!;
  const gridEl = document.getElementById("expGrid")!;
  const btnMore = document.getElementById("btnExpMore") as HTMLButtonElement;

  let language = "";
  let tag = "";
  let sortBy: "score" | "task_count" | "created_at" = "score";
  let keyword = "";
  let pageNumber = 1;
  let hasMore = false;
  let loading = false;
  let items: FishVoiceModel[] = [];
  let debounceTimer: number | undefined;
  let loadedOnce = false;

  function renderFilters(): void {
    langStrip.innerHTML = "";
    FISH_LANGUAGE_FILTERS.forEach((f) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `f-chip${language === f.id ? " active" : ""}`;
      b.textContent = f.label;
      b.addEventListener("click", () => {
        language = f.id;
        renderFilters();
        void fetchPage(true);
      });
      langStrip.appendChild(b);
    });

    tagStrip.innerHTML = "";
    FISH_TAG_FILTERS.forEach((f) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `f-chip${tag === f.id ? " active" : ""}`;
      b.textContent = f.label;
      b.addEventListener("click", () => {
        tag = f.id;
        renderFilters();
        void fetchPage(true);
      });
      tagStrip.appendChild(b);
    });

    sortSeg.innerHTML = "";
    FISH_SORT_OPTIONS.forEach((s) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = s.label;
      b.setAttribute("aria-selected", sortBy === s.id ? "true" : "false");
      b.addEventListener("click", () => {
        sortBy = s.id;
        renderFilters();
        void fetchPage(true);
      });
      sortSeg.appendChild(b);
    });
  }

  function renderCards(): void {
    const state = cb.getState();
    const playingId = cb.getPlayingPreviewId();
    gridEl.innerHTML = "";

    if (!items.length && !loading) {
      gridEl.innerHTML =
        '<div class="empty" style="grid-column:1/-1">没有找到匹配的音色模型，试试切换关键词或筛选条件</div>';
      return;
    }

    const frag = document.createDocumentFragment();
    items.forEach((m) => {
      const card = document.createElement("article");
      const selected = state.fishRefId.trim() === m.id;
      const liked = cb.isBookmarked(m.id);
      const isPlaying = playingId === m.id;
      const sampleUrl = m.samples[0]?.audio || "";
      card.className = `exp-card${selected ? " selected" : ""}`;

      const cover = document.createElement("div");
      cover.className = "exp-cover";
      if (m.coverUrl) {
        const img = document.createElement("img");
        img.src = m.coverUrl;
        img.alt = m.title;
        img.loading = "lazy";
        img.onerror = () => {
          img.remove();
          cover.textContent = m.title.slice(0, 1).toUpperCase();
        };
        cover.appendChild(img);
      } else {
        cover.textContent = m.title.slice(0, 1).toUpperCase();
      }

      const headInfo = document.createElement("div");
      headInfo.className = "exp-head-info";
      const nameEl = document.createElement("div");
      nameEl.className = "exp-name";
      nameEl.textContent = m.title;
      nameEl.title = m.title;

      const authorEl = document.createElement("div");
      authorEl.className = "exp-author";
      authorEl.textContent = `by ${m.authorName}`;

      const statsEl = document.createElement("div");
      statsEl.className = "exp-stats";
      statsEl.textContent = `使用 ${fmtCompactCount(m.taskCount)} · 点赞 ${fmtCompactCount(m.likeCount)}`;

      headInfo.append(nameEl, authorEl, statsEl);

      const top = document.createElement("div");
      top.className = "exp-card-top";
      top.append(cover, headInfo);

      const desc = document.createElement("div");
      desc.className = "exp-desc";
      desc.textContent = m.description || m.samples[0]?.text || "Fish Audio 社区音色模型";

      const tagsWrap = document.createElement("div");
      tagsWrap.className = "exp-tags";
      m.languages.slice(0, 2).forEach((l) => {
        const s = document.createElement("span");
        s.className = "exp-tag lang";
        s.textContent = formatFishLanguage(l);
        tagsWrap.appendChild(s);
      });
      m.tags.slice(0, 3).forEach((t) => {
        const s = document.createElement("span");
        s.className = "exp-tag";
        s.textContent = t;
        tagsWrap.appendChild(s);
      });

      const actions = document.createElement("div");
      actions.className = "exp-actions";

      const playBtn = document.createElement("button");
      playBtn.type = "button";
      playBtn.className = `mini-btn ${isPlaying ? "primary" : "ghost"}`;
      playBtn.disabled = !sampleUrl;
      playBtn.innerHTML = `${isPlaying ? ICONS.pause : ICONS.play}<span>${sampleUrl ? (isPlaying ? "停止试听" : "试听") : "无样音"}</span>`;
      playBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        cb.onTogglePreview(m, playBtn);
      });

      const favBtn = document.createElement("button");
      favBtn.type = "button";
      favBtn.className = "mini-btn ghost";
      favBtn.title = liked ? "取消收藏" : "收藏音色";
      favBtn.innerHTML = liked ? ICONS.heartFilled : ICONS.heart;
      if (liked) favBtn.style.color = "var(--red)";
      favBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        cb.onToggleBookmark(m);
        renderCards();
      });

      const spacer = document.createElement("div");
      spacer.className = "spacer";

      const useBtn = document.createElement("button");
      useBtn.type = "button";
      useBtn.className = "mini-btn primary";
      useBtn.textContent = selected ? "当前已选" : "选用此音色";
      useBtn.addEventListener("click", () => {
        cb.onSelectVoice(m);
        close();
      });

      actions.append(playBtn, favBtn, spacer, useBtn);
      card.append(top, desc, tagsWrap, actions);
      frag.appendChild(card);
    });

    gridEl.appendChild(frag);
  }

  function renderSkeletons(): void {
    for (let i = 0; i < 6; i++) {
      const sk = document.createElement("div");
      sk.className = "skeleton-card";
      gridEl.appendChild(sk);
    }
  }

  async function fetchPage(reset: boolean): Promise<void> {
    if (loading) return;
    if (reset) {
      pageNumber = 1;
      items = [];
      gridEl.innerHTML = "";
    }
    const state = cb.getState();
    const keyEntry = pickKey(state, "fish");
    if (selfOnly.checked && !keyEntry) {
      cb.onNotify("warn", "需要 Fish Audio Key", "「仅看我的音色」需要在 Key 池中添加 Fish API Key。");
      selfOnly.checked = false;
      return;
    }

    loading = true;
    btnMore.hidden = true;
    totalCountEl.textContent = "加载中…";
    if (reset) renderSkeletons();

    try {
      const res = await searchFishModels(
        {
          title: keyword,
          language,
          tag,
          sortBy,
          self: selfOnly.checked,
          pageNumber,
          pageSize: 18,
        },
        { apiKey: keyEntry?.value, corsPrefix: state.cors },
      );
      if (reset) items = res.items;
      else {
        const seen = new Set(items.map((x) => x.id));
        res.items.forEach((x) => {
          if (!seen.has(x.id)) items.push(x);
        });
      }
      hasMore = res.hasMore;
      pageNumber++;
      totalCountEl.textContent = `共 ${fmtCompactCount(res.total)} 个模型 · 已载入 ${items.length}`;
    } catch (err) {
      cb.onNotify("err", "获取 Fish 音色列表失败", err instanceof Error ? err.message : String(err));
      totalCountEl.textContent = "加载失败";
    } finally {
      loading = false;
      renderCards();
      btnMore.hidden = !hasMore;
    }
  }

  function open(initialKeyword?: string): void {
    if (typeof initialKeyword === "string") {
      keyword = initialKeyword.trim();
      searchInput.value = keyword;
      searchClear.hidden = !keyword;
    }
    modal.classList.add("open");
    scrim.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    renderFilters();
    if (!loadedOnce || typeof initialKeyword === "string") {
      loadedOnce = true;
      void fetchPage(true);
    } else {
      renderCards();
    }
    setTimeout(() => searchInput.focus(), 80);
  }

  function close(): void {
    modal.classList.remove("open");
    scrim.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  btnOpen.addEventListener("click", () => open());
  btnClose.addEventListener("click", close);
  scrim.addEventListener("click", close);

  searchInput.addEventListener("input", () => {
    keyword = searchInput.value.trim();
    searchClear.hidden = !keyword;
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      void fetchPage(true);
    }, 320);
  });

  searchClear.addEventListener("click", () => {
    keyword = "";
    searchInput.value = "";
    searchClear.hidden = true;
    void fetchPage(true);
  });

  selfOnly.addEventListener("change", () => void fetchPage(true));
  btnMore.addEventListener("click", () => void fetchPage(false));

  bodyEl.addEventListener(
    "scroll",
    () => {
      if (!hasMore || loading) return;
      if (bodyEl.scrollTop + bodyEl.clientHeight >= bodyEl.scrollHeight - 240) {
        void fetchPage(false);
      }
    },
    { passive: true },
  );

  return {
    open,
    close,
    isOpen: () => modal.classList.contains("open"),
    refreshView: () => {
      if (modal.classList.contains("open")) renderCards();
    },
  };
}
