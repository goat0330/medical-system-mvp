@echo off
setlocal
cd /d %~dp0
call cleanup-obsolete.bat >nul
node scripts\ensure-hmeditor.mjs
if errorlevel 1 (
  echo Failed to prepare the local structured medical-record editor.
  pause
  exit /b 1
)
node server.mjs 8765
pause
