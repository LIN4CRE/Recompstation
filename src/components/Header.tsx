import React from 'react';
import {
  Gamepad2,
  Upload,
  Cpu,
  Sparkles,
  Database,
  Settings,
  ShieldCheck,
  Zap,
} from 'lucide-react';

export type NavTab = 'library' | 'upload' | 'rea' | 'boxart' | 'compatibility' | 'settings';

interface HeaderProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  gameCount: number;
  hasActiveGame: boolean;
  onOpenActiveGame?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  gameCount,
  hasActiveGame,
  onOpenActiveGame,
}) => {
  return (
    <header className="border-b border-[#273043] bg-[#0c0f17]/95 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onTabChange('library')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 p-0.5 shadow-lg shadow-cyan-500/20">
              <div className="w-full h-full bg-[#0d111a] rounded-[10px] flex items-center justify-center">
                <Gamepad2 className="w-5 h-5 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-slate-200 to-cyan-400 bg-clip-text text-transparent">
                  Recomp<span className="text-cyan-400">Station</span>
                </span>
                <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold tracking-wider uppercase bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 rounded">
                  WASM v2.4
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                ROM Recompilation & Instant Browser Gaming Platform
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center space-x-1 sm:space-x-2">
            <button
              onClick={() => onTabChange('library')}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'library'
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/40 shadow-sm shadow-cyan-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <Gamepad2 className="w-4 h-4" />
              <span className="hidden md:inline">Library</span>
              {gameCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 text-[10px] font-mono bg-cyan-950 text-cyan-300 rounded-full border border-cyan-800/80">
                  {gameCount}
                </span>
              )}
            </button>

            <button
              onClick={() => onTabChange('upload')}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'upload'
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/40 shadow-sm shadow-cyan-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span className="hidden md:inline">Upload & Analyze</span>
            </button>

            <button
              onClick={() => onTabChange('rea')}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'rea'
                  ? 'bg-purple-500/15 text-purple-400 border border-purple-500/40 shadow-sm shadow-purple-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <Cpu className="w-4 h-4" />
              <span className="hidden md:inline">REA Agent</span>
            </button>

            <button
              onClick={() => onTabChange('boxart')}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'boxart'
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/40 shadow-sm shadow-amber-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span className="hidden md:inline">Box Art 4K</span>
            </button>

            <button
              onClick={() => onTabChange('compatibility')}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'compatibility'
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/40 shadow-sm shadow-cyan-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <Database className="w-4 h-4" />
              <span className="hidden lg:inline">Database</span>
            </button>

            <button
              onClick={() => onTabChange('settings')}
              className={`flex items-center space-x-2 p-2 sm:px-3 sm:py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'settings'
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
              }`}
              title="Settings & System Diagnostics"
            >
              <Settings className="w-4 h-4" />
            </button>
          </nav>

          {/* Active Player quick badge or System Indicator */}
          <div className="hidden sm:flex items-center space-x-2">
            {hasActiveGame && onOpenActiveGame ? (
              <button
                onClick={onOpenActiveGame}
                className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse text-xs font-mono font-semibold hover:bg-emerald-500/30 transition-all"
              >
                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                <span>RESUME GAME</span>
              </button>
            ) : (
              <div className="flex items-center space-x-2 px-2.5 py-1 rounded-md bg-[#161c28] border border-slate-800 text-[11px] font-mono text-slate-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>LOCAL-FIRST SANDBOX</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
