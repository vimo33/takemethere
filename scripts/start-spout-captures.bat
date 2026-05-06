@echo off
setlocal

set "ROOT=%~dp0.."
set "CAPTURE_DIR=%ROOT%\tools\SpoutWinCapture\SpoutWinCapture"
set "CAPTURE_EXE=%CAPTURE_DIR%\SpoutWinCapture.exe"

if not exist "%CAPTURE_EXE%" (
  echo SpoutWinCapture was not found at:
  echo %CAPTURE_EXE%
  echo.
  echo Run the Spout setup/download step first.
  pause
  exit /b 1
)

pushd "%CAPTURE_DIR%"
start "TakeMeThere_LEFT Spout" "%CAPTURE_EXE%" "TakeMeThere_LEFT"
start "TakeMeThere_FRONT Spout" "%CAPTURE_EXE%" "TakeMeThere_FRONT"
start "TakeMeThere_RIGHT Spout" "%CAPTURE_EXE%" "TakeMeThere_RIGHT"
popd

echo Started Spout capture senders for TakeMeThere_LEFT, TakeMeThere_FRONT, and TakeMeThere_RIGHT.
echo Keep the three Take Me There frame windows open while MadMapper is receiving them.
endlocal
