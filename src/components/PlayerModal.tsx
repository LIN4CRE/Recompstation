import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Maximize2,
  Camera,
  Volume2,
  VolumeX,
  X,
  Sliders,
  Save,
  Download,
  Gamepad,
  Keyboard,
  Eye,
  Zap,
  Activity,
} from 'lucide-react';
import { GameItem, PerformanceStats } from '../types/rom';
import { WebAssemblyRunner } from '../engines/WebAssemblyRunner';
import { saveGameState, getGameSaveStates } from '../services/storage';
import { PerformanceMonitor, ExecutionMetadata } from './PerformanceMonitor';

interface PlayerModalProps {
  game: GameItem;
  onClose: () => void;
}

export const PlayerModal: React.FC<PlayerModalProps> = ({ game, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runnerRef = useRef<WebAssemblyRunner | null>(null);

  const [isPaused, setIsPaused] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'original' | '4:3' | '16:9' | 'pixel'>('4:3');
  const [crtFilter, setCrtFilter] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(80);
  const [showControlsHelp, setShowControlsHelp] = useState(false);
  const [showTouchControls, setShowTouchControls] = useState(false);
  const [showPerformance, setShowPerformance] = useState<boolean>(false);
  const [stats, setStats] = useState<PerformanceStats>({
    fps: 60,
    frameTime: 16.6,
    audioLatency: 12,
    sampleRate: 44100,
    framesRendered: 0,
    droppedFrames: 0,
    memoryUsageMb: 24.5,
    backend: 'Canvas 2D',
  });
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [hasGamepad, setHasGamepad] = useState(false);

  // Initialize engine and runner
  useEffect(() => {
    if (!canvasRef.current || !game.romData) return;

    const runner = new WebAssemblyRunner({
      canvas: canvasRef.current,
      romData: game.romData,
      platform: game.platform,
      aspectRatio,
      crtFilter,
      volume: isMuted ? 0 : volume,
    });

    runnerRef.current = runner;
    runner.start().catch((err) => {
      console.error('Failed to start game runner:', err);
      alert(`Execution Error: ${err.message}`);
    });

    // Check touch screen device
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      setShowTouchControls(true);
    }

    // Performance polling interval
    const statsInterval = setInterval(() => {
      if (runnerRef.current) {
        setStats(runnerRef.current.getPerformance());
      }
    }, 500);

    // Gamepad connection listener
    const handleGamepadConnected = () => setHasGamepad(true);
    const handleGamepadDisconnected = () => setHasGamepad(false);
    window.addEventListener('gamepadconnected', handleGamepadConnected);
    window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);

    // Keyboard handlers
    const keyMap: Record<string, keyof typeof runner.keys> = {
      ArrowUp: 'up', KeyW: 'up',
      ArrowDown: 'down', KeyS: 'down',
      ArrowLeft: 'left', KeyA: 'left',
      ArrowRight: 'right', KeyD: 'right',
      KeyZ: 'a', KeyJ: 'a',
      KeyX: 'b', KeyK: 'b',
      KeyC: 'x', KeyI: 'x',
      KeyV: 'y', KeyU: 'y',
      Enter: 'start',
      ShiftRight: 'select', Space: 'select',
      KeyQ: 'l',
      KeyE: 'r',
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'F3') {
        e.preventDefault();
        setShowPerformance((prev) => !prev);
        return;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      const mapped = keyMap[e.code];
      if (mapped && runnerRef.current) {
        runnerRef.current.updateButtons({ [mapped]: true });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const mapped = keyMap[e.code];
      if (mapped && runnerRef.current) {
        runnerRef.current.updateButtons({ [mapped]: false });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      runner.destroy();
      runnerRef.current = null;
      clearInterval(statsInterval);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('gamepadconnected', handleGamepadConnected);
      window.removeEventListener('gamepaddisconnected', handleGamepadDisconnected);
    };
  }, [game]);

  const togglePause = () => {
    if (!runnerRef.current) return;
    if (isPaused) {
      runnerRef.current.resume();
      setIsPaused(false);
    } else {
      runnerRef.current.pause();
      setIsPaused(true);
    }
  };

  const handleReset = () => {
    runnerRef.current?.reset();
  };

  const handleFullscreen = () => {
    const el = document.getElementById('player-viewport-container');
    if (el) {
      if (!document.fullscreenElement) {
        el.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  const handleScreenshot = () => {
    if (!runnerRef.current) return;
    const url = runnerRef.current.takeScreenshot();
    const link = document.createElement('a');
    link.download = `${game.title.replace(/\s+/g, '_')}_screenshot.png`;
    link.href = url;
    link.click();
    setSaveStatus('Screenshot saved!');
    setTimeout(() => setSaveStatus(null), 2500);
  };

  const handleSaveState = async () => {
    if (!runnerRef.current) return;
    try {
      const stateData = runnerRef.current.saveState();
      const screenshot = runnerRef.current.takeScreenshot();
      await saveGameState({
        id: `${game.id}-slot-1`,
        gameId: game.id,
        slot: 1,
        timestamp: Date.now(),
        data: stateData,
        screenshotUrl: screenshot,
        size: stateData.length,
      });
      setSaveStatus('Game state saved to IndexedDB!');
      setTimeout(() => setSaveStatus(null), 2500);
    } catch (e: any) {
      alert(`Save State failed: ${e.message}`);
    }
  };

  const handleLoadState = async () => {
    if (!runnerRef.current) return;
    try {
      const saves = await getGameSaveStates(game.id);
      if (saves.length > 0) {
        runnerRef.current.loadState(saves[0].data);
        setSaveStatus('Game state loaded!');
        setTimeout(() => setSaveStatus(null), 2500);
      } else {
        alert('No saved states found for this title.');
      }
    } catch (e: any) {
      alert(`Load state failed: ${e.message}`);
    }
  };

  // Virtual touch button handlers
  const handleTouchButton = (btn: string, pressed: boolean) => {
    if (runnerRef.current) {
      runnerRef.current.updateButtons({ [btn]: pressed });
    }
  };

  // Calculate canvas aspect ratio styles
  const getAspectRatioClasses = () => {
    switch (aspectRatio) {
      case '16:9':
        return 'w-full h-full max-h-[75vh] object-cover aspect-video';
      case 'original':
      case '4:3':
        return 'h-full max-h-[75vh] object-contain aspect-[4/3]';
      case 'pixel':
        return 'image-rendering-pixelated max-h-[75vh]';
      default:
        return 'h-full max-h-[75vh] object-contain';
    }
  };

  // Execution metadata for the PerformanceMonitor interface
  const executionMetadata: ExecutionMetadata = {
    platform: game.platform,
    platformName: game.platformName,
    executionMethod: game.executionMethod,
    backend: stats.backend,
    sampleRate: stats.sampleRate,
    audioLatency: stats.audioLatency,
    title: game.title,
    fileSize: game.fileSize,
    crc32: game.crc32,
    droppedFrames: stats.droppedFrames,
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-between overflow-hidden">
      {/* Top Bar */}
      <div className="w-full bg-[#0a0d14]/95 border-b border-[#232a3b] px-4 py-2.5 flex items-center justify-between z-20">
        <div className="flex items-center space-x-3">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <div>
            <h2 className="text-sm font-extrabold text-white flex items-center space-x-2">
              <span>{game.title}</span>
              <span className="px-1.5 py-0.2 text-[10px] font-mono uppercase bg-cyan-950 text-cyan-400 border border-cyan-800 rounded">
                {game.platform.toUpperCase()}
              </span>
            </h2>
            <span className="text-[11px] font-mono text-slate-400">
              Method: {game.executionMethod.replace(/_/g, ' ')}
            </span>
          </div>
        </div>

        {/* Real-time HUD Performance Pill */}
        <button
          onClick={() => setShowPerformance(!showPerformance)}
          className={`hidden md:flex items-center space-x-3 px-3 py-1 border rounded-lg font-mono text-xs transition-all ${
            showPerformance
              ? 'bg-[#182235] border-cyan-500/60 text-cyan-300 shadow-sm shadow-cyan-500/10'
              : 'bg-[#131926] border-slate-800 text-slate-400 hover:text-white'
          }`}
          title="Click to toggle Technical Performance Monitor overlay (or press F3)"
        >
          <div className="flex items-center space-x-1.5">
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-bold text-white">{stats.fps} FPS</span>
          </div>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400">{stats.frameTime}ms</span>
          <span className="text-slate-600">|</span>
          <span className="text-cyan-400">{stats.memoryUsageMb ?? 24.5}MB</span>
          <span className="text-slate-600">|</span>
          <span className="text-emerald-400">{stats.backend}</span>
        </button>

        {/* Close Button */}
        <div className="flex items-center space-x-2">
          {saveStatus && (
            <span className="text-xs font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-800/80 px-2 py-1 rounded">
              {saveStatus}
            </span>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Game Screen Viewport */}
      <div
        id="player-viewport-container"
        className="flex-1 w-full flex items-center justify-center relative p-2 sm:p-4 bg-black overflow-hidden"
      >
        {/* Real-Time High-Frequency Technical Performance Monitor Overlay */}
        <PerformanceMonitor
          metadata={executionMetadata}
          isVisible={showPerformance}
          onClose={() => setShowPerformance(false)}
        />

        <div
          className={`relative flex items-center justify-center transition-all ${
            crtFilter ? 'crt-overlay' : ''
          }`}
        >
          <canvas
            ref={canvasRef}
            className={`shadow-2xl rounded-sm transition-all ${getAspectRatioClasses()}`}
            style={{ imageRendering: 'pixelated' }}
          />
        </div>

        {/* On-Screen Mobile Touch Controls */}
        {showTouchControls && (
          <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 z-30 select-none">
            {/* Top L / R Bumpers */}
            <div className="flex justify-between pointer-events-auto">
              <button
                onTouchStart={() => handleTouchButton('l', true)}
                onTouchEnd={() => handleTouchButton('l', false)}
                className="w-14 h-10 rounded-lg bg-slate-800/70 active:bg-cyan-500/80 text-white font-mono text-xs font-bold border border-slate-700/80 backdrop-blur-sm"
              >
                L
              </button>
              <button
                onTouchStart={() => handleTouchButton('r', true)}
                onTouchEnd={() => handleTouchButton('r', false)}
                className="w-14 h-10 rounded-lg bg-slate-800/70 active:bg-cyan-500/80 text-white font-mono text-xs font-bold border border-slate-700/80 backdrop-blur-sm"
              >
                R
              </button>
            </div>

            {/* Bottom D-Pad and Action Buttons */}
            <div className="flex justify-between items-end pb-2 pointer-events-auto">
              {/* Virtual D-Pad */}
              <div className="relative w-32 h-32">
                <button
                  onTouchStart={() => handleTouchButton('up', true)}
                  onTouchEnd={() => handleTouchButton('up', false)}
                  className="absolute top-0 left-10 w-12 h-10 rounded-t-lg bg-slate-800/80 active:bg-cyan-500 text-white flex items-center justify-center font-bold text-lg border border-slate-700"
                >
                  ▲
                </button>
                <button
                  onTouchStart={() => handleTouchButton('down', true)}
                  onTouchEnd={() => handleTouchButton('down', false)}
                  className="absolute bottom-0 left-10 w-12 h-10 rounded-b-lg bg-slate-800/80 active:bg-cyan-500 text-white flex items-center justify-center font-bold text-lg border border-slate-700"
                >
                  ▼
                </button>
                <button
                  onTouchStart={() => handleTouchButton('left', true)}
                  onTouchEnd={() => handleTouchButton('left', false)}
                  className="absolute top-10 left-0 w-10 h-12 rounded-l-lg bg-slate-800/80 active:bg-cyan-500 text-white flex items-center justify-center font-bold text-lg border border-slate-700"
                >
                  ◀
                </button>
                <button
                  onTouchStart={() => handleTouchButton('right', true)}
                  onTouchEnd={() => handleTouchButton('right', false)}
                  className="absolute top-10 right-0 w-10 h-12 rounded-r-lg bg-slate-800/80 active:bg-cyan-500 text-white flex items-center justify-center font-bold text-lg border border-slate-700"
                >
                  ▶
                </button>
              </div>

              {/* Start & Select in Middle */}
              <div className="flex space-x-3 mb-2">
                <button
                  onTouchStart={() => handleTouchButton('select', true)}
                  onTouchEnd={() => handleTouchButton('select', false)}
                  className="px-3 py-1.5 rounded-full bg-slate-800/80 active:bg-cyan-500 text-slate-300 font-mono text-[10px] uppercase border border-slate-700"
                >
                  Select
                </button>
                <button
                  onTouchStart={() => handleTouchButton('start', true)}
                  onTouchEnd={() => handleTouchButton('start', false)}
                  className="px-3 py-1.5 rounded-full bg-slate-800/80 active:bg-cyan-500 text-slate-300 font-mono text-[10px] uppercase border border-slate-700"
                >
                  Start
                </button>
              </div>

              {/* A / B Action Buttons */}
              <div className="relative w-32 h-32 flex items-center justify-center">
                <button
                  onTouchStart={() => handleTouchButton('b', true)}
                  onTouchEnd={() => handleTouchButton('b', false)}
                  className="absolute bottom-2 left-2 w-14 h-14 rounded-full bg-red-600/80 active:bg-red-400 text-white font-extrabold text-sm border-2 border-red-400/50 shadow-lg"
                >
                  B
                </button>
                <button
                  onTouchStart={() => handleTouchButton('a', true)}
                  onTouchEnd={() => handleTouchButton('a', false)}
                  className="absolute top-2 right-2 w-14 h-14 rounded-full bg-cyan-600/80 active:bg-cyan-400 text-white font-extrabold text-sm border-2 border-cyan-400/50 shadow-lg"
                >
                  A
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls Toolbar */}
      <div className="w-full bg-[#0a0d14]/95 border-t border-[#232a3b] px-4 py-3 flex flex-wrap items-center justify-between gap-4 z-20">
        {/* Playback Controls */}
        <div className="flex items-center space-x-2">
          <button
            onClick={togglePause}
            className="p-2 rounded-lg bg-[#141b2b] hover:bg-[#1a2338] text-white border border-slate-700/80 transition-colors"
            title={isPaused ? 'Resume Game' : 'Pause Game'}
          >
            {isPaused ? <Play className="w-4 h-4 text-emerald-400 fill-emerald-400" /> : <Pause className="w-4 h-4 text-amber-400" />}
          </button>

          <button
            onClick={handleReset}
            className="p-2 rounded-lg bg-[#141b2b] hover:bg-[#1a2338] text-slate-300 border border-slate-700/80 transition-colors"
            title="Restart Game"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={handleSaveState}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-[#141b2b] hover:bg-[#1a2338] text-slate-200 border border-slate-700/80 text-xs font-mono"
            title="Save Snapshot to Browser Storage"
          >
            <Save className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Save</span>
          </button>

          <button
            onClick={handleLoadState}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-[#141b2b] hover:bg-[#1a2338] text-slate-200 border border-slate-700/80 text-xs font-mono"
            title="Load Snapshot from Browser Storage"
          >
            <Download className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Load</span>
          </button>

          <button
            onClick={handleScreenshot}
            className="p-2 rounded-lg bg-[#141b2b] hover:bg-[#1a2338] text-slate-300 border border-slate-700/80 transition-colors"
            title="Take Screenshot"
          >
            <Camera className="w-4 h-4" />
          </button>
        </div>

        {/* Video & Audio Settings */}
        <div className="flex items-center space-x-3">
          {/* Performance Monitor HUD Toggle */}
          <button
            onClick={() => setShowPerformance(!showPerformance)}
            className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-mono border transition-all ${
              showPerformance
                ? 'bg-cyan-950/80 text-cyan-400 border-cyan-800'
                : 'bg-[#141b2b] text-slate-400 border-slate-800'
            }`}
            title="Toggle Technical Performance Monitor Overlay (or press F3)"
          >
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">HUD {showPerformance ? 'ON' : 'OFF'}</span>
          </button>

          {/* CRT Scanline Toggle */}
          <button
            onClick={() => setCrtFilter(!crtFilter)}
            className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-mono border transition-all ${
              crtFilter
                ? 'bg-cyan-950/80 text-cyan-400 border-cyan-800'
                : 'bg-[#141b2b] text-slate-400 border-slate-800'
            }`}
            title="CRT Scanline & Phosphor Filter"
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">CRT {crtFilter ? 'ON' : 'OFF'}</span>
          </button>

          {/* Aspect Ratio Selector */}
          <div className="flex items-center bg-[#141b2b] border border-slate-800 rounded-lg p-0.5 text-xs font-mono">
            {(['4:3', '16:9', 'pixel'] as const).map((ratio) => (
              <button
                key={ratio}
                onClick={() => setAspectRatio(ratio)}
                className={`px-2 py-1 rounded capitalize ${
                  aspectRatio === ratio
                    ? 'bg-cyan-500 text-black font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {ratio}
              </button>
            ))}
          </div>

          {/* Volume Mute */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-lg bg-[#141b2b] hover:bg-[#1a2338] text-slate-300 border border-slate-700/80"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
          </button>

          {/* Gamepad Status */}
          <div
            className={`flex items-center space-x-1 px-2 py-1 rounded text-[11px] font-mono border ${
              hasGamepad
                ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
                : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
            title={hasGamepad ? 'Gamepad Connected' : 'No Gamepad Detected (Plug in USB/Bluetooth)'}
          >
            <Gamepad className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{hasGamepad ? 'GAMEPAD ON' : 'GAMEPAD'}</span>
          </div>

          {/* Touch Controls Toggle */}
          <button
            onClick={() => setShowTouchControls(!showTouchControls)}
            className={`p-2 rounded-lg border ${
              showTouchControls
                ? 'bg-cyan-950/80 text-cyan-400 border-cyan-800'
                : 'bg-[#141b2b] text-slate-400 border-slate-800'
            }`}
            title="Toggle On-Screen Touch Controls"
          >
            <Sliders className="w-4 h-4" />
          </button>

          {/* Keybindings Help */}
          <button
            onClick={() => setShowControlsHelp(!showControlsHelp)}
            className="p-2 rounded-lg bg-[#141b2b] hover:bg-[#1a2338] text-slate-300 border border-slate-700/80"
            title="Keyboard Controls Reference"
          >
            <Keyboard className="w-4 h-4" />
          </button>

          {/* Fullscreen */}
          <button
            onClick={handleFullscreen}
            className="p-2 rounded-lg bg-[#141b2b] hover:bg-[#1a2338] text-slate-300 border border-slate-700/80"
            title="Toggle Fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Keyboard Controls Reference Modal */}
      {showControlsHelp && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-40 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#10141e] border border-[#273043] rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Keyboard className="w-5 h-5 text-cyan-400" />
                <span>Default Control Keybindings</span>
              </h3>
              <button
                onClick={() => setShowControlsHelp(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                <span className="text-slate-400">D-Pad / Direction</span>
                <span className="text-cyan-300 font-bold">Arrow Keys or W / A / S / D</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                <span className="text-slate-400">A Button</span>
                <span className="text-cyan-300 font-bold">Z or J</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                <span className="text-slate-400">B Button</span>
                <span className="text-cyan-300 font-bold">X or K</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                <span className="text-slate-400">X / Y Buttons</span>
                <span className="text-cyan-300 font-bold">C / V</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                <span className="text-slate-400">Start / Select</span>
                <span className="text-cyan-300 font-bold">Enter / Right Shift (or Space)</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                <span className="text-slate-400">L / R Shoulders</span>
                <span className="text-cyan-300 font-bold">Q / E</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-400">Performance Telemetry HUD</span>
                <span className="text-emerald-300 font-bold">F3 key</span>
              </div>
            </div>

            <button
              onClick={() => setShowControlsHelp(false)}
              className="mt-6 w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs uppercase"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
