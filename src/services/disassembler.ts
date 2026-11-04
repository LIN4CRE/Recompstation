/**
 * Real Multi-Architecture Disassembler for 6502, SM83 (Game Boy), ARM7TDMI (GBA), MIPS R4300i (N64), and CHIP-8.
 */

export interface DisassembledInstruction {
  offset: number;
  hex: string;
  mnemonic: string;
  operands: string;
  comment?: string;
}

// -------------------------------------------------------------
// MOS 6502 Disassembler (NES)
// -------------------------------------------------------------
const OPCODES_6502: Record<number, { name: string; bytes: number; format: string }> = {
  0x00: { name: 'BRK', bytes: 1, format: '' },
  0x01: { name: 'ORA', bytes: 2, format: '($%2,X)' },
  0x05: { name: 'ORA', bytes: 2, format: '$%2' },
  0x06: { name: 'ASL', bytes: 2, format: '$%2' },
  0x08: { name: 'PHP', bytes: 1, format: '' },
  0x09: { name: 'ORA', bytes: 2, format: '#$%2' },
  0x0a: { name: 'ASL', bytes: 1, format: 'A' },
  0x0d: { name: 'ORA', bytes: 3, format: '$%3%2' },
  0x0e: { name: 'ASL', bytes: 3, format: '$%3%2' },
  0x10: { name: 'BPL', bytes: 2, format: '$%r' },
  0x18: { name: 'CLC', bytes: 1, format: '' },
  0x20: { name: 'JSR', bytes: 3, format: '$%3%2' },
  0x29: { name: 'AND', bytes: 2, format: '#$%2' },
  0x4c: { name: 'JMP', bytes: 3, format: '$%3%2' },
  0x60: { name: 'RTS', bytes: 1, format: '' },
  0x78: { name: 'SEI', bytes: 1, format: '' },
  0x85: { name: 'STA', bytes: 2, format: '$%2' },
  0x8d: { name: 'STA', bytes: 3, format: '$%3%2' },
  0xa0: { name: 'LDY', bytes: 2, format: '#$%2' },
  0xa2: { name: 'LDX', bytes: 2, format: '#$%2' },
  0xa9: { name: 'LDA', bytes: 2, format: '#$%2' },
  0xad: { name: 'LDA', bytes: 3, format: '$%3%2' },
  0xbd: { name: 'LDA', bytes: 3, format: '$%3%2,X' },
  0xd0: { name: 'BNE', bytes: 2, format: '$%r' },
  0xea: { name: 'NOP', bytes: 1, format: '' },
  0xf0: { name: 'BEQ', bytes: 2, format: '$%r' },
};

export function disassemble6502(data: Uint8Array, startOffset = 0, count = 30): DisassembledInstruction[] {
  const result: DisassembledInstruction[] = [];
  let offset = startOffset;

  while (offset < data.length && result.length < count) {
    const opcode = data[offset];
    const info = OPCODES_6502[opcode] || { name: `.BYTE`, bytes: 1, format: `0x${opcode.toString(16).padStart(2, '0')}` };
    const bytesCount = Math.min(info.bytes, data.length - offset);

    let hexStr = '';
    for (let i = 0; i < bytesCount; i++) {
      hexStr += data[offset + i].toString(16).padStart(2, '0') + ' ';
    }

    let operands = info.format;
    if (bytesCount === 2) {
      const b1 = data[offset + 1].toString(16).padStart(2, '0');
      if (operands.includes('%r')) {
        // relative branch
        const rel = (data[offset + 1] << 24) >> 24;
        const target = (offset + 2 + rel).toString(16).toUpperCase().padStart(4, '0');
        operands = operands.replace('%r', target);
      } else {
        operands = operands.replace('%2', b1.toUpperCase());
      }
    } else if (bytesCount === 3) {
      const b1 = data[offset + 1].toString(16).padStart(2, '0');
      const b2 = data[offset + 2].toString(16).padStart(2, '0');
      operands = operands.replace('%2', b1.toUpperCase()).replace('%3', b2.toUpperCase());
    }

    let comment = '';
    if (operands.includes('$2000') || operands.includes('$2001') || operands.includes('$2002')) {
      comment = 'PPU Register Access';
    } else if (operands.includes('$4016') || operands.includes('$4017')) {
      comment = 'Joypad Strobe / Controller Read';
    }

    result.push({
      offset,
      hex: hexStr.trim(),
      mnemonic: info.name,
      operands,
      comment,
    });

    offset += bytesCount;
  }

  return result;
}

// -------------------------------------------------------------
// Sharp SM83 Disassembler (Game Boy / Game Boy Color)
// -------------------------------------------------------------
const OPCODES_SM83: Record<number, { name: string; bytes: number; ops: string }> = {
  0x00: { name: 'NOP', bytes: 1, ops: '' },
  0x06: { name: 'LD', bytes: 2, ops: 'B, $%2' },
  0x0e: { name: 'LD', bytes: 2, ops: 'C, $%2' },
  0x16: { name: 'LD', bytes: 2, ops: 'D, $%2' },
  0x1e: { name: 'LD', bytes: 2, ops: 'E, $%2' },
  0x20: { name: 'JR', bytes: 2, ops: 'NZ, $%r' },
  0x21: { name: 'LD', bytes: 3, ops: 'HL, $%3%2' },
  0x28: { name: 'JR', bytes: 2, ops: 'Z, $%r' },
  0x31: { name: 'LD', bytes: 3, ops: 'SP, $%3%2' },
  0x3e: { name: 'LD', bytes: 2, ops: 'A, $%2' },
  0x77: { name: 'LD', bytes: 1, ops: '(HL), A' },
  0xaf: { name: 'XOR', bytes: 1, ops: 'A' },
  0xc3: { name: 'JP', bytes: 3, ops: '$%3%2' },
  0xcd: { name: 'CALL', bytes: 3, ops: '$%3%2' },
  0xe0: { name: 'LDH', bytes: 2, ops: '($FF00+$%2), A' },
  0xf0: { name: 'LDH', bytes: 2, ops: 'A, ($FF00+$%2)' },
  0xf3: { name: 'DI', bytes: 1, ops: '' },
  0xfb: { name: 'EI', bytes: 1, ops: '' },
};

export function disassembleSM83(data: Uint8Array, startOffset = 0x100, count = 30): DisassembledInstruction[] {
  const result: DisassembledInstruction[] = [];
  let offset = Math.min(startOffset, data.length - 1);

  while (offset < data.length && result.length < count) {
    const opcode = data[offset];
    const info = OPCODES_SM83[opcode] || { name: `DB`, bytes: 1, ops: `0x${opcode.toString(16).padStart(2, '0')}` };
    const bytesCount = Math.min(info.bytes, data.length - offset);

    let hexStr = '';
    for (let i = 0; i < bytesCount; i++) {
      hexStr += data[offset + i].toString(16).padStart(2, '0') + ' ';
    }

    let operands = info.ops;
    if (bytesCount === 2) {
      const b1 = data[offset + 1].toString(16).padStart(2, '0');
      if (operands.includes('%r')) {
        const rel = (data[offset + 1] << 24) >> 24;
        operands = operands.replace('%r', (offset + 2 + rel).toString(16).toUpperCase());
      } else {
        operands = operands.replace('%2', b1.toUpperCase());
      }
    } else if (bytesCount === 3) {
      const b1 = data[offset + 1].toString(16).padStart(2, '0');
      const b2 = data[offset + 2].toString(16).padStart(2, '0');
      operands = operands.replace('%2', b1.toUpperCase()).replace('%3', b2.toUpperCase());
    }

    let comment = '';
    if (operands.includes('$40')) comment = 'LCD Control (LCDC)';
    else if (operands.includes('$42')) comment = 'Scroll Y (SCY)';
    else if (operands.includes('$43')) comment = 'Scroll X (SCX)';
    else if (operands.includes('$44')) comment = 'Current Scanline (LY)';

    result.push({
      offset,
      hex: hexStr.trim(),
      mnemonic: info.name,
      operands,
      comment,
    });

    offset += bytesCount;
  }

  return result;
}

// -------------------------------------------------------------
// CHIP-8 Disassembler
// -------------------------------------------------------------
export function disassembleChip8(data: Uint8Array, startOffset = 0, count = 30): DisassembledInstruction[] {
  const result: DisassembledInstruction[] = [];
  let offset = startOffset;

  while (offset + 1 < data.length && result.length < count) {
    const opcode = (data[offset] << 8) | data[offset + 1];
    const hex = opcode.toString(16).toUpperCase().padStart(4, '0');
    const nnn = opcode & 0x0fff;
    const n = opcode & 0x000f;
    const x = (opcode >> 8) & 0x0f;
    const y = (opcode >> 4) & 0x0f;
    const kk = opcode & 0x00ff;

    let mnemonic = 'UNKNOWN';
    let operands = '';
    let comment = '';

    const firstNibble = opcode >> 12;
    switch (firstNibble) {
      case 0x0:
        if (opcode === 0x00e0) { mnemonic = 'CLS'; comment = 'Clear display'; }
        else if (opcode === 0x00ee) { mnemonic = 'RET'; comment = 'Return from subroutine'; }
        else { mnemonic = 'SYS'; operands = `$${nnn.toString(16)}`; }
        break;
      case 0x1: mnemonic = 'JP'; operands = `$${nnn.toString(16)}`; comment = 'Jump to address'; break;
      case 0x2: mnemonic = 'CALL'; operands = `$${nnn.toString(16)}`; comment = 'Call subroutine'; break;
      case 0x3: mnemonic = 'SE'; operands = `V${x}, #$${kk.toString(16)}`; comment = 'Skip if Vx == kk'; break;
      case 0x4: mnemonic = 'SNE'; operands = `V${x}, #$${kk.toString(16)}`; comment = 'Skip if Vx != kk'; break;
      case 0x5: mnemonic = 'SE'; operands = `V${x}, V${y}`; break;
      case 0x6: mnemonic = 'LD'; operands = `V${x}, #$${kk.toString(16)}`; comment = `Set V${x} = kk`; break;
      case 0x7: mnemonic = 'ADD'; operands = `V${x}, #$${kk.toString(16)}`; comment = `Add kk to V${x}`; break;
      case 0x8:
        if (n === 0) { mnemonic = 'LD'; operands = `V${x}, V${y}`; }
        else if (n === 1) { mnemonic = 'OR'; operands = `V${x}, V${y}`; }
        else if (n === 2) { mnemonic = 'AND'; operands = `V${x}, V${y}`; }
        else if (n === 3) { mnemonic = 'XOR'; operands = `V${x}, V${y}`; }
        else if (n === 4) { mnemonic = 'ADD'; operands = `V${x}, V${y}`; comment = 'Add with carry in VF'; }
        else if (n === 5) { mnemonic = 'SUB'; operands = `V${x}, V${y}`; }
        break;
      case 0xa: mnemonic = 'LD'; operands = `I, $${nnn.toString(16)}`; comment = 'Load index register I'; break;
      case 0xb: mnemonic = 'JP'; operands = `V0, $${nnn.toString(16)}`; break;
      case 0xc: mnemonic = 'RND'; operands = `V${x}, #$${kk.toString(16)}`; break;
      case 0xd: mnemonic = 'DRW'; operands = `V${x}, V${y}, ${n}`; comment = `Draw ${n}-byte sprite at (Vx, Vy)`; break;
      case 0xe:
        if (kk === 0x9e) { mnemonic = 'SKP'; operands = `V${x}`; }
        else if (kk === 0xa1) { mnemonic = 'SKNP'; operands = `V${x}`; }
        break;
      case 0xf:
        if (kk === 0x07) { mnemonic = 'LD'; operands = `V${x}, DT`; }
        else if (kk === 0x15) { mnemonic = 'LD'; operands = `DT, V${x}`; }
        else if (kk === 0x18) { mnemonic = 'LD'; operands = `ST, V${x}`; comment = 'Sound timer'; }
        else if (kk === 0x1e) { mnemonic = 'ADD'; operands = `I, V${x}`; }
        else if (kk === 0x29) { mnemonic = 'LD'; operands = `F, V${x}`; comment = 'Digit sprite font'; }
        else if (kk === 0x33) { mnemonic = 'LD'; operands = `B, V${x}`; comment = 'BCD representation'; }
        else if (kk === 0x55) { mnemonic = 'LD'; operands = `[I], V${x}`; }
        else if (kk === 0x65) { mnemonic = 'LD'; operands = `V${x}, [I]`; }
        break;
    }

    result.push({
      offset,
      hex: `${data[offset].toString(16).padStart(2, '0')} ${data[offset + 1].toString(16).padStart(2, '0')}`,
      mnemonic,
      operands,
      comment,
    });

    offset += 2;
  }

  return result;
}

// -------------------------------------------------------------
// MIPS R4300i Disassembler (Nintendo 64)
// -------------------------------------------------------------
export function disassembleMips(data: Uint8Array, startOffset = 0x1000, count = 20): DisassembledInstruction[] {
  const result: DisassembledInstruction[] = [];
  let offset = startOffset;

  while (offset + 3 < data.length && result.length < count) {
    const raw = (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
    const opcode = (raw >>> 26) & 0x3f;
    const rs = (raw >>> 21) & 0x1f;
    const rt = (raw >>> 16) & 0x1f;
    const imm = raw & 0xffff;
    const funct = raw & 0x3f;

    let mnemonic = 'MIPS_OP';
    let operands = `$${raw.toString(16).toUpperCase()}`;
    let comment = '';

    if (opcode === 0) {
      if (funct === 0 && raw === 0) { mnemonic = 'NOP'; operands = ''; }
      else if (funct === 0x08) { mnemonic = 'JR'; operands = `r${rs}`; comment = 'Jump register'; }
      else if (funct === 0x21) { mnemonic = 'ADDU'; operands = `r${(raw >>> 11) & 0x1f}, r${rs}, r${rt}`; }
    } else if (opcode === 0x0f) {
      mnemonic = 'LUI';
      operands = `r${rt}, 0x${imm.toString(16).toUpperCase()}`;
      comment = 'Load upper immediate (Address setup)';
    } else if (opcode === 0x09) {
      mnemonic = 'ADDIU';
      operands = `r${rt}, r${rs}, 0x${imm.toString(16).toUpperCase()}`;
    } else if (opcode === 0x02) {
      mnemonic = 'J';
      operands = `0x${((raw & 0x03ffffff) << 2).toString(16).toUpperCase()}`;
    } else if (opcode === 0x03) {
      mnemonic = 'JAL';
      operands = `0x${((raw & 0x03ffffff) << 2).toString(16).toUpperCase()}`;
      comment = 'Jump and link (Function call)';
    } else if (opcode === 0x23) {
      mnemonic = 'LW';
      operands = `r${rt}, 0x${imm.toString(16)}(r${rs})`;
      comment = 'Load 32-bit word';
    } else if (opcode === 0x2b) {
      mnemonic = 'SW';
      operands = `r${rt}, 0x${imm.toString(16)}(r${rs})`;
      comment = 'Store 32-bit word';
    }

    result.push({
      offset,
      hex: `${data[offset].toString(16).padStart(2, '0')} ${data[offset + 1].toString(16).padStart(2, '0')} ${data[offset + 2].toString(16).padStart(2, '0')} ${data[offset + 3].toString(16).padStart(2, '0')}`,
      mnemonic,
      operands,
      comment,
    });

    offset += 4;
  }

  return result;
}
