@echo off
setlocal
cd /d %~dp0
if exist app\domain\hmeditor.js del /q app\domain\hmeditor.js
if exist vendor\hmeditor rmdir /s /q vendor\hmeditor
if exist product\hmeditor-templates rmdir /s /q product\hmeditor-templates
if exist fallback\hmeditor-templates rmdir /s /q fallback\hmeditor-templates
if exist scripts\vendor-hmeditor.ps1 del /q scripts\vendor-hmeditor.ps1
if exist docs\05-HmEditor质控界面对齐说明.md del /q docs\05-HmEditor质控界面对齐说明.md
if exist tests\hmeditor.test.mjs del /q tests\hmeditor.test.mjs
if exist tests\hm-qc-ui.test.mjs del /q tests\hm-qc-ui.test.mjs
echo Obsolete editor artifacts cleaned.
