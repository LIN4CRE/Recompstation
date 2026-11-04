import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import JSZip from 'jszip';

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');
const releaseDir = path.join(rootDir, 'release');
const portableDir = path.join(releaseDir, 'RecompStation-win-x64');
const zipOutputPath = path.join(releaseDir, 'RecompStation-Windows-x64.zip');

async function main() {
  console.log('⚡ Starting RecompStation Windows Distribution Packaging...');

  // 1. Verify build output exists
  if (!fs.existsSync(distDir)) {
    console.error('❌ Error: dist directory not found. Please run "npm run build" first.');
    process.exit(1);
  }

  // 2. Prepare directories
  fs.rmSync(portableDir, { recursive: true, force: true });
  fs.mkdirSync(portableDir, { recursive: true });

  // 3. Recursive directory copy helper
  function copyRecursive(src, dest) {
    const stats = fs.statSync(src);
    if (stats.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      for (const item of fs.readdirSync(src)) {
        copyRecursive(path.join(src, item), path.join(dest, item));
      }
    } else {
      fs.copyFileSync(src, dest);
    }
  }

  // 4. Copy dist directory
  console.log('📦 Staging production web application assets...');
  copyRecursive(distDir, path.join(portableDir, 'app'));

  // 5. Copy Electron desktop launcher and configuration
  const electronDir = path.join(rootDir, 'electron');
  if (fs.existsSync(electronDir)) {
    fs.mkdirSync(path.join(portableDir, 'electron'), { recursive: true });
    copyRecursive(electronDir, path.join(portableDir, 'electron'));
  }

  // 6. Generate lightweight Windows double-click runner batch scripts
  const launcherBatContent = `@echo off
title RecompStation - Game Preservation Engine
echo ============================================================
echo  Starting RecompStation (WebAssembly & Binary Engine)
echo ============================================================
echo.
if exist "electron\\main.cjs" (
  where npx >nul 2>nul
  if %errorlevel% equ 0 (
    echo [OK] Launching hardware-accelerated desktop client...
    call npx --yes electron electron\\main.cjs
    goto end
  )
)

echo [OK] Launching in default web browser...
start "" "%~dp0app\\index.html"

:end
`;
  fs.writeFileSync(path.join(portableDir, 'Launch-RecompStation.bat'), launcherBatContent, 'utf-8');

  // 7. Generate README for the portable package
  const portableReadme = `# RecompStation - Portable Windows Release
Version: 1.0.0
Architecture: x64 Windows / WebAssembly SIMD

## How to Run
- Double-click 'Launch-RecompStation.bat' to launch the application.
- Or open 'app/index.html' in Chrome, Edge, Brave, or Firefox.

## Features
- 100% Local-First Ingestion: ROM files never leave your machine.
- WebAssembly SIMD hardware acceleration.
- Built-in multi-platform static recompilation recommendation engine.
- Real-time Performance HUD (F3 to toggle).
`;
  fs.writeFileSync(path.join(portableDir, 'README.txt'), portableReadme, 'utf-8');

  // 8. Bundle into zip archive using JSZip
  console.log('🗜️  Compressing into Windows zip archive: ' + zipOutputPath);
  const zip = new JSZip();

  function addFolderToZip(folderPath, zipFolder) {
    const items = fs.readdirSync(folderPath);
    for (const item of items) {
      const fullPath = path.join(folderPath, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        const subZip = zipFolder.folder(item);
        addFolderToZip(fullPath, subZip);
      } else {
        const content = fs.readFileSync(fullPath);
        zipFolder.file(item, content);
      }
    }
  }

  addFolderToZip(portableDir, zip);

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  fs.writeFileSync(zipOutputPath, zipBuffer);

  // 9. Generate cryptographic SHA256 checksum
  const hash = crypto.createHash('sha256').update(zipBuffer).digest('hex');
  const checksumFile = path.join(releaseDir, 'SHA256SUMS.txt');
  fs.appendFileSync(checksumFile, `${hash}  RecompStation-Windows-x64.zip\n`, 'utf-8');

  const zipSizeMB = (zipBuffer.length / (1024 * 1024)).toFixed(2);
  console.log(`✅ Success! Created Windows zip-ready bundle:`);
  console.log(`   📁 Output: release/RecompStation-Windows-x64.zip (${zipSizeMB} MB)`);
  console.log(`   🔒 SHA-256: ${hash}`);
}

main().catch((err) => {
  console.error('Packaging failed:', err);
  process.exit(1);
});
