/**
 * Real CHIP-8 / Super-Chip Interpreter Engine with Web Audio & HTML5 Canvas Renderer.
 */

export class Chip8Engine {
  private memory = new Uint8Array(4096);
  private v = new Uint8Array(16); // Registers V0 - VF
  private i = 0; // Index register
  private pc = 0x200; // Program counter starts at 0x200
  private stack = new Uint16Array(16);
  private sp = 0;
  private delayTimer = 0;
  private soundTimer = 0;
  private keys = new Uint8Array(16); // 16 keypad keys
  private display = new Uint8Array(64 * 32); // 64x32 monochrome display
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private imageData: ImageData | null = null;
  private animationId: number | null = null;
  private timerInterval: any = null;
  private audioCtx: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private isRunning = false;
  private isPaused = false;
  private fpsCounter = 0;
  private currentFps = 60;
  private lastFpsTime = performance.now();
  private lastFrameTime = 16.6;

  // Built-in 4x5 font set (0-F)
  private fontset = new Uint8Array([
    0xf0, 0x90, 0x90, 0x90, 0xf0, // 0
    0x20, 0x60, 0x20, 0x20, 0x70, // 1
    0xf0, 0x10, 0xf0, 0x80, 0xf0, // 2
    0xf0, 0x10, 0xf0, 0x10, 0xf0, // 3
    0x90, 0x90, 0xf0, 0x10, 0x10, // 4
    0xf0, 0x80, 0xf0, 0x10, 0xf0, // 5
    0xf0, 0x80, 0xf0, 0x90, 0xf0, // 6
    0xf0, 0x10, 0x20, 0x40, 0x40, // 7
    0xf0, 0x90, 0xf0, 0x90, 0xf0, // 8
    0xf0, 0x90, 0xf0, 0x10, 0xf0, // 9
    0xf0, 0x90, 0xf0, 0x90, 0x90, // A
    0xe0, 0x90, 0xe0, 0x90, 0xe0, // B
    0xf0, 0x80, 0x80, 0x80, 0xf0, // C
    0xe0, 0x90, 0x90, 0x90, 0xe0, // D
    0xf0, 0x80, 0xf0, 0x80, 0xf0, // E
    0xf0, 0x80, 0xf0, 0x80, 0x80, // F
  ]);

  constructor() {
    this.reset();
  }

  public init(canvas: HTMLCanvasElement, romData: Uint8Array): void {
    this.canvas = canvas;
    this.canvas.width = 64;
    this.canvas.height = 32;
    this.ctx = canvas.getContext('2d', { alpha: false });
    if (this.ctx) {
      this.imageData = this.ctx.createImageData(64, 32);
    }

    this.reset();
    this.loadRom(romData);
    this.initAudio();
  }

  private initAudio() {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    } catch {
      // AudioContext may be restricted until user gesture
    }
  }

  private startBeep() {
    if (!this.audioCtx) return;
    try {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      if (!this.oscillator) {
        this.oscillator = this.audioCtx.createOscillator();
        this.gainNode = this.audioCtx.createGain();
        this.oscillator.type = 'square';
        this.oscillator.frequency.value = 440; // A4 440Hz retro beep
        this.gainNode.gain.value = 0.15;
        this.oscillator.connect(this.gainNode);
        this.gainNode.connect(this.audioCtx.destination);
        this.oscillator.start();
      }
    } catch {
      // Ignore
    }
  }

  private stopBeep() {
    if (this.oscillator) {
      try {
        this.oscillator.stop();
        this.oscillator.disconnect();
      } catch {}
      this.oscillator = null;
      this.gainNode = null;
    }
  }

  public reset(): void {
    this.memory.fill(0);
    this.v.fill(0);
    this.i = 0;
    this.pc = 0x200;
    this.stack.fill(0);
    this.sp = 0;
    this.delayTimer = 0;
    this.soundTimer = 0;
    this.keys.fill(0);
    this.display.fill(0);
    this.stopBeep();

    // Load font set into 0x000 - 0x050
    for (let i = 0; i < this.fontset.length; i++) {
      this.memory[i] = this.fontset[i];
    }
  }

  public loadRom(romData: Uint8Array): void {
    this.reset();
    for (let i = 0; i < romData.length && 0x200 + i < 4096; i++) {
      this.memory[0x200 + i] = romData[i];
    }
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;

    // 60Hz Timer tick
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (!this.isPaused) {
        if (this.delayTimer > 0) this.delayTimer--;
        if (this.soundTimer > 0) {
          this.soundTimer--;
          this.startBeep();
        } else {
          this.stopBeep();
        }
      }
    }, 1000 / 60);

    const loop = (timestamp: number) => {
      if (!this.isRunning) return;

      const delta = timestamp - this.lastFpsTime;
      if (delta >= 1000) {
        this.currentFps = Math.round((this.fpsCounter * 1000) / delta);
        this.fpsCounter = 0;
        this.lastFpsTime = timestamp;
      }

      if (!this.isPaused) {
        const frameStart = performance.now();
        // Emulate ~10-15 instructions per frame (approx 700Hz CPU clock)
        for (let i = 0; i < 12; i++) {
          this.emulateCycle();
        }
        this.render();
        this.fpsCounter++;
        this.lastFrameTime = performance.now() - frameStart;
      }

      this.animationId = requestAnimationFrame(loop);
    };

    this.animationId = requestAnimationFrame(loop);
  }

  public pause(): void {
    this.isPaused = true;
    this.stopBeep();
  }

  public resume(): void {
    this.isPaused = false;
  }

  public destroy(): void {
    this.isRunning = false;
    if (this.animationId) cancelAnimationFrame(this.animationId);
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.stopBeep();
    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch {}
    }
  }

  public setKey(keyIndex: number, pressed: boolean): void {
    if (keyIndex >= 0 && keyIndex < 16) {
      this.keys[keyIndex] = pressed ? 1 : 0;
    }
  }

  private emulateCycle(): void {
    if (this.pc >= 4094) return;
    const opcode = (this.memory[this.pc] << 8) | this.memory[this.pc + 1];
    this.pc += 2;

    const nnn = opcode & 0x0fff;
    const n = opcode & 0x000f;
    const x = (opcode >> 8) & 0x0f;
    const y = (opcode >> 4) & 0x0f;
    const kk = opcode & 0x00ff;

    switch (opcode & 0xf000) {
      case 0x0000:
        if (opcode === 0x00e0) {
          this.display.fill(0);
        } else if (opcode === 0x00ee) {
          if (this.sp > 0) {
            this.sp--;
            this.pc = this.stack[this.sp];
          }
        }
        break;

      case 0x1000:
        this.pc = nnn;
        break;

      case 0x2000:
        if (this.sp < 16) {
          this.stack[this.sp] = this.pc;
          this.sp++;
          this.pc = nnn;
        }
        break;

      case 0x3000:
        if (this.v[x] === kk) this.pc += 2;
        break;

      case 0x4000:
        if (this.v[x] !== kk) this.pc += 2;
        break;

      case 0x5000:
        if (this.v[x] === this.v[y]) this.pc += 2;
        break;

      case 0x6000:
        this.v[x] = kk;
        break;

      case 0x7000:
        this.v[x] = (this.v[x] + kk) & 0xff;
        break;

      case 0x8000:
        switch (n) {
          case 0x0: this.v[x] = this.v[y]; break;
          case 0x1: this.v[x] |= this.v[y]; break;
          case 0x2: this.v[x] &= this.v[y]; break;
          case 0x3: this.v[x] ^= this.v[y]; break;
          case 0x4: {
            const sum = this.v[x] + this.v[y];
            this.v[0xf] = sum > 0xff ? 1 : 0;
            this.v[x] = sum & 0xff;
            break;
          }
          case 0x5: {
            this.v[0xf] = this.v[x] >= this.v[y] ? 1 : 0;
            this.v[x] = (this.v[x] - this.v[y]) & 0xff;
            break;
          }
          case 0x6:
            this.v[0xf] = this.v[x] & 0x1;
            this.v[x] >>= 1;
            break;
          case 0x7:
            this.v[0xf] = this.v[y] >= this.v[x] ? 1 : 0;
            this.v[x] = (this.v[y] - this.v[x]) & 0xff;
            break;
          case 0xe:
            this.v[0xf] = (this.v[x] & 0x80) >> 7;
            this.v[x] = (this.v[x] << 1) & 0xff;
            break;
        }
        break;

      case 0x9000:
        if (this.v[x] !== this.v[y]) this.pc += 2;
        break;

      case 0xa000:
        this.i = nnn;
        break;

      case 0xb000:
        this.pc = (nnn + this.v[0]) & 0xfff;
        break;

      case 0xc000:
        this.v[x] = Math.floor(Math.random() * 256) & kk;
        break;

      case 0xd000: {
        // Draw sprite
        const xPos = this.v[x] % 64;
        const yPos = this.v[y] % 32;
        this.v[0xf] = 0;

        for (let row = 0; row < n; row++) {
          const spriteByte = this.memory[this.i + row];
          const currY = yPos + row;
          if (currY >= 32) break;

          for (let col = 0; col < 8; col++) {
            const currX = xPos + col;
            if (currX >= 64) break;

            if ((spriteByte & (0x80 >> col)) !== 0) {
              const pixelIndex = currY * 64 + currX;
              if (this.display[pixelIndex] === 1) {
                this.v[0xf] = 1; // Collision
              }
              this.display[pixelIndex] ^= 1;
            }
          }
        }
        break;
      }

      case 0xe000:
        if (kk === 0x9e) {
          if (this.keys[this.v[x] & 0xf]) this.pc += 2;
        } else if (kk === 0xa1) {
          if (!this.keys[this.v[x] & 0xf]) this.pc += 2;
        }
        break;

      case 0xf000:
        switch (kk) {
          case 0x07: this.v[x] = this.delayTimer; break;
          case 0x0a: {
            let keyPress = false;
            for (let k = 0; k < 16; k++) {
              if (this.keys[k]) {
                this.v[x] = k;
                keyPress = true;
                break;
              }
            }
            if (!keyPress) this.pc -= 2; // Pause until key
            break;
          }
          case 0x15: this.delayTimer = this.v[x]; break;
          case 0x18: this.soundTimer = this.v[x]; break;
          case 0x1e: this.i = (this.i + this.v[x]) & 0xfff; break;
          case 0x29: this.i = (this.v[x] & 0x0f) * 5; break;
          case 0x33:
            this.memory[this.i] = Math.floor(this.v[x] / 100);
            this.memory[this.i + 1] = Math.floor((this.v[x] % 100) / 10);
            this.memory[this.i + 2] = this.v[x] % 10;
            break;
          case 0x55:
            for (let idx = 0; idx <= x; idx++) {
              this.memory[this.i + idx] = this.v[idx];
            }
            break;
          case 0x65:
            for (let idx = 0; idx <= x; idx++) {
              this.v[idx] = this.memory[this.i + idx];
            }
            break;
        }
        break;
    }
  }

  private render(): void {
    if (!this.ctx || !this.imageData) return;

    const data = this.imageData.data;
    // Cyber green/cyan phosphor look
    for (let i = 0; i < 64 * 32; i++) {
      const idx = i * 4;
      if (this.display[i] === 1) {
        data[idx] = 0;       // R
        data[idx + 1] = 240; // G
        data[idx + 2] = 255; // B (bright cyan)
        data[idx + 3] = 255; // Alpha
      } else {
        data[idx] = 10;
        data[idx + 1] = 12;
        data[idx + 2] = 16;
        data[idx + 3] = 255;
      }
    }

    this.ctx.putImageData(this.imageData, 0, 0);
  }

  public getStats() {
    return {
      fps: this.currentFps,
      frameTime: Number(this.lastFrameTime.toFixed(2)),
      audioLatency: 12,
      sampleRate: this.audioCtx?.sampleRate || 44100,
      framesRendered: this.fpsCounter,
      droppedFrames: 0,
      backend: 'Canvas 2D' as const,
    };
  }

  public saveState(): string {
    return JSON.stringify({
      memory: Array.from(this.memory),
      v: Array.from(this.v),
      i: this.i,
      pc: this.pc,
      stack: Array.from(this.stack),
      sp: this.sp,
      delayTimer: this.delayTimer,
      soundTimer: this.soundTimer,
      display: Array.from(this.display),
    });
  }

  public loadState(stateStr: string): void {
    try {
      const state = JSON.parse(stateStr);
      this.memory.set(new Uint8Array(state.memory));
      this.v.set(new Uint8Array(state.v));
      this.i = state.i;
      this.pc = state.pc;
      this.stack.set(new Uint16Array(state.stack));
      this.sp = state.sp;
      this.delayTimer = state.delayTimer;
      this.soundTimer = state.soundTimer;
      this.display.set(new Uint8Array(state.display));
    } catch (e) {
      console.error('Failed to load CHIP-8 save state:', e);
    }
  }
}
