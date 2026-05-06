# Take Me There Native NDI Helper

This helper publishes fixed off-screen Electron NDI source surfaces as NDI senders. It is a separate process so the Electron app does not need native modules.

## Build

Install the NDI SDK, then from this directory:

```powershell
$env:NDI_SDK_DIR="C:\Program Files\NDI\NDI 6 SDK"
cmake -S . -B build -A x64
cmake --build build --config Release
```

Expected app path:

```text
native/ndi-helper/bin/Release/takemethere-ndi-helper.exe
```

Either copy that executable to:

```text
native/ndi-helper/bin/takemethere-ndi-helper.exe
```

or point the app to it:

```powershell
$env:NDI_HELPER_PATH="D:\Projects-Bildspur\Take me there\native\ndi-helper\bin\Release\takemethere-ndi-helper.exe"
```

## Runtime Contract

The Electron app launches the helper like this:

```text
takemethere-ndi-helper.exe --window TakeMeThere_LEFT --sender TakeMeThere_LEFT --window TakeMeThere_FRONT --sender TakeMeThere_FRONT
```

Each pair creates one NDI stream. The app now creates these source surfaces off-screen at fixed resolution, so the operator watches the in-app monitor previews instead of separate output windows.

## Notes

The first implementation uses Win32 window capture as the practical Windows baseline. The public process contract is the same if we later swap the capture backend to direct frame ingestion or Windows Graphics Capture.
