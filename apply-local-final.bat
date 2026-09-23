@echo off
setlocal
cd /d %~dp0
call cleanup-obsolete.bat
call verify-p0.bat
if errorlevel 1 exit /b 1
echo.
echo Local UI final overlay is ready.
