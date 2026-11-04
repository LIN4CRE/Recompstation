import React, { useEffect, useRef, useState, useCallback } from 'react';
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
  Gamepad2,
  Keyboard,
  Eye,
  EyeOff,
  Zap,
  Activity,
  Trash2,
  Clock,
  Plus,
  Check,
  Tv,
  Layers,
  Settings,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { GameItem, PerformanceStats, SaveState } from '../types/rom';
import { WebAssemblyRunner } from '../engines/WebAssemblyRunner';
import { saveGameState, getGameSaveStates, deleteGameState } from '../services/storage';
import { PerformanceMonitor, ExecutionMetadata } from './PerformanceMonitor';

export type GamepadLayoutPreset = 'standard' | 'nintendo' | 'playstation' | 'arcade';

interface PlayerModalProps {
  game: GameItem;
  onClose: () => void;
}

export const PlayerModal: React.FC<PlayerModalProps> = ({ game, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runnerRef = useRef<WebAssemblyRunner | null>(null);

  // Core Playback State
  const [isPaused, setIsPaused] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'original' | '4:3' | '16:9' | 'pixel'>('4:3');
  
  // CRT Filter State (Persistent)
  const [crtFilter, setCrtFilter] = useState<boolean>(() => {
    const saved = localStorage.getItem('recompstation_crt_overlay');
    return saved !== null ? saved === 'true' : true;
  });

  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(80);
  
  // Modals & Overlays
  const [showControlsHelp, setShowControlsHelp] = useState(false);
  const [showTouchControls, setShowTouchControls] = useState(false);
  const [showPerformance, setShowPerformance] = useState<boolean>(false);
  const [showSaveStatesModal, setShowSaveStatesModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'display' | 'gamepad' | 'audio'>('display');

  // Save States List (IndexedDB)
  const [saveStates, setSaveStates] = useState<SaveState[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Gamepad State & Configuration
  const [hasGamepad, setHasGamepad] = useState(false);
  const [gamepadName, setGamepadName] = useState<string>('Standard Controller');
  const [gamepadIndex, setGamepadIndex] = useState<number>(0);
  const [gamepadLayout, setGamepadLayout] = useState<GamepadLayoutPreset>(() => {
    return (localStorage.getItem('recompstation_gamepad_layout') as GamepadLayoutPreset) || 'standard';
  });
  const [activeGamepadButtons, setActiveGamepadButtons] = useState<string[]>([]);
  const [deadzone, setDeadzone] = useState<number>(0.25);

  // Performance Telemetry Stats
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

  // Persist CRT setting
  const handleToggleCrt = (enabled: boolean) => {
    setCrtFilter(enabled);
    localStorage.setItem('recompstation_crt_overlay', String(enabled));
  };

  // Persist Gamepad Layout
  const handleSelectGamepadLayout = (layout: GamepadLayoutPreset) => {
    setGamepadLayout(layout);
    localStorage.setItem('recompstation_gamepad_layout', layout);
  };

  // Load Save States for current title from IndexedDB
  const refreshSaveStates = useCallback(async () => {
    try {
      const saves = await getGameSaveStates(game.id);
      // Sort newest first
      saves.sort((a, b) => b.timestamp - a.timestamp);
      setSaveStates(saves);
    } catch (err) {
      console.error('Failed to load save states from IndexedDB:', err);
    }
  }, [game.id]);

  useEffect(() => {
    refreshSaveStates();
  }, [refreshSaveStates]);

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
      if (e.code === 'F2') {
        e.preventDefault();
        handleQuickSave();
        return;
      }
      if (e.code === 'F4') {
        e.preventDefault();
        handleQuickLoad();
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
    };
  }, [game]);

  // Dedicated Gamepad API Polling Loop with Layout Mapping
  useEffect(() => {
    let animId: number;

    const handleGamepadConnected = (e: GamepadEvent) => {
      setHasGamepad(true);
      setGamepadName(e.gamepad.id || 'Connected Gamepad');
      setGamepadIndex(e.gamepad.index);
    };

    const handleGamepadDisconnected = (e: GamepadEvent) => {
      const remaining = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
      if (remaining.length === 0) {
        setHasGamepad(false);
      } else {
        const nextPad = remaining[0];
        if (nextPad) {
          setGamepadName(nextPad.id || 'Connected Gamepad');
          setGamepadIndex(nextPad.index);
        }
      }
    };

    window.addEventListener('gamepadconnected', handleGamepadConnected);
    window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);

    // Initial check for already connected controllers
    if (typeof navigator !== 'undefined' && navigator.getGamepads) {
      const initialGamepads = Array.from(navigator.getGamepads()).filter(Boolean);
      if (initialGamepads.length > 0 && initialGamepads[0]) {
        setHasGamepad(true);
        setGamepadName(initialGamepads[0].id || 'Connected Gamepad');
        setGamepadIndex(initialGamepads[0].index);
      }
    }

    const pollGamepad = () => {
      if (typeof navigator !== 'undefined' && navigator.getGamepads) {
        const gamepads = navigator.getGamepads();
        const pad = gamepads[gamepadIndex] || gamepads[0] || gamepads[1];

        if (pad && pad.connected) {
          if (!hasGamepad) setHasGamepad(true);

          const pressedButtons: string[] = [];

          // Standard button indices
          const b0 = pad.buttons[0]?.pressed || false; // South button (Xbox A, PS Cross, Switch B)
          const b1 = pad.buttons[1]?.pressed || false; // East button (Xbox B, PS Circle, Switch A)
          const b2 = pad.buttons[2]?.pressed || false; // West button (Xbox X, PS Square, Switch Y)
          const b3 = pad.buttons[3]?.pressed || false; // North button (Xbox Y, PS Triangle, Switch X)
          const l1 = pad.buttons[4]?.pressed || false; // Left shoulder
          const r1 = pad.buttons[5]?.pressed || false; // Right shoulder
          const l2 = pad.buttons[6]?.pressed || false; // Left trigger
          const r2 = pad.buttons[7]?.pressed || false; // Right trigger
          const select = pad.buttons[8]?.pressed || false; // Back/Share/Select
          const start = pad.buttons[9]?.pressed || false; // Start/Options
          const dpadUp = pad.buttons[12]?.pressed || false;
          const dpadDown = pad.buttons[13]?.pressed || false;
          const dpadLeft = pad.buttons[14]?.pressed || false;
          const dpadRight = pad.buttons[15]?.pressed || false;

          // Analog axes with configurable deadzone
          const axisX = pad.axes[0] !== undefined ? pad.axes[0] : 0;
          const axisY = pad.axes[1] !== undefined ? pad.axes[1] : 0;

          const analogUp = axisY < -deadzone;
          const analogDown = axisY > deadzone;
          const analogLeft = axisX < -deadzone;
          const analogRight = axisX > deadzone;

          const up = dpadUp || analogUp;
          const down = dpadDown || analogDown;
          const left = dpadLeft || analogLeft;
          const right = dpadRight || analogRight;

          // Layout Presets Mapping
          let a = false;
          let b = false;
          let x = false;
          let y = false;

          switch (gamepadLayout) {
            case 'nintendo':
              // Nintendo layout: East button is A, South button is B, North is X, West is Y
              a = b1;
              b = b0;
              x = b3;
              y = b2;
              break;

            case 'playstation':
              // PlayStation: Cross (0) is primary action (A), Circle (1) is secondary (B)
              a = b0;
              b = b1;
              x = b2;
              y = b3;
              break;

            case 'arcade':
              // Arcade / Fightstick: Top row / Bottom row
              a = b0;
              b = b1;
              x = b2;
              y = b3;
              break;

            case 'standard':
            default:
              // Standard XInput: South is A (btn 0), East is B (btn 1)
              a = b0;
              b = b1;
              x = b2;
              y = b3;
              break;
          }

          const l = l1 || l2;
          const r = r1 || r2;

          // Track active buttons for UI visual feedback
          if (up) pressedButtons.push('UP');
          if (down) pressedButtons.push('DOWN');
          if (left) pressedButtons.push('LEFT');
          if (right) pressedButtons.push('RIGHT');
          if (a) pressedButtons.push('A');
          if (b) pressedButtons.push('B');
          if (x) pressedButtons.push('X');
          if (y) pressedButtons.push('Y');
          if (l) pressedButtons.push('L');
          if (r) pressedButtons.push('R');
          if (start) pressedButtons.push('START');
          if (select) pressedButtons.push('SELECT');

          setActiveGamepadButtons(pressedButtons);

          // Update active runner
          if (runnerRef.current) {
            runnerRef.current.updateButtons({
              up,
              down,
              left,
              right,
              a,
              b,
              x,
              y,
              l,
              r,
              start,
              select,
            });
          }
        } else {
          setActiveGamepadButtons([]);
        }
      }

      animId = requestAnimationFrame(pollGamepad);
    };

    animId = requestAnimationFrame(pollGamepad);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('gamepadconnected', handleGamepadConnected);
      window.removeEventListener('gamepaddisconnected', handleGamepadDisconnected);
    };
  }, [gamepadIndex, gamepadLayout, deadzone, hasGamepad]);

  // Core Playback Functions
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
    setSaveStatus('Emulation reset');
    setTimeout(() => setSaveStatus(null), 2000);
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
    setSaveStatus('Screenshot downloaded!');
    setTimeout(() => setSaveStatus(null), 2500);
  };

  // Taking Save State
  const handleTakeSaveState = async (slotNumber?: number) => {
    if (!runnerRef.current) return;
    setIsSaving(true);
    try {
      const stateData = runnerRef.current.saveState();
      const screenshot = runnerRef.current.takeScreenshot();
      
      const targetSlot = slotNumber ?? (saveStates.length > 0 ? Math.max(...saveStates.map((s) => s.slot)) + 1 : 1);
      const stateId = `${game.id}-slot-${targetSlot}-${Date.now()}`;

      const newSave: SaveState = {
        id: stateId,
        gameId: game.id,
        slot: targetSlot,
        timestamp: Date.now(),
        data: stateData,
        screenshotUrl: screenshot,
        size: stateData.length,
      };

      await saveGameState(newSave);
      await refreshSaveStates();
      setSaveStatus(`Saved to Slot ${targetSlot} in IndexedDB!`);
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (e: any) {
      alert(`Save State failed: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Quick Save (F2 or Quick Save button)
  const handleQuickSave = () => {
    handleTakeSaveState(1);
  };

  // Quick Load (F4 or Quick Load button)
  const handleQuickLoad = () => {
    if (saveStates.length > 0) {
      handleRestoreSaveState(saveStates[0]);
    } else {
      setSaveStatus('No save states found');
      setTimeout(() => setSaveStatus(null), 2000);
    }
  };

  // Restoring Save State
  const handleRestoreSaveState = (save: SaveState) => {
    if (!runnerRef.current) return;
    try {
      runnerRef.current.loadState(save.data);
      setSaveStatus(`Restored Slot ${save.slot} state!`);
      setTimeout(() => setSaveStatus(null), 3000);
      setShowSaveStatesModal(false);
    } catch (e: any) {
      alert(`Restore State failed: ${e.message}`);
    }
  };

  // Deleting Save State
  const handleDeleteSaveState = async (saveId: string, slot: number) => {
    if (confirm(`Delete save state for Slot ${slot}?`)) {
      try {
        await deleteGameState(saveId);
        await refreshSaveStates();
        setSaveStatus(`Deleted Slot ${slot}`);
        setTimeout(() => setSaveStatus(null), 2000);
      } catch (err: any) {
        alert(`Delete failed: ${err.message}`);
      }
    }
  };

  // Export Save State as JSON
  const handleExportSaveState = (save: SaveState) => {
    const blob = new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${game.title.replace(/\s+/g, '_')}_Slot${save.slot}_save.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Virtual touch button handlers
  const handleTouchButton = (btn: string, pressed: boolean) => {
    if (runnerRef.current) {
      runnerRef.current.updateButtons({ [btn]: pressed });
    }
  };

  // Aspect ratio classes
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
            <div className="flex items-center space-x-2 text-[11px] font-mono text-slate-400">
              <span>Method: {game.executionMethod.replace(/_/g, ' ')}</span>
              {hasGamepad && (
                <span className="hidden sm:inline-flex items-center space-x-1 text-emerald-400">
                  <span>•</span>
                  <Gamepad2 className="w-3 h-3" />
                  <span>{gamepadName.length > 25 ? gamepadName.slice(0, 22) + '...' : gamepadName}</span>
                </span>
              )}
            </div>
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

        {/* Action Controls & Close */}
        <div className="flex items-center space-x-2">
          {saveStatus && (
            <span className="text-xs font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-800/80 px-2.5 py-1 rounded shadow-sm animate-fade-in">
              {saveStatus}
            </span>
          )}

          {/* Quick Settings Button */}
          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-1.5 text-slate-300 hover:text-cyan-400 rounded-lg hover:bg-slate-800 transition-colors"
            title="Display & Controller Settings"
          >
            <Settings className="w-5 h-5" />
          </button>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            title="Exit Emulation"
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

        {/* Viewport Canvas with user-controlled .crt-overlay toggle */}
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

        {/* Active Gamepad Input Toast / Diagnostic Overlay */}
        {hasGamepad && activeGamepadButtons.length > 0 && (
          <div className="absolute top-4 left-4 bg-black/75 border border-emerald-500/40 rounded-lg px-2.5 py-1 flex items-center space-x-2 font-mono text-[11px] text-emerald-300 pointer-events-none backdrop-blur-sm z-30">
            <Gamepad className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>{activeGamepadButtons.join(' + ')}</span>
          </div>
        )}

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
        {/* Playback & Save State Controls */}
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
            title="Restart Emulation"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Save States Manager Drawer Button */}
          <button
            onClick={() => {
              refreshSaveStates();
              setShowSaveStatesModal(true);
            }}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-[#141b2b] hover:bg-[#1c263c] text-cyan-300 border border-cyan-800/70 text-xs font-mono shadow-sm transition-all"
            title="Open Save States Manager (IndexedDB Snapshots)"
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>Save States ({saveStates.length})</span>
          </button>

          <button
            onClick={handleQuickSave}
            disabled={isSaving}
            className="hidden sm:flex items-center space-x-1 px-2.5 py-2 rounded-lg bg-[#141b2b] hover:bg-[#1a2338] text-slate-200 border border-slate-700/80 text-xs font-mono"
            title="Quick Save to Slot 1 (F2)"
          >
            <Save className="w-3.5 h-3.5 text-cyan-400" />
            <span>F2 Quick Save</span>
          </button>

          <button
            onClick={handleQuickLoad}
            className="hidden sm:flex items-center space-x-1 px-2.5 py-2 rounded-lg bg-[#141b2b] hover:bg-[#1a2338] text-slate-200 border border-slate-700/80 text-xs font-mono"
            title="Quick Load from Most Recent State (F4)"
          >
            <Download className="w-3.5 h-3.5 text-purple-400" />
            <span>F4 Load</span>
          </button>

          <button
            onClick={handleScreenshot}
            className="p-2 rounded-lg bg-[#141b2b] hover:bg-[#1a2338] text-slate-300 border border-slate-700/80 transition-colors"
            title="Take PNG Screenshot"
          >
            <Camera className="w-4 h-4" />
          </button>
        </div>

        {/* Video, CRT & Audio Settings */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Performance Monitor HUD Toggle */}
          <button
            onClick={() => setShowPerformance(!showPerformance)}
            className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-mono border transition-all ${
              showPerformance
                ? 'bg-cyan-950/80 text-cyan-400 border-cyan-800 shadow-sm shadow-cyan-500/10'
                : 'bg-[#141b2b] text-slate-400 border-slate-800'
            }`}
            title="Toggle Technical Performance Monitor Overlay (or press F3)"
          >
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">HUD {showPerformance ? 'ON' : 'OFF'}</span>
          </button>

          {/* User-Controlled CRT Overlay Toggle */}
          <button
            onClick={() => handleToggleCrt(!crtFilter)}
            className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-mono border transition-all ${
              crtFilter
                ? 'bg-cyan-950/90 text-cyan-300 border-cyan-600 shadow-sm shadow-cyan-500/20'
                : 'bg-[#141b2b] text-slate-400 border-slate-800 hover:text-white'
            }`}
            title="Toggle authentic CRT scanlines & phosphor effect vs clean sharp pixels"
          >
            {crtFilter ? (
              <>
                <Tv className="w-3.5 h-3.5 text-cyan-400" />
                <span className="font-bold">CRT AUTHENTIC</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5 text-slate-400" />
                <span>CRT CLEAN</span>
              </>
            )}
          </button>

          {/* Aspect Ratio Selector */}
          <div className="hidden lg:flex items-center bg-[#141b2b] border border-slate-800 rounded-lg p-0.5 text-xs font-mono">
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

          {/* Gamepad Connection Badge & Quick Settings Trigger */}
          <button
            onClick={() => {
              setSettingsTab('gamepad');
              setShowSettingsModal(true);
            }}
            className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono border transition-all ${
              hasGamepad
                ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800 hover:bg-emerald-900/60 shadow-sm shadow-emerald-500/10'
                : 'bg-slate-900 text-slate-500 border-slate-800 hover:border-slate-700 hover:text-slate-400'
            }`}
            title={hasGamepad ? `${gamepadName} Connected. Click to configure layout.` : 'No Gamepad Detected (Click to configure)'}
          >
            <Gamepad className="w-3.5 h-3.5" />
            <span className="hidden md:inline font-bold">
              {hasGamepad ? `PAD (${gamepadLayout.toUpperCase()})` : 'NO PAD'}
            </span>
          </button>

          {/* Volume Mute */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-lg bg-[#141b2b] hover:bg-[#1a2338] text-slate-300 border border-slate-700/80"
            title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
          </button>

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

      {/* Save States Manager Modal (IndexedDB) */}
      {showSaveStatesModal && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-40 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-[#10141e] border border-[#273043] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-[#141a29]/80">
              <div className="flex items-center space-x-3">
                <Layers className="w-5 h-5 text-cyan-400" />
                <div>
                  <h3 className="text-base font-bold text-white">Save State Manager</h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Persistent IndexedDB snapshots for {game.title}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleTakeSaveState()}
                  disabled={isSaving}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-mono font-bold text-xs uppercase transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isSaving ? 'Capturing...' : 'Capture New State'}</span>
                </button>
                <button
                  onClick={() => setShowSaveStatesModal(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: List of Save States */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {saveStates.length === 0 ? (
                <div className="text-center py-12 px-4 border border-dashed border-slate-800 rounded-xl bg-[#0c1018]">
                  <Save className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <h4 className="text-sm font-bold text-white mb-1">No Save States Recorded Yet</h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4 font-mono">
                    Capture an exact freeze-frame of your game at any moment. States are safely stored in your browser's IndexedDB.
                  </p>
                  <button
                    onClick={() => handleTakeSaveState(1)}
                    className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs uppercase"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create Slot 1 Snapshot</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {saveStates.map((save) => {
                    const dateFormatted = new Date(save.timestamp).toLocaleString();
                    const sizeKB = (save.size / 1024).toFixed(1);

                    return (
                      <div
                        key={save.id}
                        className="bg-[#141b2a] border border-slate-800 hover:border-cyan-500/50 rounded-xl p-3 flex flex-col justify-between group transition-all shadow-md"
                      >
                        {/* Preview Screenshot */}
                        <div className="relative aspect-[4/3] bg-black rounded-lg overflow-hidden border border-slate-800/80 mb-3">
                          {save.screenshotUrl ? (
                            <img
                              src={save.screenshotUrl}
                              alt={`Slot ${save.slot} Screenshot`}
                              className="w-full h-full object-contain"
                              style={{ imageRendering: 'pixelated' }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-600 font-mono text-xs">
                              No Preview
                            </div>
                          )}
                          <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/80 border border-cyan-500/60 text-cyan-300 font-mono text-[10px] font-bold">
                            SLOT {save.slot}
                          </span>
                          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/70 text-slate-400 font-mono text-[9px]">
                            {sizeKB} KB
                          </span>
                        </div>

                        {/* Metadata */}
                        <div className="mb-3">
                          <div className="flex items-center space-x-1.5 text-slate-400 text-xs font-mono">
                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                            <span>{dateFormatted}</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center space-x-2 pt-2 border-t border-slate-800/80">
                          <button
                            onClick={() => handleRestoreSaveState(save)}
                            className="flex-1 py-1.5 px-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/50 font-mono text-xs font-bold flex items-center justify-center space-x-1 transition-colors"
                            title="Restore this saved game snapshot"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Restore</span>
                          </button>
                          <button
                            onClick={() => handleExportSaveState(save)}
                            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
                            title="Export save state as JSON"
                          >
                            <Save className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteSaveState(save.id, save.slot)}
                            className="p-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-900/50 transition-colors"
                            title="Delete this state from IndexedDB"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-800 bg-[#0e121c] flex items-center justify-between text-xs font-mono text-slate-400">
              <span>Shortcuts: F2 = Quick Save | F4 = Quick Load</span>
              <button
                onClick={() => setShowSaveStatesModal(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-mono text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comprehensive Settings Modal (Visual CRT, Gamepad Layout & Audio) */}
      {showSettingsModal && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-40 flex items-center justify-center p-4">
          <div className="max-w-xl w-full bg-[#10141e] border border-[#273043] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-[#141a29]/80">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Settings className="w-5 h-5 text-cyan-400" />
                <span>Player & Hardware Settings</span>
              </h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-800 bg-[#0c1018] px-6">
              <button
                onClick={() => setSettingsTab('display')}
                className={`py-3 px-4 font-mono text-xs font-bold border-b-2 flex items-center space-x-2 transition-all ${
                  settingsTab === 'display'
                    ? 'border-cyan-400 text-cyan-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Tv className="w-4 h-4" />
                <span>Display & CRT</span>
              </button>
              <button
                onClick={() => setSettingsTab('gamepad')}
                className={`py-3 px-4 font-mono text-xs font-bold border-b-2 flex items-center space-x-2 transition-all ${
                  settingsTab === 'gamepad'
                    ? 'border-cyan-400 text-cyan-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Gamepad className="w-4 h-4" />
                <span>Gamepad API</span>
              </button>
              <button
                onClick={() => setSettingsTab('audio')}
                className={`py-3 px-4 font-mono text-xs font-bold border-b-2 flex items-center space-x-2 transition-all ${
                  settingsTab === 'audio'
                    ? 'border-cyan-400 text-cyan-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Volume2 className="w-4 h-4" />
                <span>Audio & Performance</span>
              </button>
            </div>

            {/* Tab Contents */}
            <div className="p-6 space-y-6">
              {/* DISPLAY TAB */}
              {settingsTab === 'display' && (
                <div className="space-y-5">
                  {/* CRT Overlay Section */}
                  <div className="bg-[#141b2a] border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <Tv className="w-4 h-4 text-cyan-400" />
                        <h4 className="text-sm font-bold text-white">CRT Shader & Scanlines Effect</h4>
                      </div>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                        crtFilter ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {crtFilter ? 'ACTIVE' : 'DISABLED'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 mb-4 font-mono leading-relaxed">
                      Choose between authentic phosphor scanline simulation (simulating vintage Sony Trinitron / PVM arcade monitors) or clean raw pixel rendering for modern LCD/OLED sharpness.
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => handleToggleCrt(true)}
                        className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                          crtFilter
                            ? 'bg-cyan-950/60 border-cyan-500 text-white shadow-md shadow-cyan-500/10'
                            : 'bg-[#0f1420] border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-xs">Authentic CRT</span>
                          {crtFilter && <Check className="w-4 h-4 text-cyan-400" />}
                        </div>
                        <span className="text-[10px] text-slate-400">Scanline gradient, shadow mask & phosphor warmth</span>
                      </button>

                      <button
                        onClick={() => handleToggleCrt(false)}
                        className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                          !crtFilter
                            ? 'bg-cyan-950/60 border-cyan-500 text-white shadow-md shadow-cyan-500/10'
                            : 'bg-[#0f1420] border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-xs">Clean Raw Pixel</span>
                          {!crtFilter && <Check className="w-4 h-4 text-cyan-400" />}
                        </div>
                        <span className="text-[10px] text-slate-400">Zero scanlines, 100% crisp pixelated clarity</span>
                      </button>
                    </div>
                  </div>

                  {/* Aspect Ratio Section */}
                  <div className="bg-[#141b2a] border border-slate-800 rounded-xl p-4">
                    <h4 className="text-sm font-bold text-white mb-2">Display Aspect Ratio</h4>
                    <div className="grid grid-cols-3 gap-2">
                      {(['4:3', '16:9', 'pixel'] as const).map((ratio) => (
                        <button
                          key={ratio}
                          onClick={() => setAspectRatio(ratio)}
                          className={`py-2 px-3 rounded-lg border font-mono text-xs font-bold capitalize transition-all ${
                            aspectRatio === ratio
                              ? 'bg-cyan-500 text-black border-cyan-400'
                              : 'bg-[#0f1420] border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          {ratio === 'pixel' ? '1:1 Square' : ratio}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* GAMEPAD TAB */}
              {settingsTab === 'gamepad' && (
                <div className="space-y-5">
                  {/* Connection Status Card */}
                  <div className={`p-4 rounded-xl border flex items-center justify-between ${
                    hasGamepad
                      ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
                      : 'bg-[#141b2a] border-slate-800 text-slate-400'
                  }`}>
                    <div className="flex items-center space-x-3">
                      <Gamepad className={`w-6 h-6 ${hasGamepad ? 'text-emerald-400' : 'text-slate-600'}`} />
                      <div>
                        <h4 className="text-sm font-bold text-white">
                          {hasGamepad ? gamepadName : 'No Controller Detected'}
                        </h4>
                        <p className="text-xs font-mono text-slate-400">
                          {hasGamepad
                            ? `Connected on Index #${gamepadIndex} • HTML5 Gamepad API Active`
                            : 'Plug in any USB, Bluetooth or 2.4G gamepad and press any button to pair.'}
                        </p>
                      </div>
                    </div>
                    {hasGamepad && (
                      <span className="px-2 py-1 rounded bg-emerald-900/80 text-emerald-300 font-mono text-[10px] font-bold">
                        CONNECTED
                      </span>
                    )}
                  </div>

                  {/* Layout Preset Selector */}
                  <div className="bg-[#141b2a] border border-slate-800 rounded-xl p-4">
                    <h4 className="text-sm font-bold text-white mb-1">Controller Button Mapping Layout</h4>
                    <p className="text-xs text-slate-400 font-mono mb-4">
                      Select your preferred physical button layout to match your controller or retro platform muscle memory.
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                      {[
                        {
                          id: 'standard',
                          label: 'Standard / Xbox (XInput)',
                          desc: 'South = A (Primary), East = B (Secondary)',
                        },
                        {
                          id: 'nintendo',
                          label: 'Nintendo (Switch / SNES)',
                          desc: 'East = A, South = B (Physical Nintendo orientation)',
                        },
                        {
                          id: 'playstation',
                          label: 'PlayStation (DualShock / DualSense)',
                          desc: 'Cross = A, Circle = B, Square = X, Triangle = Y',
                        },
                        {
                          id: 'arcade',
                          label: 'Arcade / Fightstick',
                          desc: 'Linear 6-button arcade layout',
                        },
                      ].map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => handleSelectGamepadLayout(preset.id as GamepadLayoutPreset)}
                          className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                            gamepadLayout === preset.id
                              ? 'bg-cyan-950/60 border-cyan-500 text-white shadow-sm'
                              : 'bg-[#0f1420] border-slate-800 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-xs">{preset.label}</span>
                            {gamepadLayout === preset.id && <Check className="w-4 h-4 text-cyan-400" />}
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">{preset.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Deadzone Slider */}
                  <div className="bg-[#141b2a] border border-slate-800 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-sm font-bold text-white">Analog Stick Deadzone</h4>
                      <span className="font-mono text-xs text-cyan-400 font-bold">
                        {Math.round(deadzone * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.05"
                      max="0.50"
                      step="0.05"
                      value={deadzone}
                      onChange={(e) => setDeadzone(parseFloat(e.target.value))}
                      className="w-full accent-cyan-400 bg-slate-800 rounded-lg cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
                      <span>Sensitive (5%)</span>
                      <span>Default (25%)</span>
                      <span>Drift Protection (50%)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* AUDIO & PERFORMANCE TAB */}
              {settingsTab === 'audio' && (
                <div className="space-y-5">
                  <div className="bg-[#141b2a] border border-slate-800 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-sm font-bold text-white">Master Sound Volume</h4>
                      <span className="font-mono text-xs text-cyan-400 font-bold">{isMuted ? 'Muted' : `${volume}%`}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={isMuted ? 0 : volume}
                      disabled={isMuted}
                      onChange={(e) => setVolume(parseInt(e.target.value))}
                      className="w-full accent-cyan-400 bg-slate-800 rounded-lg cursor-pointer disabled:opacity-50"
                    />
                  </div>

                  <div className="bg-[#141b2a] border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white">Real-Time Performance HUD</h4>
                      <p className="text-xs text-slate-400 font-mono">
                        Displays high-frequency FPS, frame pacing sparklines & memory heap usage.
                      </p>
                    </div>
                    <button
                      onClick={() => setShowPerformance(!showPerformance)}
                      className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold border transition-all ${
                        showPerformance
                          ? 'bg-cyan-500 text-black border-cyan-400'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {showPerformance ? 'ENABLED' : 'DISABLED'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-800 bg-[#0e121c] flex justify-end">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs uppercase"
              >
                Apply & Return to Game
              </button>
            </div>
          </div>
        </div>
      )}

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
              <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                <span className="text-slate-400">Quick Save State</span>
                <span className="text-cyan-300 font-bold">F2 key</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                <span className="text-slate-400">Quick Restore State</span>
                <span className="text-purple-300 font-bold">F4 key</span>
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
