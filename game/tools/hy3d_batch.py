"""Gửi nhiều ảnh lên Hunyuan3D (/send + /status), tải GLB về.

py -3 hy3d_batch.py <out_dir> <img1> [img2 ...]
API và key đọc từ HUNYUAN3D_AGENT_GUIDE.md ở thư mục gốc dự án (hoặc biến môi trường HY3D_API / HY3D_KEY).
"""
import base64, json, os, re, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
guide = open(os.path.join(ROOT, "HUNYUAN3D_AGENT_GUIDE.md"), encoding="utf-8").read()
API = os.environ.get("HY3D_API") or re.search(r'HY3D_API="([^"]+)"', guide).group(1)
KEY = os.environ.get("HY3D_KEY") or re.search(r'HY3D_KEY="([^"]+)"', guide).group(1)
HDR = {"Authorization": f"Bearer {KEY}"}


def req(url, body=None):
    h = {**HDR, **({"Content-Type": "application/json"} if body else {})}
    data = json.dumps(body).encode() if body else None
    return urllib.request.urlopen(urllib.request.Request(url, data, h), timeout=120).read()


def job(img, out_dir, seed=42):
    name = os.path.splitext(os.path.basename(img))[0]
    b64 = base64.b64encode(open(img, "rb").read()).decode()
    for attempt in range(2):
        uid = json.loads(req(f"{API}/send", {"image": b64, "seed": seed + attempt}))["uid"]
        print(name, "queued", uid, flush=True)
        t0 = time.time()
        while time.time() - t0 < 1800:
            s = json.loads(req(f"{API}/status/{uid}"))
            if s["status"] == "completed":
                path = os.path.join(out_dir, name + ".glb")
                open(path, "wb").write(req(s["result_url"]))
                print(name, "done", round(time.time() - t0), "s", os.path.getsize(path), "bytes", flush=True)
                return path
            if s["status"] == "error":
                print(name, "error", s.get("message"), flush=True)
                break
            time.sleep(5)
    return None


if __name__ == "__main__":
    out_dir, imgs = sys.argv[1], sys.argv[2:]
    os.makedirs(out_dir, exist_ok=True)
    print(json.loads(req(f"{API}/health")), flush=True)
    with ThreadPoolExecutor(len(imgs)) as ex:
        res = list(ex.map(lambda p: job(p, out_dir), imgs))
    print("RESULT", res)
