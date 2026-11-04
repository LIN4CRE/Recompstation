import React, { useState } from 'react';
import {
  Database,
  Search,
  ExternalLink,
  CheckCircle2,
  Cpu,
  ShieldCheck,
  Zap,
  Info,
} from 'lucide-react';
import { KNOWN_GAMES_CATALOG, RECOMPILATION_PROJECTS } from '../services/database';

export const CompatibilityDatabaseView: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('all');

  const filteredCatalog = KNOWN_GAMES_CATALOG.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.crc32 && item.crc32.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.gameCode && item.gameCode.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesPlatform = filterPlatform === 'all' || item.platform === filterPlatform;
    return matchesSearch && matchesPlatform;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Title */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center space-x-3">
          <Database className="w-8 h-8 text-cyan-400" />
          <span>Compatibility Database & Recompilation Index</span>
        </h1>
        <p className="mt-2 text-sm text-slate-400 max-w-3xl">
          Verified No-Intro checksums, active static recompilation projects, and browser-tested performance benchmarks for supported platforms.
        </p>
      </div>

      {/* Featured Recompilation Projects Showcase */}
      <div className="mb-10">
        <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold mb-4 flex items-center space-x-2">
          <Cpu className="w-4 h-4 text-purple-400" />
          <span>Major Open-Source Recompilation & Decompilation Projects</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(RECOMPILATION_PROJECTS).map(([key, proj]) => (
            <div
              key={key}
              className="p-4 rounded-xl bg-[#10141e]/90 border border-[#273043] flex flex-col justify-between hover:border-purple-500/50 transition-all"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-purple-950 text-purple-300 border border-purple-800">
                    {proj.type.replace('_', ' ')}
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 flex items-center space-x-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{proj.status}</span>
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white mb-1">{proj.name}</h3>
                <p className="text-xs text-slate-400 line-clamp-3">{proj.description}</p>
              </div>

              <div className="pt-3 mt-3 border-t border-slate-800 flex items-center justify-between">
                <span className="text-[10px] text-slate-500 font-mono truncate max-w-[150px]">{proj.notes}</span>
                <a
                  href={proj.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:text-cyan-300 p-1"
                  title="Visit Project Repository"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-3 rounded-2xl bg-[#10141e]/90 border border-[#273043] flex flex-col sm:flex-row items-center justify-between gap-3 mb-6">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, CRC32, or Game Code..."
            className="w-full bg-[#151c2a] text-xs font-mono text-white placeholder-slate-500 pl-9 pr-4 py-2 rounded-xl border border-slate-700/80 outline-none focus:border-cyan-500 transition-colors"
          />
        </div>

        <select
          value={filterPlatform}
          onChange={(e) => setFilterPlatform(e.target.value)}
          className="bg-[#151c2a] text-xs font-mono text-slate-300 border border-slate-700/80 rounded-xl px-3 py-2 outline-none focus:border-cyan-500 transition-colors w-full sm:w-auto"
        >
          <option value="all">All Systems</option>
          <option value="n64">Nintendo 64</option>
          <option value="snes">Super Nintendo</option>
          <option value="gba">Game Boy Advance</option>
          <option value="ps1">PlayStation 1</option>
          <option value="genesis">Sega Genesis</option>
          <option value="doom_wad">DOOM WAD</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-[#10141e]/90 border border-[#273043] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-[#141a27] text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-bold">GAME TITLE</th>
                <th className="py-3 px-4 font-bold">CONSOLE</th>
                <th className="py-3 px-4 font-bold">VERIFIED CRC32</th>
                <th className="py-3 px-4 font-bold">EXECUTION METHOD</th>
                <th className="py-3 px-4 font-bold">BENCHMARK</th>
                <th className="py-3 px-4 font-bold">NOTES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredCatalog.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-white">
                    <div className="flex items-center space-x-2">
                      <span>{item.title}</span>
                      {item.region && (
                        <span className="px-1.5 py-0.2 text-[9px] bg-slate-800 text-slate-400 rounded">
                          {item.region}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
                      {item.platform.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-cyan-300 font-bold">
                    {item.crc32 || 'N/A'}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="text-slate-300 capitalize">
                      {item.defaultExecution.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-emerald-400 font-bold">
                    {item.testedFps ? `${item.testedFps} FPS (Fullspeed)` : '60 FPS'}
                  </td>
                  <td className="py-3.5 px-4 text-slate-400 max-w-xs truncate">
                    {item.notes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
