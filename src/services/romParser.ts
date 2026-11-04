import JSZip from 'jszip';
import {
  PlatformId,
  RomAnalysisReport,
  ExecutionMethod,
  CompatibilityStatus,
  RomVector,
} from '../types/rom';
import {
  calculateCrc32,
  calculateMd5,
  calculateSha1,
  calculateEntropy,
  extractAsciiStrings,
} from './checksum';
import { lookupGameInCatalog } from './database';
import { detectFormat } from '../core/detect';
import { fingerprint } from '../core/catalogue';

export interface ExtractedFile {
  name: string;
  data: Uint8Array;
}

/**
 * Extracts a file or ZIP archive into individual ROM files
 */
export async function extractRomFiles(file: File | { name: string; data: Uint8Array }): Promise<ExtractedFile[]> {
  const isBrowserFile = file instanceof File;
  const fileName = file.name;
  const buffer = isBrowserFile ? new Uint8Array(await file.arrayBuffer()) : file.data;

  // Check if it's a ZIP archive
  if (
    fileName.toLowerCase().endsWith('.zip') ||
    (buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04)
  ) {
    const zip = new JSZip();
    const contents = await zip.loadAsync(buffer);
    const results: ExtractedFile[] = [];

    const supportedExtensions = ['.nes', '.sfc', '.smc', '.gb', '.gbc', '.gba', '.z64', '.n64', '.v64', '.md', '.gen', '.bin', '.ch8', '.wad', '.iso', '.cue'];

    for (const [relativePath, zipEntry] of Object.entries(contents.files)) {
      if (zipEntry.dir) continue;
      const lower = relativePath.toLowerCase();
      // Ignore __MACOSX and hidden files
      if (lower.includes('__macosx') || lower.startsWith('.')) continue;

      const isRom = supportedExtensions.some((ext) => lower.endsWith(ext));
      if (isRom) {
        const fileData = await zipEntry.async('uint8array');
        results.push({
          name: relativePath.split('/').pop() || relativePath,
          data: fileData,
        });
      }
    }

    if (results.length > 0) {
      return results;
    }
  }

  return [{ name: fileName, data: buffer }];
}

/**
 * Comprehensive parser and binary analyzer for console ROMs
 */
export async function analyzeRom(fileName: string, data: Uint8Array): Promise<RomAnalysisReport> {
  // Recompa core format detection & canonical byte extraction (strips copier headers, de-interleaves SMD, converts N64 endianness)
  const detection = detectFormat(data, fileName);
  const canonicalData = detection.payload.length > 0 ? detection.payload : data;

  const fileSize = canonicalData.length;
  const crc32 = calculateCrc32(canonicalData);
  const [md5, sha1] = await Promise.all([calculateMd5(canonicalData), calculateSha1(canonicalData)]);
  const { overall: entropy, buckets: entropyBuckets } = calculateEntropy(canonicalData);
  const strings = extractAsciiStrings(canonicalData, 4, 25);

  let platform: PlatformId = (detection.platformId as PlatformId) || 'unknown';
  let platformName = detection.format ? detection.format.label : 'Unknown Binary';
  let gameTitle = detection.embeddedTitle || '';
  let identified = false;
  let region = detection.regionHint ? String(detection.regionHint) : 'Unknown';
  let version = '1.0';
  const headerDetails: Record<string, string | number | boolean> = {};
  const vectorTable: RomVector[] = [];
  const missingDependencies: string[] = [];
  const technicalNotes: string[] = [];

  // Populate facts and header fields from Recompa core detection
  for (const fact of detection.facts) {
    headerDetails[fact.label] = fact.value;
  }
  for (const [key, val] of Object.entries(detection.header.fields)) {
    headerDetails[key] = String(val);
  }
  for (const err of detection.errors) {
    technicalNotes.push(`[${err.severity.toUpperCase()}] ${err.message}${err.remedy ? ' (' + err.remedy + ')' : ''}`);
  }

  // No-Intro DAT catalogue lookup
  try {
    const fpResult = await fingerprint({
      platform: detection.platformId,
      size: canonicalData.length,
      crc32,
      sha1,
    });
    if (fpResult.match) {
      gameTitle = fpResult.match.name;
      region = fpResult.match.region || region;
      version = fpResult.match.version || version;
      identified = true;
      headerDetails['No-Intro Title'] = fpResult.match.name;
      headerDetails['Catalogue Region'] = fpResult.match.region;
      headerDetails['Catalogue Source'] = fpResult.match.source;
      if (fpResult.match.matchedOn === 'sha1') {
        headerDetails['Cryptographic Verification'] = 'Matched No-Intro SHA-1 & CRC32';
      }
    }
  } catch (err) {
    // Non-fatal if catalogue lookup is unavailable
  }

  const lowerName = fileName.toLowerCase();
  const fileExt = fileName.includes('.') ? '.' + fileName.split('.').pop()?.toLowerCase() : '';

  // 1. Detect NES (iNES 1.0 & 2.0 header)
  if (data.length >= 16 && data[0] === 0x4e && data[1] === 0x45 && data[2] === 0x53 && data[3] === 0x1a) {
    platform = 'nes';
    platformName = 'Nintendo Entertainment System (Famicom)';
    const prgChunks = data[4];
    const chrChunks = data[5];
    const flag6 = data[6];
    const flag7 = data[7];
    const mapper = (flag7 & 0xf0) | ((flag6 >> 4) & 0x0f);
    const hasBattery = (flag6 & 0x02) !== 0;
    const isNes2 = (flag7 & 0x0c) === 0x08;

    headerDetails['Format'] = isNes2 ? 'NES 2.0 Header' : 'iNES 1.0 Header';
    headerDetails['PRG-ROM Size'] = `${prgChunks * 16} KB`;
    headerDetails['CHR-ROM Size'] = chrChunks === 0 ? 'CHR-RAM (8 KB)' : `${chrChunks * 8} KB`;
    headerDetails['Mapper ID'] = mapper;
    headerDetails['Mirroring'] = flag6 & 0x01 ? 'Vertical' : 'Horizontal';
    headerDetails['Battery-backed RAM'] = hasBattery;

    // Read vector table at end of PRG-ROM (NMI, RESET, IRQ/BRK at 0xFFFA-0xFFFF)
    if (data.length >= 16 + prgChunks * 16384) {
      const prgEnd = 16 + prgChunks * 16384;
      const nmi = (data[prgEnd - 6] | (data[prgEnd - 5] << 8)).toString(16).toUpperCase().padStart(4, '0');
      const reset = (data[prgEnd - 4] | (data[prgEnd - 3] << 8)).toString(16).toUpperCase().padStart(4, '0');
      const irq = (data[prgEnd - 2] | (data[prgEnd - 1] << 8)).toString(16).toUpperCase().padStart(4, '0');
      vectorTable.push({ name: 'NMI Vector', address: '$FFFA', target: `$${nmi}` });
      vectorTable.push({ name: 'Reset Vector', address: '$FFFC', target: `$${reset}` });
      vectorTable.push({ name: 'IRQ/BRK Vector', address: '$FFFE', target: `$${irq}` });
    }

    technicalNotes.push(`Mapper ${mapper} identified. ${hasBattery ? 'Battery RAM supported.' : 'No battery RAM.'}`);
  }
  // 2. Detect Game Boy / Game Boy Color
  else if (data.length >= 0x150 && isNintendoLogoPresent(data)) {
    const cgbFlag = data[0x143];
    const isGbc = (cgbFlag & 0x80) !== 0;
    platform = isGbc ? 'gbc' : 'gb';
    platformName = isGbc ? 'Game Boy Color' : 'Game Boy (DMG)';

    // Extract title (0x0134 to 0x0143)
    let titleBytes: number[] = [];
    const titleEnd = isGbc ? 0x13e : 0x142;
    for (let i = 0x134; i <= titleEnd; i++) {
      if (data[i] === 0) break;
      titleBytes.push(data[i]);
    }
    const rawTitle = String.fromCharCode(...titleBytes).trim();
    if (rawTitle.length > 0) {
      gameTitle = rawTitle;
      identified = true;
    }

    const cartType = data[0x147];
    const romSizeCode = data[0x148];
    const ramSizeCode = data[0x149];
    const destCode = data[0x14a];

    headerDetails['Title'] = rawTitle || 'N/A';
    headerDetails['Cartridge Type'] = getGbCartridgeType(cartType);
    headerDetails['ROM Size'] = `${32 << romSizeCode} KB`;
    headerDetails['RAM Size'] = getGbRamSize(ramSizeCode);
    headerDetails['Region'] = destCode === 0 ? 'Japan' : 'Overseas (World)';
    headerDetails['Header Checksum'] = `0x${data[0x14d].toString(16).toUpperCase()}`;

    region = destCode === 0 ? 'Japan' : 'World';

    // Game Boy Interrupt Vectors
    vectorTable.push({ name: 'V-Blank Interrupt', address: '$0040', target: 'RST 40h' });
    vectorTable.push({ name: 'LCD STAT Interrupt', address: '$0048', target: 'RST 48h' });
    vectorTable.push({ name: 'Timer Interrupt', address: '$0050', target: 'RST 50h' });
    vectorTable.push({ name: 'Serial Interrupt', address: '$0058', target: 'RST 58h' });
    vectorTable.push({ name: 'Joypad Interrupt', address: '$0060', target: 'RST 60h' });
    vectorTable.push({ name: 'Cartridge Entrypoint', address: '$0100', target: 'NOP; JP $0150' });

    technicalNotes.push(`Valid Nintendo Cartridge Header at 0x0100. Cartridge controller: ${getGbCartridgeType(cartType)}.`);
  }
  // 3. Detect Game Boy Advance (ARM branch instruction at 0x00 and logo check)
  else if (data.length >= 0xc0 && (data[3] === 0xea || data[0x0b2] === 0x96 || lowerName.endsWith('.gba'))) {
    // Check ARM B opcode (0xEAxxxxxx)
    platform = 'gba';
    platformName = 'Game Boy Advance';

    // Title at 0x00A0 (12 ASCII chars)
    let gbaTitleBytes: number[] = [];
    for (let i = 0x0a0; i < 0x0ac; i++) {
      if (data[i] >= 32 && data[i] <= 126) gbaTitleBytes.push(data[i]);
    }
    const gbaTitle = String.fromCharCode(...gbaTitleBytes).trim();
    if (gbaTitle.length > 0) {
      gameTitle = gbaTitle;
      identified = true;
    }

    // Game Code at 0x00AC (4 chars e.g. BPRE)
    const codeBytes = [data[0xac], data[0xad], data[0xae], data[0xaf]];
    const gameCode = String.fromCharCode(...codeBytes);

    headerDetails['Title'] = gbaTitle || 'N/A';
    headerDetails['Game Code'] = gameCode;
    headerDetails['Maker Code'] = String.fromCharCode(data[0xb0], data[0xb1]);
    headerDetails['Unit Code'] = data[0xb2] === 0 ? 'GBA Standard' : `0x${data[0xb2].toString(16)}`;
    headerDetails['Device Type'] = data[0xb3] === 0 ? 'Normal ROM' : 'DACS / Special';
    headerDetails['Header Checksum'] = `0x${data[0xbd].toString(16).toUpperCase()}`;

    if (gameCode.endsWith('E')) region = 'USA';
    else if (gameCode.endsWith('P')) region = 'Europe';
    else if (gameCode.endsWith('J')) region = 'Japan';

    vectorTable.push({ name: 'Reset / Entry Point', address: '0x08000000', target: `Branch ARM opcode` });
    vectorTable.push({ name: 'SWI Bios Handlers', address: '0x00000000', target: 'ARM SWI vectors' });
    vectorTable.push({ name: 'IRQ Interrupt Vector', address: '0x03007FFC', target: 'User IRQ handler' });

    technicalNotes.push(`32-bit ARM7TDMI binary. Game code: ${gameCode}.`);
  }
  // 4. Detect Nintendo 64 (.z64 / .v64 / .n64)
  else if (
    data.length >= 0x40 &&
    (data[0] === 0x80 && data[1] === 0x37 && data[2] === 0x12 && data[3] === 0x40 || // .z64 big endian
     data[0] === 0x37 && data[1] === 0x80 && data[2] === 0x40 && data[3] === 0x12 || // .v64 byteswapped
     data[0] === 0x40 && data[1] === 0x12 && data[2] === 0x37 && data[3] === 0x80 || // .n64 little endian
     lowerName.endsWith('.z64') || lowerName.endsWith('.n64') || lowerName.endsWith('.v64'))
  ) {
    platform = 'n64';
    platformName = 'Nintendo 64';

    let isBigEndian = data[0] === 0x80;
    headerDetails['Byte Order'] = isBigEndian ? 'Big Endian (.z64 Native)' : 'Byte-swapped (.v64/.n64)';

    // Title at 0x20 - 0x33 (20 chars)
    let n64TitleBytes: number[] = [];
    for (let i = 0x20; i < 0x34; i++) {
      if (data[i] >= 32 && data[i] <= 126) n64TitleBytes.push(data[i]);
    }
    const n64Title = String.fromCharCode(...n64TitleBytes).trim();
    if (n64Title.length > 0) {
      gameTitle = n64Title;
      identified = true;
    }

    // Game code at 0x3B (4 chars e.g. NSME, CZLE)
    const code = String.fromCharCode(data[0x3b], data[0x3c], data[0x3d], data[0x3e]);
    headerDetails['Title'] = n64Title || 'N/A';
    headerDetails['Game Code'] = code;
    headerDetails['ClockRate'] = `0x${((data[4] << 24) | (data[5] << 16) | (data[6] << 8) | data[7]).toString(16)}`;
    headerDetails['PC Initial'] = `0x${((data[8] << 24) | (data[9] << 16) | (data[10] << 8) | data[11]).toString(16)}`;
    headerDetails['CRC1'] = `0x${((data[0x10] << 24) | (data[0x11] << 16) | (data[0x12] << 8) | data[0x13]).toString(16)}`;
    headerDetails['CRC2'] = `0x${((data[0x14] << 24) | (data[0x15] << 16) | (data[0x16] << 8) | data[0x17]).toString(16)}`;

    if (code.endsWith('E')) region = 'USA';
    else if (code.endsWith('P')) region = 'Europe';
    else if (code.endsWith('J')) region = 'Japan';

    vectorTable.push({ name: 'Boot Entrypoint', address: '0x80000400', target: 'MIPS R4300i Bootloader' });
    vectorTable.push({ name: 'RSP Microcode Vector', address: '0x04001000', target: 'SP IMEM Task' });

    technicalNotes.push(`N64 MIPS R4300i 64-bit architecture. Compatible with N64Recomp / WebAssembly static recompiler.`);
  }
  // 5. Detect SNES / Super Famicom
  else if (data.length >= 0x8000 && (lowerName.endsWith('.smc') || lowerName.endsWith('.sfc') || isSnesHeader(data))) {
    platform = 'snes';
    platformName = 'Super Nintendo Entertainment System (Super Famicom)';

    const snesInfo = parseSnesHeader(data);
    gameTitle = snesInfo.title;
    if (gameTitle) identified = true;
    region = snesInfo.region;

    headerDetails['Title'] = snesInfo.title;
    headerDetails['Map Mode'] = snesInfo.mapMode;
    headerDetails['ROM Type'] = snesInfo.romType;
    headerDetails['ROM Size'] = snesInfo.romSize;
    headerDetails['SRAM Size'] = snesInfo.sramSize;
    headerDetails['Checksum'] = `0x${snesInfo.checksum.toString(16).toUpperCase()}`;

    vectorTable.push({ name: 'Native Reset Vector', address: '$00FFFC', target: `$${snesInfo.resetVector}` });
    vectorTable.push({ name: 'Native NMI Vector', address: '$00FFEA', target: 'V-Blank Handler' });
    vectorTable.push({ name: 'Native IRQ Vector', address: '$00FFEE', target: 'Timer/Raster IRQ' });

    technicalNotes.push(`16-bit 65c816 CPU with SPC700 Sony Audio Coprocessor. Map Mode: ${snesInfo.mapMode}.`);
  }
  // 6. Detect Sega Genesis / Mega Drive
  else if (data.length >= 0x200 && isGenesisRom(data, lowerName)) {
    platform = 'genesis';
    platformName = 'Sega Mega Drive / Genesis';

    // Title at 0x150 (48 ASCII chars)
    let genTitleBytes: number[] = [];
    for (let i = 0x150; i < 0x180; i++) {
      if (data[i] >= 32 && data[i] <= 126) genTitleBytes.push(data[i]);
    }
    const genTitle = String.fromCharCode(...genTitleBytes).trim();
    if (genTitle.length > 0) {
      gameTitle = genTitle;
      identified = true;
    }

    const domesticTitle = String.fromCharCode(...data.slice(0x120, 0x150)).trim();
    headerDetails['Title'] = genTitle || domesticTitle || 'N/A';
    headerDetails['System'] = String.fromCharCode(...data.slice(0x100, 0x110)).trim();
    headerDetails['Copyright'] = String.fromCharCode(...data.slice(0x110, 0x120)).trim();
    headerDetails['Checksum'] = `0x${((data[0x18e] << 8) | data[0x18f]).toString(16).toUpperCase()}`;

    vectorTable.push({ name: 'Initial SP', address: '$000000', target: `$${((data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3]).toString(16).toUpperCase()}` });
    vectorTable.push({ name: 'Initial PC (Entry)', address: '$000004', target: `$${((data[4] << 24) | (data[5] << 16) | (data[6] << 8) | data[7]).toString(16).toUpperCase()}` });

    technicalNotes.push(`Motorola 68000 16/32-bit CPU + Zilog Z80 audio subsystem.`);
  }
  // 7. Detect PlayStation 1 (PS-X EXE or ISO/CUE)
  else if (
    (data.length >= 8 && data[0] === 0x50 && data[1] === 0x53 && data[2] === 0x2d && data[3] === 0x58) ||
    lowerName.endsWith('.cue') || lowerName.endsWith('.iso') || lowerName.endsWith('.bin') && data.length > 50000000
  ) {
    platform = 'ps1';
    platformName = 'Sony PlayStation (PS1)';
    headerDetails['Format'] = data[0] === 0x50 ? 'PS-X Standalone Executable' : 'Disc Image (ISO-9660 / CUE)';
    missingDependencies.push('PS1 SCPH-1001 / SCPH-5500 BIOS (Simulated HLE BIOS enabled by default)');
    technicalNotes.push(`MIPS R3000A CPU @ 33.8 MHz + Sony Geometry Transformation Engine (GTE).`);
  }
  // 8. Detect DOOM WAD
  else if (
    data.length >= 4 &&
    ((data[0] === 0x49 && data[1] === 0x57 && data[2] === 0x41 && data[3] === 0x44) ||
     (data[0] === 0x50 && data[1] === 0x57 && data[2] === 0x41 && data[3] === 0x44))
  ) {
    platform = 'doom_wad';
    platformName = 'id Tech 1 Engine (DOOM WAD)';
    const isIwad = data[0] === 0x49;
    const numLumps = data[4] | (data[5] << 8) | (data[6] << 16) | (data[7] << 24);
    headerDetails['WAD Type'] = isIwad ? 'Internal WAD (IWAD Standalone Game)' : 'Patch WAD (PWAD Mod)';
    headerDetails['Lump Count'] = numLumps;
    gameTitle = isIwad ? 'DOOM (id Tech 1)' : 'DOOM PWAD Expansion';
    identified = true;
    technicalNotes.push(`Native WebAssembly Chocolate Doom source port supported.`);
  }
  // 9. Detect CHIP-8
  else if (data.length <= 4096 && (lowerName.endsWith('.ch8') || lowerName.endsWith('.c8'))) {
    platform = 'chip8';
    platformName = 'COSMAC VIP CHIP-8 / Super-Chip';
    headerDetails['Architecture'] = 'CHIP-8 Virtual Machine';
    headerDetails['Memory Size'] = `${data.length} bytes (Loads at 0x0200)`;
    gameTitle = fileName.replace(/\.[^/.]+$/, '');
    identified = true;
    technicalNotes.push(`Direct JIT / Interpreter execution at 60Hz display refresh.`);
  }

  // Fallback title from filename if not identified in header
  if (!gameTitle) {
    const cleanName = fileName.replace(/\.[^/.]+$/, '').replace(/[\(\[].*?[\)\]]/g, '').trim();
    gameTitle = cleanName;
  }

  // Lookup in verified database catalog
  const catalogMatch = lookupGameInCatalog(crc32, headerDetails['Game Code'] as string, gameTitle);
  if (catalogMatch) {
    gameTitle = catalogMatch.title;
    platform = catalogMatch.platform;
    identified = true;
    if (catalogMatch.region) region = catalogMatch.region;
  }

  // Determine Recompilation Viability and Available Methods according to rules
  const availableMethods: ExecutionMethod[] = [];
  let recommendedExecution: ExecutionMethod = 'optimized_wasm_emulator';
  let recompilationViabilityScore = 50;
  let decompilationProject = catalogMatch?.recompilationProject || null;

  if (catalogMatch?.recompilationProject?.type === 'wasm_native' || catalogMatch?.recompilationProject?.type === 'decomp_port') {
    availableMethods.push('native_recompilation');
    availableMethods.push('optimized_wasm_emulator');
    recommendedExecution = 'native_recompilation';
    recompilationViabilityScore = 98;
  } else if (catalogMatch?.recompilationProject?.type === 'static_recomp') {
    availableMethods.push('static_recompile_candidate');
    availableMethods.push('optimized_wasm_emulator');
    recommendedExecution = 'static_recompile_candidate';
    recompilationViabilityScore = 92;
  } else if (platform === 'doom_wad') {
    availableMethods.push('source_port_wasm');
    recommendedExecution = 'source_port_wasm';
    recompilationViabilityScore = 95;
  } else if (platform === 'chip8') {
    availableMethods.push('jit_interpreter');
    recommendedExecution = 'jit_interpreter';
    recompilationViabilityScore = 90;
  } else if (['nes', 'gb', 'gbc', 'gba'].includes(platform)) {
    availableMethods.push('optimized_wasm_emulator');
    availableMethods.push('jit_interpreter');
    recommendedExecution = 'optimized_wasm_emulator';
    recompilationViabilityScore = 80;
  } else if (['snes', 'genesis', 'n64', 'ps1'].includes(platform)) {
    availableMethods.push('optimized_wasm_emulator');
    recommendedExecution = 'optimized_wasm_emulator';
    recompilationViabilityScore = 65;
  } else {
    availableMethods.push('optimized_wasm_emulator');
    recommendedExecution = 'optimized_wasm_emulator';
    recompilationViabilityScore = 30;
  }

  let compatibility: CompatibilityStatus = catalogMatch?.compatibility || 'playable';
  if (missingDependencies.length > 0) {
    compatibility = 'needs_bios';
  } else if (recommendedExecution === 'native_recompilation' || recommendedExecution === 'static_recompile_candidate') {
    compatibility = 'recomp_available';
  }

  const performanceEstimate =
    recommendedExecution === 'native_recompilation'
      ? '60 FPS Ultra-Fast (Zero CPU Emulation Overhead)'
      : recommendedExecution === 'static_recompile_candidate'
      ? '60 FPS High Framerate (Static Recompilation Pipeline)'
      : recommendedExecution === 'source_port_wasm'
      ? '60 FPS Native WebAssembly Engine'
      : '60 FPS Fullspeed (Optimized WebAssembly Core)';

  return {
    fileName,
    fileSize,
    crc32,
    md5,
    sha1,
    platform,
    platformName,
    gameTitle,
    identified,
    fileFormat: fileExt || 'bin',
    region,
    version,
    headerDetails,
    entropy,
    entropyBuckets,
    vectorTable,
    strings,
    recommendedExecution,
    availableMethods,
    compatibility,
    missingDependencies,
    estimatedPerformance: performanceEstimate,
    technicalNotes,
    recompilationViabilityScore,
    decompilationProject,
  };
}

// Helpers for Game Boy
function isNintendoLogoPresent(data: Uint8Array): boolean {
  // Check bytes 0x0104 - 0x0113 (first 16 bytes of Nintendo logo)
  const logoSample = [
    0xce, 0xed, 0x66, 0x66, 0xcc, 0x0d, 0x00, 0x0b,
    0x03, 0x73, 0x00, 0x83, 0x00, 0x0c, 0x00, 0x0d,
  ];
  for (let i = 0; i < logoSample.length; i++) {
    if (data[0x104 + i] !== logoSample[i]) return false;
  }
  return true;
}

function getGbCartridgeType(code: number): string {
  switch (code) {
    case 0x00: return 'ROM ONLY';
    case 0x01: return 'MBC1';
    case 0x02: return 'MBC1+RAM';
    case 0x03: return 'MBC1+RAM+BATTERY';
    case 0x05: return 'MBC2';
    case 0x06: return 'MBC2+BATTERY';
    case 0x0f: return 'MBC3+TIMER+BATTERY';
    case 0x10: return 'MBC3+TIMER+RAM+BATTERY';
    case 0x11: return 'MBC3';
    case 0x12: return 'MBC3+RAM';
    case 0x13: return 'MBC3+RAM+BATTERY';
    case 0x19: return 'MBC5';
    case 0x1a: return 'MBC5+RAM';
    case 0x1b: return 'MBC5+RAM+BATTERY';
    case 0x1c: return 'MBC5+RUMBLE';
    case 0x1d: return 'MBC5+RUMBLE+RAM';
    case 0x1e: return 'MBC5+RUMBLE+RAM+BATTERY';
    default: return `Custom Controller (0x${code.toString(16)})`;
  }
}

function getGbRamSize(code: number): string {
  switch (code) {
    case 0: return 'None';
    case 1: return '2 KB';
    case 2: return '8 KB';
    case 3: return '32 KB (4 banks of 8KB)';
    case 4: return '128 KB (16 banks)';
    case 5: return '64 KB (8 banks)';
    default: return `${code} (Unknown)`;
  }
}

// Helpers for SNES
function isSnesHeader(data: Uint8Array): boolean {
  // Test LoROM offset 0x7FC0 or HiROM offset 0xFFC0
  const offsets = [0x7fc0, 0xffc0, 0x7fc0 + 512, 0xffc0 + 512];
  for (const off of offsets) {
    if (data.length >= off + 32) {
      const checksum = data[off + 28] | (data[off + 29] << 8);
      const complement = data[off + 26] | (data[off + 27] << 8);
      if ((checksum + complement) === 0xffff && checksum !== 0) {
        return true;
      }
    }
  }
  return false;
}

function parseSnesHeader(data: Uint8Array) {
  let headerOffset = 0x7fc0;
  if (data.length % 1024 === 512) {
    // Headered SMC ROM (512 byte copier header)
    headerOffset += 512;
  }

  // Check if HiROM is a better match
  const hiOffset = headerOffset + 0x8000;
  if (data.length >= hiOffset + 32) {
    const c1 = data[headerOffset + 28] | (data[headerOffset + 29] << 8);
    const comp1 = data[headerOffset + 26] | (data[headerOffset + 27] << 8);
    const c2 = data[hiOffset + 28] | (data[hiOffset + 29] << 8);
    const comp2 = data[hiOffset + 26] | (data[hiOffset + 27] << 8);

    if (c2 + comp2 === 0xffff && (c1 + comp1 !== 0xffff)) {
      headerOffset = hiOffset;
    }
  }

  let titleBytes: number[] = [];
  for (let i = 0; i < 21; i++) {
    const b = data[headerOffset + i];
    if (b >= 32 && b <= 126) titleBytes.push(b);
  }
  const title = String.fromCharCode(...titleBytes).trim();

  const mapMode = data[headerOffset + 21];
  const romType = data[headerOffset + 22];
  const romSize = data[headerOffset + 23];
  const sramSize = data[headerOffset + 24];
  const destCode = data[headerOffset + 25];
  const checksum = data[headerOffset + 28] | (data[headerOffset + 29] << 8);
  const resetVector = (data[headerOffset + 30] | (data[headerOffset + 31] << 8)).toString(16).toUpperCase().padStart(4, '0');

  let region = 'World';
  if (destCode === 0) region = 'Japan';
  else if (destCode === 1) region = 'USA';
  else if (destCode === 2) region = 'Europe';

  return {
    title,
    mapMode: mapMode & 0x01 ? 'HiROM' : 'LoROM',
    romType: romType === 0 ? 'ROM Only' : romType === 2 ? 'ROM + RAM + Battery' : `Type 0x${romType.toString(16)}`,
    romSize: `${1 << (romSize - 7)} MB`,
    sramSize: sramSize === 0 ? 'None' : `${1 << (sramSize + 3)} KB`,
    checksum,
    resetVector,
    region,
  };
}

// Helpers for Sega Genesis
function isGenesisRom(data: Uint8Array, name: string): boolean {
  if (data.length < 0x200) return false;
  const sysName = String.fromCharCode(...data.slice(0x100, 0x110));
  return sysName.includes('SEGA') || name.endsWith('.md') || name.endsWith('.gen');
}
