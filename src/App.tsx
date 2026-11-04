import React, { useState, useEffect, useCallback } from 'react';
import { Header, NavTab } from './components/Header';
import { GameLibraryView } from './components/GameLibraryView';
import { UploadView } from './components/UploadView';
import { PlayerModal } from './components/PlayerModal';
import { ReaAgentView } from './components/ReaAgentView';
import { BoxArtStudio } from './components/BoxArtStudio';
import { CompatibilityDatabaseView } from './components/CompatibilityDatabaseView';
import { SettingsView } from './components/SettingsView';
import { CommandPalette } from './components/CommandPalette';
import { GameItem, RomAnalysisReport } from './types/rom';
import {
  getAllGamesFromLibrary,
  saveGameToLibrary,
  deleteGameFromLibrary,
  getAllSaveStates,
} from './services/storage';
import { BUILTIN_HOMEBREWS } from './engines/BuiltinRoms';
import { analyzeRom } from './services/romParser';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('upload');
  const [games, setGames] = useState<GameItem[]>([]);
  const [activePlayingGame, setActivePlayingGame] = useState<GameItem | null>(null);

  // Command Palette State
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Cross-component state
  const [activeReport, setActiveReport] = useState<RomAnalysisReport | null>(null);
  const [activeRawData, setActiveRawData] = useState<Uint8Array | null>(null);
  const [boxArtTargetGame, setBoxArtTargetGame] = useState<GameItem | null>(null);

  // Global Keyboard Shortcut: Cmd/Ctrl + K for Command Palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Load games from IndexedDB on startup
  const loadGames = useCallback(async () => {
    try {
      const stored = await getAllGamesFromLibrary();
      if (stored.length > 0) {
        setGames(stored);
      } else {
        // Auto-seed initial verified homebrews on first visit so user has immediate instant games!
        await seedDefaultHomebrews();
      }
    } catch (e) {
      console.warn('IndexedDB initial load error:', e);
    }
  }, []);

  useEffect(() => {
    loadGames();
  }, [loadGames]);

  const seedDefaultHomebrews = async () => {
    try {
      const seeded: GameItem[] = [];
      for (const hb of BUILTIN_HOMEBREWS) {
        const report = await analyzeRom(`${hb.id}.nes`, hb.data);
        report.gameTitle = hb.title;
        const item: GameItem = {
          id: hb.id,
          title: hb.title,
          platform: hb.platform,
          platformName: report.platformName,
          fileFormat: report.fileFormat,
          fileSize: report.fileSize,
          crc32: report.crc32,
          sha1: report.sha1,
          romData: hb.data,
          executionMethod: report.recommendedExecution,
          compatibility: report.compatibility,
          favorite: false,
          addedAt: Date.now(),
          isBuiltIn: true,
          report,
        };
        await saveGameToLibrary(item);
        seeded.push(item);
      }
      setGames(seeded);
    } catch (e) {
      console.error('Failed to seed default homebrews:', e);
    }
  };

  const handleSaveToLibrary = async (game: GameItem) => {
    try {
      await saveGameToLibrary(game);
      setGames((prev) => {
        const existing = prev.findIndex((g) => g.id === game.id);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = game;
          return updated;
        }
        return [game, ...prev];
      });
    } catch (e: any) {
      alert(`Failed to save game to library: ${e.message}`);
    }
  };

  const handleDeleteGame = async (id: string) => {
    try {
      await deleteGameFromLibrary(id);
      setGames((prev) => prev.filter((g) => g.id !== id));
      if (activePlayingGame?.id === id) {
        setActivePlayingGame(null);
      }
    } catch (e: any) {
      alert(`Delete failed: ${e.message}`);
    }
  };

  const handleCoverUpdated = (gameId: string, newCoverUrl: string) => {
    setGames((prev) =>
      prev.map((g) => (g.id === gameId ? { ...g, coverUrl: newCoverUrl } : g))
    );
  };

  const handleClearLibrary = async () => {
    for (const g of games) {
      await deleteGameFromLibrary(g.id);
    }
    setGames([]);
    setActivePlayingGame(null);
  };

  const handleExportAllSaves = async () => {
    try {
      const allSaves = await getAllSaveStates();
      if (allSaves.length === 0) {
        alert('No save states found in IndexedDB to export.');
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
    } catch (e: any) {
      alert(`Export failed: ${e.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0c10] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Navigation Header */}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        gameCount={games.length}
        hasActiveGame={activePlayingGame !== null}
        onOpenActiveGame={() => {
          if (activePlayingGame) {
            // Already active, modal opens
          }
        }}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
      />

      {/* Main Tab Content */}
      <main className="flex-1">
        {activeTab === 'upload' && (
          <UploadView
            onGameReadyToPlay={(game) => {
              setActivePlayingGame(game);
              handleSaveToLibrary(game);
            }}
            onSaveToLibrary={handleSaveToLibrary}
            onOpenReaAgent={(report, data) => {
              setActiveReport(report);
              setActiveRawData(data);
              setActiveTab('rea');
            }}
            onOpenBoxArt={(game) => {
              setBoxArtTargetGame(game);
              setActiveTab('boxart');
            }}
          />
        )}

        {activeTab === 'library' && (
          <GameLibraryView
            games={games}
            onPlayGame={(game) => setActivePlayingGame(game)}
            onDeleteGame={handleDeleteGame}
            onGenerateCover={(game) => {
              setBoxArtTargetGame(game);
              setActiveTab('boxart');
            }}
            onNavigateUpload={() => setActiveTab('upload')}
          />
        )}

        {activeTab === 'rea' && (
          <ReaAgentView
            currentReport={activeReport}
            rawData={activeRawData}
          />
        )}

        {activeTab === 'boxart' && (
          <BoxArtStudio
            games={games}
            preselectedGame={boxArtTargetGame}
            onCoverUpdated={handleCoverUpdated}
          />
        )}

        {activeTab === 'compatibility' && <CompatibilityDatabaseView />}

        {activeTab === 'settings' && (
          <SettingsView
            games={games}
            onClearLibrary={handleClearLibrary}
            onRefreshLibrary={loadGames}
          />
        )}
      </main>

      {/* Global Command Palette (Cmd/Ctrl + K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        games={games}
        onPlayGame={(game) => {
          setActivePlayingGame(game);
          handleSaveToLibrary(game);
        }}
        onNavigateTab={(tab) => setActiveTab(tab)}
        onClearCache={handleClearLibrary}
        onExportSaves={handleExportAllSaves}
        onAddSampleRoms={seedDefaultHomebrews}
      />

      {/* Instant Play Dedicated Player Modal */}
      {activePlayingGame && (
        <PlayerModal
          game={activePlayingGame}
          onClose={() => setActivePlayingGame(null)}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-[#1a2130] bg-[#0c0f17] py-6 px-4 text-center text-xs font-mono text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
            <span className="font-bold text-slate-400">RecompStation Engine</span>
            <span>•</span>
            <span>Static Recompilation & Instant Browser Gaming</span>
          </div>
          <div className="flex items-center space-x-3 text-slate-400">
            <span>Press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">Cmd/Ctrl + K</kbd> for Command Hub</span>
            <span>•</span>
            <span>Local-First Sandbox</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
