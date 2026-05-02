# Take Me There Prototype

Internal prototype for a 3-wall AI portal installation.

The app opens an Operator window plus three clean projector frame windows (`TakeMeThere_LEFT`, `TakeMeThere_FRONT`, `TakeMeThere_RIGHT`) that MadMapper picks up via Spout.

Prototype 1 uses a generated still image plus subtle procedural Three.js motion. Without an API key it runs on local recipe generation and fallback visuals.

## Requirements

- Windows 10/11 (Spout pipeline is Windows-only — see `docs/SPOUT_MADMAPPER_SETUP.md`)
- Node.js 18+ and npm
- MadMapper (on the same Windows machine for Spout)
- Optional: Gemini API key for cloud image generation

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
| `npm run dev` | Start the Electron app (Operator + three frame windows). |
| `npm run dev:windows` | Same as `dev`, but pins Electron's cache to `./.local-appdata`. Use on locked-down Windows machines. |
| `npm start` | Alias for `npm run dev`. |
| `npm run check` | Run `scripts/check-config.cjs` to validate environment/config. |
| `npm run spout:settings` | Open SpoutSettings.exe (bundled in `tools/Spout2`). |
| `npm run spout:capture` | Launch three SpoutWinCapture senders that mirror the frame windows into MadMapper. |

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

## Spout → MadMapper

Full setup in `docs/SPOUT_MADMAPPER_SETUP.md`. Short version:

1. `npm run dev` — wait until the three frame windows (`TakeMeThere_LEFT/FRONT/RIGHT`) are visible.
2. `npm run spout:capture` — three `SpoutWinCapture` windows open and republish the frame windows as Spout senders.
3. In MadMapper, add three Spout inputs with those names and assign them to the projector surfaces.

Notes:

- Order matters: the Electron frame windows must exist *before* starting the capture senders.
- Spout shares DirectX textures locally — MadMapper must run on the same Windows machine. For a Mac MadMapper, you'd need an NDI bridge instead.
- If a sender doesn't appear in MadMapper, close and reopen that one capture window after its frame window is visible.

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
