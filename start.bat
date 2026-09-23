@echo off
setlocal
cd /d %~dp0
call cleanup-obsolete.bat >nul
node server.mjs 8765
pause
