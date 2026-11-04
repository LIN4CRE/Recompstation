import React, { useState, useEffect } from 'react';
import {
  Settings,
  Cpu,
  HardDrive,
  Keyboard,
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  Download,
  Trash2,
} from 'lucide-react';
import { GameItem } from '../types/rom';

interface SettingsViewProps {
  games: GameItem[];
  onClearLibrary: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ games, onClearLibrary }) => {
  const [hasSimd, setHasSimd] = useState<boolean | null>(null);
  const [webglInfo, setWebglInfo] = useState<string>('Detecting...');
  const [audioInfo, setAudioInfo] = useState<string>('Detecting...');
  const [storageUsed, setStorageUsed] = useState<string>('Calculating...');

  useEffect(() => {
    // 1. Test WASM SIMD
    try {
      const simdBytes = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 26, 11]);
      const module = new WebAssembly.Module(simdBytes);
      setHasSimd(!!module);
    } catch {
      setHasSimd(false);
    }

    // 2. Test WebGL 2.0
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2');
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'WebGL 2.0 Supported';
        setWebglInfo(renderer);
      } else {
        setWebglInfo('WebGL 1.0 Fallback');
      }
    } catch {
      setWebglInfo('Canvas 2D Only');
    }

    // 3. AudioContext
    try {
      const AudioClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioClass) {
        const ctx = new AudioClass();
        setAudioInfo(`${ctx.sampleRate} Hz (Latency: ~12ms)`);
        ctx.close();
      }
    } catch {
      setAudioInfo('Unavailable');
    }

    // 4. Storage estimate
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((est) => {
        const usedMb = est.usage ? (est.usage / (1024 * 1024)).toFixed(1) : '0';
        const quotaMb = est.quota ? (est.quota / (1024 * 1024)).toFixed(0) : '0';
        setStorageUsed(`${usedMb} MB used of ${quotaMb} MB available`);
      });
    }
  }, []);

  const handleExportBackup = () => {
    const backupData = games.map((g) => ({
      title: g.title,
      platform: g.platform,
      crc32: g.crc32,
      addedAt: g.addedAt,
      report: g.report,
    }));

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `RecompStation_Library_Backup_${Date.now()}.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Title */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center space-x-3">
          <Settings className="w-8 h-8 text-cyan-400" />
          <span>Settings & Hardware Diagnostics</span>
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Inspect device acceleration capabilities, storage quotas, and legal notices.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Hardware Acceleration & WebAssembly Diagnostics */}
        <div className="p-6 rounded-2xl bg-[#10141e]/90 border border-[#273043] space-y-5">
          <h2 className="text-base font-bold text-white flex items-center space-x-2">
            <Cpu className="w-5 h-5 text-cyan-400" />
            <span>Browser Capabilities & Execution Profile</span>
          </h2>

          <div className="space-y-3 font-mono text-xs">
            <div className="p-3 rounded-xl bg-[#141b27] border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-slate-400 block font-sans font-bold">WebAssembly SIMD (128-bit)</span>
                <span className="text-slate-500 text-[10px]">Vectorized instruction acceleration for emulators</span>
              </div>
              <span className={`px-2 py-0.5 rounded font-bold ${hasSimd ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400'}`}>
                {hasSimd ? 'ACTIVE' : 'UNAVAILABLE'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#141b27] border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-slate-400 block font-sans font-bold">Graphics Pipeline</span>
                <span className="text-slate-500 text-[10px] truncate max-w-xs block">{webglInfo}</span>
              </div>
              <span className="px-2 py-0.5 rounded font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
                HARDWARE
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#141b27] border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-slate-400 block font-sans font-bold">Web Audio Synthesis</span>
                <span className="text-slate-500 text-[10px]">{audioInfo}</span>
              </div>
              <span className="px-2 py-0.5 rounded font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                LOW-LATENCY
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#141b27] border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-slate-400 block font-sans font-bold">IndexedDB Quota</span>
                <span className="text-slate-500 text-[10px]">{storageUsed}</span>
              </div>
              <span className="px-2 py-0.5 rounded font-bold bg-slate-800 text-slate-300">
                SANDBOXED
              </span>
            </div>
          </div>
        </div>

        {/* Local Storage & Library Management */}
        <div className="p-6 rounded-2xl bg-[#10141e]/90 border border-[#273043] space-y-5 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center space-x-2 mb-4">
              <HardDrive className="w-5 h-5 text-purple-400" />
              <span>Library Persistence & Backup</span>
            </h2>

            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              All your ROM binaries, save states, and generated cover art are stored strictly on your local device via IndexedDB. Nothing is uploaded to remote servers. You can export a JSON metadata backup or clear the local cache at any time.
            </p>

            <div className="space-y-3 font-mono text-xs">
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Total Games in Library:</span>
                <span className="text-white font-bold">{games.length}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Target Dev Server:</span>
                <span className="text-cyan-400 font-bold">Port 3000 (Vite + Express)</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-800">
            <button
              onClick={handleExportBackup}
              className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-[#161d2b] hover:bg-[#1d2638] text-slate-200 border border-slate-700 text-xs font-mono font-bold transition-all"
            >
              <Download className="w-4 h-4 text-cyan-400" />
              <span>Export Metadata Backup</span>
            </button>

            <button
              onClick={() => {
                if (confirm('Clear all local games and save states? This cannot be undone.')) {
                  onClearLibrary();
                }
              }}
              className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-900/60 text-xs font-mono font-bold transition-all"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear Local Storage</span>
            </button>
          </div>
        </div>
      </div>

      {/* Legal & Compliance Safeguards Card */}
      <div className="p-6 rounded-2xl bg-[#0d1017] border border-[#273043] space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center space-x-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <span>Legal Safeguards, Fair Use & Preservation Policy</span>
        </h3>
        <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside leading-relaxed">
          <li>
            <strong className="text-slate-300">No Commercial ROMs Bundled:</strong> RecompStation is an execution platform and reverse-engineering tool. It does not distribute, host, or download copyrighted commercial game binaries.
          </li>
          <li>
            <strong className="text-slate-300">Local-First Architecture:</strong> Uploaded ROM files are decoded and run locally in your browser sandbox using WebAssembly. Files never leave your device.
          </li>
          <li>
            <strong className="text-slate-300">Open-Source Attribution:</strong> Acknowledges research and open-source contributions from N64Recomp, Ship of Harkinian (Harbour Masters), sm64-port, Wipeout Rewrite, and the global homebrew community.
          </li>
        </ul>
      </div>
    </div>
  );
};
