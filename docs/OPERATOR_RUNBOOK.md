# Operator Runbook

## Before Visitors

1. Connect projector outputs.
2. Open MadMapper and load the room preset.
3. Start the app with `npm run dev`.
4. Move the projection output window to the projector display.
5. Trigger fullscreen output from the operator dashboard.
6. Run one fallback world before using cloud generation.

## Session Flow

1. Click **Start session**.
2. Ask: “Where do you want to go?”
3. Type the visitor answer or use microphone capture.
4. Click **Generate world**.
5. Let the portal stay in the generating state until the world appears.
6. Use **Trigger arrival** only if manual timing is needed.
7. Click **End session** when the experience is finished.
8. Click **Reset** before the next visitor.

## Emergency Controls

- **Blackout** cuts projection to black.
- **Reset** returns to idle.
- **Skip to fallback** avoids a stuck API request or weak network.
- If audio fails, continue the session silently.
- If cloud generation fails, the app automatically creates a fallback world.

## API Keys

Gemini default:

```bash
export GEMINI_API_KEY="your-key"
```

Optional OpenAI image test:

```bash
export IMAGE_PROVIDER="openai"
export OPENAI_API_KEY="your-key"
```

PowerShell uses `$env:NAME="value"` instead of `export`.
