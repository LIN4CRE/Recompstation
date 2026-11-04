import { buildTestRom, TEST_ROM_NAME, TEST_ROM_META } from '../core/testrom';
import { runLiveVerification, LiveVerificationTarget, VerificationResult } from '../core/verification';
import { GameItem, RomAnalysisReport } from '../types/rom';
import { analyzeRom } from '../services/romParser';

export interface TestGeneratorOptions {
  autoVerify?: boolean;
  sampleDurationSeconds?: number;
}

export interface GeneratedSelfTestSession {
  fileName: string;
  bytes: Uint8Array;
  metadata: typeof TEST_ROM_META;
  analysisReport: RomAnalysisReport;
  gameItem: GameItem;
}

/**
 * 6502 Self-Test Cartridge Generator & Automated Live Session Verification Utility.
 *
 * Authors algorithmic 6502 test ROMs in code without external copyrighted binaries
 * and coordinates 6-point live session verification for emulation and recompilation targets.
 */
export class TestGenerator {
  /**
   * Generates a deterministic 6502 Self-Test Cartridge in code
   * with complete NES 2.0 / iNES headers, PRG code, and CHR striped tiles.
   */
  public static generate6502Cartridge(): Uint8Array {
    return buildTestRom();
  }

  /**
   * Builds an executable game session for the self-test cartridge,
   * complete with canonical analysis report and GameItem record ready for runtime playback.
   */
  public static async createSelfTestSession(): Promise<GeneratedSelfTestSession> {
    const bytes = this.generate6502Cartridge();
    const fileName = TEST_ROM_NAME;
    const analysisReport = await analyzeRom(fileName, bytes);

    const gameItem: GameItem = {
      id: 'selftest-6502-nes',
      title: TEST_ROM_META.name,
      platform: 'nes',
      platformName: 'Nintendo Entertainment System (Famicom)',
      fileFormat: 'nes',
      fileSize: bytes.length,
      crc32: analysisReport.crc32,
      sha1: analysisReport.sha1,
      romData: bytes,
      executionMethod: 'optimized_wasm_emulator',
      compatibility: 'verified',
      lastPlayed: Date.now(),
      favorite: false,
      addedAt: Date.now(),
      isBuiltIn: true,
      report: analysisReport,
    };

    return {
      fileName,
      bytes,
      metadata: TEST_ROM_META,
      analysisReport,
      gameItem,
    };
  }

  /**
   * Performs the automated 6-point live session verification on any running game session.
   *
   * Verifies:
   * 1. Video Output: Non-black framebuffer pixels and color distribution.
   * 2. Animation & Frame Deltas: Verifies live rendering loop over static frozen display.
   * 3. Timing / FPS: Locked 60 Hz frame pacing and frame delta stability.
   * 4. Audio Pipeline: Sample rate and buffer latency verification.
   * 5. Input Dispatch: Synthetic controller button signals (Start/A).
   * 6. State Serialization: Save state capture and load roundtrip.
   */
  public static async verifyLiveSession(
    target: LiveVerificationTarget,
    durationSeconds = 2.5
  ): Promise<VerificationResult> {
    return await runLiveVerification(target, durationSeconds);
  }

  /**
   * Helper to verify if an uploaded ROM's hardware requirements match the 6502 test suite capabilities.
   */
  public static is6502Architecture(platformId: string): boolean {
    return ['nes', 'snes', 'gb', 'gbc'].includes(platformId.toLowerCase());
  }
}
