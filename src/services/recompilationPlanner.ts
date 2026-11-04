import { RomAnalysisReport, ExecutionMethod, CompatibilityStatus } from '../types/rom';
import { detectEnvironment, environmentSnapshot } from '../core/environment';
import { RuntimeEnvironment } from '../core/types';
import { ALL_DESCRIPTORS } from '../engines/descriptors';

export interface RecompilationCandidate {
  tier: number;
  method: ExecutionMethod;
  label: string;
  engineId: string;
  engineName: string;
  runnable: boolean;
  score: number;
  blockers: string[];
  notes: string[];
  performanceEstimate: string;
}

export interface RecompilationPlan {
  selectedMethod: ExecutionMethod;
  selectedEngineId: string;
  compatibility: CompatibilityStatus;
  viabilityScore: number;
  performanceEstimate: string;
  rationale: string;
  candidates: RecompilationCandidate[];
  environment: RuntimeEnvironment;
}

/**
 * 6-Tier Deterministic Recompilation Priority Planner
 *
 * Implements the deterministic evaluation ladder:
 *   Tier 1: Verified browser-native recompilation (WebAssembly)
 *   Tier 2: Compatible static recompilation candidate (e.g. N64Recomp / Zelda64Recomp)
 *   Tier 3: Source port compiled to WebAssembly (e.g. Chocolate Doom)
 *   Tier 4: Optimized WebAssembly emulator (e.g. mGBA, NES WASM core)
 *   Tier 5: JIT / JavaScript micro-interpreter (e.g. CHIP-8, JS cores)
 *   Tier 6: External toolchain requirement (Ghidra, Rizin, native CLI)
 */
export class RecompilationPlanner {
  /**
   * Plans the optimal execution method for a given ROM based on its analysis metadata and client hardware capabilities.
   */
  public static async plan(report: RomAnalysisReport, customEnv?: RuntimeEnvironment): Promise<RecompilationPlan> {
    const env = customEnv || (await detectEnvironment());
    const candidates: RecompilationCandidate[] = [];

    const platform = report.platform;
    const decomp = report.decompilationProject;

    // -------------------------------------------------------------------------
    // Tier 1: Verified Browser-Native Recompilation
    // -------------------------------------------------------------------------
    const tier1Eligible = decomp?.type === 'wasm_native' || decomp?.type === 'decomp_port';
    candidates.push({
      tier: 1,
      method: 'native_recompilation',
      label: 'Verified Browser-Native Recompilation',
      engineId: 'recomp-wasm-native',
      engineName: decomp?.name || 'Native WebAssembly Port',
      runnable: Boolean(tier1Eligible && env.webAssembly),
      score: tier1Eligible ? 98 : 0,
      blockers: !env.webAssembly
        ? ['WebAssembly runtime is not supported by client environment']
        : !tier1Eligible
        ? ['No pre-compiled browser-native WebAssembly binary exists for this specific ROM']
        : [],
      notes: tier1Eligible
        ? ['Zero emulation overhead; direct translation to WebAssembly with 60 FPS performance']
        : [],
      performanceEstimate: '60 FPS Ultra-Fast (Zero CPU Emulation Overhead)',
    });

    // -------------------------------------------------------------------------
    // Tier 2: Compatible Static Recompilation Candidate (N64Recomp / Zelda64Recomp)
    // -------------------------------------------------------------------------
    const isN64Static = platform === 'n64' && (decomp?.type === 'static_recomp' || true);
    const tier2Eligible = isN64Static;
    candidates.push({
      tier: 2,
      method: 'static_recompile_candidate',
      label: 'Compatible Static Recompilation Pipeline',
      engineId: 'n64recomp-cli',
      engineName: 'N64Recomp / Zelda64Recomp Pipeline',
      runnable: Boolean(tier2Eligible),
      score: decomp?.type === 'static_recomp' ? 94 : isN64Static ? 82 : 0,
      blockers: !tier2Eligible
        ? ['Platform does not support offline static recompilation pipeline']
        : [],
      notes: isN64Static
        ? [
            'N64 MIPS R4300i binary compatible with static recompilation.',
            'Requires offline C compilation with N64Recomp CLI or server processing endpoint.',
          ]
        : [],
      performanceEstimate: '60 FPS High Framerate (Static Recompilation Pipeline)',
    });

    // -------------------------------------------------------------------------
    // Tier 3: Source Port Compiled to WebAssembly
    // -------------------------------------------------------------------------
    const isSourcePort = platform === 'doom_wad';
    candidates.push({
      tier: 3,
      method: 'source_port_wasm',
      label: 'Source Port Compiled to WebAssembly',
      engineId: 'chocolate-doom-wasm',
      engineName: 'Chocolate Doom WebAssembly Engine',
      runnable: Boolean(isSourcePort && env.webAssembly),
      score: isSourcePort ? 92 : 0,
      blockers: !isSourcePort ? ['Game payload is not an id Tech 1 WAD'] : [],
      notes: isSourcePort ? ['Native Chocolate Doom WebAssembly engine runs directly in canvas'] : [],
      performanceEstimate: '60 FPS Native WebAssembly Engine',
    });

    // -------------------------------------------------------------------------
    // Tier 4: Optimized WebAssembly Emulator Core
    // -------------------------------------------------------------------------
    const isWasmEmulatorSupported = ['nes', 'gb', 'gbc', 'gba', 'snes', 'genesis', 'n64', 'ps1'].includes(platform);
    const wasmNeedsWebGl2 = platform === 'gba';
    const wasmBlockers: string[] = [];
    if (!env.webAssembly) wasmBlockers.push('WebAssembly not supported');
    if (wasmNeedsWebGl2 && !env.webgl2) wasmBlockers.push('WebGL2 context required for SDL2/GLES video pipeline');

    candidates.push({
      tier: 4,
      method: 'optimized_wasm_emulator',
      label: 'Optimized WebAssembly Emulator Core',
      engineId: platform === 'gba' ? 'mgba-wasm' : 'recomp-wasm-core',
      engineName: platform === 'gba' ? 'mGBA (WASM)' : 'Optimized WebAssembly Core',
      runnable: Boolean(isWasmEmulatorSupported && wasmBlockers.length === 0),
      score: isWasmEmulatorSupported ? (['nes', 'gb', 'gbc', 'gba'].includes(platform) ? 80 : 65) : 25,
      blockers: wasmBlockers,
      notes: ['Accurate cycle-pacing with Web Audio latency synchronization'],
      performanceEstimate: '60 FPS Fullspeed (Optimized WebAssembly Core)',
    });

    // -------------------------------------------------------------------------
    // Tier 5: JIT / JavaScript Micro-Interpreter
    // -------------------------------------------------------------------------
    const isJitInterpreterSupported = ['chip8', 'nes', 'gb'].includes(platform);
    candidates.push({
      tier: 5,
      method: 'jit_interpreter',
      label: 'JavaScript / JIT Micro-Interpreter',
      engineId: platform === 'chip8' ? 'recomp-chip8' : 'jsnes',
      engineName: platform === 'chip8' ? 'CHIP-8 Virtual Machine' : 'JavaScript Core',
      runnable: Boolean(isJitInterpreterSupported),
      score: platform === 'chip8' ? 90 : 60,
      blockers: !isJitInterpreterSupported ? ['No lightweight micro-interpreter for this architecture'] : [],
      notes: ['Direct main-thread execution with zero external asset loading'],
      performanceEstimate: '60 FPS Instant Playback (Micro-Interpreter)',
    });

    // -------------------------------------------------------------------------
    // Tier 6: External Toolchain Requirement
    // -------------------------------------------------------------------------
    candidates.push({
      tier: 6,
      method: 'static_recompile_candidate',
      label: 'External Native Toolchain (Ghidra, Rizin, GCC)',
      engineId: 'external-toolchain',
      engineName: 'Native Processing Toolchain',
      runnable: false,
      score: 40,
      blockers: ['Cannot be executed purely client-side without local CLI tools'],
      notes: ['Available via RecompStation Express port 3000 toolchain endpoints'],
      performanceEstimate: 'Ahead-of-Time Native Binary Compilation',
    });

    // Determine the highest runnable tier
    const runnableCandidates = candidates
      .filter((c) => c.runnable)
      .sort((a, b) => a.tier - b.tier || b.score - a.score);

    const winner = runnableCandidates[0] || candidates[3]; // default to WASM emulator if needed

    // Determine Compatibility Status
    let compatibility: CompatibilityStatus = 'playable';
    if (report.missingDependencies && report.missingDependencies.length > 0) {
      compatibility = 'needs_bios';
    } else if (winner.tier === 1) {
      compatibility = 'verified';
    } else if (winner.tier === 2) {
      compatibility = 'recomp_available';
    } else if (winner.score < 50) {
      compatibility = 'partially_compatible';
    }

    const rationale = `Selected Tier ${winner.tier} (${winner.label}): ${winner.notes.join(' ')}`;

    return {
      selectedMethod: winner.method,
      selectedEngineId: winner.engineId,
      compatibility,
      viabilityScore: winner.score,
      performanceEstimate: winner.performanceEstimate,
      rationale,
      candidates,
      environment: env,
    };
  }
}
