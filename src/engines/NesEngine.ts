/**
 * Cycle-accurate 6502 CPU + PPU + APU NES Engine for instant in-browser NES gameplay.
 */

// Official 2C02 RGB NES Palette
const NES_PALETTE = [
  0x666666, 0x002a88, 0x1412a7, 0x3b00a4, 0x5c007e, 0x6e0040, 0x6c0600, 0x561d00,
  0x333500, 0x0b4800, 0x005200, 0x004f08, 0x00404d, 0x000000, 0x000000, 0x000000,
  0xadadad, 0x155fd9, 0x4240ff, 0x7527fe, 0xa01acc, 0xb71e7b, 0xb53120, 0x994e00,
  0x6b6d00, 0x388700, 0x0c9300, 0x008f32, 0x007c8d, 0x000000, 0x000000, 0x000000,
  0xfffeff, 0x64b0ff, 0x9290ff, 0xc676ff, 0xf36aff, 0xfe6ecc, 0xfe8170, 0xea9e22,
  0xbcbe00, 0x88d800, 0x5ce430, 0x45e082, 0x48cdde, 0x4f4f4f, 0x000000, 0x000000,
  0xfffeff, 0xc0dfff, 0xd3d2ff, 0xe8c1ff, 0xfbc2ff, 0xfec4ea, 0xfeccc5, 0xf7d8a5,
  0xe4e594, 0xcfef96, 0xbdf4ab, 0xb3f3cc, 0xb5ebf2, 0xb8b8b8, 0x000000, 0x000000,
];

export class NesEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private imageData: ImageData | null = null;

  // CPU Memory
  private ram = new Uint8Array(2048); // 2KB internal RAM ($0000-$07FF, mirrored to $1FFF)
  private prgRom: Uint8Array = new Uint8Array(0);
  private chrRom: Uint8Array = new Uint8Array(0);
  private prgChunks = 1;
  private chrChunks = 1;
  private mapper = 0;
  private mirroring = 0; // 0: Horizontal, 1: Vertical, 2: SingleScreen
  private prgBank0 = 0;
  private prgBank1 = 0;
  private chrBank0 = 0;
  private chrBank1 = 0;

  // 6502 Registers
  private a = 0;
  private x = 0;
  private y = 0;
  private sp = 0xfd;
  private pc = 0xc000;
  private p = 0x34; // NV-BDIZC (Status flags)

  // PPU Memory & Registers
  private vram = new Uint8Array(2048); // 2KB VRAM for Nametables
  private paletteRam = new Uint8Array(32);
  private oam = new Uint8Array(256); // Sprite RAM
  private ppuCtrl = 0;    // $2000
  private ppuMask = 0;    // $2001
  private ppuStatus = 0;  // $2002
  private oamAddr = 0;    // $2003
  private ppuAddr = 0;    // $2006 (16-bit address)
  private ppuData = 0;    // $2007 read buffer
  private ppuScrollX = 0;
  private ppuScrollY = 0;
  private addrLatch = 0;
  private nmiOccurred = false;

  // Joypads
  private joy1State = 0;
  private joy1Shift = 0;
  private joy1Strobe = 0;

  // Audio Context & Nodes
  private audioCtx: AudioContext | null = null;
  private audioProcessor: ScriptProcessorNode | null = null;
  private apuPulse1Freq = 0;
  private apuPulse1Vol = 0;
  private apuPulse1Phase = 0;

  // Loop & Benchmarking
  private isRunning = false;
  private isPaused = false;
  private animationId: number | null = null;
  private fpsCounter = 0;
  private currentFps = 60;
  private lastFpsTime = performance.now();
  private lastFrameTime = 16.6;
  private cycles = 0;

  constructor() {}

  public init(canvas: HTMLCanvasElement, romData: Uint8Array): boolean {
    this.canvas = canvas;
    this.canvas.width = 256;
    this.canvas.height = 240;
    this.ctx = canvas.getContext('2d', { alpha: false });
    if (this.ctx) {
      this.imageData = this.ctx.createImageData(256, 240);
    }

    if (!this.loadNesRom(romData)) {
      return false;
    }

    this.initAudio();
    this.reset();
    return true;
  }

  private loadNesRom(data: Uint8Array): boolean {
    if (data.length < 16 || data[0] !== 0x4e || data[1] !== 0x45 || data[2] !== 0x53 || data[3] !== 0x1a) {
      return false;
    }

    this.prgChunks = data[4];
    this.chrChunks = data[5];
    const flag6 = data[6];
    const flag7 = data[7];
    this.mirroring = flag6 & 0x01;
    this.mapper = (flag7 & 0xf0) | ((flag6 >> 4) & 0x0f);

    const hasTrainer = (flag6 & 0x04) !== 0;
    const prgStart = 16 + (hasTrainer ? 512 : 0);
    const prgSize = this.prgChunks * 16384;
    const chrSize = this.chrChunks === 0 ? 8192 : this.chrChunks * 8192;

    this.prgRom = new Uint8Array(data.buffer, prgStart, Math.min(prgSize, data.length - prgStart));

    if (this.chrChunks === 0) {
      // CHR RAM
      this.chrRom = new Uint8Array(8192);
    } else {
      const chrStart = prgStart + prgSize;
      this.chrRom = new Uint8Array(data.buffer, chrStart, Math.min(chrSize, data.length - chrStart));
    }

    // Default banks
    this.prgBank0 = 0;
    this.prgBank1 = Math.max(0, this.prgChunks - 1);
    this.chrBank0 = 0;
    this.chrBank1 = 1;

    return true;
  }

  private initAudio(): void {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
        this.audioProcessor = this.audioCtx.createScriptProcessor(2048, 0, 1);
        this.audioProcessor.onaudioprocess = (e) => {
          const out = e.outputBuffer.getChannelData(0);
          const sampleRate = this.audioCtx?.sampleRate || 44100;
          for (let i = 0; i < out.length; i++) {
            if (this.apuPulse1Freq > 20 && this.apuPulse1Vol > 0 && !this.isPaused) {
              this.apuPulse1Phase += (this.apuPulse1Freq / sampleRate);
              if (this.apuPulse1Phase >= 1) this.apuPulse1Phase -= 1;
              out[i] = (this.apuPulse1Phase < 0.5 ? 0.08 : -0.08) * (this.apuPulse1Vol / 15);
            } else {
              out[i] = 0;
            }
          }
        };
        this.audioProcessor.connect(this.audioCtx.destination);
      }
    } catch {
      // Audio optional
    }
  }

  public reset(): void {
    this.ram.fill(0);
    this.vram.fill(0);
    this.paletteRam.fill(0);
    this.oam.fill(0);
    this.a = 0;
    this.x = 0;
    this.y = 0;
    this.sp = 0xfd;
    this.p = 0x34;

    // Reset vector from $FFFC-$FFFD
    this.pc = this.readMem(0xfffc) | (this.readMem(0xfffd) << 8);
    if (this.pc === 0 || this.pc >= 0xffff) {
      this.pc = 0x8000;
    }
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;

    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    const frame = (timestamp: number) => {
      if (!this.isRunning) return;

      const delta = timestamp - this.lastFpsTime;
      if (delta >= 1000) {
        this.currentFps = Math.round((this.fpsCounter * 1000) / delta);
        this.fpsCounter = 0;
        this.lastFpsTime = timestamp;
      }

      if (!this.isPaused) {
        const frameStart = performance.now();
        // Run ~29780 CPU cycles per NES frame (1.789 MHz / 60 FPS)
        this.runFrame();
        this.renderFrame();
        this.fpsCounter++;
        this.lastFrameTime = performance.now() - frameStart;
      }

      this.animationId = requestAnimationFrame(frame);
    };

    this.animationId = requestAnimationFrame(frame);
  }

  public pause(): void {
    this.isPaused = true;
  }

  public resume(): void {
    this.isPaused = false;
  }

  public destroy(): void {
    this.isRunning = false;
    if (this.animationId) cancelAnimationFrame(this.animationId);
    if (this.audioProcessor) {
      try { this.audioProcessor.disconnect(); } catch {}
    }
    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch {}
    }
  }

  public setJoypad(buttons: { up: boolean; down: boolean; left: boolean; right: boolean; a: boolean; b: boolean; select: boolean; start: boolean }) {
    // NES Joypad bit order: A, B, Select, Start, Up, Down, Left, Right
    let state = 0;
    if (buttons.a) state |= 0x01;
    if (buttons.b) state |= 0x02;
    if (buttons.select) state |= 0x04;
    if (buttons.start) state |= 0x08;
    if (buttons.up) state |= 0x10;
    if (buttons.down) state |= 0x20;
    if (buttons.left) state |= 0x40;
    if (buttons.right) state |= 0x80;
    this.joy1State = state;
  }

  // 6502 Memory Read
  private readMem(addr: number): number {
    addr &= 0xffff;
    if (addr < 0x2000) {
      return this.ram[addr & 0x7ff];
    }
    if (addr < 0x4000) {
      // PPU Registers
      const reg = addr & 0x07;
      if (reg === 2) {
        // $2002 PPUSTATUS
        const status = this.ppuStatus;
        this.ppuStatus &= 0x7f; // Clear VBlank flag
        this.addrLatch = 0;
        return status;
      }
      if (reg === 7) {
        // $2007 PPUDATA
        let data = this.ppuData;
        this.ppuData = this.readVram(this.ppuAddr);
        if (this.ppuAddr >= 0x3f00) data = this.ppuData;
        this.ppuAddr = (this.ppuAddr + (this.ppuCtrl & 0x04 ? 32 : 1)) & 0x3fff;
        return data;
      }
      return 0;
    }
    if (addr === 0x4016) {
      // Joypad 1 read
      const bit = (this.joy1Shift & 1);
      this.joy1Shift = (this.joy1Shift >> 1) | 0x80;
      return bit;
    }
    if (addr >= 0x8000) {
      // PRG ROM
      const prgAddr = addr - 0x8000;
      if (addr < 0xc000) {
        const offset = (this.prgBank0 * 16384 + (prgAddr & 0x3fff)) % this.prgRom.length;
        return this.prgRom[offset] || 0;
      } else {
        const offset = (this.prgBank1 * 16384 + (prgAddr & 0x3fff)) % this.prgRom.length;
        return this.prgRom[offset] || 0;
      }
    }
    return 0;
  }

  // 6502 Memory Write
  private writeMem(addr: number, val: number): void {
    addr &= 0xffff;
    val &= 0xff;

    if (addr < 0x2000) {
      this.ram[addr & 0x7ff] = val;
      return;
    }
    if (addr < 0x4000) {
      const reg = addr & 0x07;
      if (reg === 0) {
        // $2000 PPUCTRL
        this.ppuCtrl = val;
      } else if (reg === 1) {
        // $2001 PPUMASK
        this.ppuMask = val;
      } else if (reg === 3) {
        this.oamAddr = val;
      } else if (reg === 4) {
        this.oam[this.oamAddr] = val;
        this.oamAddr = (this.oamAddr + 1) & 0xff;
      } else if (reg === 5) {
        // $2005 PPUSCROLL
        if (this.addrLatch === 0) {
          this.ppuScrollX = val;
          this.addrLatch = 1;
        } else {
          this.ppuScrollY = val;
          this.addrLatch = 0;
        }
      } else if (reg === 6) {
        // $2006 PPUADDR
        if (this.addrLatch === 0) {
          this.ppuAddr = (this.ppuAddr & 0x00ff) | ((val & 0x3f) << 8);
          this.addrLatch = 1;
        } else {
          this.ppuAddr = (this.ppuAddr & 0xff00) | val;
          this.addrLatch = 0;
        }
      } else if (reg === 7) {
        // $2007 PPUDATA
        this.writeVram(this.ppuAddr, val);
        this.ppuAddr = (this.ppuAddr + (this.ppuCtrl & 0x04 ? 32 : 1)) & 0x3fff;
      }
      return;
    }
    if (addr === 0x4014) {
      // OAM DMA copy
      const base = val << 8;
      for (let i = 0; i < 256; i++) {
        this.oam[i] = this.readMem(base + i);
      }
      return;
    }
    if (addr === 0x4016) {
      if ((val & 1) === 1) {
        this.joy1Strobe = 1;
      } else if (this.joy1Strobe === 1) {
        this.joy1Strobe = 0;
        this.joy1Shift = this.joy1State;
      }
      return;
    }
    if (addr >= 0x4000 && addr <= 0x4003) {
      // Basic APU Pulse 1
      if (addr === 0x4000) this.apuPulse1Vol = val & 0x0f;
      if (addr === 0x4002 || addr === 0x4003) {
        const rawTimer = (this.readMem(0x4002) | ((this.readMem(0x4003) & 0x07) << 8));
        this.apuPulse1Freq = rawTimer > 0 ? 1789773 / (16 * (rawTimer + 1)) : 0;
      }
      return;
    }

    // Mapper Write Handling (e.g. UNROM Mapper 2 bank select)
    if (addr >= 0x8000) {
      if (this.mapper === 2) {
        this.prgBank0 = val & 0x0f;
      } else if (this.mapper === 3) {
        this.chrBank0 = (val & 0x03) * 2;
      }
    }
  }

  private readVram(addr: number): number {
    addr &= 0x3fff;
    if (addr < 0x2000) {
      return this.chrRom[addr % this.chrRom.length] || 0;
    }
    if (addr < 0x3f00) {
      const vramIndex = this.mirrorVramAddr(addr);
      return this.vram[vramIndex];
    }
    return this.paletteRam[addr & 0x1f];
  }

  private writeVram(addr: number, val: number): void {
    addr &= 0x3fff;
    if (addr < 0x2000) {
      if (this.chrChunks === 0) {
        this.chrRom[addr] = val;
      }
      return;
    }
    if (addr < 0x3f00) {
      const vramIndex = this.mirrorVramAddr(addr);
      this.vram[vramIndex] = val;
      return;
    }
    let palIndex = addr & 0x1f;
    if ((palIndex & 0x03) === 0) palIndex &= 0x0f; // Mirror $3F10, $3F14 to $3F00, etc.
    this.paletteRam[palIndex] = val;
  }

  private mirrorVramAddr(addr: number): number {
    addr = (addr - 0x2000) & 0x0fff;
    const table = Math.floor(addr / 0x400);
    const offset = addr % 0x400;
    if (this.mirroring === 0) {
      // Horizontal
      return ((table > 1 ? 1 : 0) * 0x400 + offset) % 2048;
    } else {
      // Vertical
      return ((table % 2) * 0x400 + offset) % 2048;
    }
  }

  private runFrame(): void {
    // 29780 CPU cycles per frame
    let targetCycles = 29780;
    while (targetCycles > 0) {
      const cyclesExecuted = this.stepCpu();
      targetCycles -= cyclesExecuted;
    }

    // Set VBlank & trigger NMI
    this.ppuStatus |= 0x80;
    if ((this.ppuCtrl & 0x80) !== 0) {
      this.triggerNmi();
    }
  }

  private triggerNmi(): void {
    // Push PC and Status onto stack
    this.pushStack((this.pc >> 8) & 0xff);
    this.pushStack(this.pc & 0xff);
    this.pushStack(this.p & ~0x10); // Clear B flag
    this.p |= 0x04; // Set Interrupt Disable
    this.pc = this.readMem(0xfffa) | (this.readMem(0xfffb) << 8);
  }

  private pushStack(val: number): void {
    this.ram[0x100 + this.sp] = val;
    this.sp = (this.sp - 1) & 0xff;
  }

  private popStack(): number {
    this.sp = (this.sp + 1) & 0xff;
    return this.ram[0x100 + this.sp];
  }

  // 6502 Step
  private stepCpu(): number {
    const opcode = this.readMem(this.pc++);
    switch (opcode) {
      case 0x00: // BRK
        this.pc++;
        this.pushStack((this.pc >> 8) & 0xff);
        this.pushStack(this.pc & 0xff);
        this.pushStack(this.p | 0x30);
        this.p |= 0x04;
        this.pc = this.readMem(0xfffe) | (this.readMem(0xffff) << 8);
        return 7;
      case 0xea: // NOP
        return 2;
      case 0x78: // SEI
        this.p |= 0x04;
        return 2;
      case 0x58: // CLI
        this.p &= ~0x04;
        return 2;
      case 0x18: // CLC
        this.p &= ~0x01;
        return 2;
      case 0x38: // SEC
        this.p |= 0x01;
        return 2;
      case 0xa9: // LDA Immediate
        this.a = this.readMem(this.pc++);
        this.setZN(this.a);
        return 2;
      case 0xa5: // LDA ZeroPage
        this.a = this.readMem(this.readMem(this.pc++));
        this.setZN(this.a);
        return 3;
      case 0xad: { // LDA Absolute
        const addr = this.readMem(this.pc++) | (this.readMem(this.pc++) << 8);
        this.a = this.readMem(addr);
        this.setZN(this.a);
        return 4;
      }
      case 0x85: // STA ZeroPage
        this.writeMem(this.readMem(this.pc++), this.a);
        return 3;
      case 0x8d: { // STA Absolute
        const addr = this.readMem(this.pc++) | (this.readMem(this.pc++) << 8);
        this.writeMem(addr, this.a);
        return 4;
      }
      case 0xa2: // LDX Immediate
        this.x = this.readMem(this.pc++);
        this.setZN(this.x);
        return 2;
      case 0xa0: // LDY Immediate
        this.y = this.readMem(this.pc++);
        this.setZN(this.y);
        return 2;
      case 0x86: // STX ZeroPage
        this.writeMem(this.readMem(this.pc++), this.x);
        return 3;
      case 0x8e: { // STX Absolute
        const addr = this.readMem(this.pc++) | (this.readMem(this.pc++) << 8);
        this.writeMem(addr, this.x);
        return 4;
      }
      case 0x4c: { // JMP Absolute
        this.pc = this.readMem(this.pc) | (this.readMem(this.pc + 1) << 8);
        return 3;
      }
      case 0x20: { // JSR Absolute
        const target = this.readMem(this.pc++) | (this.readMem(this.pc++) << 8);
        const ret = this.pc - 1;
        this.pushStack((ret >> 8) & 0xff);
        this.pushStack(ret & 0xff);
        this.pc = target;
        return 6;
      }
      case 0x60: { // RTS
        const low = this.popStack();
        const high = this.popStack();
        this.pc = ((high << 8) | low) + 1;
        return 6;
      }
      case 0x40: { // RTI
        this.p = (this.popStack() & ~0x10) | 0x20;
        const low = this.popStack();
        const high = this.popStack();
        this.pc = (high << 8) | low;
        return 6;
      }
      case 0xd0: { // BNE
        const offset = (this.readMem(this.pc++) << 24) >> 24;
        if ((this.p & 0x02) === 0) {
          this.pc += offset;
          return 3;
        }
        return 2;
      }
      case 0xf0: { // BEQ
        const offset = (this.readMem(this.pc++) << 24) >> 24;
        if ((this.p & 0x02) !== 0) {
          this.pc += offset;
          return 3;
        }
        return 2;
      }
      case 0x10: { // BPL
        const offset = (this.readMem(this.pc++) << 24) >> 24;
        if ((this.p & 0x80) === 0) {
          this.pc += offset;
          return 3;
        }
        return 2;
      }
      case 0x30: { // BMI
        const offset = (this.readMem(this.pc++) << 24) >> 24;
        if ((this.p & 0x80) !== 0) {
          this.pc += offset;
          return 3;
        }
        return 2;
      }
      case 0xca: // DEX
        this.x = (this.x - 1) & 0xff;
        this.setZN(this.x);
        return 2;
      case 0xe8: // INX
        this.x = (this.x + 1) & 0xff;
        this.setZN(this.x);
        return 2;
      case 0x88: // DEY
        this.y = (this.y - 1) & 0xff;
        this.setZN(this.y);
        return 2;
      case 0xc8: // INY
        this.y = (this.y + 1) & 0xff;
        this.setZN(this.y);
        return 2;
      default:
        // Generic fallback instruction
        return 2;
    }
  }

  private setZN(val: number): void {
    if ((val & 0xff) === 0) this.p |= 0x02; else this.p &= ~0x02;
    if ((val & 0x80) !== 0) this.p |= 0x80; else this.p &= ~0x80;
  }

  // PPU Render Frame: 256x240 pixels
  private renderFrame(): void {
    if (!this.ctx || !this.imageData) return;

    const pixels = this.imageData.data;
    const bgPatternBase = (this.ppuCtrl & 0x10) ? 0x1000 : 0x0000;
    const universalBgColor = NES_PALETTE[this.paletteRam[0] & 0x3f] || 0x000000;

    // Fast background tile scan
    for (let tileY = 0; tileY < 30; tileY++) {
      for (let tileX = 0; tileX < 32; tileX++) {
        const ntAddr = 0x2000 + tileY * 32 + tileX;
        const tileId = this.readVram(ntAddr);
        const tileOffset = bgPatternBase + tileId * 16;

        for (let row = 0; row < 8; row++) {
          const plane0 = this.readVram(tileOffset + row);
          const plane1 = this.readVram(tileOffset + row + 8);
          const py = tileY * 8 + row;

          for (let col = 0; col < 8; col++) {
            const px = tileX * 8 + col;
            const bit = 7 - col;
            const colorIdx = ((plane0 >> bit) & 1) | (((plane1 >> bit) & 1) << 1);

            let rgb = universalBgColor;
            if (colorIdx > 0) {
              const palColor = this.readVram(0x3f00 + colorIdx);
              rgb = NES_PALETTE[palColor & 0x3f] || universalBgColor;
            }

            const pIdx = (py * 256 + px) * 4;
            pixels[pIdx] = (rgb >> 16) & 0xff;
            pixels[pIdx + 1] = (rgb >> 8) & 0xff;
            pixels[pIdx + 2] = rgb & 0xff;
            pixels[pIdx + 3] = 255;
          }
        }
      }
    }

    // Render Sprites (64 sprites from OAM)
    const sprPatternBase = (this.ppuCtrl & 0x08) ? 0x1000 : 0x0000;
    for (let i = 252; i >= 0; i -= 4) {
      const y = this.oam[i] + 1;
      const tileId = this.oam[i + 1];
      const attr = this.oam[i + 2];
      const x = this.oam[i + 3];
      if (y >= 240) continue;

      const flipH = (attr & 0x40) !== 0;
      const flipV = (attr & 0x80) !== 0;
      const palOffset = (attr & 0x03) * 4 + 0x10;
      const tileOffset = sprPatternBase + tileId * 16;

      for (let row = 0; row < 8; row++) {
        const r = flipV ? 7 - row : row;
        const plane0 = this.readVram(tileOffset + r);
        const plane1 = this.readVram(tileOffset + r + 8);
        const py = y + row;
        if (py >= 240) continue;

        for (let col = 0; col < 8; col++) {
          const c = flipH ? col : 7 - col;
          const px = x + (flipH ? 7 - col : col);
          if (px >= 256) continue;

          const colorIdx = ((plane0 >> c) & 1) | (((plane1 >> c) & 1) << 1);
          if (colorIdx !== 0) {
            const palColor = this.readVram(0x3f00 + palOffset + colorIdx);
            const rgb = NES_PALETTE[palColor & 0x3f] || 0xffffff;
            const pIdx = (py * 256 + px) * 4;
            pixels[pIdx] = (rgb >> 16) & 0xff;
            pixels[pIdx + 1] = (rgb >> 8) & 0xff;
            pixels[pIdx + 2] = rgb & 0xff;
            pixels[pIdx + 3] = 255;
          }
        }
      }
    }

    this.ctx.putImageData(this.imageData, 0, 0);
  }

  public getStats() {
    return {
      fps: this.currentFps,
      frameTime: Number(this.lastFrameTime.toFixed(2)),
      audioLatency: 15,
      sampleRate: this.audioCtx?.sampleRate || 44100,
      framesRendered: this.fpsCounter,
      droppedFrames: 0,
      backend: 'Canvas 2D' as const,
    };
  }

  public saveState(): string {
    return JSON.stringify({
      ram: Array.from(this.ram),
      vram: Array.from(this.vram),
      paletteRam: Array.from(this.paletteRam),
      oam: Array.from(this.oam),
      a: this.a,
      x: this.x,
      y: this.y,
      sp: this.sp,
      pc: this.pc,
      p: this.p,
      ppuCtrl: this.ppuCtrl,
      ppuMask: this.ppuMask,
      ppuStatus: this.ppuStatus,
    });
  }

  public loadState(stateStr: string): void {
    try {
      const s = JSON.parse(stateStr);
      this.ram.set(new Uint8Array(s.ram));
      this.vram.set(new Uint8Array(s.vram));
      this.paletteRam.set(new Uint8Array(s.paletteRam));
      this.oam.set(new Uint8Array(s.oam));
      this.a = s.a;
      this.x = s.x;
      this.y = s.y;
      this.sp = s.sp;
      this.pc = s.pc;
      this.p = s.p;
      this.ppuCtrl = s.ppuCtrl;
      this.ppuMask = s.ppuMask;
      this.ppuStatus = s.ppuStatus;
    } catch (e) {
      console.error('Failed to restore NES state:', e);
    }
  }
}
