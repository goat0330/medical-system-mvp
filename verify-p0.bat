@echo off
setlocal
node tests/local-editor.test.mjs || exit /b 1
node tests/no-remote-runtime.test.mjs || exit /b 1
node tests/design-contract.test.mjs || exit /b 1
node tests/ui-runtime.test.mjs || exit /b 1
node tests/settlement.test.mjs || exit /b 1
node tests/integration.test.mjs || exit /b 1
echo All local UI P0 checks passed.
