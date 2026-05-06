# Spout to MadMapper Setup

## Output Model

The app opens three clean projector frame windows:

- `TakeMeThere_LEFT`
- `TakeMeThere_FRONT`
- `TakeMeThere_RIGHT`

Each window renders one projector view from the same generated world. This keeps the walls visually continuous while giving MadMapper one live source per projector.

## Spout Bridge

Electron does not publish Spout senders directly, so use a Windows Spout window-capture bridge for the first test.

Recommended bridge path:

1. Install Spout 2.
2. Use a Spout window-capture sender such as `SpoutWinCapture`.
3. Start one capture sender per Take Me There frame window, or run `scripts/start-spout-captures.bat`.
4. Confirm the senders:
   - `TakeMeThere_LEFT`
   - `TakeMeThere_FRONT`
   - `TakeMeThere_RIGHT`

Keep the three Take Me There frame windows open while MadMapper is receiving them.

Bridge download:

- Spout 2: https://github.com/leadedge/Spout2/releases
- SpoutWinCapture: https://github.com/leadedge/Win32CaptureSample/releases/tag/v2.04

## MadMapper

1. Open MadMapper.
2. Add three Spout inputs:
   - `TakeMeThere_LEFT`
   - `TakeMeThere_FRONT`
   - `TakeMeThere_RIGHT`
3. Assign each input to its matching projector surface.
4. Warp and mask each surface independently.
5. Save the MadMapper project as the room preset.

## Test Order

1. Start Take Me There.
2. Confirm the three frame windows are visible.
3. Start the three Spout capture senders.
4. Confirm the three senders appear in MadMapper.
5. Map left, front, and right.
6. Trigger a fallback world first.
7. Test generated worlds after the mapping is stable.

## Notes

- Spout is local-machine only. MadMapper and Take Me There need to run on the same Windows machine and graphics path.
- If a sender does not appear in MadMapper, restart the capture sender after the matching Take Me There frame window is visible.
- For future projectors, add one additional render window and one additional Spout sender per projector.
- If capture latency or reliability is not good enough, the next step is a native Spout sender module inside the app.
