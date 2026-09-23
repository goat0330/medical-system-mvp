@echo off
setlocal
cd /d "%~dp0.."
powershell.exe -NoLogo -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0configure-deepseek-key.ps1"
echo.
echo When the operation finishes, press any key to close this window.
pause >nul
