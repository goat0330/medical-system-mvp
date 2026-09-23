@echo off
setlocal
cd /d %~dp0
node tests\clinical-facts.test.mjs
if errorlevel 1 exit /b %errorlevel%
if exist tests\p1-operational.test.mjs node tests\p1-operational.test.mjs
if errorlevel 1 exit /b %errorlevel%
if exist tests\p1-real-flow.test.mjs node tests\p1-real-flow.test.mjs
if errorlevel 1 exit /b %errorlevel%
echo.
echo PASS: Patient Fact + Evidence + Conflict + Projection overlay verified.
