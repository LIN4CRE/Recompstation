@echo off
title RecompStation - Game Preservation Engine
echo ============================================================
echo  Starting RecompStation (WebAssembly & Binary Engine)
echo ============================================================
echo.
if exist "electron\main.cjs" (
  where npx >nul 2>nul
  if %errorlevel% equ 0 (
    echo [OK] Launching hardware-accelerated desktop client...
    call npx --yes electron electron\main.cjs
    goto end
  )
)

echo [OK] Launching in default web browser...
start "" "%~dp0app\index.html"

:end
