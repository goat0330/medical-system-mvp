@echo off
setlocal
cd /d %~dp0
node --test tests\clinical-facts.test.mjs tests\p1-input-integrity.test.mjs tests\full-chain-quality.test.mjs
if errorlevel 1 exit /b %errorlevel%
if exist tests\p1-operational.test.mjs node --test tests\p1-operational.test.mjs
if errorlevel 1 exit /b %errorlevel%
if exist tests\p1-real-flow.test.mjs node --test tests\p1-real-flow.test.mjs
if errorlevel 1 exit /b %errorlevel%
echo.
echo PASS: patient facts + screenshot integrity + six-domain full-chain QC verified.
