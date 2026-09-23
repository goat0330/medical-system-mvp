@echo off
setlocal
cd /d %~dp0
node tests\p1-real-flow.test.mjs
if errorlevel 1 exit /b 1
echo.
echo P1 official DRG/DIP 3.0 verification PASS.
