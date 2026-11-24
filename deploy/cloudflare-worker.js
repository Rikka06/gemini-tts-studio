/**
 * Cloudflare Worker — Standard HTTP Edge Dynamic Serving + Fish Audio CORS Gateway
 *
 * 功能：
 * 1. 基于 HTTP 请求头 User-Agent（及 Cookie tts_device_mode / ?view= 覆盖）
 *    在同一个根 URL (/) 下直接返回 desktop/index.html 或 mobile/index.html，
 *    并设置规范响应头 Vary: User-Agent, Cookie（无重定向、无白屏）。
 * 2. 透传 /assets/*、/desktop/*、/mobile/* 静态资源到源站（例如 GitHub Pages）。
 * 3. 在 /api/fish/*、/v1/tts、/model* 提供完整的 Fish Audio CORS 反向代理。
 *
 * 部署提示：
 * 在 Worker 环境变量中设置 ORIGIN_URL，例如：
 *   ORIGIN_URL = "https://rikka06.github.io/gemini-tts-studio"
 */

const MOBILE_UA_RE =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|HarmonyOS|MicroMessenger|Windows Phone/i;

const FISH_UPSTREAM = "https://api.fish.audio";

function parseCookie(header, name) {
  if (!header) return "";
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = header.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : "";
}

function resolveTargetDevice(request, url) {
  const view = url.searchParams.get("view");
  if (view === "desktop" || view === "mobile") {
    return { target: view, setCookie: view };
  }
  if (view === "auto") {
    return { target: detectByUA(request), setCookie: "auto" };
  }
  const cookieOverride = parseCookie(request.headers.get("Cookie") || "", "tts_device_mode");
  if (cookieOverride === "desktop" || cookieOverride === "mobile") {
    return { target: cookieOverride, setCookie: "" };
  }
  return { target: detectByUA(request), setCookie: "" };
}

function detectByUA(request) {
  const chMobile = request.headers.get("Sec-CH-UA-Mobile");
  if (chMobile === "?1") return "mobile";
  const ua = request.headers.get("User-Agent") || "";
  return MOBILE_UA_RE.test(ua) ? "mobile" : "desktop";
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, model, Accept, Accept-Language, X-Requested-With",
    "Access-Control-Expose-Headers": "Content-Type, Content-Length",
    "Access-Control-Max-Age": "86400",
  };
}

async function proxyFishApi(request, url) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  let upstreamPath = url.pathname;
  if (upstreamPath.startsWith("/api/fish")) {
    upstreamPath = upstreamPath.slice("/api/fish".length) || "/";
  }
  const targetUrl = `${FISH_UPSTREAM}${upstreamPath}${url.search}`;
  const fwdHeaders = new Headers();
  for (const name of ["Authorization", "Content-Type", "model", "Accept", "Accept-Language"]) {
    const val = request.headers.get(name);
    if (val) fwdHeaders.set(name, val);
  }
  const upstreamRes = await fetch(targetUrl, {
    method: request.method,
    headers: fwdHeaders,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
  });
  const outHeaders = new Headers(upstreamRes.headers);
  for (const [k, v] of Object.entries(corsHeaders())) {
    outHeaders.set(k, v);
  }
  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: outHeaders,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 1. Fish Audio CORS 代理路由
    if (path.startsWith("/api/fish/") || path.startsWith("/v1/") || path === "/model" || path.startsWith("/model/")) {
      return proxyFishApi(request, url);
    }

    const originBase = String(env.ORIGIN_URL || "https://rikka06.github.io/gemini-tts-studio").replace(/\/+$/, "");

    // 2. 根路径同 URL Dynamic Serving
    if (path === "/" || path === "/index.html") {
      const { target, setCookie } = resolveTargetDevice(request, url);
      const upstreamRes = await fetch(`${originBase}/${target}/index.html`, {
        headers: { "User-Agent": request.headers.get("User-Agent") || "" },
      });
      if (!upstreamRes.ok) {
        return new Response("Upstream bundle not found", { status: 502 });
      }
      // 重写 ../assets/ -> ./assets/ 以保证在根 URL / 下相对资源路径正确解析
      let html = await upstreamRes.text();
      html = html.replace(/(["'])\.\.\/assets\//g, "$1./assets/");

      const headers = new Headers({
        "Content-Type": "text/html; charset=utf-8",
        "Vary": "User-Agent, Cookie",
        "Cache-Control": "public, max-age=60",
        "X-TTS-Served-Bundle": target,
      });
      if (setCookie === "auto") {
        headers.append("Set-Cookie", "tts_device_mode=; Path=/; Max-Age=0; SameSite=Lax");
      } else if (setCookie) {
        headers.append("Set-Cookie", `tts_device_mode=${setCookie}; Path=/; Max-Age=2592000; SameSite=Lax`);
      }
      return new Response(html, { status: 200, headers });
    }

    // 3. 其余静态资源（/assets/*, /desktop/*, /mobile/*）直接代理到源站
    const assetRes = await fetch(`${originBase}${path}${url.search}`);
    const resHeaders = new Headers(assetRes.headers);
    if (path.startsWith("/assets/")) {
      resHeaders.set("Cache-Control", "public, max-age=31536000, immutable");
    }
    return new Response(assetRes.body, {
      status: assetRes.status,
      headers: resHeaders,
    });
  },
};
