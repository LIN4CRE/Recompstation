export type PlatformId =
  | 'nes'
  | 'snes'
  | 'gb'
  | 'gbc'
  | 'gba'
  | 'n64'
  | 'genesis'
  | 'ps1'
  | 'chip8'
  | 'doom_wad'
  | 'unknown';

export type ExecutionMethod =
  | 'native_recompilation'
  | 'static_recompile_candidate'
  | 'source_port_wasm'
  | 'optimized_wasm_emulator'
  | 'jit_interpreter';

export type CompatibilityStatus =
  | 'playable'
  | 'recomp_available'
  | 'verified'
  | 'partially_compatible'
  | 'needs_bios'
  | 'incompatible'
  | 'untested';

export interface RomVector {
  name: string;
  address: string;
  target: string;
}

export interface RecompilationProjectInfo {
  name: string;
  url: string;
  type: 'static_recomp' | 'decomp_port' | 'clean_room' | 'wasm_native';
  status: 'production' | 'active_development' | 'experimental';
  description: string;
  notes: string;
}

export interface RomAnalysisReport {
  fileName: string;
  fileSize: number;
  crc32: string;
  md5: string;
  sha1: string;
  platform: PlatformId;
  platformName: string;
  gameTitle: string;
  identified: boolean;
  fileFormat: string;
  region: string;
  version: string;
  headerDetails: Record<string, string | number | boolean>;
  entropy: number; // 0.0 to 8.0
  entropyBuckets: number[]; // 16-32 data points for visualization
  vectorTable: RomVector[];
  strings: string[];
  recommendedExecution: ExecutionMethod;
  availableMethods: ExecutionMethod[];
  compatibility: CompatibilityStatus;
  missingDependencies: string[];
  estimatedPerformance: string;
  technicalNotes: string[];
  recompilationViabilityScore: number; // 0 - 100
  decompilationProject: RecompilationProjectInfo | null;
}

export interface GameItem {
  id: string;
  title: string;
  platform: PlatformId;
  platformName: string;
  fileFormat: string;
  fileSize: number;
  crc32: string;
  sha1?: string;
  romData?: Uint8Array;
  coverUrl?: string;
  executionMethod: ExecutionMethod;
  compatibility: CompatibilityStatus;
  lastPlayed?: number;
  favorite: boolean;
  addedAt: number;
  isBuiltIn: boolean;
  report: RomAnalysisReport;
}

export interface SaveState {
  id: string;
  gameId: string;
  slot: number;
  timestamp: number;
  screenshotUrl?: string;
  data: string; // Base64 or JSON state
  size: number;
}

export interface ControllerMapping {
  up: string;
  down: string;
  left: string;
  right: string;
  a: string;
  b: string;
  x?: string;
  y?: string;
  start: string;
  select: string;
  l?: string;
  r?: string;
}

export interface PerformanceStats {
  fps: number;
  frameTime: number; // ms
  audioLatency: number; // ms
  sampleRate: number;
  framesRendered: number;
  droppedFrames: number;
  memoryUsageMb?: number;
  backend: 'WebGL 2' | 'WebGL 1' | 'Canvas 2D';
}
