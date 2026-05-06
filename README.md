# Take Me There Prototype

Internal prototype for a 3-wall AI portal installation.

The app opens a Mission Control cockpit. A single layered equirectangular world sphere is viewed by arbitrary virtual projector cameras, and the app publishes final camera feeds as NDI streams such as `TakeMeThere_LEFT`, `TakeMeThere_FRONT`, and `TakeMeThere_RIGHT`. Output monitoring happens inside the cockpit; fixed off-screen NDI source surfaces are used only as a bridge for the current native helper.

Prototype 1 uses a generated still image plus subtle procedural Three.js motion. Without an API key it runs on local recipe generation and fallback visuals.

## Requirements

- Windows 10/11 for the current native NDI helper
- Node.js 18+ and npm
- MadMapper 6.x with NDI input enabled
- Optional: Gemini API key for cloud image generation
- Native NDI helper for projector feeds (see `docs/NDI_NATIVE_HELPER.md`)

## Quick Start

```bash
npm install
npm run dev
```

PowerShell with script-execution policies, or locked-down machines:

```powershell
npm.cmd install
npm.cmd run dev:windows
```

`dev:windows` keeps Electron's app-data cache inside the project folder.

## Available Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Electron Mission Control app. |
| `npm run dev:windows` | Same as `dev`, but pins Electron's cache to `./.local-appdata`. Use on locked-down Windows machines. |
| `npm start` | Alias for `npm run dev`. |
| `npm run check` | Run `scripts/check-config.cjs` to validate environment/config. |
| `npm run spout:settings` | Legacy only: open SpoutSettings.exe. |
| `npm run spout:capture` | Legacy only: launch SpoutWinCapture senders. |
| `npm run ndi:configure` | Configure the native Windows NDI helper build. Requires `NDI_SDK_DIR`. |
| `npm run ndi:build` | Build the native Windows NDI helper after configuration. |

## API Keys (optional)

Cloud image generation uses Gemini by default. Without a key the app uses local fallback recipes and generated SVG world textures.

Bash / macOS / Linux:

```bash
export GEMINI_API_KEY="your-key"
npm run dev
```

Windows PowerShell:

```powershell
$env:GEMINI_API_KEY="your-key"
npm.cmd run dev
```

Optional OpenAI image test:

```bash
export IMAGE_PROVIDER="openai"
export OPENAI_API_KEY="your-key"
```

## NDI to MadMapper

Build or install the native helper, then start the app:

```powershell
$env:NDI_SDK_DIR="C:\Program Files\NDI\NDI 6 SDK"
npm.cmd run ndi:configure
npm.cmd run ndi:build
npm.cmd run dev:windows
```

In MadMapper, add NDI media inputs using the feed names from the Scene tab and assign them to surfaces such as `Quad-1`, `Quad-2`, and `Quad-3`.

Spout documentation remains in `docs/SPOUT_MADMAPPER_SETUP.md` for legacy tests, but NDI is the default path now.

## Setup Mode

Setup Mode is the install screen for alignment and transport checks:

- Output health cards for arbitrary virtual projector cameras.
- Transport is NDI by default.
- Test cards: black, white, RGB, grid, checkerboard, edge frame, crosshair, horizon/seams, and labels.
- Identify buttons to flash left/front/right in the app and through MadMapper surface opacity where available.
- MadMapper OSCQuery discovery at `http://127.0.0.1:8010/?` by default.
- Room presets saved locally under `room-presets/`.
- Room Preview with a layered world sphere, camera positions, FOV cones, seam zones, scan mesh import, and draggable camera markers.
- Optional SAM 2 mask generation hook for foreground layer previews.

MadMapper preset naming and cue recommendations are in `docs/MADMAPPER_6_PRESET_TEMPLATE.md`.

## MadMapper Output Modes

Default is **3-wall**:

```text
Left | Front | Right
```

Ceiling mode is available from the operator dashboard:

```text
Left | Front | Right | Ceiling
```

## Operator Controls

- Start session / End session / Reset
- Enter prompt manually or use microphone (where supported)
- Generate / regenerate world
- Skip to fallback world
- Trigger arrival
- Blackout

See `docs/OPERATOR_RUNBOOK.md` for the full session flow and `docs/PROJECTOR_SETUP.md` for the room workflow.

## Prototype Defaults

- 60 second generation timeout
- Still image + procedural motion
- Curated synthesized ambient audio categories
- Cabled projector baseline
- Wireless projector testing is optional and outside success criteria
