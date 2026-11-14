"""Локальний сервер для розробки Earth Jukebox.

Відрізняється від `python -m http.server` двома речами:
  * підтримує HTTP Range — браузер може перемотувати відео;
  * вимикає кеш (Cache-Control: no-store) — після правок не треба чистити кеш.

Запуск із кореня проєкту:  python tools/serve.py [порт]
"""
import http.server
import os
import re
import sys


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
        ".webm": "video/webm", ".mp4": "video/mp4", ".wasm": "application/wasm",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def send_head(self):
        rng = self.headers.get("Range")
        path = self.translate_path(self.path)
        if not rng or not os.path.isfile(path):
            return super().send_head()
        m = re.match(r"bytes=(\d*)-(\d*)", rng)
        size = os.path.getsize(path)
        if not m:
            return super().send_head()
        start = int(m.group(1)) if m.group(1) else max(0, size - int(m.group(2) or 0))
        end = int(m.group(2)) if m.group(1) and m.group(2) else size - 1
        end = min(end, size - 1)
        if start > end:
            self.send_error(416)
            return None
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        self._range_left = end - start + 1
        return f

    def do_POST(self):
        """Лише для tools/precompute.html: зберегти готовий аналіз у samples/<id>.analysis.json."""
        m = re.fullmatch(r"/__save/samples/([\w.-]+\.analysis\.json)", self.path)
        if not m:
            self.send_error(403, "only samples/*.analysis.json")
            return
        length = int(self.headers.get("Content-Length", 0))
        if length > 20 * 1024 * 1024:
            self.send_error(413)
            return
        data = self.rfile.read(length)
        target = os.path.join(os.getcwd(), "samples", m.group(1))
        with open(target, "wb") as f:
            f.write(data)
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(f"saved {len(data)} bytes".encode())

    def copyfile(self, source, outputfile):
        left = getattr(self, "_range_left", None)
        if left is None:
            return super().copyfile(source, outputfile)
        try:
            while left > 0:
                chunk = source.read(min(64 * 1024, left))
                if not chunk:
                    break
                outputfile.write(chunk)
                left -= len(chunk)
        except (ConnectionResetError, BrokenPipeError):
            pass
        finally:
            self._range_left = None


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    print(f"Earth Jukebox: http://localhost:{port}/")
    http.server.ThreadingHTTPServer(("", port), Handler).serve_forever()
