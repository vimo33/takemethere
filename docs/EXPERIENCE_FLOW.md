# Take Me There Experience Flow

This document describes how the prototype works now, what the visitor and operator experience, what the AI does, and what changes with the new soft warp and depth implementation.

## Current Experience

The visitor tells the system where they want to go. The operator can type the prompt or use the microphone button when browser speech recognition is available. When the operator starts generation, the projection output now moves into a soft real-time warp field so the room immediately feels like it is travelling while the cloud generation happens.

The system expands the visitor's phrase into a world recipe, then generates one coherent panoramic image. That image is sent to the projection output window and rendered across left, front, and right views using Three.js virtual cameras. The app does not generate three unrelated wall images; it uses one source world and derives the wall views from it.

After the image is ready, the app enters the reveal sequence:

- `PORTAL_OPENING`: first world reveal.
- `ARRIVAL`: about 3.5 seconds after the world image arrives.
- `WORLD_ACTIVE`: about 7 seconds after the world image arrives.

## What The AI Does

Prompt expansion uses Gemini by default. The current prompt tells the AI to preserve literal visitor details, avoid unsafe content, avoid recognizable real people and copyrighted characters, and return structured JSON. The JSON includes a title, visitor input, visual prompt, negative prompt, mood, color palette, motion style, sound style, lighting style, and safety level.

Image generation uses the world recipe. The image prompt asks for an eye-level panoramic scene with strong foreground, midground, and background depth. It asks for atmospheric particles, dramatic light, visible texture, projection-friendly composition, no people, no text, and no logos.

## Tech Stack

- Electron desktop app with two windows: operator dashboard and projection output.
- Three.js for the projection output, soft warp loading scene, flat world renderer, and depth renderer.
- Gemini prompt expansion, default `gemini-3-flash-preview`.
- Imagen image generation, default `imagen-4.0-generate-001`.
- Optional OpenAI image generation path through `IMAGE_PROVIDER=openai`.
- Local SVG fallback when cloud generation fails.
- Local depth helper process after image generation.

Current model choices are intentionally configurable in `.env`. The recommended Google setup is `gemini-3-flash-preview` for world-recipe expansion and `imagen-4.0-generate-001` for the final projected still image. Google currently lists Gemini 3 Flash Preview as its speed/scale frontier text model and Imagen 4 as the high-fidelity image generation family, with Fast, Standard, and Ultra variants. The optional OpenAI image path uses `gpt-image-2` by default, with `gpt-image-1.5` available as a fallback if access or latency is better for the account.

## Timing And Costs

These are practical estimates. Exact timings vary by network, API queue, GPU setup, and image model behavior.

| Step | Typical time | Timeout | Cost |
| --- | ---: | ---: | ---: |
| Visitor speaks/types | 10-30s human time | none | $0 |
| Speech recognition | near real time | browser dependent | $0 |
| Soft warp loader | starts in <1s | none | $0 |
| Prompt expansion | ~1-5s | 15s | usually under $0.01 |
| Imagen 4 Standard image | ~10-45s | 60s | about $0.04 |
| First visible generated world | ~15-60s total | image timeout dependent | image cost only |
| Local depth, GTX 1080 Ti-class GPU | ~2-20s after image | 45s default | $0 |
| Local depth, CPU fallback | ~20-60s | 45s default | $0 |
| Three.js render update | usually <1s | none | $0 |

The visitor no longer waits on a blank or static screen. They see the warp field immediately, then the flat world image appears as soon as the image is ready. Depth generation continues locally and upgrades the view when ready.

## New Soft Warp Loader

The warp loader is local and real time. It is not a pre-rendered video. It appears during:

- `LISTENING`: quiet particles drifting inward.
- `UNDERSTANDING`: subtle forward pull and low-speed streaks.
- `GENERATING`: stronger tunnel depth, still soft and gentle.

The effect is intentionally slower and softer than a hard sci-fi warp jump. It is part of the experience: the visitor should feel they are being transported while the AI is building the world.

## New Depth Implementation

The depth implementation is additive. It does not replace the current renderer.

The new flow is:

1. Generate one world image.
2. Save the image into a timestamped folder under `generated-worlds/`.
3. Start a local depth helper process.
4. Save `depth.png` next to `image.png`.
5. Send the depth map back to the projection output.
6. Let the operator compare `Flat`, `Depth`, or `Auto`.

`Auto` means the app shows the flat image first, then switches to depth when depth is ready. If depth fails, the flat world stays live.

The first built-in helper creates a local procedural depth map so the pipeline works immediately. For higher quality, replace it with a Depth Anything V2 helper by setting `DEPTH_HELPER_COMMAND`. The app passes the input image path and output depth path as arguments.

Useful environment settings:

```powershell
$env:DEPTH_GPU="1"
$env:DEPTH_TIMEOUT_MS="45000"
$env:DEPTH_HELPER_COMMAND="python scripts/depth_anything_helper.py"
```

The intended hardware setup is to keep Electron/projector rendering on GPU 0 and run depth inference on GPU 1 via `CUDA_VISIBLE_DEVICES=1`. With two 11GB GTX 1080-class GPUs and 64GB RAM, local depth estimation is realistic. Modern AI video or world models are still too heavy for this machine as a live local path.

## Failure Modes

- Missing API key: use local fallback recipe/image.
- Prompt expansion timeout or invalid JSON: use fallback recipe.
- Image generation timeout, API error, or safety rejection: show SVG fallback world.
- Network/firewall blocks to `generativelanguage.googleapis.com:443` or `api.openai.com:443`: show local fallback and report a connectivity error in the operator panel.
- Depth helper missing: mark depth as failed/skipped and keep flat world.
- Depth helper timeout: keep flat world and show depth error in the operator dashboard.
- Bad depth map: operator can switch back to `Flat`.
- GPU 1 unavailable: use GPU 0 or CPU fallback, but prioritize projection frame stability.
- Renderer frame drops during warp: reduce particle count before reducing world quality.

## Where We Are Now

The current prototype has become a three-part experience:

1. A local soft warp loading scene while the AI works.
2. A generated panoramic world rendered across projector views.
3. A local depth upgrade path that can enhance the same image after it appears.

The immediate next creative test is to compare the same prompt in `Flat`, `Auto`, and `Depth` modes inside the room and decide whether the depth illusion meaningfully improves the feeling of being inside the world.
