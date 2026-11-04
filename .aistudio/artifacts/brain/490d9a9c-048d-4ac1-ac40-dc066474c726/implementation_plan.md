# Implementation Plan: Merging Recompa into RecompStation

This plan outlines the architecture, file organization, integration phases, and verification steps to merge **Recompa** (`https://github.com/LIN4CRE/Recompa`) into **RecompStation**, preserving the best features of both repositories under a unified, production-grade full-stack platform.

---

## 🎯 Architecture & Merge Objectives

1. **Branding & Presentation**:
   - Primary Title: **RecompStation** with explicit heritage attribution to **Recompa** in the header, footer, `README.md`, and technical documentation.
2. **Binary Processing & Analysis Core**:
   - Merge Recompa's `src/core/detect.ts` (38 KB pure TypeScript format detection, iNES trainer stripping, SMC header removal, Sega SMD de-interleaving, and N64 endianness conversion to `.z64` big-endian).
   - Merge Recompa's `src/core/binary.ts` and `src/core/hash.ts` for canonicalized byte slicing and hash generation.
3. **Offline No-Intro DAT Fingerprint Catalogue**:
   - Copy `public/data/catalogue/` (4+ MB of pre-indexed `size:crc32` lookup tables for NES, SNES, GB, GBC, GBA, N64, Genesis, GG, SMS) to `public/data/catalogue/`.
   - Integrate `catalogue.ts` into our ingestion pipeline for instant $O(1)$ official title, region, and revision resolution.
4. **Deterministic 6-Tier Execution Planner**:
   - Merge `src/core/planner.ts` and `src/engines/descriptors.ts` to rank execution viability:
     1. Verified browser-native recompilation
     2. Compatible static recompilation (N64Recomp, Zelda64Recomp, etc.)
     3. Source port compiled to WebAssembly
     4. Optimized WebAssembly emulator
     5. JavaScript emulator
     6. External toolchain (Ghidra, Rizin, native compilers)
   - Expose this auditable reasoning in both the technical report and the Compatibility Matrix.
5. **Programmatic 6502 Self-Test Cartridge**:
   - Merge `src/core/testrom.ts` (two-pass 6502 assembler generating a verifiable test ROM in code) into the Built-in Test Games suite.
6. **Automated Live Session Verification**:
   - Merge `src/core/verification.ts` to provide a 6-point automated live test (framebuffer test, animation delta, audio callbacks, input injection, FPS stability, and save state roundtrip).
7. **Native Processing Service Integration**:
   - Merge `server/processing-service.mjs` endpoints directly into our Express `server.ts` entry point:
     - `/api/processing/health`: Reports detected local CLI tools (Ghidra, Rizin, REA, N64Recomp).
     - `/api/processing/disassemble`: Executes Rizin or Ghidra headless for native symbol extraction when installed.
     - `/api/processing/n64/plan`: Emits exact N64Recomp CLI commands, symbol maps, and C config files.
   - Retain all existing Gemini AI endpoints (`/api/gemini/chat`, `/api/gemini/image`).
8. **UI & Control Shell Preservation**:
   - Maintain RecompStation's cyber-deck UI, `CommandPalette` (`Cmd/Ctrl + K`), `BatchQueue` multi-ROM ingestion, `PlayerModal` with user-controlled `.crt-overlay` toggle, HTML5 Gamepad API layout presets, and IndexedDB Save States manager.

---

## 📋 Phased Execution Roadmap

### Phase 1: Core Subsystems & Assets Ingestion
- Copy `public/data/catalogue/` JSON files from `/tmp/recompa_repo/public/data/catalogue/` to `/public/data/catalogue/`.
- Adapt and import into `src/core/`:
  - `src/core/binary.ts`: Byte reader and endianness converters.
  - `src/core/detect.ts`: Full format detection, mapper parser, and canonical payload extractor.
  - `src/core/catalogue.ts`: No-Intro DAT lookup engine.
  - `src/core/planner.ts`: 6-tier execution planning engine.
  - `src/core/platforms.ts`: Platform metadata and firmware/BIOS requirements.
  - `src/core/testrom.ts`: Algorithmic 6502 self-test cartridge.
  - `src/core/verification.ts`: Live session test framework.
- Integrate Recompa's engine descriptors into `src/engines/descriptors.ts`.

### Phase 2: Engine & Ingestion Pipeline Integration
- Update `src/services/romParser.ts`:
  - Run `detectFormat()` to canonicalize bytes (strip headers, de-interleave SMD, convert N64 endianness).
  - Query No-Intro DAT catalogue via `lookupCatalogue()`.
  - Run `planExecution()` to produce deterministic, auditable recompilation recommendations.
- Add the 6502 Self-Test Cartridge to `src/engines/BuiltinRoms.ts` as an instant test cartridge alongside existing homebrews.

### Phase 3: Express Full-Stack Server Expansion (`server.ts`)
- Add processing routes to `server.ts`:
  - `GET /api/processing/health`
  - `POST /api/processing/disassemble`
  - `POST /api/processing/n64/plan`
- Preserve Gemini AI endpoints (`/api/gemini/chat`, `/api/gemini/image`) on port 3000.

### Phase 4: UI & View Merging
- In `UploadView.tsx`: Display No-Intro catalogue match badges, canonicalized facts, and audited execution plan explanations.
- In `PlayerModal.tsx`: Add a "Run Live Verification" action invoking `runVerification()` to execute the 6-point live session test with telemetry.
- In `Header.tsx` & `SettingsView.tsx`: Add attribution credits ("RecompStation • Built with Recompa Core & Technology Audit").

### Phase 5: Build, Package & CI/CD Verification
- Update `README.md` and docs to reflect the merged capabilities.
- Verify `package:win-zip` and GitHub Actions workflows (`deploy.yml`, `build-executable.yml`).
- Run `compile_applet` and `lint_applet` to confirm zero compilation or TypeScript errors.

---

## 🔒 Verification & Safety Standards
- **Zero Regression**: Existing PlayerModal CRT toggles, Gamepad layout mapping, and save state export/import must remain intact.
- **Local-First Sandbox**: Canonicalization, DAT lookups, and emulation execute 100% client-side without sending ROM files over the wire.
- **Port 3000 Compliance**: All full-stack routes run via `server.ts` on port 3000.
