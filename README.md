# Take Me There Prototype

Internal prototype for a 3-wall AI portal installation.

The app opens two windows:

- **Operator**: prompt entry, microphone capture, state controls, latency/cost display.
- **Projection Output**: a clean multi-view canvas for MadMapper slicing.

Prototype 1 uses a generated still image plus subtle procedural Three.js motion. If no API key is configured, it runs with local recipe generation and fallback visuals.

## Setup

```bash
npm install
npm run dev
```

On Windows PowerShell with script execution disabled, use:

```powershell
npm.cmd install
npm.cmd run dev:windows
```

`dev:windows` keeps Electron's app-data cache inside the project folder, which helps on locked-down machines.

## Cloud Image Generation

Set a Gemini API key before starting the app:

```bash
export GEMINI_API_KEY="your-key"
```

PowerShell:

```powershell
$env:GEMINI_API_KEY="your-key"
npm.cmd run dev
```

Without `GEMINI_API_KEY`, the app uses local fallback recipes and generated SVG world textures.

The app loads local files directly in Electron, so it does not require a Vite/dev server during installation tests.

Optional OpenAI image test:

```bash
export IMAGE_PROVIDER="openai"
export OPENAI_API_KEY="your-key"
```

See `docs/PROJECTOR_SETUP.md` and `docs/OPERATOR_RUNBOOK.md` for the room workflow.

## MadMapper Output

Default mode is **3-wall**:

```text
Left | Front | Right
```

Ceiling mode is available from the operator dashboard:

```text
Left | Front | Right | Ceiling
```

Route the projection output window to the extended display, then slice each section in MadMapper.

## Controls

- Start session
- Enter prompt manually
- Use microphone where supported by the browser runtime
- Generate / regenerate world
- Skip to fallback world
- Trigger arrival
- End session
- Blackout
- Reset

## Prototype Defaults

- 60 second generation timeout
- Still image + procedural motion
- Curated synthesized ambient audio categories
- Cabled projector baseline
- Wireless projector testing is optional and outside success criteria
