import React, { useState } from 'react';
import {
  Sparkles,
  Image as ImageIcon,
  Download,
  Check,
  RefreshCw,
  Sliders,
  Layers,
  Palette,
  ArrowRight,
} from 'lucide-react';
import { GameItem } from '../types/rom';
import { updateGameCover } from '../services/storage';

interface BoxArtStudioProps {
  games: GameItem[];
  preselectedGame?: GameItem | null;
  onCoverUpdated?: (gameId: string, newCoverUrl: string) => void;
}

export const BoxArtStudio: React.FC<BoxArtStudioProps> = ({
  games,
  preselectedGame,
  onCoverUpdated,
}) => {
  const [selectedGameId, setSelectedGameId] = useState<string>(
    preselectedGame?.id || (games.length > 0 ? games[0].id : '')
  );
  const [prompt, setPrompt] = useState<string>(
    preselectedGame
      ? `Dramatic retro cover art for "${preselectedGame.title}" on ${preselectedGame.platformName}. Dynamic action scene with iconic hero framing and vintage packaging logo.`
      : 'Legendary hero standing on a cliff overlooking a futuristic cyber retro landscape, Japanese Super Famicom box art styling.'
  );
  // Affordance for user to specify image size (1K, 2K, 4K) per feature instructions
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('2K');
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '3:4' | '4:3' | '16:9'>('3:4');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [appliedSuccess, setAppliedSuccess] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const stylePresets = [
    {
      label: 'Super Famicom Box Art',
      text: 'Japanese Super Famicom packaging aesthetic, bold colorful character illustration, dramatic lighting, authentic 90s anime retro box layout.',
    },
    {
      label: '90s Action Comic Cover',
      text: 'Vintage 90s Western comic book action cover, dynamic superhero stance, high contrast, bold inks and rich grain.',
    },
    {
      label: 'N64/PS1 3D CGI Render',
      text: 'Iconic late 90s pre-rendered 3D CGI box art, metallic shaders, atmospheric fog, nostalgic early 3D console packaging.',
    },
    {
      label: 'Arcade Pixel Art Poster',
      text: 'Masterclass neo-retro pixel art poster with vibrant neon colors, intricate details, and arcade marquee typography.',
    },
  ];

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setErrorMsg(null);
    setAppliedSuccess(false);

    const activeGame = games.find((g) => g.id === selectedGameId);

    try {
      const response = await fetch('/api/gemini/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          imageSize,
          aspectRatio,
          gameTitle: activeGame?.title || 'Retro Game',
          platform: activeGame?.platformName || 'Console',
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate image');
      }

      setGeneratedImageUrl(data.imageUrl);
    } catch (err: any) {
      console.error('Image generation error:', err);
      setErrorMsg(err.message || 'Generation failed. Check API key quota or try another prompt.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyToGame = async () => {
    if (!generatedImageUrl || !selectedGameId) return;

    try {
      await updateGameCover(selectedGameId, generatedImageUrl);
      if (onCoverUpdated) {
        onCoverUpdated(selectedGameId, generatedImageUrl);
      }
      setAppliedSuccess(true);
      setTimeout(() => setAppliedSuccess(false), 3000);
    } catch (e: any) {
      alert(`Failed to apply cover: ${e.message}`);
    }
  };

  const handleDownload = () => {
    if (!generatedImageUrl) return;
    const link = document.createElement('a');
    link.download = `BoxArt_${imageSize}_${Date.now()}.png`;
    link.href = generatedImageUrl;
    link.click();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Title */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center space-x-3">
          <Sparkles className="w-8 h-8 text-amber-400" />
          <span>Retro Box Art & Game Cover Asset Studio</span>
          <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-amber-950 text-amber-400 border border-amber-800">
            GEMINI 3 PRO IMAGE
          </span>
        </h1>
        <p className="mt-2 text-sm text-slate-400 max-w-3xl">
          Generate authentic, collector-grade vintage box art and cartridge covers for your homebrew titles and library games with high-fidelity resolution (1K, 2K, 4K).
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Configuration Controls (6 cols) */}
        <div className="lg:col-span-6 space-y-6">
          {/* Target Game Selector */}
          <div className="p-5 rounded-2xl bg-[#10141e]/90 border border-[#273043] space-y-3">
            <label className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold block">
              Target Game in Library
            </label>
            {games.length > 0 ? (
              <select
                value={selectedGameId}
                onChange={(e) => {
                  setSelectedGameId(e.target.value);
                  const g = games.find((item) => item.id === e.target.value);
                  if (g) {
                    setPrompt(`Dramatic authentic packaging box art for "${g.title}" on ${g.platformName}. Vibrant character framing and vintage arcade logo.`);
                  }
                }}
                className="w-full bg-[#151c2a] text-sm font-semibold text-white border border-slate-700/80 rounded-xl px-4 py-2.5 outline-none focus:border-amber-500 transition-colors"
              >
                {games.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title} ({g.platformName})
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-slate-500 font-mono">
                No games currently in library. Upload a ROM or test homebrew first, or generate standalone art.
              </p>
            )}
          </div>

          {/* Prompt Input & Style Presets */}
          <div className="p-5 rounded-2xl bg-[#10141e]/90 border border-[#273043] space-y-4">
            <div>
              <label className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold block mb-2">
                Artwork Prompt & Description
              </label>
              <textarea
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe characters, scenery, typography, art medium, and color palette..."
                className="w-full bg-[#151c2a] text-xs font-mono text-slate-200 border border-slate-700/80 rounded-xl p-3 outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            {/* Presets */}
            <div>
              <span className="text-[11px] font-mono text-slate-400 block mb-2">Style Presets:</span>
              <div className="grid grid-cols-2 gap-2">
                {stylePresets.map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => setPrompt(`${prompt ? prompt + '. ' : ''}${preset.text}`)}
                    className="p-2.5 text-left rounded-xl bg-[#151c2a] hover:bg-[#1a2334] border border-slate-800 text-xs text-slate-300 hover:text-amber-300 transition-all font-mono"
                  >
                    + {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Affordance: Image Size & Aspect Ratio Controls */}
          <div className="p-5 rounded-2xl bg-[#10141e]/90 border border-[#273043] space-y-5">
            {/* MANDATORY AFFORDANCE: Image Size (1K, 2K, 4K) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-mono uppercase tracking-wider text-amber-400 font-bold flex items-center space-x-1.5">
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Output Resolution Size</span>
                </label>
                <span className="text-[11px] font-mono text-slate-400">gemini-3-pro-image-preview</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {(['1K', '2K', '4K'] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setImageSize(size)}
                    className={`py-3 rounded-xl border text-center transition-all ${
                      imageSize === size
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500 font-bold shadow-md shadow-amber-500/20'
                        : 'bg-[#151c2a] text-slate-400 border-slate-800 hover:text-white hover:bg-[#1a2334]'
                    }`}
                  >
                    <span className="block text-base font-extrabold">{size}</span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {size === '1K' ? 'Standard' : size === '2K' ? 'High Res' : 'Ultra 4K'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Aspect Ratio Selector */}
            <div>
              <label className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold block mb-2">
                Box Aspect Ratio
              </label>
              <div className="grid grid-cols-4 gap-2 text-xs font-mono">
                {[
                  { id: '3:4', label: '3:4 (Box)' },
                  { id: '1:1', label: '1:1 (Square)' },
                  { id: '4:3', label: '4:3 (Screen)' },
                  { id: '16:9', label: '16:9 (Banner)' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setAspectRatio(item.id as any)}
                    className={`py-2 px-2 rounded-lg border text-center transition-all ${
                      aspectRatio === item.id
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500 font-bold'
                        : 'bg-[#151c2a] text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Generate Action Button */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-400 text-black font-extrabold text-sm shadow-xl shadow-amber-500/20 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-black" />
                  <span>Synthesizing {imageSize} Box Art...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 fill-black" />
                  <span>Generate {imageSize} Box Art ({aspectRatio})</span>
                </>
              )}
            </button>

            {errorMsg && (
              <p className="text-xs font-mono text-red-400 bg-red-950/40 border border-red-900/60 p-3 rounded-xl">
                {errorMsg}
              </p>
            )}
          </div>
        </div>

        {/* Right Column: Artwork Preview & Actions (6 cols) */}
        <div className="lg:col-span-6 flex flex-col">
          <div className="flex-1 rounded-2xl bg-[#10141e]/90 border border-[#273043] p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <ImageIcon className="w-4 h-4 text-amber-400" />
                  <span>High-Fidelity Preview</span>
                </h3>
                {generatedImageUrl && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-amber-950 text-amber-300 border border-amber-800">
                    {imageSize} • {aspectRatio}
                  </span>
                )}
              </div>

              {/* Preview Container */}
              <div className="w-full min-h-[380px] rounded-xl bg-[#0a0d14] border border-slate-800 flex items-center justify-center overflow-hidden relative group">
                {isGenerating ? (
                  <div className="text-center p-8">
                    <div className="w-16 h-16 border-4 border-amber-500/20 border-t-amber-400 rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-sm font-bold text-white">Rendering {imageSize} Artwork</p>
                    <p className="text-xs text-slate-500 mt-1">Applying vintage console packaging styles...</p>
                  </div>
                ) : generatedImageUrl ? (
                  <img
                    src={generatedImageUrl}
                    alt="Generated Retro Box Art"
                    className="max-h-[480px] w-auto object-contain rounded shadow-2xl transition-transform group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="text-center p-8 text-slate-500">
                    <Layers className="w-12 h-12 mx-auto mb-3 opacity-40" />
                    <p className="text-sm font-semibold text-slate-400">Artwork Canvas Ready</p>
                    <p className="text-xs text-slate-600 mt-1">
                      Choose an image size (1K, 2K, 4K) and generate vintage box art.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Action Bar when generated */}
            {generatedImageUrl && (
              <div className="pt-6 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 mt-4">
                <button
                  onClick={handleDownload}
                  className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-[#1b2234] hover:bg-[#222b42] text-slate-200 border border-slate-700 text-xs font-mono font-bold transition-all"
                >
                  <Download className="w-4 h-4 text-cyan-400" />
                  <span>Download Full Res ({imageSize})</span>
                </button>

                {selectedGameId && (
                  <button
                    onClick={handleApplyToGame}
                    disabled={appliedSuccess}
                    className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-black font-extrabold text-xs transition-all shadow-md shadow-emerald-500/20"
                  >
                    {appliedSuccess ? (
                      <>
                        <Check className="w-4 h-4 text-black" />
                        <span>Applied to Library Cover!</span>
                      </>
                    ) : (
                      <>
                        <Palette className="w-4 h-4 text-black" />
                        <span>Set as Game Box Art</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
