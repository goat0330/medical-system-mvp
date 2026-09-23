@echo off
setlocal
cd /d %~dp0
python scripts\compile-official-rulepacks.py
if errorlevel 1 exit /b 1
node tests\p1-real-flow.test.mjs
