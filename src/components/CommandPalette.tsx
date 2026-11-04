import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Gamepad2,
  Upload,
  Cpu,
  Sparkles,
  Database,
  Settings,
  Trash2,
  Download,
  Maximize2,
  Play,
  X,
  Command,
  Zap,
  ArrowRight,
  PlusCircle,
} from 'lucide-react';
import { GameItem } from '../types/rom';
import { NavTab } from './Header';

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  games: GameItem[];
  onPlayGame: (game: GameItem) => void;
  onNavigateTab: (tab: NavTab) => void;
  onClearCache: () => void;
  onExportSaves: () => void;
  onAddSampleRoms?: () => void;
}

interface CommandItem {
  id: string;
  category: 'games' | 'navigation' | 'actions';
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  badge?: string;
  action: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  games,
  onPlayGame,
  onNavigateTab,
  onClearCache,
  onExportSaves,
  onAddSampleRoms,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Build candidate commands list
  const navigationCommands: CommandItem[] = [
    {
      id: 'nav-library',
      category: 'navigation',
      title: 'Go to Game Library',
      subtitle: `Browse and search your collection (${games.length} games)`,
      icon: <Gamepad2 className="w-4 h-4 text-cyan-400" />,
      badge: 'TAB',
      action: () => {
        onNavigateTab('library');
        onClose();
      },
    },
    {
      id: 'nav-upload',
      category: 'navigation',
      title: 'Upload & Batch Ingest ROMs',
      subtitle: 'Drag and drop single or multiple ROM binaries',
      icon: <Upload className="w-4 h-4 text-cyan-400" />,
      badge: 'TAB',
      action: () => {
        onNavigateTab('upload');
        onClose();
      },
    },
    {
      id: 'nav-rea',
      category: 'navigation',
      title: 'REA Reverse Engineering Agent',
      subtitle: 'Disassemble opcodes & inspect binary structures',
      icon: <Cpu className="w-4 h-4 text-purple-400" />,
      badge: 'AI',
      action: () => {
        onNavigateTab('rea');
        onClose();
      },
    },
    {
      id: 'nav-boxart',
      category: 'navigation',
      title: 'Box Art Studio 4K',
      subtitle: 'Generate period-accurate vintage box art covers',
      icon: <Sparkles className="w-4 h-4 text-amber-400" />,
      badge: 'AI',
      action: () => {
        onNavigateTab('boxart');
        onClose();
      },
    },
    {
      id: 'nav-compatibility',
      category: 'navigation',
      title: 'Compatibility & Recompilation Matrix',
      subtitle: 'Lookup N64Recomp, Zelda64, native source ports & Wasm emulators',
      icon: <Database className="w-4 h-4 text-cyan-400" />,
      badge: 'MATRIX',
      action: () => {
        onNavigateTab('compatibility');
        onClose();
      },
    },
    {
      id: 'nav-settings',
      category: 'navigation',
      title: 'Settings & Hardware Diagnostics',
      subtitle: 'Inspect WebAssembly SIMD, WebGL & manage save state stores',
      icon: <Settings className="w-4 h-4 text-slate-300" />,
      badge: 'CONFIG',
      action: () => {
        onNavigateTab('settings');
        onClose();
      },
    },
  ];

  const systemActionCommands: CommandItem[] = [
    {
      id: 'action-export-saves',
      category: 'actions',
      title: 'Export Entire Save State Store (.json)',
      subtitle: 'Download all IndexedDB snapshots for cross-browser transfer',
      icon: <Download className="w-4 h-4 text-emerald-400" />,
      badge: 'DATA',
      action: () => {
        onExportSaves();
        onClose();
      },
    },
    {
      id: 'action-toggle-fullscreen',
      category: 'actions',
      title: 'Toggle Fullscreen Mode',
      subtitle: 'Switch browser display to immersive view',
      icon: <Maximize2 className="w-4 h-4 text-cyan-400" />,
      badge: 'SYSTEM',
      action: () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
        onClose();
      },
    },
    {
      id: 'action-clear-cache',
      category: 'actions',
      title: 'Clear Local Storage & IndexedDB Cache',
      subtitle: 'Purge all cached ROMs and reset local database',
      icon: <Trash2 className="w-4 h-4 text-red-400" />,
      badge: 'RESET',
      action: () => {
        if (confirm('Are you sure you want to clear your local library and all save states?')) {
          onClearCache();
        }
        onClose();
      },
    },
  ];

  if (onAddSampleRoms) {
    systemActionCommands.push({
      id: 'action-add-samples',
      category: 'actions',
      title: 'Ingest Verified Homebrew Sample ROMs',
      subtitle: 'Load built-in NES & CHIP-8 open-source test games',
      icon: <PlusCircle className="w-4 h-4 text-cyan-400" />,
      badge: 'SAMPLE',
      action: () => {
        onAddSampleRoms();
        onClose();
      },
    });
  }

  // Filter games based on query
  const gameCommands: CommandItem[] = games.map((game) => ({
    id: `game-${game.id}`,
    category: 'games',
    title: game.title,
    subtitle: `${game.platformName || game.platform.toUpperCase()} • ${game.executionMethod.replace(/_/g, ' ')}`,
    icon: <Play className="w-4 h-4 text-emerald-400 fill-emerald-400" />,
    badge: game.platform.toUpperCase(),
    action: () => {
      onPlayGame(game);
      onClose();
    },
  }));

  // Combined & Filtered items
  const q = query.toLowerCase().trim();
  const filteredCommands: CommandItem[] = [
    ...gameCommands.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.subtitle && c.subtitle.toLowerCase().includes(q)) ||
        (c.badge && c.badge.toLowerCase().includes(q))
    ),
    ...navigationCommands.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.subtitle && c.subtitle.toLowerCase().includes(q))
    ),
    ...systemActionCommands.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.subtitle && c.subtitle.toLowerCase().includes(q))
    ),
  ];

  // Keyboard navigation inside list
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filteredCommands.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredCommands.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filteredCommands[selectedIndex];
      if (selected) {
        selected.action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  // Auto-scroll selected item into view
  useEffect(() => {
    const activeEl = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-start justify-center pt-20 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="max-w-2xl w-full bg-[#10141e] border border-[#273043] rounded-2xl shadow-2xl overflow-hidden flex flex-col border-cyan-500/30"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="p-4 border-b border-slate-800 flex items-center space-x-3 bg-[#131926]">
          <Search className="w-5 h-5 text-cyan-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a game title, platform, navigation tab, or system command..."
            className="w-full bg-transparent text-white placeholder-slate-500 text-sm font-mono focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 font-mono text-[10px]">
            <span>ESC</span>
          </kbd>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          className="max-h-[60vh] overflow-y-auto p-2 divide-y divide-slate-800/40"
        >
          {filteredCommands.length === 0 ? (
            <div className="py-12 text-center text-slate-500 font-mono text-xs">
              <Search className="w-8 h-8 text-slate-700 mx-auto mb-2" />
              <span>No commands or games matching "{query}"</span>
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  data-index={idx}
                  onClick={() => cmd.action()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-cyan-950/60 border border-cyan-500/50 text-white shadow-sm'
                      : 'text-slate-300 hover:bg-[#141b27] border border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div
                      className={`p-2 rounded-lg ${
                        isSelected ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800/80 text-slate-400'
                      }`}
                    >
                      {cmd.icon}
                    </div>
                    <div className="truncate">
                      <div className="text-sm font-bold truncate flex items-center space-x-2">
                        <span>{cmd.title}</span>
                      </div>
                      {cmd.subtitle && (
                        <p className="text-xs font-mono text-slate-400 truncate">
                          {cmd.subtitle}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 flex-shrink-0 ml-3">
                    {cmd.badge && (
                      <span className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                        {cmd.badge}
                      </span>
                    )}
                    {isSelected && <ArrowRight className="w-4 h-4 text-cyan-400" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2.5 bg-[#0e121c] border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-500">
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">↑↓</kbd>
              <span>Navigate</span>
            </span>
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">↵</kbd>
              <span>Select</span>
            </span>
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">ESC</kbd>
              <span>Close</span>
            </span>
          </div>

          <span className="text-slate-500 font-bold">RecompStation Command Hub</span>
        </div>
      </div>
    </div>
  );
};
