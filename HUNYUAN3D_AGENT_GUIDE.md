# Hunyuan3D Image-to-3D API — Agent Guide

Turn **one image** into **one textured 3D model** (`.glb`, PBR materials).
The service runs Tencent Hunyuan3D-2.1 on 2 GPUs behind a shared FIFO queue.

## Configuration

Fill these two values in before use:

```bash
HY3D_API="https://litellm.zingplay.com/zps/hunyuan3d"   # base URL (through LiteLLM)
HY3D_KEY="sk-Am-SsMfek5PRvCSiZI_A4w"                                        # shared key
```

Every request, including the GLB download, must carry this header:

```
Authorization: Bearer $HY3D_KEY
```

## At a glance

| | |
|---|---|
| Input | 1 image: PNG, JPEG or WEBP, ≤ 20 MB, ideally 1024×1024 |
| Output | `.glb`: one mesh, ~40,000 triangles, base color + metallic/roughness textures (2048 px), no normal map, no skeleton |
| Time | ~60–70 s per job once it starts; 2 jobs run in parallel, the rest wait in line |
| Retention | Results are deleted after **24 hours**. Download them right away |

## Workflow

1. `POST /send` → you get a `uid`
2. `GET /status/{uid}` every 5 s until `status` is `completed` or `error`
3. `GET result_url` → save the bytes as `.glb`
4. (Optional) preview it in the browser, see [Preview the result](#preview-the-result-html)

Always use `/send` + `/status`. Do **not** use `/generate` (it holds one HTTP request open for minutes and will hit proxy timeouts).

## Endpoints

### `POST /send`

```json
{
  "image": "<base64 PNG/JPEG/WEBP, a data:image/...;base64, prefix is also accepted>"
}
```

| Field | Required | Notes |
|---|---|---|
| `image` | one of `image` / `image_url` | Base64 image |
| `image_url` | one of `image` / `image_url` | Public URL the server can download (no auth, no localhost) |
| `seed` | no | Default `1234`. Change it to get a different variation of the same image |
| `remove_background` | no | Default `true`. Skipped automatically when the PNG already has a transparent background |
| `texture` | no | Accepted, but the server currently **always** textures |

Other Hunyuan parameters (`num_inference_steps`, `octree_resolution`, `face_count`, ...) are currently ignored by the server. Do not send them.

Response:

```json
{
  "uid": "3f9c0d...",
  "status": "queued",
  "position": 1,
  "estimated_wait_seconds": 65,
  "status_url": "https://litellm.zingplay.com/zps/hunyuan3d/status/3f9c0d..."
}
```

### `GET /status/{uid}`

`status` moves through `queued` → `processing` → `completed`, or ends in `error`.

```json
{ "uid": "3f9c0d...", "status": "queued", "position": 3, "estimated_wait_seconds": 130 }
{ "uid": "3f9c0d...", "status": "processing", "backend": "gpu-1", "run_seconds": 21.4 }
{ "uid": "3f9c0d...", "status": "completed", "run_seconds": 63.0,
  "result_url": "https://litellm.zingplay.com/zps/hunyuan3d/result/3f9c0d....glb" }
{ "uid": "3f9c0d...", "status": "error", "message": "backend HTTP 404: ..." }
```

Do not add `?base64=true`. It inlines the whole GLB (~5 MB) into the JSON and floods your context.

### `GET /result/{uid}.glb`

Binary GLB. Send the Bearer header here too.

### `GET /health`

Shows whether the GPUs are up and how long the queue is. Useful before submitting a batch.

### Errors

| Code | Meaning | What to do |
|---|---|---|
| 400 | Bad image (not base64, not PNG/JPEG/WEBP, `image_url` unreachable) | Fix the input |
| 401 / 403 | Missing or wrong key | Check `HY3D_KEY` and the `Authorization` header |
| 404 on `/status` | Unknown or expired `uid` (results live 24 h) | Submit again |
| 413 | Image larger than 20 MB | Downscale to 1024×1024 |
| 429 | Queue is full (100 jobs) | Wait 60 s and retry |
| `status: "error"` | Generation failed on the GPU | Retry once with a different `seed`; if it fails again, improve the image (see below) |

## Code

### curl

```bash
IMG_B64=$(base64 -w0 input.png)
JOB=$(curl -s -X POST "$HY3D_API/send" \
  -H "Authorization: Bearer $HY3D_KEY" -H "Content-Type: application/json" \
  -d "{\"image\":\"$IMG_B64\",\"seed\":42}" | jq -r .uid)

while :; do
  S=$(curl -s "$HY3D_API/status/$JOB" -H "Authorization: Bearer $HY3D_KEY")
  ST=$(echo "$S" | jq -r .status); echo "$ST"
  [ "$ST" = completed ] && break
  [ "$ST" = error ] && { echo "$S"; exit 1; }
  sleep 5
done

curl -s -o model.glb "$(echo "$S" | jq -r .result_url)" -H "Authorization: Bearer $HY3D_KEY"
```

### Python (standard library only)

```python
import base64, json, os, time, urllib.request

API = os.environ["HY3D_API"].rstrip("/")
HDR = {"Authorization": f"Bearer {os.environ['HY3D_KEY']}"}

def _req(url, body=None):
    headers = {**HDR, **({"Content-Type": "application/json"} if body else {})}
    data = json.dumps(body).encode() if body else None
    return urllib.request.urlopen(urllib.request.Request(url, data, headers), timeout=120).read()

def image_to_3d(image_path: str, out_path: str, seed: int = 42, timeout_s: int = 1800) -> str:
    img = base64.b64encode(open(image_path, "rb").read()).decode()
    uid = json.loads(_req(f"{API}/send", {"image": img, "seed": seed}))["uid"]
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        s = json.loads(_req(f"{API}/status/{uid}"))
        if s["status"] == "completed":
            open(out_path, "wb").write(_req(s["result_url"]))
            return out_path
        if s["status"] == "error":
            raise RuntimeError(s.get("message"))
        time.sleep(5)
    raise TimeoutError(f"job {uid} not finished after {timeout_s}s")
```

## Preview the result (HTML)

To show the user the model, put this `preview.html` next to the downloaded `model.glb`. It uses Google's `<model-viewer>`, so no build step is needed.

```html
<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>3D Preview</title>
<script type="module" src="https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js"></script>
<style>html,body{margin:0;height:100%;background:#2b2d31;font-family:system-ui,sans-serif;color:#ddd}
model-viewer{width:100%;height:100%}
.info{position:fixed;left:16px;bottom:16px;font-size:13px;opacity:.8}</style></head>
<body><model-viewer src="model.glb" camera-controls auto-rotate shadow-intensity="1" exposure="1.1" environment-image="neutral" touch-action="pan-y"></model-viewer>
<div class="info">Drag to rotate · scroll to zoom · right-drag to pan</div></body></html>
```

Serve the folder over HTTP. Opening the file directly via `file://` does not work, because the browser blocks loading the GLB:

```bash
python -m http.server 8765
# then open http://localhost:8765/preview.html
```

- Change `src` to match the GLB filename.
- Never inline the GLB as base64 in the HTML; reference the file.
- To check the result, take a screenshot after ~3 s (the model needs time to load) and compare it with the input image. The back side is guessed by the model, so look at it too.

## Input image tips

The model sees only this one image and shrinks it to 512×512, so keep it simple:

- One object, centered, fully in frame with margin; square, ~1024×1024.
- Front three-quarter view for props and static characters; straight front view for symmetric objects.
- Plain solid medium-gray or transparent background; no floor, shadow or props. Avoid a light subject on a white background.
- Soft even lighting, stylized 3D-render look, bold shapes. Thin parts, glass, fur and small text come out poorly.

## Characters meant for animation

The output has no skeleton and must be auto-rigged afterwards, which only works from a clean pose: straight front view, A-pose with arms and legs clearly apart from the body, open empty hands, short or tied hair, no capes or loose robes.

## Rules for agents

- Use `/send` + `/status`, never `/generate`; poll every 5 s, give up after 30 min.
- Download the GLB as soon as it is `completed`; results expire after 24 h.
- Never paste GLB bytes or base64 into the conversation; pass the file path or `result_url`.
- When the user wants to see the model, give them the preview page from [Preview the result](#preview-the-result-html), served over HTTP.
- If a result looks bad, fix the input image rather than resubmitting the same one.
