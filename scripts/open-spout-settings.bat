@echo off
setlocal

set "ROOT=%~dp0.."
set "SPOUT_SETTINGS=%ROOT%\tools\Spout2\SPOUT-2007\SETTINGS\SpoutSettings.exe"

if not exist "%SPOUT_SETTINGS%" (
  echo SpoutSettings was not found at:
  echo %SPOUT_SETTINGS%
  echo.
  echo Run the Spout setup/download step first.
  pause
  exit /b 1
)

start "Spout Settings" "%SPOUT_SETTINGS%"
endlocal
