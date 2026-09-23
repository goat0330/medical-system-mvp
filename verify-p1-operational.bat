@echo off
setlocal
cd /d %~dp0
node --test tests\p1-real-flow.test.mjs tests\p1-operational.test.mjs
if errorlevel 1 exit /b %errorlevel%
echo.
echo PASS: official DRG/DIP 3.0 + operational workflow verified.
