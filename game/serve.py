"""Dev server cho mockup: phục vụ thư mục D:/Claude/Chess, tắt cache để sửa code là thấy ngay.

Chạy:  py -3 game/serve.py [port]   rồi mở http://localhost:8780/game/
"""
import functools
import http.server
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent  # cần cả game/ và oldman/


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8780
    handler = functools.partial(NoCacheHandler, directory=str(ROOT))
    print(f"Serving {ROOT} at http://localhost:{port}/game/")
    http.server.ThreadingHTTPServer(("", port), handler).serve_forever()
