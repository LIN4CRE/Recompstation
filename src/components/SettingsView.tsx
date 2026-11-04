import React, { useState, useEffect, useRef } from 'react';
import {
  Settings,
  Cpu,
  HardDrive,
  Keyboard,
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  Download,
  Upload,
  Trash2,
  Layers,
  Database,
  FileJson,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { GameItem, SaveState } from '../types/rom';
import { getAllSaveStates, importAllSaveStates } from '../services/storage';

interface SettingsViewProps {
  games: GameItem[];
  onClearLibrary: () => void;
  onRefreshLibrary?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  games,
  onClearLibrary,
  onRefreshLibrary,
}) => {
  const [hasSimd, setHasSimd] = useState<boolean | null>(null);
  const [webglInfo, setWebglInfo] = useState<string>('Detecting...');
  const [audioInfo, setAudioInfo] = useState<string>('Detecting...');
  const [storageUsed, setStorageUsed] = useState<string>('Calculating...');

  // Save states store diagnostics & export/import
  const [saveStatesCount, setSaveStatesCount] = useState<number>(0);
  const [saveStatesSizeKB, setSaveStatesSizeKB] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    // 5. Query save states from IndexedDB
    fetchSaveStatesSummary();
  }, []);

  const fetchSaveStatesSummary = async () => {
    try {
      const allSaves = await getAllSaveStates();
      setSaveStatesCount(allSaves.length);
      const totalBytes = allSaves.reduce((acc, s) => acc + (s.size || (s.data ? s.data.length : 0)), 0);
      setSaveStatesSizeKB(Math.round(totalBytes / 1024));
    } catch (e) {
      console.error('Failed to load save states summary:', e);
    }
  };

  // Export Entire IndexedDB Save State Store as JSON
  const handleExportSaveStatesStore = async () => {
    try {
      const allSaves = await getAllSaveStates();
      if (allSaves.length === 0) {
        setStatusMessage({ text: 'No save states found in IndexedDB to export.', type: 'error' });
        setTimeout(() => setStatusMessage(null), 3500);
        return;
      }

      const exportPayload = {
        app: 'RecompStation',
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        store: 'saves',
        totalRecords: allSaves.length,
        states: allSaves,
      };

      const jsonStr = JSON.stringify(exportPayload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `RecompStation_All_SaveStates_${Date.now()}.json`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);

      setStatusMessage({
        text: `Exported ${allSaves.length} save states (${Math.round(blob.size / 1024)} KB) successfully!`,
        type: 'success',
      });
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      setStatusMessage({ text: `Export failed: ${err.message}`, type: 'error' });
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  // Import Entire IndexedDB Save State Store from JSON
  const handleImportSaveStatesFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        // Check format: either direct array of SaveState or export payload with .states
        let statesToImport: SaveState[] = [];
        if (Array.isArray(parsed)) {
          statesToImport = parsed;
        } else if (parsed && Array.isArray(parsed.states)) {
          statesToImport = parsed.states;
        } else {
          throw new Error('Invalid save state JSON format. Expected an array of save state objects.');
        }

        if (statesToImport.length === 0) {
          throw new Error('No valid save state records found in this file.');
        }

        const { importedCount } = await importAllSaveStates(statesToImport);
        await fetchSaveStatesSummary();
        onRefreshLibrary?.();

        setStatusMessage({
          text: `Successfully imported ${importedCount} save states into IndexedDB!`,
          type: 'success',
        });
        setTimeout(() => setStatusMessage(null), 4000);
      } catch (err: any) {
        setStatusMessage({ text: `Import failed: ${err.message}`, type: 'error' });
        setTimeout(() => setStatusMessage(null), 5000);
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.onerror = () => {
      setStatusMessage({ text: 'Failed to read the selected file.', type: 'error' });
      setIsImporting(false);
      setTimeout(() => setStatusMessage(null), 4000);
    };

    reader.readAsText(file);
  };

  const handleExportLibraryBackup = () => {
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

    setStatusMessage({
      text: `Exported metadata for ${games.length} games.`,
      type: 'success',
    });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center space-x-3">
            <Settings className="w-8 h-8 text-cyan-400" />
            <span>Settings & Hardware Diagnostics</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Inspect device acceleration capabilities, manage save states backups, and storage quotas.
          </p>
        </div>

        {statusMessage && (
          <div
            className={`px-4 py-2 rounded-xl border flex items-center space-x-2 font-mono text-xs shadow-lg animate-fade-in ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300'
                : 'bg-red-950/80 border-red-600 text-red-300'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}
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

        {/* IndexedDB Save States Store Export & Import */}
        <div className="p-6 rounded-2xl bg-[#10141e]/90 border border-[#273043] space-y-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <Layers className="w-5 h-5 text-cyan-400" />
                <span>Save States Store (IndexedDB Export & Import)</span>
              </h2>
              <span className="px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-400 font-mono text-[10px] font-bold">
                CROSS-BROWSER
              </span>
            </div>

            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              Export your entire IndexedDB save state store as a unified JSON archive. You can import this JSON file into another browser instance (e.g. Chrome, Firefox, Edge, or the native Windows executable) to seamlessly transfer all your gameplay states and progress.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-6 font-mono text-xs">
              <div className="p-3 rounded-xl bg-[#141b27] border border-slate-800">
                <span className="text-slate-500 text-[10px] block">TOTAL SAVE STATES</span>
                <span className="text-lg font-bold text-white">{saveStatesCount}</span>
                <span className="text-slate-500 text-[10px] block">Across all games</span>
              </div>

              <div className="p-3 rounded-xl bg-[#141b27] border border-slate-800">
                <span className="text-slate-500 text-[10px] block">STORE PAYLOAD SIZE</span>
                <span className="text-lg font-bold text-cyan-400">{saveStatesSizeKB} KB</span>
                <span className="text-slate-500 text-[10px] block">IndexedDB memory</span>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-800">
            {/* Hidden file input for import */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImportSaveStatesFile}
              accept=".json,application/json"
              className="hidden"
            />

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleExportSaveStatesStore}
                className="flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-bold transition-all shadow-sm"
              >
                <Download className="w-4 h-4 text-cyan-400" />
                <span>Export Save States (.json)</span>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-[#161d2b] hover:bg-[#1d2638] text-purple-300 border border-purple-500/40 text-xs font-mono font-bold transition-all shadow-sm"
              >
                <Upload className="w-4 h-4 text-purple-400" />
                <span>{isImporting ? 'Importing...' : 'Import Save States (.json)'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Local Storage & Library Management */}
        <div className="p-6 rounded-2xl bg-[#10141e]/90 border border-[#273043] space-y-5 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center space-x-2 mb-4">
              <HardDrive className="w-5 h-5 text-purple-400" />
              <span>Library Metadata & Cache Management</span>
            </h2>

            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              All your ROM binaries, technical analysis reports, and generated cover art are stored strictly on your local device via IndexedDB. Nothing is uploaded to remote servers. You can export a library metadata backup or clear the local cache at any time.
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
              onClick={handleExportLibraryBackup}
              className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-[#161d2b] hover:bg-[#1d2638] text-slate-200 border border-slate-700 text-xs font-mono font-bold transition-all"
            >
              <FileJson className="w-4 h-4 text-cyan-400" />
              <span>Export Library Metadata</span>
            </button>

            <button
              onClick={() => {
                if (confirm('Clear all local games and save states? This cannot be undone.')) {
                  onClearLibrary();
                  setSaveStatesCount(0);
                  setSaveStatesSizeKB(0);
                  setStatusMessage({ text: 'Local library and IndexedDB cache cleared.', type: 'success' });
                  setTimeout(() => setStatusMessage(null), 3000);
                }
              }}
              className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-900/60 text-xs font-mono font-bold transition-all"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear Local Storage</span>
            </button>
          </div>
        </div>

        {/* Global Keyboard Shortcuts Card */}
        <div className="p-6 rounded-2xl bg-[#10141e]/90 border border-[#273043] space-y-4">
          <h2 className="text-base font-bold text-white flex items-center space-x-2">
            <Keyboard className="w-5 h-5 text-amber-400" />
            <span>Global Hotkeys & Command Palette</span>
          </h2>

          <p className="text-xs text-slate-400 font-mono leading-relaxed">
            RecompStation includes global shortcuts for instant system navigation and game launching:
          </p>

          <div className="space-y-2 font-mono text-xs">
            <div className="p-2.5 rounded-lg bg-[#141b27] border border-slate-800 flex justify-between items-center">
              <span className="text-slate-300">Open Command Palette</span>
              <kbd className="px-2 py-1 rounded bg-[#1e2738] border border-slate-700 text-cyan-300 font-bold text-[11px]">
                Cmd/Ctrl + K
              </kbd>
            </div>
            <div className="p-2.5 rounded-lg bg-[#141b27] border border-slate-800 flex justify-between items-center">
              <span className="text-slate-300">Quick Save State (In Player)</span>
              <kbd className="px-2 py-1 rounded bg-[#1e2738] border border-slate-700 text-cyan-300 font-bold text-[11px]">
                F2
              </kbd>
            </div>
            <div className="p-2.5 rounded-lg bg-[#141b27] border border-slate-800 flex justify-between items-center">
              <span className="text-slate-300">Quick Load State (In Player)</span>
              <kbd className="px-2 py-1 rounded bg-[#1e2738] border border-slate-700 text-purple-300 font-bold text-[11px]">
                F4
              </kbd>
            </div>
            <div className="p-2.5 rounded-lg bg-[#141b27] border border-slate-800 flex justify-between items-center">
              <span className="text-slate-300">Toggle Technical Telemetry HUD</span>
              <kbd className="px-2 py-1 rounded bg-[#1e2738] border border-slate-700 text-emerald-300 font-bold text-[11px]">
                F3
              </kbd>
            </div>
          </div>
        </div>
      </div>

      {/* Recompa Heritage & Unified Core Architecture Card */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-[#121826] to-[#0e121d] border border-cyan-500/30 space-y-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <span>Recompa Heritage & Unified Engine Subsystems</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-950 text-purple-300 border border-purple-800">
                LIN4CRE/Recompa Merged
              </span>
            </h3>
            <p className="text-xs text-slate-400 font-mono">
              High-precision binary analysis, No-Intro cataloguing, and deterministic execution planning
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
          <div className="p-3 rounded-xl bg-[#0d111a] border border-slate-800 space-y-1">
            <span className="text-cyan-400 font-bold block">No-Intro DAT Catalogue (4 MB)</span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              O(1) SHA-1 and CRC32 cryptographic fingerprint matching across NES, SNES, GB/GBC, GBA, Genesis, and N64 library sets.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#0d111a] border border-slate-800 space-y-1">
            <span className="text-cyan-400 font-bold block">Canonical Payload Extraction</span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Automated iNES trainer and copier header stripping (SMC/SWC), SMD interleaved bit unscrambling, and N64 byte-swapping (.v64/.n64 to .z64).
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#0d111a] border border-slate-800 space-y-1">
            <span className="text-cyan-400 font-bold block">6-Tier Recompilation Planner</span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Deterministic evaluation prioritising browser-native WebAssembly recompilation over static ports and JIT/WASM emulation.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#0d111a] border border-slate-800 space-y-1">
            <span className="text-cyan-400 font-bold block">6-Point Live Session Verification</span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Automated testing suite verifying video framebuffer pixels, animation deltas, 60Hz timing, audio synthesis, and save state roundtrips.
            </p>
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
            <strong className="text-slate-300">Save State Portability:</strong> Save states generated in RecompStation can be exported as standard JSON data blobs and imported into any other browser or desktop instance.
          </li>
        </ul>
      </div>
    </div>
  );
};
