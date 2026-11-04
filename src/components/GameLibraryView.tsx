import React, { useState } from 'react';
import {
  Play,
  Star,
  Trash2,
  Sparkles,
  Search,
  Filter,
  Gamepad2,
  FolderOpen,
  Upload,
  Calendar,
  HardDrive,
} from 'lucide-react';
import { GameItem, PlatformId } from '../types/rom';

interface GameLibraryViewProps {
  games: GameItem[];
  onPlayGame: (game: GameItem) => void;
  onDeleteGame: (id: string) => void;
  onGenerateCover: (game: GameItem) => void;
  onNavigateUpload: () => void;
}

export const GameLibraryView: React.FC<GameLibraryViewProps> = ({
  games,
  onPlayGame,
  onDeleteGame,
  onGenerateCover,
  onNavigateUpload,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');

  const filteredGames = games.filter((game) => {
    const matchesSearch =
      game.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      game.platformName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPlatform =
      selectedPlatform === 'all' || game.platform === selectedPlatform;
    return matchesSearch && matchesPlatform;
  });

  const getMethodBadge = (method: string) => {
    switch (method) {
      case 'native_recompilation':
        return { label: 'Native Recompile', color: 'bg-emerald-950 text-emerald-400 border-emerald-800' };
      case 'static_recompile_candidate':
        return { label: 'Static Recomp', color: 'bg-purple-950 text-purple-400 border-purple-800' };
      case 'source_port_wasm':
        return { label: 'Source Port Wasm', color: 'bg-blue-950 text-blue-400 border-blue-800' };
      case 'optimized_wasm_emulator':
        return { label: 'WASM Core', color: 'bg-cyan-950 text-cyan-400 border-cyan-800' };
      default:
        return { label: 'JIT Interpreter', color: 'bg-amber-950 text-amber-400 border-amber-800' };
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header and Search Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center space-x-3">
            <span>Local Game Library</span>
            <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
              {games.length} {games.length === 1 ? 'TITLE' : 'TITLES'}
            </span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Stored locally in browser IndexedDB. Instant zero-latency launch with full controller and save-state support.
          </p>
        </div>

        {/* Action button */}
        <div className="flex items-center space-x-3">
          <button
            onClick={onNavigateUpload}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-extrabold text-xs shadow-lg shadow-cyan-500/20 transition-all"
          >
            <Upload className="w-4 h-4 fill-black" />
            <span>Upload ROM</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-3 rounded-2xl bg-[#10141e]/90 border border-[#273043] flex flex-col sm:flex-row items-center justify-between gap-3 mb-6">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search game titles or consoles..."
            className="w-full bg-[#151c2a] text-xs font-mono text-white placeholder-slate-500 pl-9 pr-4 py-2 rounded-xl border border-slate-700/80 outline-none focus:border-cyan-500 transition-colors"
          />
        </div>

        {/* Platform Filter */}
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={selectedPlatform}
            onChange={(e) => setSelectedPlatform(e.target.value)}
            className="bg-[#151c2a] text-xs font-mono text-slate-300 border border-slate-700/80 rounded-xl px-3 py-2 outline-none focus:border-cyan-500 transition-colors"
          >
            <option value="all">All Platforms</option>
            <option value="nes">NES / Famicom</option>
            <option value="snes">SNES / Super Famicom</option>
            <option value="gb">Game Boy</option>
            <option value="gbc">Game Boy Color</option>
            <option value="gba">Game Boy Advance</option>
            <option value="n64">Nintendo 64</option>
            <option value="genesis">Sega Genesis</option>
            <option value="chip8">COSMAC CHIP-8</option>
            <option value="doom_wad">DOOM Engine WAD</option>
          </select>
        </div>
      </div>

      {/* Games Grid */}
      {filteredGames.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredGames.map((game) => {
            const badge = getMethodBadge(game.executionMethod);
            return (
              <div
                key={game.id}
                className="rounded-2xl bg-[#10141e]/90 border border-[#273043] overflow-hidden hover:border-cyan-500/50 hover:shadow-xl hover:shadow-cyan-950/30 transition-all duration-200 flex flex-col group"
              >
                {/* Cover Banner with Play overlay */}
                <div className="relative aspect-[4/3] bg-[#0c0f17] flex items-center justify-center overflow-hidden border-b border-slate-800">
                  {game.coverUrl ? (
                    <img
                      src={game.coverUrl}
                      alt={game.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gradient-to-b from-[#141b2b] to-[#0a0d14] text-center">
                      <Gamepad2 className="w-12 h-12 text-slate-600 mb-2 group-hover:text-cyan-400 transition-colors" />
                      <span className="text-xs font-mono text-slate-400 font-bold uppercase">
                        {game.platform.toUpperCase()}
                      </span>
                    </div>
                  )}

                  {/* Play Button Overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-xs">
                    <button
                      onClick={() => onPlayGame(game)}
                      className="w-14 h-14 rounded-full bg-cyan-400 hover:bg-cyan-300 text-black flex items-center justify-center shadow-lg shadow-cyan-400/40 transform hover:scale-110 active:scale-95 transition-all"
                      title="Play Game Instantly"
                    >
                      <Play className="w-6 h-6 fill-black ml-1" />
                    </button>
                  </div>

                  {/* Top-left execution badge */}
                  <div className="absolute top-2.5 left-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border shadow-sm ${badge.color}`}>
                      {badge.label}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
                      <span>{game.platformName}</span>
                      <span>{(game.fileSize / 1024).toFixed(0)} KB</span>
                    </div>
                    <h3 className="text-sm font-extrabold text-white line-clamp-1 group-hover:text-cyan-400 transition-colors">
                      {game.title}
                    </h3>
                    <p className="text-[11px] font-mono text-slate-500 mt-1">
                      CRC32: {game.crc32}
                    </p>
                  </div>

                  {/* Card Actions */}
                  <div className="pt-4 mt-3 border-t border-slate-800/80 flex items-center justify-between">
                    <button
                      onClick={() => onGenerateCover(game)}
                      className="flex items-center space-x-1 text-[11px] font-mono text-amber-400 hover:text-amber-300 transition-colors"
                      title="Generate 4K Box Art with Gemini"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Box Art</span>
                    </button>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => onPlayGame(game)}
                        className="px-3 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-bold transition-all flex items-center space-x-1"
                      >
                        <Play className="w-3 h-3 fill-cyan-300" />
                        <span>Play</span>
                      </button>

                      <button
                        onClick={() => onDeleteGame(game.id)}
                        className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-800 transition-colors"
                        title="Delete from Library"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl bg-[#10141e]/50 border border-dashed border-[#273043] p-12 text-center">
          <FolderOpen className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <h3 className="text-base font-bold text-white mb-2">No Games in Library</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mb-6">
            Upload your legally obtained game ROM files or try the built-in homebrews to populate your instant-play library.
          </p>
          <button
            onClick={onNavigateUpload}
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold text-xs shadow-lg shadow-cyan-500/20"
          >
            <Upload className="w-4 h-4" />
            <span>Go to Upload & Analyze</span>
          </button>
        </div>
      )}
    </div>
  );
};
