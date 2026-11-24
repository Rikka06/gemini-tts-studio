#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TTS Studio 本地配套服务（仅依赖 Python 标准库）

功能：
  1) 基于 User-Agent 的同 URL 动态分发（Dynamic Serving）：
     访问 http://127.0.0.1:8080/ 时读取请求头 User-Agent 与 tts_device_mode Cookie，
     直接返回 dist/desktop/index.html 或 dist/mobile/index.html，并附带 Vary: User-Agent, Cookie。
     同时完整支持 /desktop/、/mobile/、/assets/* 静态资源访问。
  2) 全量 Fish Audio CORS 反向代理：
     支持 GET /model、GET /model/{id}、POST /v1/tts（以及 /https://api.fish.audio/...）。
  3) 本地密钥便捷加载（仅本地回环）：
     读取同目录 .local-keys.json（已加入 .gitignore，不入库不公开）。
"""

import json
import os
import re
import socket
import sys
import threading
import urllib.error
import urllib.request
import webbrowser
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit

HOST = "127.0.0.1"
PORT = 8080
LOCAL_URL = f"http://{HOST}:{PORT}/"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.join(BASE_DIR, "dist")
SERVE_ROOT = DIST_DIR if os.path.isdir(DIST_DIR) else BASE_DIR
LOCAL_KEYS_FILE = os.path.join(BASE_DIR, ".local-keys.json")

UPSTREAM_ORIGIN = "https://api.fish.audio"
FORWARD_HEADERS = ("Authorization", "Content-Type", "model", "Accept", "Accept-Language")
ALLOWED_UPSTREAM_HOSTS = ("api.fish.audio",)
DENY_EXT = (".py", ".pyc", ".pyw", ".bat", ".cmd", ".ps1", ".log", ".err", ".ini", ".db", ".ts", ".json")

MOBILE_UA_RE = re.compile(
    r"Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|HarmonyOS|MicroMessenger|Windows Phone",
    re.IGNORECASE,
)

MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".opus": "audio/ogg",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
}


def log(msg):
    print(msg, flush=True)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "TTSStudioLocal/2.0"

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Authorization, Content-Type, model, Accept, Accept-Language, X-Requested-With",
        )
        self.send_header("Access-Control-Expose-Headers", "Content-Type, Content-Length")
        self.send_header("Access-Control-Max-Age", "86400")

    def _send_body(self, status, body, content_type, extra_headers=None):
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if extra_headers:
            for k, v in extra_headers:
                self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD" and body:
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def _send_json(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self._send_body(status, body, "application/json; charset=utf-8")

    def log_message(self, fmt, *args):
        try:
            log("  · " + (fmt % args))
        except Exception:
            log("  · " + str(fmt))

    @staticmethod
    def _resolve_upstream(raw_path, query=""):
        p = unquote(raw_path or "/")
        if p.startswith("/api/fish/"):
            p = p[len("/api/fish"):]

        for _ in range(3):
            if p.startswith("/http://") or p.startswith("/https://"):
                p = p[1:]
                continue
            if p.startswith("http://") or p.startswith("https://"):
                try:
                    parts = urlsplit(p)
                except ValueError:
                    return None
                host = (parts.hostname or "").lower()
                if host not in ALLOWED_UPSTREAM_HOSTS:
                    return None
                tail = parts.path or "/"
                q = parts.query or query
                if q:
                    tail += "?" + q
                return "https://" + host + tail
            break

        if p.startswith("/v1/") or p == "/model" or p.startswith("/model/"):
            return UPSTREAM_ORIGIN + p + (("?" + query) if query else "")
        return None

    def _detect_device(self, query_str):
        qs = parse_qs(query_str)
        view = (qs.get("view") or [""])[0]
        set_cookie = None
        if view in ("desktop", "mobile"):
            return view, f"tts_device_mode={view}; Path=/; Max-Age=2592000; SameSite=Lax"
        if view == "auto":
            set_cookie = "tts_device_mode=; Path=/; Max-Age=0; SameSite=Lax"

        cookie_raw = self.headers.get("Cookie") or ""
        if cookie_raw and view != "auto":
            ck = SimpleCookie()
            try:
                ck.load(cookie_raw)
                if "tts_device_mode" in ck:
                    val = ck["tts_device_mode"].value
                    if val in ("desktop", "mobile"):
                        return val, None
            except Exception:
                pass

        ua = self.headers.get("User-Agent") or ""
        ch_mobile = self.headers.get("Sec-CH-UA-Mobile") or ""
        if ch_mobile == "?1" or MOBILE_UA_RE.search(ua):
            return "mobile", set_cookie
        return "desktop", set_cookie

    def _proxy_request(self, method):
        parts = urlsplit(self.path)
        upstream = self._resolve_upstream(parts.path, parts.query)
        if not upstream:
            self._send_json(404, {"message": "该路径未配置代理目标", "path": self.path})
            return

        body = None
        if method in ("POST", "PUT", "PATCH"):
            try:
                length = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                length = 0
            body = self.rfile.read(length) if length > 0 else b""

        req = urllib.request.Request(upstream, data=body, method=method)
        for name in FORWARD_HEADERS:
            value = self.headers.get(name)
            if value:
                req.add_header(name, value)
        if method in ("POST", "PUT", "PATCH") and not self.headers.get("Content-Type"):
            req.add_header("Content-Type", "application/json")
        req.add_header("User-Agent", "TTSStudioLocal/2.0")

        log(f"  → 代理 {method} {upstream}")

        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                data = resp.read()
                ctype = resp.headers.get("Content-Type") or "application/octet-stream"
                self._send_body(resp.status, data, ctype)
        except urllib.error.HTTPError as e:
            data = e.read() if e.fp else b""
            ctype = (e.headers.get("Content-Type") if e.headers else None) or "application/json"
            self._send_body(e.code, data, ctype)
        except (socket.timeout, TimeoutError):
            self._send_json(504, {"message": "上游请求超时（180 秒）。"})
        except urllib.error.URLError as e:
            self._send_json(502, {"message": f"代理无法连接 Fish Audio：{e.reason}"})
        except Exception as e:
            self._send_json(502, {"message": f"代理内部错误：{e}"})

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        self._proxy_request("POST")

    def do_GET(self):
        self._handle_get_or_head()

    def do_HEAD(self):
        self._handle_get_or_head()

    def _handle_get_or_head(self):
        parts = urlsplit(self.path)
        raw_path = unquote(parts.path)

        # 本地密钥读取端点（仅本地 .local-keys.json，无文件时返回空 JSON 避免 404）
        if raw_path == "/api/local-keys":
            if os.path.isfile(LOCAL_KEYS_FILE):
                try:
                    with open(LOCAL_KEYS_FILE, "r", encoding="utf-8") as f:
                        self._send_json(200, json.load(f))
                        return
                except Exception:
                    pass
            self._send_json(200, {"gemini": [], "fish": []})
            return

        # 代理 GET 请求（如 /model、/model/{id}）
        if self._resolve_upstream(raw_path, parts.query):
            self._proxy_request("GET")
            return

        # 同 URL User-Agent 动态分发（/ 或 /index.html）
        if raw_path in ("", "/", "/index.html"):
            device, set_cookie = self._detect_device(parts.query)
            bundle_html = os.path.join(SERVE_ROOT, device, "index.html")
            if os.path.isfile(bundle_html):
                with open(bundle_html, "rb") as f:
                    text = f.read().decode("utf-8", errors="replace")
                text = text.replace('"../assets/', '"./assets/').replace("'../assets/", "'./assets/")
                text = text.replace("<html ", '<html data-local-server="1" ', 1)
                extra = [("Vary", "User-Agent, Cookie"), ("X-TTS-Served-Bundle", device)]
                if set_cookie:
                    extra.append(("Set-Cookie", set_cookie))
                self._send_body(200, text.encode("utf-8"), "text/html; charset=utf-8", extra)
                return

        self._serve_static(raw_path)

    def _serve_static(self, rel):
        if rel in ("", "/"):
            rel = "/index.html"
        target = os.path.normpath(os.path.join(SERVE_ROOT, rel.lstrip("/\\")))
        if not (target == SERVE_ROOT or target.startswith(SERVE_ROOT + os.sep)):
            self._send_json(403, {"message": "禁止访问该路径"})
            return
        if os.path.isdir(target):
            target = os.path.join(target, "index.html")
        if not os.path.isfile(target):
            self._send_json(404, {"message": "文件不存在", "path": rel})
            return
        ext = os.path.splitext(target)[1].lower()
        if ext in DENY_EXT:
            self._send_json(403, {"message": "禁止访问该文件类型", "path": rel})
            return
        ctype = MIME_TYPES.get(ext, "application/octet-stream")
        with open(target, "rb") as f:
            data = f.read()
        if ext == ".html":
            txt = data.decode("utf-8", errors="replace").replace("<html ", '<html data-local-server="1" ', 1)
            data = txt.encode("utf-8")
        self._send_body(200, data, ctype)


def main():
    if not os.path.isdir(DIST_DIR):
        log("  [提示] 尚未检测到 dist 构建目录，请先运行 npm run build。")
    try:
        httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError as e:
        log(f"  [启动失败] 端口 {PORT} 无法监听：{e}")
        return 1
    httpd.daemon_threads = True
    log(f"  TTS Studio 本地服务已启动：{LOCAL_URL}  (静态目录：{SERVE_ROOT})")
    threading.Timer(0.5, lambda: webbrowser.open(LOCAL_URL)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        log("  服务已停止。")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
