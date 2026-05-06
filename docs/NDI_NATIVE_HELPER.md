# Native NDI Helper Contract

Phase 1 adds an app interface for NDI plus a companion native Windows helper source tree. This avoids shipping Electron native modules and keeps the renderer stable.

## Windows Helper

Expected binary:

```text
native/ndi-helper/bin/takemethere-ndi-helper.exe
```

Override path:

```powershell
$env:NDI_HELPER_PATH="D:\path\to\takemethere-ndi-helper.exe"
```

Build commands are available from the repo root:

```powershell
$env:NDI_SDK_DIR="C:\Program Files\NDI\NDI 6 SDK"
npm.cmd run ndi:configure
npm.cmd run ndi:build
```

The app launches the helper with repeated window/sender pairs. These windows are fixed-size off-screen NDI source surfaces, not visible operator output windows:

```text
takemethere-ndi-helper.exe --window TakeMeThere_LEFT --sender TakeMeThere_LEFT --window TakeMeThere_FRONT --sender TakeMeThere_FRONT --window TakeMeThere_RIGHT --sender TakeMeThere_RIGHT
```

Only final projector camera feeds are published over NDI. Depth, foreground, atmosphere, and masks remain layer controls/previews inside the app unless we explicitly add a performance/effects layer later.

## Implementation

- Source lives in `native/ndi-helper`.
- The current Windows helper captures named fixed off-screen Electron NDI source surfaces with Win32 window capture and publishes them as NDI senders.
- The process contract is intentionally compatible with a later direct frame-ingestion or Windows Graphics Capture backend.
- Publish one NDI stream per sender name through the NDI SDK.
- Report process failure through exit code and stderr/logs.
- Do not perform mapping, warping, cropping, or color correction. MadMapper owns those.

## Current App Behavior

Setup Mode is NDI-first. The app starts NDI by default, creates one fixed-resolution source per virtual projector camera, and shows monitor previews inside the cockpit. If the helper binary is missing, the app reports the exact missing path while the cockpit previews continue to work.

## Future macOS

Use the same process contract and feed names. The macOS helper should capture windows with ScreenCaptureKit and publish through the NDI SDK.
