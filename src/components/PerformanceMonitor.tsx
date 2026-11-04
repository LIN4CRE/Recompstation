import React, { useState, useEffect } from 'react';
import {
  Activity,
  Cpu,
  HardDrive,
  Clock,
  Volume2,
  ChevronDown,
  ChevronUp,
  X,
  Zap,
  CornerDownRight,
} from 'lucide-react';

export interface ExecutionMetadata {
  platform: string;
  platformName?: string;
  executionMethod: string;
  backend?: string;
  sampleRate?: number;
  audioLatency?: number;
  title?: string;
  fileSize?: number;
  crc32?: string;
  droppedFrames?: number;
  resolution?: string;
}

export type OverlayCorner = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

export interface PerformanceMonitorProps {
  metadata: ExecutionMetadata;
  isVisible?: boolean;
  onClose?: () => void;
  defaultCorner?: OverlayCorner;
}

export const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  metadata,
  isVisible = true,
  onClose,
  defaultCorner = 'top-right',
}) => {
  const [corner, setCorner] = useState<OverlayCorner>(defaultCorner);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [fps, setFps] = useState<number>(60);
  const [frameTime, setFrameTime] = useState<number>(16.67);
  const [frameHistory, setFrameHistory] = useState<number[]>([]);
  const [memoryInfo, setMemoryInfo] = useState<{
    usedMb: number;
    totalMb: number;
    availableMb: number;
    percent: number;
  }>({
    usedMb: 24.5,
    totalMb: 64.0,
    availableMb: 1980.0,
    percent: 15,
  });

  // High-frequency requestAnimationFrame loop for real-time FPS and frame time tracking
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();
    let frameCount = 0;
    let lastFpsUpdate = performance.now();
    const rollingDeltas: number[] = [];

    // Query browser memory (Chromium performance.memory API with graceful fallback)
    const updateMemoryTelemetry = () => {
      if (typeof performance !== 'undefined' && (performance as any).memory) {
        const mem = (performance as any).memory;
        const used = mem.usedJSHeapSize / (1024 * 1024);
        const total = mem.totalJSHeapSize / (1024 * 1024);
        const limit = mem.jsHeapSizeLimit / (1024 * 1024);
        const available = Math.max(0, limit - used);

        setMemoryInfo({
          usedMb: Number(used.toFixed(1)),
          totalMb: Number(total.toFixed(1)),
          availableMb: Number(available.toFixed(0)),
          percent: Math.min(100, Math.round((used / limit) * 100)),
        });
      } else {
        // Fallback for non-Chromium browsers based on loaded ROM buffer + framebuffer footprint
        const romFootprint = metadata.fileSize ? metadata.fileSize / (1024 * 1024) : 0.5;
        const estimatedHeap = 22.4 + romFootprint * 1.5;
        setMemoryInfo({
          usedMb: Number(estimatedHeap.toFixed(1)),
          totalMb: 48.0,
          availableMb: 2048,
          percent: Math.round((estimatedHeap / 512) * 100),
        });
      }
    };

    updateMemoryTelemetry();
    const memInterval = setInterval(updateMemoryTelemetry, 1000);

    const rafLoop = (now: number) => {
      const delta = now - lastTime;
      lastTime = now;

      if (delta > 0 && delta < 200) {
        rollingDeltas.push(delta);
        if (rollingDeltas.length > 24) rollingDeltas.shift();
      }

      frameCount++;

      // Update telemetry display at ~4Hz so numbers remain readable to the human eye
      if (now - lastFpsUpdate >= 250) {
        const measuredFps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
        const avgFrameTime =
          rollingDeltas.length > 0
            ? rollingDeltas.reduce((acc, v) => acc + v, 0) / rollingDeltas.length
            : delta;

        setFps(measuredFps);
        setFrameTime(Number(avgFrameTime.toFixed(2)));
        setFrameHistory([...rollingDeltas]);

        frameCount = 0;
        lastFpsUpdate = now;
      }

      animId = requestAnimationFrame(rafLoop);
    };

    animId = requestAnimationFrame(rafLoop);

    return () => {
      cancelAnimationFrame(animId);
      clearInterval(memInterval);
    };
  }, [metadata]);

  if (!isVisible) return null;

  // Corner positioning styles - ensuring it anchors tightly to corner without obstructing gameplay
  const cornerClasses: Record<OverlayCorner, string> = {
    'top-right': 'top-3 right-3',
    'top-left': 'top-3 left-3',
    'bottom-right': 'bottom-14 right-3',
    'bottom-left': 'bottom-14 left-3',
  };

  const cycleCorner = () => {
    const sequence: OverlayCorner[] = ['top-right', 'top-left', 'bottom-left', 'bottom-right'];
    const nextIdx = (sequence.indexOf(corner) + 1) % sequence.length;
    setCorner(sequence[nextIdx]);
  };

  // High-contrast color coding
  const fpsColor =
    fps >= 58
      ? 'text-emerald-400'
      : fps >= 45
      ? 'text-amber-400'
      : 'text-rose-400';

  const frameTimeColor =
    frameTime <= 17.2
      ? 'text-emerald-400'
      : frameTime <= 22
      ? 'text-amber-400'
      : 'text-rose-400';

  return (
    <div
      className={`absolute ${cornerClasses[corner]} z-40 transition-all select-none font-mono pointer-events-auto`}
      style={{ width: isExpanded ? '280px' : '230px' }}
    >
      {/* Semi-transparent, high-contrast HUD panel */}
      <div className="bg-[#070a11]/75 backdrop-blur-md border border-cyan-500/30 rounded-xl shadow-2xl shadow-black/90 overflow-hidden">
        {/* HUD Header Bar */}
        <div className="px-2.5 py-1.5 bg-[#0e1422]/80 border-b border-[#1b263b] flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-[10px] font-extrabold text-white tracking-widest uppercase flex items-center space-x-1">
              <Activity className="w-3 h-3 text-cyan-400" />
              <span>TELEMETRY</span>
            </span>
          </div>

          <div className="flex items-center space-x-0.5">
            {/* Corner Repositioner */}
            <button
              onClick={cycleCorner}
              className="p-1 text-slate-400 hover:text-cyan-300 rounded hover:bg-slate-800/60 transition-colors"
              title="Move overlay to next screen corner"
            >
              <CornerDownRight className="w-3 h-3" />
            </button>

            {/* Expand / Minimize Toggle */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800/60 transition-colors"
              title={isExpanded ? 'Collapse to compact view' : 'Expand full diagnostics'}
            >
              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {/* Close / Hide Button */}
            {onClose && (
              <button
                onClick={onClose}
                className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800/60 transition-colors"
                title="Hide Performance Monitor (Toggle back via HUD button)"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Compact Primary Telemetry Metrics */}
        <div className="p-2.5 space-y-2">
          <div className="grid grid-cols-3 gap-1.5 text-center">
            {/* High-frequency FPS */}
            <div className="p-1.5 rounded-lg bg-[#090d16]/90 border border-slate-800/80">
              <span className="text-[8px] text-slate-400 block uppercase font-bold tracking-tight">
                FPS
              </span>
              <span className={`text-base font-extrabold leading-none ${fpsColor}`}>
                {fps}
              </span>
            </div>

            {/* High-frequency Frame Time */}
            <div className="p-1.5 rounded-lg bg-[#090d16]/90 border border-slate-800/80">
              <span className="text-[8px] text-slate-400 block uppercase font-bold tracking-tight">
                FRAME
              </span>
              <span className={`text-sm font-extrabold leading-none ${frameTimeColor}`}>
                {frameTime}<span className="text-[8px] text-slate-500 font-normal">ms</span>
              </span>
            </div>

            {/* Available Browser Memory */}
            <div className="p-1.5 rounded-lg bg-[#090d16]/90 border border-slate-800/80">
              <span className="text-[8px] text-slate-400 block uppercase font-bold tracking-tight">
                HEAP RAM
              </span>
              <span className="text-sm font-extrabold leading-none text-cyan-300">
                {memoryInfo.usedMb}<span className="text-[8px] text-slate-500 font-normal">M</span>
              </span>
            </div>
          </div>

          {/* Real-time Frame Pacing Sparkline */}
          <div className="pt-1 border-t border-[#162033]">
            <div className="flex items-center justify-between text-[8px] text-slate-400 mb-0.5">
              <span>PACING (Target 16.6ms)</span>
              <span className="text-slate-500 font-bold">{memoryInfo.availableMb}MB Avail</span>
            </div>
            <div className="flex items-end h-5 space-x-0.5 bg-[#05080f]/90 rounded p-0.5 border border-slate-800/80">
              {frameHistory.map((ft, idx) => {
                const barHeight = Math.min(100, Math.max(15, (ft / 33.3) * 100));
                const isSpike = ft > 18.5;
                return (
                  <div
                    key={idx}
                    className="flex-1 rounded-xs transition-all"
                    style={{
                      height: `${barHeight}%`,
                      backgroundColor: isSpike ? '#f43f5e' : '#10b981',
                    }}
                  ></div>
                );
              })}
            </div>
          </div>

          {/* Expanded Diagnostics Panel */}
          {isExpanded && (
            <div className="pt-2 border-t border-[#162033] space-y-1.5 text-[10px]">
              {/* Available Memory Breakdown */}
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400 flex items-center space-x-1">
                  <HardDrive className="w-3 h-3 text-cyan-400" />
                  <span>Avail Memory:</span>
                </span>
                <span className="font-bold text-white">
                  {memoryInfo.availableMb} MB ({memoryInfo.percent}% heap)
                </span>
              </div>

              {/* Engine Backend */}
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400 flex items-center space-x-1">
                  <Cpu className="w-3 h-3 text-purple-400" />
                  <span>Backend:</span>
                </span>
                <span className="font-bold text-emerald-400">
                  {metadata.backend || 'Canvas 2D / Wasm'}
                </span>
              </div>

              {/* Execution Profile */}
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400 flex items-center space-x-1">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span>Method:</span>
                </span>
                <span className="font-bold text-cyan-300 uppercase text-[9px] truncate max-w-[130px]">
                  {metadata.executionMethod.replace(/_/g, ' ')}
                </span>
              </div>

              {/* Audio Latency if available */}
              {metadata.audioLatency !== undefined && (
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400 flex items-center space-x-1">
                    <Volume2 className="w-3 h-3 text-cyan-400" />
                    <span>Audio Latency:</span>
                  </span>
                  <span className="font-bold text-white">
                    {metadata.audioLatency}ms @ {metadata.sampleRate || 44100}Hz
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
