import React, { useState, useRef, useEffect } from 'react';
import {
  Cpu,
  Binary,
  Send,
  Sparkles,
  Bot,
  User,
  ArrowRight,
  RefreshCw,
  Search,
  Code,
  FileSearch,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { RomAnalysisReport } from '../types/rom';
import {
  disassemble6502,
  disassembleSM83,
  disassembleChip8,
  disassembleMips,
  DisassembledInstruction,
} from '../services/disassembler';

interface ReaAgentViewProps {
  currentReport: RomAnalysisReport | null;
  rawData: Uint8Array | null;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
}

export const ReaAgentView: React.FC<ReaAgentViewProps> = ({ currentReport, rawData }) => {
  // Hex viewer state
  const [hexOffset, setHexOffset] = useState<number>(0);
  const [selectedByte, setSelectedByte] = useState<number | null>(null);

  // Disassembler state
  const [disasmArch, setDisasmArch] = useState<string>('auto');
  const [disasmOffset, setDisasmOffset] = useState<number>(0);
  const [instructions, setInstructions] = useState<DisassembledInstruction[]>([]);

  // AI Chat state (per feature requirements: multi-turn, scrollable thread, role selector, model selector)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.8-flash');
  const [selectedRole, setSelectedRole] = useState<'rea_specialist' | 'recomp_architect' | 'fast_lookup'>('rea_specialist');
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Set initial arch and offset when report changes
  useEffect(() => {
    if (currentReport) {
      if (currentReport.platform === 'nes') {
        setDisasmArch('6502');
        setDisasmOffset(16); // Skip iNES header
      } else if (currentReport.platform === 'gb' || currentReport.platform === 'gbc') {
        setDisasmArch('sm83');
        setDisasmOffset(0x0100); // Game Boy entrypoint
      } else if (currentReport.platform === 'chip8') {
        setDisasmArch('chip8');
        setDisasmOffset(0);
      } else if (currentReport.platform === 'n64') {
        setDisasmArch('mips');
        setDisasmOffset(0x1000);
      } else {
        setDisasmArch('6502');
        setDisasmOffset(0);
      }
    }
  }, [currentReport]);

  // Update disassembly when arch, offset, or rawData changes
  useEffect(() => {
    if (!rawData || rawData.length === 0) {
      setInstructions([]);
      return;
    }

    const arch = disasmArch === 'auto'
      ? (currentReport?.platform === 'nes' ? '6502' : currentReport?.platform === 'gb' ? 'sm83' : currentReport?.platform === 'chip8' ? 'chip8' : '6502')
      : disasmArch;

    let insts: DisassembledInstruction[] = [];
    if (arch === '6502') {
      insts = disassemble6502(rawData, disasmOffset, 35);
    } else if (arch === 'sm83') {
      insts = disassembleSM83(rawData, disasmOffset, 35);
    } else if (arch === 'chip8') {
      insts = disassembleChip8(rawData, disasmOffset, 35);
    } else if (arch === 'mips') {
      insts = disassembleMips(rawData, disasmOffset, 35);
    }

    setInstructions(insts);
  }, [rawData, disasmArch, disasmOffset, currentReport]);

  // Initial welcome message from REA Agent
  useEffect(() => {
    if (chatMessages.length === 0) {
      const romInfo = currentReport
        ? `I see you have loaded "${currentReport.gameTitle}" (${currentReport.platformName}). Checksum: ${currentReport.crc32}. Recommended execution: ${currentReport.recommendedExecution}.`
        : `No active ROM is loaded yet. You can ask me general questions about console architectures, static recompilations (N64Recomp, Ship of Harkinian), reverse engineering opcodes, or load a ROM from the Upload tab.`;

      setChatMessages([
        {
          id: 'msg-welcome',
          role: 'model',
          content: `Hello! I am REA (Reverse Engineer Anything), your specialized game-engine binary reverse engineering and static recompilation advisor.\n\n${romInfo}\n\nAsk me anything about opcode disassemblies, memory maps, DMA controllers, or how to port this binary to WebAssembly!`,
          timestamp: Date.now(),
        },
      ]);
    }
  }, [currentReport]);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatMessages]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputPrompt;
    if (!text.trim() || isSending) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setInputPrompt('');
    setIsSending(true);

    // Build context with current ROM metadata
    let systemInstruction = `You are REA (Reverse Engineer Anything), an elite binary reverse engineer, retro console architect, and static recompilation specialist.
You assist developers in understanding raw binaries, opcodes (6502, Z80, SM83, ARM7TDMI, MIPS R4300i, CHIP-8), hardware registers (PPU, SPU, APU, DMA, Joypad), and static recompilation pipelines (N64Recomp, sm64-port, Ship of Harkinian, etc.).`;

    if (currentReport) {
      systemInstruction += `\n\nCurrent ROM in context:
- Title: ${currentReport.gameTitle}
- Platform: ${currentReport.platformName} (${currentReport.platform})
- CRC32: ${currentReport.crc32} | SHA1: ${currentReport.sha1}
- File Size: ${currentReport.fileSize} bytes
- Header details: ${JSON.stringify(currentReport.headerDetails)}
- Recommended Execution: ${currentReport.recommendedExecution}
- Recompilation Viability: ${currentReport.recompilationViabilityScore}%`;
    }

    // Role-specific guidelines
    if (selectedRole === 'recomp_architect') {
      systemInstruction += `\nRole Focus: Emphasize static binary translation, decompilation techniques, Emscripten/WebAssembly compilation, and C engine ports.`;
    } else if (selectedRole === 'fast_lookup') {
      systemInstruction += `\nRole Focus: Provide ultra-concise, accurate register addresses, opcode cycle timings, and memory map offsets without long essays.`;
    }

    try {
      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...chatMessages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          systemInstruction,
          model: selectedModel,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch Gemini response');
      }

      setChatMessages((prev) => [
        ...prev,
        {
          id: `msg-resp-${Date.now()}`,
          role: 'model',
          content: data.reply || 'No response returned.',
          timestamp: Date.now(),
        },
      ]);
    } catch (err: any) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `msg-err-${Date.now()}`,
          role: 'model',
          content: `⚠️ Error consulting REA Agent: ${err.message}`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  // Render 256 bytes for Hex view
  const renderHexDump = () => {
    if (!rawData) {
      return (
        <div className="p-8 text-center text-slate-500 font-mono text-xs">
          No ROM binary loaded. Upload a file to view hex dump.
        </div>
      );
    }

    const rows: React.ReactNode[] = [];
    const pageSize = 256;
    const start = Math.min(hexOffset, Math.max(0, rawData.length - pageSize));
    const end = Math.min(rawData.length, start + pageSize);

    for (let i = start; i < end; i += 16) {
      const rowBytes = rawData.slice(i, Math.min(rawData.length, i + 16));
      const hexParts: React.ReactNode[] = [];
      const asciiParts: string[] = [];

      for (let j = 0; j < 16; j++) {
        if (j < rowBytes.length) {
          const byteVal = rowBytes[j];
          const isSelected = selectedByte === i + j;
          hexParts.push(
            <span
              key={j}
              onClick={() => setSelectedByte(i + j)}
              className={`cursor-pointer px-0.5 rounded transition-colors ${
                isSelected
                  ? 'bg-cyan-500 text-black font-bold'
                  : byteVal === 0
                  ? 'text-slate-600'
                  : byteVal >= 32 && byteVal <= 126
                  ? 'text-cyan-300'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {byteVal.toString(16).padStart(2, '0')}
            </span>
          );
          asciiParts.push(byteVal >= 32 && byteVal <= 126 ? String.fromCharCode(byteVal) : '.');
        } else {
          hexParts.push(<span key={j} className="text-transparent">00</span>);
          asciiParts.push(' ');
        }
      }

      rows.push(
        <div key={i} className="flex items-center space-x-3 hover:bg-slate-800/40 px-2 py-0.5 rounded">
          <span className="text-slate-500 font-bold w-16">
            0x{i.toString(16).toUpperCase().padStart(6, '0')}
          </span>
          <div className="flex space-x-1.5 flex-1">{hexParts}</div>
          <span className="text-slate-400 font-mono tracking-widest pl-2 border-l border-slate-800">
            {asciiParts.join('')}
          </span>
        </div>
      );
    }

    return rows;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Title */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center space-x-3">
            <Cpu className="w-8 h-8 text-purple-400" />
            <span>REA: Reverse Engineering & Binary Agent</span>
            <span className="px-2 py-0.5 text-xs font-mono font-bold bg-purple-950 text-purple-400 border border-purple-800 rounded">
              GEMINI 3.8 FLASH
            </span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Deep binary inspection, real multi-architecture disassembler, and AI-assisted recompilation analysis.
          </p>
        </div>

        {currentReport && (
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-[#141a27] border border-slate-800 font-mono text-xs text-slate-300">
            <span className="text-slate-500">Loaded:</span>
            <span className="text-cyan-400 font-bold truncate max-w-[200px]">{currentReport.gameTitle}</span>
            <span className="text-slate-600">|</span>
            <span className="text-purple-400 font-bold uppercase">{currentReport.platform}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Hex Dump & Disassembler (6 cols) */}
        <div className="lg:col-span-6 space-y-6">
          {/* Real Disassembler Pane */}
          <div className="rounded-2xl bg-[#10141e]/90 border border-[#273043] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800 mb-4">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Code className="w-4 h-4 text-cyan-400" />
                <span>Multi-Architecture Disassembler</span>
              </h3>

              {/* Architecture Selector */}
              <div className="flex items-center space-x-2">
                <select
                  value={disasmArch}
                  onChange={(e) => setDisasmArch(e.target.value)}
                  className="bg-[#182030] text-xs font-mono text-cyan-300 border border-slate-700 rounded-lg px-2 py-1 outline-none"
                >
                  <option value="6502">MOS 6502 (NES)</option>
                  <option value="sm83">Sharp SM83 (Game Boy)</option>
                  <option value="chip8">COSMAC CHIP-8</option>
                  <option value="mips">MIPS R4300i (N64)</option>
                </select>

                <input
                  type="text"
                  placeholder="Offset (hex)"
                  value={`0x${disasmOffset.toString(16).toUpperCase()}`}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value.replace(/[^0-9a-fA-F]/g, ''), 16);
                    if (!isNaN(parsed)) setDisasmOffset(parsed);
                  }}
                  className="w-24 bg-[#182030] text-xs font-mono text-slate-200 border border-slate-700 rounded-lg px-2 py-1 text-center outline-none"
                />
              </div>
            </div>

            {/* Instruction List */}
            <div className="h-64 overflow-y-auto space-y-1 font-mono text-xs pr-2">
              {instructions.length > 0 ? (
                instructions.map((ins, i) => (
                  <div
                    key={i}
                    className="flex items-center space-x-3 p-1 rounded hover:bg-slate-800/60 transition-colors"
                  >
                    <span className="text-slate-500 w-16">
                      ${ins.offset.toString(16).toUpperCase().padStart(4, '0')}
                    </span>
                    <span className="text-slate-400 w-20 truncate">{ins.hex}</span>
                    <span className="text-cyan-400 font-bold w-12">{ins.mnemonic}</span>
                    <span className="text-slate-200 flex-1 truncate">{ins.operands}</span>
                    {ins.comment && (
                      <span className="text-amber-400 text-[10px] hidden sm:inline truncate max-w-[140px]">
                        ; {ins.comment}
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-slate-500 text-xs">
                  Upload a ROM to inspect real disassembled machine instructions.
                </div>
              )}
            </div>
          </div>

          {/* Hex Viewer */}
          <div className="rounded-2xl bg-[#10141e]/90 border border-[#273043] p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Binary className="w-4 h-4 text-purple-400" />
                <span>Binary Hex Inspector</span>
              </h3>

              <div className="flex items-center space-x-2 font-mono text-xs">
                <button
                  onClick={() => setHexOffset(Math.max(0, hexOffset - 256))}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  ▲ Prev 256B
                </button>
                <button
                  onClick={() => setHexOffset(hexOffset + 256)}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  ▼ Next 256B
                </button>
              </div>
            </div>

            <div className="h-64 overflow-y-auto font-mono text-xs space-y-0.5">
              {renderHexDump()}
            </div>
          </div>
        </div>

        {/* Right Side: Gemini REA Multi-Turn Chat (6 cols) */}
        <div className="lg:col-span-6 flex flex-col h-[640px] rounded-2xl bg-[#10141e]/90 border border-[#273043] overflow-hidden">
          {/* Chat Header with Model & Role Selection */}
          <div className="p-4 bg-[#141a27] border-b border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">REA Reverse Engineering Chatbot</h3>
                  <p className="text-[10px] text-slate-400 font-mono">Agent-Assisted Binary Analysis</p>
                </div>
              </div>

              {/* Model Selector per Instructions */}
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="bg-[#0e131d] text-xs font-mono text-purple-300 border border-purple-900/60 rounded-lg px-2.5 py-1 outline-none"
              >
                <option value="gemini-3.8-flash">gemini-3.8-flash (General)</option>
                <option value="gemini-4-argon">gemini-4-argon (Complex Logic)</option>
                <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Fast)</option>
              </select>
            </div>

            {/* Role Pills */}
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-mono text-slate-400 uppercase">Agent Role:</span>
              <div className="flex space-x-1.5 text-[11px] font-mono">
                <button
                  onClick={() => setSelectedRole('rea_specialist')}
                  className={`px-2 py-0.5 rounded transition-all ${
                    selectedRole === 'rea_specialist'
                      ? 'bg-purple-950 text-purple-300 border border-purple-700'
                      : 'text-slate-400 hover:text-white bg-slate-900'
                  }`}
                >
                  Binary Specialist
                </button>
                <button
                  onClick={() => setSelectedRole('recomp_architect')}
                  className={`px-2 py-0.5 rounded transition-all ${
                    selectedRole === 'recomp_architect'
                      ? 'bg-cyan-950 text-cyan-300 border border-cyan-700'
                      : 'text-slate-400 hover:text-white bg-slate-900'
                  }`}
                >
                  Recomp Architect
                </button>
                <button
                  onClick={() => setSelectedRole('fast_lookup')}
                  className={`px-2 py-0.5 rounded transition-all ${
                    selectedRole === 'fast_lookup'
                      ? 'bg-amber-950 text-amber-300 border border-amber-700'
                      : 'text-slate-400 hover:text-white bg-slate-900'
                  }`}
                >
                  HW Register Spec
                </button>
              </div>
            </div>
          </div>

          {/* Quick Prompt Suggestion Chips */}
          <div className="px-4 py-2 bg-[#0c1018] border-b border-slate-800/80 flex items-center space-x-2 overflow-x-auto text-xs font-mono">
            <button
              onClick={() => handleSendMessage('Explain this ROM memory map, interrupt vectors, and hardware I/O registers.')}
              className="px-2.5 py-1 rounded-full bg-slate-800/70 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 whitespace-nowrap transition-colors"
            >
              🗺️ Memory Map
            </button>
            <button
              onClick={() => handleSendMessage('What static recompilation tools (e.g. N64Recomp, sm64-port) or WebAssembly pipelines fit this ROM?')}
              className="px-2.5 py-1 rounded-full bg-slate-800/70 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 whitespace-nowrap transition-colors"
            >
              ⚡ Recompilation Path
            </button>
            <button
              onClick={() => handleSendMessage('Decompile the main loop and explain how joypad inputs and scanlines are polled.')}
              className="px-2.5 py-1 rounded-full bg-slate-800/70 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 whitespace-nowrap transition-colors"
            >
              🔬 Decompile Routine
            </button>
          </div>

          {/* Scrollable Chat Thread */}
          <div ref={chatScrollRef} className="flex-1 p-4 overflow-y-auto space-y-4">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex space-x-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'model' && (
                  <div className="w-7 h-7 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="w-4 h-4 text-purple-400" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-medium shadow-md shadow-cyan-900/20 rounded-br-none'
                      : 'bg-[#151c2a] text-slate-200 border border-slate-800 rounded-bl-none font-mono'
                  }`}
                >
                  {msg.content}
                </div>
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="w-4 h-4 text-cyan-400" />
                  </div>
                )}
              </div>
            ))}

            {isSending && (
              <div className="flex space-x-3 items-center text-slate-400 text-xs font-mono">
                <div className="w-7 h-7 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center">
                  <RefreshCw className="w-4 h-4 text-purple-400 animate-spin" />
                </div>
                <span>REA is analyzing binary instructions...</span>
              </div>
            )}
          </div>

          {/* Chat Input */}
          <div className="p-3 bg-[#141a27] border-t border-slate-800 flex items-center space-x-2">
            <input
              type="text"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Ask REA about opcodes, memory registers, recompilation..."
              disabled={isSending}
              className="flex-1 bg-[#0d111a] border border-slate-700/80 rounded-xl px-4 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={isSending || !inputPrompt.trim()}
              className="p-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white shadow-md shadow-purple-600/30 transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
