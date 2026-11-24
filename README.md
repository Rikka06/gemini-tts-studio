# TTS Studio · Gemini TTS + Fish Audio 双端独立工作台

基于 **Vite + TypeScript** 重构升级的多端语音合成工作台，完整集成 **Gemini TTS** 与 **Fish Audio** 实时音色搜索、样音试听、元数据缓存、完整合成参数调节与双端独立架构（Desktop / Mobile Dynamic Serving）。

## 核心特性

### 1. Fish Audio 音色库与工作台增强
- **真实音色名称与元数据映射**：自动解析并缓存 `GET /model/{id}` 返回的真实模型名称（`title`）、作者、语种分类、封面图与描述。
- **内置音色发现广场**：支持实时关键词防抖搜索、语种筛选（中文 / English / 日本語 / 한국어 等）、标签筛选、热度/最新排序、无限滚动分页、`我的音色 (self=true)` 过滤。
- **一键交互**：每张音色卡片支持**一键试听样音**（互斥播放）、**一键收藏**、**一键设为当前音色**。
- **完整 TTS 参数开放**：支持切换 `s2.1-pro-free` / `s2.1-pro` / `s2-pro` / `s1` / `drama-3`，调节 `format`（`mp3`/`wav`/`opus`/`pcm`）、码率、采样率、`prosody.speed`、`prosody.volume`、`temperature`、`top_p`、`repetition_penalty`、`chunk_length`、`latency` 与 `normalize`。

### 2. 基于 User-Agent 的双端独立架构（Dynamic Serving）
- **根分发器 (`index.html`)**：首屏渲染前极速探测 `User-Agent` / 触控与视口特征，无白屏闪烁自动分发至独立端入口，支持 `?view=desktop|mobile|auto` 与手动切换覆盖（持久化至 `localStorage` 与 Cookie `tts_device_mode`）。
- **桌面端独立包 (`desktop/index.html`)**：完整保留原有两栏桌面工作台体验 + 音色探索模态窗 + 波形进度播放器。
- **移动端独立包 (`mobile/index.html`)**：零桌面代码依赖，融合 **Apple HIG + Material Design 3 + 小米 HyperOS 拇指热区规范**，严格执行 L1（底栏三主视图）/ L2（可拖拽手势关闭 Bottom Sheet）/ L3（全局悬浮迷你播放器 + Toast）三级交互架构。
- **标准 HTTP 网关配置**：内置 [`deploy/cloudflare-worker.js`](./deploy/cloudflare-worker.js) 与 [`deploy/nginx-dynamic-serving.conf`](./deploy/nginx-dynamic-serving.conf)，支持同 URL 按 `User-Agent` 动态分发并携带 `Vary: User-Agent, Cookie` 响应头，同时内置 Fish Audio `/v1/tts` CORS 反代。

## 本地运行

```bash
npm install
npm run build
python server.py   # 或双击 一键启动TTS.bat
```

访问 `http://127.0.0.1:8080/`，本地 `server.py` 会自动根据请求 `User-Agent` 返回对应独立页面，并代理解析 Fish Audio 请求。

> 安全提示：如需在本地自动预载个人 API Key，可在本地创建 `.local-keys.json`（已加入 `.gitignore`，不会提交到 Git 仓库）：
> ```json
> {
>   "gemini": ["你的_Gemini_Key"],
>   "fish": ["你的_Fish_Audio_Key"]
> }
> ```
