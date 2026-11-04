import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  FileCode,
  CheckCircle,
  AlertTriangle,
  Play,
  BookmarkPlus,
  Binary,
  Layers,
  ArrowRight,
  Sparkles,
  Copy,
  Check,
  ShieldAlert,
  Flame,
  ListOrdered,
  Trash2,
  RefreshCw,
  Plus,
  Clock,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { RomAnalysisReport, GameItem } from '../types/rom';
import { extractRomFiles, analyzeRom } from '../services/romParser';
import { BUILTIN_HOMEBREWS, BuiltinHomebrew } from '../engines/BuiltinRoms';

export interface BatchQueueItem {
  id: string;
  file: File;
  name: string;
  size: number;
  status: 'pending' | 'extracting' | 'analyzing' | 'completed' | 'error';
  progressText: string;
  report?: RomAnalysisReport;
  rawData?: Uint8Array;
  gameItem?: GameItem;
  error?: string;
}

interface UploadViewProps {
  onGameReadyToPlay: (game: GameItem) => void;
  onSaveToLibrary: (game: GameItem) => void;
  onOpenReaAgent: (report: RomAnalysisReport, rawData: Uint8Array) => void;
  onOpenBoxArt: (game: GameItem) => void;
}

export const UploadView: React.FC<UploadViewProps> = ({
  onGameReadyToPlay,
  onSaveToLibrary,
  onOpenReaAgent,
  onOpenBoxArt,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState('');
  const [currentReport, setCurrentReport] = useState<RomAnalysisReport | null>(null);
  const [currentRawData, setCurrentRawData] = useState<Uint8Array | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Batch Processing Queue State
  const [batchQueue, setBatchQueue] = useState<BatchQueueItem[]>([]);
  const [isQueueProcessing, setIsQueueProcessing] = useState<boolean>(false);
  const isProcessingRef = useRef(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      enqueueFiles(files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
      enqueueFiles(files);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Enqueue multiple files into batch queue
  const enqueueFiles = (files: File[]) => {
    const newItems: BatchQueueItem[] = files.map((file, idx) => ({
      id: `${file.name}-${file.size}-${Date.now()}-${idx}`,
      file,
      name: file.name,
      size: file.size,
      status: 'pending',
      progressText: 'Queued for analysis',
    }));

    setBatchQueue((prev) => [...prev, ...newItems]);
  };

  // Queue Processing Worker
  useEffect(() => {
    if (isProcessingRef.current) return;

    const nextPending = batchQueue.find((item) => item.status === 'pending');
    if (!nextPending) {
      setIsQueueProcessing(false);
      return;
    }

    const processItem = async (targetItem: BatchQueueItem) => {
      isProcessingRef.current = true;
      setIsQueueProcessing(true);

      // Update item to extracting
      setBatchQueue((prev) =>
        prev.map((it) =>
          it.id === targetItem.id
            ? { ...it, status: 'extracting', progressText: 'Unpacking archive...' }
            : it
        )
      );

      try {
        const extracted = await extractRomFiles(targetItem.file);
        if (extracted.length === 0) {
          throw new Error('No valid ROM files identified in archive.');
        }

        const romFile = extracted[0];

        // Update item to analyzing
        setBatchQueue((prev) =>
          prev.map((it) =>
            it.id === targetItem.id
              ? { ...it, status: 'analyzing', progressText: 'Computing hashes & entropy...' }
              : it
          )
        );

        const report = await analyzeRom(romFile.name, romFile.data);

        const gameItem: GameItem = {
          id: `${report.platform}-${report.crc32}-${Date.now()}`,
          title: report.gameTitle || report.fileName,
          platform: report.platform,
          platformName: report.platformName,
          fileFormat: report.fileFormat,
          fileSize: report.fileSize,
          crc32: report.crc32,
          sha1: report.sha1,
          romData: romFile.data,
          executionMethod: report.recommendedExecution,
          compatibility: report.compatibility,
          favorite: false,
          addedAt: Date.now(),
          isBuiltIn: false,
          report,
        };

        // Automatically save to library for batch imports
        onSaveToLibrary(gameItem);

        // Update item to completed
        setBatchQueue((prev) =>
          prev.map((it) =>
            it.id === targetItem.id
              ? {
                  ...it,
                  status: 'completed',
                  progressText: 'Analyzed & Imported to Library',
                  report,
                  rawData: romFile.data,
                  gameItem,
                }
              : it
          )
        );

        // If no report currently viewed, focus this one
        setCurrentReport((prev) => prev || report);
        setCurrentRawData((prev) => prev || romFile.data);
      } catch (err: any) {
        setBatchQueue((prev) =>
          prev.map((it) =>
            it.id === targetItem.id
              ? {
                  ...it,
                  status: 'error',
                  progressText: err.message || 'Analysis failed',
                  error: err.message || 'Failed to process ROM',
                }
              : it
          )
        );
      } finally {
        isProcessingRef.current = false;
      }
    };

    processItem(nextPending);
  }, [batchQueue, onSaveToLibrary]);

  const handleClearCompletedQueue = () => {
    setBatchQueue((prev) => prev.filter((it) => it.status !== 'completed'));
  };

  const handleClearAllQueue = () => {
    setBatchQueue([]);
  };

  const handleSelectQueueItem = (item: BatchQueueItem) => {
    if (item.report && item.rawData) {
      setCurrentReport(item.report);
      setCurrentRawData(item.rawData);
    }
  };

  const handleLoadHomebrew = async (homebrew: BuiltinHomebrew) => {
    setIsAnalyzing(true);
    setSavedSuccess(false);
    setAnalysisProgress(`Loading verified homebrew: ${homebrew.title}...`);

    try {
      const report = await analyzeRom(`${homebrew.id}.nes`, homebrew.data);
      report.gameTitle = homebrew.title;
      setCurrentReport(report);
      setCurrentRawData(homebrew.data);
    } catch (e: any) {
      alert(`Homebrew load error: ${e.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCopyHash = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(label);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const createGameItem = (): GameItem | null => {
    if (!currentReport || !currentRawData) return null;
    return {
      id: `${currentReport.platform}-${currentReport.crc32}-${Date.now()}`,
      title: currentReport.gameTitle || currentReport.fileName,
      platform: currentReport.platform,
      platformName: currentReport.platformName,
      fileFormat: currentReport.fileFormat,
      fileSize: currentReport.fileSize,
      crc32: currentReport.crc32,
      sha1: currentReport.sha1,
      romData: currentRawData,
      executionMethod: currentReport.recommendedExecution,
      compatibility: currentReport.compatibility,
      favorite: false,
      addedAt: Date.now(),
      isBuiltIn: false,
      report: currentReport,
    };
  };

  const handlePlayNow = () => {
    const game = createGameItem();
    if (game) {
      onGameReadyToPlay(game);
    }
  };

  const handleSave = () => {
    const game = createGameItem();
    if (game) {
      onSaveToLibrary(game);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    }
  };

  // Queue metrics
  const completedCount = batchQueue.filter((it) => it.status === 'completed').length;
  const errorCount = batchQueue.filter((it) => it.status === 'error').length;
  const progressPercent = batchQueue.length > 0 ? Math.round((completedCount / batchQueue.length) * 100) : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center space-x-3">
          <span>ROM Binary Analysis & Batch Ingestion Pipeline</span>
          <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
            MULTI-ROM QUEUE
          </span>
        </h1>
        <p className="mt-2 text-sm text-slate-400 max-w-3xl">
          Drag and drop individual ROM files or multiple archives simultaneously. The batch processor unpacks files, extracts metadata, verifies checksums, determines the optimal recompilation or emulation method, and automatically imports them into your local library.
        </p>
      </div>

      {/* Batch Processing Queue Banner (Visible when items are in queue) */}
      {batchQueue.length > 0 && (
        <div className="rounded-2xl bg-[#10141e] border border-cyan-500/40 p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                <ListOrdered className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <span>Batch Ingestion Queue</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-cyan-950 text-cyan-300 border border-cyan-800">
                    {completedCount} / {batchQueue.length} Completed
                  </span>
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  {isQueueProcessing
                    ? 'Automated queue worker processing binaries and adding to library...'
                    : 'All queued items processed! Imported to local IndexedDB.'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 font-mono text-xs">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#161d2b] hover:bg-[#1d2638] text-cyan-300 border border-slate-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add More Files</span>
              </button>

              {completedCount > 0 && (
                <button
                  onClick={handleClearCompletedQueue}
                  className="px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                >
                  Clear Completed
                </button>
              )}

              <button
                onClick={handleClearAllQueue}
                className="p-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-900/50 transition-colors"
                title="Clear Entire Queue"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>

          {/* Queue Item Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-72 overflow-y-auto pr-1">
            {batchQueue.map((item) => {
              const sizeMB = (item.size / (1024 * 1024)).toFixed(2);
              const isSelected = currentReport?.crc32 === item.report?.crc32;

              return (
                <div
                  key={item.id}
                  onClick={() => handleSelectQueueItem(item)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-cyan-950/40 border-cyan-400 shadow-sm shadow-cyan-500/10'
                      : 'bg-[#141b27] border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="mb-2">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-bold text-white truncate" title={item.name}>
                        {item.report?.gameTitle || item.name}
                      </span>
                      {item.report && (
                        <span className="px-1.5 py-0.2 text-[9px] font-mono uppercase bg-cyan-950 text-cyan-400 border border-cyan-800 rounded flex-shrink-0">
                          {item.report.platform.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono block">
                      {sizeMB} MB • {item.name}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                    <div className="flex items-center space-x-1.5 text-[10px] font-mono">
                      {item.status === 'completed' && (
                        <span className="text-emerald-400 flex items-center space-x-1">
                          <CheckCircle className="w-3 h-3" />
                          <span>Imported ✓</span>
                        </span>
                      )}
                      {(item.status === 'extracting' || item.status === 'analyzing') && (
                        <span className="text-cyan-400 flex items-center space-x-1 animate-pulse">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>Analyzing...</span>
                        </span>
                      )}
                      {item.status === 'pending' && (
                        <span className="text-slate-400 flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>Pending</span>
                        </span>
                      )}
                      {item.status === 'error' && (
                        <span className="text-red-400 flex items-center space-x-1" title={item.error}>
                          <AlertCircle className="w-3 h-3" />
                          <span>Error</span>
                        </span>
                      )}
                    </div>

                    {item.gameItem && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (item.gameItem) onGameReadyToPlay(item.gameItem);
                        }}
                        className="px-2 py-1 rounded bg-cyan-500 hover:bg-cyan-400 text-black font-mono font-bold text-[10px] uppercase flex items-center space-x-1"
                        title="Play game immediately"
                      >
                        <Play className="w-2.5 h-2.5 fill-black" />
                        <span>Play</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Upload Drop Zone & Sample Homebrews (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 relative overflow-hidden group ${
              isDragging
                ? 'border-cyan-400 bg-cyan-950/20 scale-[1.01]'
                : 'border-[#273043] bg-[#10141e]/80 hover:border-cyan-500/50 hover:bg-[#131926]'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              multiple
              onChange={handleFileChange}
              accept=".nes,.sfc,.smc,.gb,.gbc,.gba,.z64,.n64,.v64,.md,.gen,.bin,.ch8,.wad,.iso,.cue,.zip"
              className="hidden"
            />

            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Upload className="w-8 h-8 text-cyan-400" />
            </div>

            <h3 className="text-base font-bold text-white mb-1">
              Drop Single or Multiple ROMs Here
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Select multiple files or ZIP archives at once. The batch queue analyzes and imports all ROMs sequentially.
            </p>

            <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-xs font-mono text-cyan-300">
              <FileCode className="w-3.5 h-3.5" />
              <span>Browse Multiple ROM Files</span>
            </div>

            <p className="mt-4 text-[11px] text-slate-500">
              100% Client-Side Sandbox. Files never leave your browser.
            </p>
          </div>

          {/* Quick-Test Built-in Homebrews */}
          <div className="rounded-2xl bg-[#10141e]/80 border border-[#273043] p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-mono uppercase tracking-wider font-bold text-slate-300 flex items-center space-x-2">
                <Flame className="w-4 h-4 text-amber-400" />
                <span>Instant Test Homebrews (1-Click)</span>
              </h4>
              <span className="text-[10px] text-slate-500 font-mono">Open Source / PD</span>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Don't have a ROM on hand? Test the analyzer and browser execution engine instantly with verified homebrews:
            </p>

            <div className="space-y-2">
              {BUILTIN_HOMEBREWS.map((hb) => (
                <button
                  key={hb.id}
                  onClick={() => handleLoadHomebrew(hb)}
                  className="w-full text-left p-3 rounded-xl bg-[#151a27] hover:bg-[#1a2133] border border-slate-800/80 hover:border-cyan-500/40 transition-all flex items-center justify-between group"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-white group-hover:text-cyan-400 transition-colors">
                        {hb.title}
                      </span>
                      <span className="px-1.5 py-0.2 text-[9px] font-mono uppercase bg-slate-800 text-slate-300 rounded">
                        {hb.platform.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{hb.description}</p>
                  </div>
                  <Play className="w-4 h-4 text-cyan-400 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Technical Analysis Report (7 cols) */}
        <div className="lg:col-span-7">
          {isAnalyzing ? (
            <div className="h-full min-h-[420px] rounded-2xl bg-[#10141e]/80 border border-[#273043] p-8 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin mb-4"></div>
              <h3 className="text-lg font-bold text-white mb-2">Analyzing ROM Binary</h3>
              <p className="text-sm font-mono text-cyan-400">{analysisProgress}</p>
            </div>
          ) : currentReport && currentRawData ? (
            <div className="rounded-2xl bg-[#10141e]/90 border border-[#273043] p-6 space-y-6">
              {/* Header Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-cyan-950 text-cyan-400 border border-cyan-800 uppercase">
                      {currentReport.platformName}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-300">
                      Region: {currentReport.region}
                    </span>
                    {currentReport.headerDetails['Cryptographic Verification'] && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-800 flex items-center space-x-1">
                        <Check className="w-3 h-3" />
                        <span>No-Intro DAT Verified</span>
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    {currentReport.gameTitle}
                  </h2>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    {currentReport.fileName} ({(currentReport.fileSize / 1024).toFixed(1)} KB)
                  </p>
                </div>

                {/* Primary Action Button */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handlePlayNow}
                    className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-extrabold text-sm shadow-lg shadow-cyan-500/25 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <Play className="w-4 h-4 fill-black" />
                    <span>PLAY INSTANTLY</span>
                  </button>

                  <button
                    onClick={handleSave}
                    disabled={savedSuccess}
                    className="p-2.5 rounded-xl bg-[#1b2234] hover:bg-[#222b42] text-slate-200 border border-slate-700/80 transition-all"
                    title="Add to Local Library"
                  >
                    {savedSuccess ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <BookmarkPlus className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Execution Strategy & Viability */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-[#141a27] border border-cyan-900/40">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 font-bold block mb-1">
                    Recommended Execution Method
                  </span>
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
                    <span className="font-bold text-sm text-white uppercase">
                      {currentReport.recommendedExecution.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{currentReport.estimatedPerformance}</p>
                </div>

                <div className="p-4 rounded-xl bg-[#141a27] border border-purple-900/40">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-purple-400 font-bold">
                      Recompilation Viability
                    </span>
                    <span className="text-xs font-mono font-bold text-white">
                      {currentReport.recompilationViabilityScore}%
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-cyan-400 rounded-full transition-all duration-500"
                      style={{ width: `${currentReport.recompilationViabilityScore}%` }}
                    ></div>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    {currentReport.recompilationViabilityScore > 85
                      ? 'High viability: Static binary translation / decompilation port available.'
                      : 'Emulation recommended: Complex memory mappers or dynamic coprocessor.'}
                  </p>
                </div>
              </div>

              {/* Checksum Hash Cards */}
              <div className="p-4 rounded-xl bg-[#141a27] border border-slate-800">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold block mb-2.5">
                  Cryptographic Integrity & Checksums
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
                  <div className="p-2.5 rounded-lg bg-[#0d111a] border border-slate-800/80 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-500 block">CRC32</span>
                      <span className="text-cyan-300 font-bold">{currentReport.crc32}</span>
                    </div>
                    <button
                      onClick={() => handleCopyHash(currentReport.crc32, 'crc')}
                      className="p-1 text-slate-400 hover:text-white"
                    >
                      {copiedHash === 'crc' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[#0d111a] border border-slate-800/80 flex items-center justify-between">
                    <div className="truncate mr-2">
                      <span className="text-[10px] text-slate-500 block">MD5</span>
                      <span className="text-slate-300 truncate block">{currentReport.md5.slice(0, 10)}...</span>
                    </div>
                    <button
                      onClick={() => handleCopyHash(currentReport.md5, 'md5')}
                      className="p-1 text-slate-400 hover:text-white flex-shrink-0"
                    >
                      {copiedHash === 'md5' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[#0d111a] border border-slate-800/80 flex items-center justify-between">
                    <div className="truncate mr-2">
                      <span className="text-[10px] text-slate-500 block">SHA-1</span>
                      <span className="text-slate-300 truncate block">{currentReport.sha1.slice(0, 10)}...</span>
                    </div>
                    <button
                      onClick={() => handleCopyHash(currentReport.sha1, 'sha1')}
                      className="p-1 text-slate-400 hover:text-white flex-shrink-0"
                    >
                      {copiedHash === 'sha1' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Entropy Distribution Visualization */}
              <div className="p-4 rounded-xl bg-[#141a27] border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
                    Shannon Entropy Distribution ({currentReport.entropy.toFixed(2)} bits/byte)
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {currentReport.entropy > 7.0 ? 'High (Compressed / Encrypted)' : 'Normal (Code & Tile Banks)'}
                  </span>
                </div>
                {/* Visualizer bars */}
                <div className="flex items-end h-14 space-x-1 pt-2">
                  {currentReport.entropyBuckets.map((val, idx) => {
                    const heightPercent = Math.min(100, Math.max(10, (val / 8.0) * 100));
                    const isHigh = val > 7.2;
                    return (
                      <div
                        key={idx}
                        className="flex-1 bg-slate-800 rounded-t overflow-hidden flex flex-col justify-end group relative"
                      >
                        <div
                          className={`w-full transition-all ${
                            isHigh ? 'bg-amber-500' : 'bg-cyan-500'
                          }`}
                          style={{ height: `${heightPercent}%` }}
                        ></div>
                        {/* Tooltip on hover */}
                        <div className="opacity-0 group-hover:opacity-100 absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-black text-[9px] font-mono text-white px-1 py-0.5 rounded pointer-events-none whitespace-nowrap z-10">
                          {val} bits
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Header Details Table */}
              {Object.keys(currentReport.headerDetails).length > 0 && (
                <div className="p-4 rounded-xl bg-[#141a27] border border-slate-800">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold block mb-2">
                    Internal Cartridge Header Dissection
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-xs">
                    {Object.entries(currentReport.headerDetails).map(([key, val]) => (
                      <div key={key} className="p-2 rounded bg-[#0d111a] border border-slate-800/60">
                        <span className="text-[10px] text-slate-500 block truncate">{key}</span>
                        <span className="text-slate-200 font-medium truncate block">{String(val)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  onClick={() => onOpenReaAgent(currentReport, currentRawData)}
                  className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/40 text-xs font-mono font-bold transition-all"
                >
                  <Binary className="w-4 h-4 text-purple-400" />
                  <span>Inspect in REA Agent / Disassembler</span>
                </button>

                <button
                  onClick={() => {
                    const game = createGameItem();
                    if (game) onOpenBoxArt(game);
                  }}
                  className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-xs font-mono font-bold transition-all"
                >
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Generate 4K Box Art</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[420px] rounded-2xl bg-[#10141e]/50 border border-dashed border-[#273043] p-8 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-800/40 flex items-center justify-center mb-4 text-slate-500">
                <Layers className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-300 mb-1">No ROM Loaded Yet</h3>
              <p className="text-xs text-slate-500 max-w-sm">
                Drop multiple ROM files or select one of the instant homebrews to process the batch queue and launch games.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
