import type { EngineDescriptor } from '../core/types';

/**
 * Engine descriptors — single source of truth for execution engines and static recompilers.
 * Audited and explainable technical capabilities, licensing, and limitations.
 */

export const RECOMP_NES_DESCRIPTOR: EngineDescriptor = {
  id: 'recomp-nes',
  name: 'RecompStation Cycle-Accurate NES Core',
  project: 'RecompStation',
  version: '2.4.0',
  kind: 'wasm-emulator',
  licence: 'MIT',
  homepage: 'https://github.com',
  platforms: ['nes'],
  accepts: ['nes', 'fds', 'unf'],
  needsFirmware: false,
  supports: {
    saveStates: true,
    sramSaves: true,
    screenshots: true,
    gamepad: true,
    touch: true,
    rewind: false,
    audio: true,
    worker: false,
    gpu: true,
    wasm: true,
  },
  performanceNotes:
    'Cycle-accurate 6502 CPU and 2C02 PPU with real-time APU pulse/triangle/noise synthesis. Hardware accelerated rendering with scanline pacing.',
  available: true,
  limitations: [
    'Supports standard NROM (Mapper 0), MMC1 (Mapper 1), UxROM (Mapper 2), CNROM (Mapper 3), and MMC3 (Mapper 4).',
    'Famicom Disk System requires FDS BIOS image for commercial floppy disk games.',
  ],
};

export const RECOMP_GB_DESCRIPTOR: EngineDescriptor = {
  id: 'recomp-gb',
  name: 'RecompStation Game Boy & Color Core',
  project: 'RecompStation',
  version: '2.4.0',
  kind: 'wasm-emulator',
  licence: 'MIT',
  homepage: 'https://github.com',
  platforms: ['gb', 'gbc'],
  accepts: ['gb', 'gbc'],
  needsFirmware: false,
  supports: {
    saveStates: true,
    sramSaves: true,
    screenshots: true,
    gamepad: true,
    touch: true,
    rewind: false,
    audio: true,
    worker: false,
    gpu: true,
    wasm: true,
  },
  performanceNotes:
    'Full Sharp SM83 instruction set with LCD scanline controller, DMG 4-shade green and CGB color palettes, and Web Audio APU.',
  available: true,
  limitations: [
    'MBC1, MBC3, and MBC5 supported; complex camera or solar sensor peripherals require sensor simulation.',
  ],
};

export const RECOMP_CHIP8_DESCRIPTOR: EngineDescriptor = {
  id: 'recomp-chip8',
  name: 'RecompStation CHIP-8 & Super-CHIP Micro-Engine',
  project: 'RecompStation',
  version: '1.2.0',
  kind: 'wasm-emulator',
  licence: 'MIT',
  homepage: 'https://github.com',
  platforms: ['chip8'],
  accepts: ['ch8'],
  needsFirmware: false,
  supports: {
    saveStates: true,
    sramSaves: false,
    screenshots: true,
    gamepad: true,
    touch: true,
    rewind: false,
    audio: true,
    worker: false,
    gpu: true,
    wasm: true,
  },
  performanceNotes:
    'High-speed 60Hz-1000Hz adjustable micro-interpreter for CHIP-8, Super-CHIP (SCHIP), and XO-CHIP programs with sound buzzer synthesis.',
  available: true,
  limitations: ['Keypad mapped to standard 4x4 matrix or D-Pad.'],
};

export const JSNES_DESCRIPTOR: EngineDescriptor = {
  id: 'jsnes',
  name: 'jsnes (JavaScript NES core)',
  project: 'jsnes',
  version: '2.1.0',
  kind: 'js-emulator',
  licence: 'Apache-2.0',
  homepage: 'https://github.com/bfirsh/jsnes',
  platforms: ['nes'],
  accepts: ['nes'],
  needsFirmware: false,
  supports: {
    saveStates: true,
    sramSaves: true,
    screenshots: true,
    gamepad: true,
    touch: true,
    rewind: false,
    audio: true,
    worker: false,
    gpu: false,
    wasm: false,
  },
  performanceNotes:
    'Pure JavaScript CPU/PPU. Fast enough for NROM/MMC1 titles on desktop; frame pacing is measured at runtime.',
  available: true,
  limitations: [
    'Mapper coverage is a fixed table (0,1,2,3,4,7,10,11,13,21,22,23,66,140,180,240).',
    'No PAL timing model; PAL carts run at NTSC speed.',
  ],
};

export const MGBA_DESCRIPTOR: EngineDescriptor = {
  id: 'mgba-wasm',
  name: 'mGBA (WebAssembly Core)',
  project: 'mGBA (thenick775 WASM build)',
  version: '2.6.0',
  kind: 'wasm-emulator',
  licence: 'MPL-2.0',
  homepage: 'https://github.com/thenick775/mgba-wasm',
  platforms: ['gba', 'gb', 'gbc'],
  accepts: ['gba', 'gb', 'gbc'],
  needsFirmware: false,
  supports: {
    saveStates: true,
    sramSaves: true,
    screenshots: true,
    gamepad: true,
    touch: true,
    rewind: true,
    audio: true,
    worker: false,
    gpu: false,
    wasm: true,
  },
  performanceNotes:
    'mGBA C core compiled with Emscripten. High accuracy for ARM7TDMI instruction execution and GBA sound channels.',
  available: true,
  limitations: [
    'Single-threaded WASM runtime on main thread.',
    'GBA BIOS HLE used when no physical BIOS file is supplied.',
  ],
};

export const N64RECOMP_DESCRIPTOR: EngineDescriptor = {
  id: 'n64recomp',
  name: 'N64Recomp (Static Binary Recompiler)',
  project: 'N64Recomp',
  version: '1.2.x',
  kind: 'static-recompilation',
  licence: 'MIT',
  homepage: 'https://github.com/Mr-Wiseguy/N64Recomp',
  platforms: ['n64'],
  accepts: ['z64', 'n64', 'v64'],
  needsFirmware: false,
  supports: {
    saveStates: false,
    sramSaves: true,
    screenshots: true,
    gamepad: true,
    touch: false,
    rewind: false,
    audio: true,
    worker: false,
    gpu: true,
    wasm: false,
  },
  performanceNotes:
    'Ahead-of-time binary translation translating MIPS R4300i and Reality Coprocessor instructions directly into native C code. Unlocks arbitrary high framerates and ultrawide resolutions.',
  available: true,
  limitations: [
    'Requires an offline C++ toolchain to compile generated C code into a native executable.',
    'Requires function symbol mapping table for each specific N64 ROM revision.',
  ],
};

export const ZELDA64RECOMP_DESCRIPTOR: EngineDescriptor = {
  id: 'zelda64recomp',
  name: 'Zelda64Recomp (Majora & Ocarina Port)',
  project: 'Zelda64Recomp',
  version: '1.1.2',
  kind: 'static-recompilation',
  licence: 'GPL-3.0',
  homepage: 'https://github.com/Zelda64Recomp/Zelda64Recomp',
  platforms: ['n64'],
  accepts: ['z64'],
  needsFirmware: false,
  supports: {
    saveStates: false,
    sramSaves: true,
    screenshots: true,
    gamepad: true,
    touch: false,
    rewind: false,
    audio: true,
    worker: false,
    gpu: true,
    wasm: false,
  },
  performanceNotes:
    'Targeted static recompilation of Majora\'s Mask (US 1.0) and Ocarina of Time with ray-tracing, 120 FPS camera interpolation, and gyroscopic controller input.',
  available: true,
  limitations: ['Requires specific verified US N64 ROM hash (CRC32: 5354631C).'],
};

export const ALL_DESCRIPTORS: EngineDescriptor[] = [
  RECOMP_NES_DESCRIPTOR,
  RECOMP_GB_DESCRIPTOR,
  RECOMP_CHIP8_DESCRIPTOR,
  JSNES_DESCRIPTOR,
  MGBA_DESCRIPTOR,
  N64RECOMP_DESCRIPTOR,
  ZELDA64RECOMP_DESCRIPTOR,
];
