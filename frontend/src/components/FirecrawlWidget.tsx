import React, { useEffect, useState } from 'react';
import { HudCard } from './HudCard';
import { ShellMetalId } from '../utils/metalThemes';
import { NeonColorId, getNeonTheme } from '../utils/neonThemes';
import { soundManager } from '../utils/audio';
import { Search, Globe, Copy, Check, Sparkles } from 'lucide-react';

interface FirecrawlWidgetProps {
  shellMetal?: ShellMetalId;
  neonTheme?: NeonColorId;
  externalResult?: {
    query?: string;
    markdown?: string;
    sources?: SourceItem[];
  } | null;
}

interface SourceItem {
  title: string;
  url: string;
}

export const FirecrawlWidget: React.FC<FirecrawlWidgetProps> = ({
  shellMetal = 'gold',
  neonTheme = 'amber',
  externalResult = null,
}) => {
  const neon = getNeonTheme(neonTheme);
  const [mode, setMode] = useState<'search' | 'scrape'>('search');
  const [targetInput, setTargetInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [markdownOutput, setMarkdownOutput] = useState<string>('');
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!externalResult) return;
    if (externalResult.query) setTargetInput(externalResult.query);
    setMarkdownOutput(externalResult.markdown || 'Search completed with no textual summary.');
    setSources(externalResult.sources || []);
  }, [externalResult]);

  const handleExecute = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = targetInput.trim();
    if (!query || isLoading) return;

    soundManager.playClick();
    setIsLoading(true);
    setMarkdownOutput(`⚡ Firecrawl crawler initiated: "${query}"`);

    try {
      const res = await fetch('/api/firecrawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          query: mode === 'search' ? query : undefined,
          url: mode === 'scrape' ? query : undefined,
        }),
      });

      const data = await res.json();
      if (data.markdown) {
        setMarkdownOutput(data.markdown);
      } else {
        setMarkdownOutput('Web crawling finished. No structured markdown parsed.');
      }

      if (data.sources) {
        setSources(data.sources);
      } else {
        setSources([]);
      }
    } catch (err: any) {
      setMarkdownOutput(`Firecrawl Error: ${err?.message || 'Network request failed'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(markdownOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <HudCard tag="PORT_03 // FIRECRAWL_WEB" dockSide="left" shellMetal={shellMetal}>
      <div className="flex flex-col h-full flex-1 select-none justify-between">
        {/* Header with Mode Toggles */}
        <div className="flex items-center justify-between pb-1 border-b border-stone-800/80 gap-1">
          <div className="flex items-center space-x-1.5 min-w-0">
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${isLoading ? 'animate-ping' : ''}`}
              style={{ backgroundColor: neon.glowColor, boxShadow: `0 0 8px ${neon.glowColor}` }}
            />
            <span 
              className="font-orbitron font-bold tracking-wider text-[11px] uppercase whitespace-nowrap truncate"
              style={{ color: neon.glowColor }}
            >
              FIRECRAWL SEARCH
            </span>
          </div>

          <div className="flex items-center space-x-1 flex-shrink-0 font-tech">
            <button
              onClick={() => {
                soundManager.playClick();
                setMode('search');
              }}
              className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded transition-colors cursor-pointer border"
              style={{
                backgroundColor: mode === 'search' ? `${neon.glowColor}25` : 'transparent',
                borderColor: mode === 'search' ? neon.glowColor : '#44403c',
                color: mode === 'search' ? neon.glowColor : '#a8a29e',
              }}
            >
              SEARCH
            </button>
            <button
              onClick={() => {
                soundManager.playClick();
                setMode('scrape');
              }}
              className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded transition-colors cursor-pointer border"
              style={{
                backgroundColor: mode === 'scrape' ? `${neon.glowColor}25` : 'transparent',
                borderColor: mode === 'scrape' ? neon.glowColor : '#44403c',
                color: mode === 'scrape' ? neon.glowColor : '#a8a29e',
              }}
            >
              SCRAPE
            </button>
          </div>
        </div>

        {/* Search Query / URL Input Form */}
        <form onSubmit={handleExecute} className="py-1 flex items-center gap-1 font-tech">
          <div className="relative flex-1 flex items-center">
            {mode === 'search' ? (
              <Search className="w-3 h-3 text-stone-400 absolute left-1.5 pointer-events-none" />
            ) : (
              <Globe className="w-3 h-3 text-stone-400 absolute left-1.5 pointer-events-none" />
            )}
            <input
              type="text"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              placeholder={mode === 'search' ? 'Search topic...' : 'https://example.com'}
              className="w-full bg-stone-950/90 border border-stone-700/80 pl-6 pr-2 py-0.5 text-[10px] text-stone-100 placeholder-stone-500 outline-none font-tech"
              style={{ borderColor: targetInput ? neon.glowColor : '#44403c' }}
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !targetInput.trim()}
            className="px-2 py-0.5 disabled:opacity-30 border text-[9.5px] font-bold transition-colors cursor-pointer whitespace-nowrap font-orbitron bg-stone-900"
            style={{ borderColor: neon.glowColor, color: neon.glowColor }}
          >
            {isLoading ? '...' : 'RUN'}
          </button>
        </form>

        {/* Output & Intelligence Preview */}
        <div className="flex-1 overflow-y-auto no-scrollbar bg-black/80 border border-stone-800 rounded p-1 text-[10px] text-stone-300 font-tech relative max-h-[55px]">
          {markdownOutput ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[8px] border-b border-stone-800 pb-0.5" style={{ color: neon.glowColor }}>
                <span className="font-orbitron font-bold">INTELLIGENCE</span>
                <button
                  onClick={handleCopy}
                  className="text-stone-400 hover:text-white cursor-pointer flex items-center space-x-0.5"
                >
                  {copied ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                  <span>{copied ? 'COPIED' : 'COPY'}</span>
                </button>
              </div>
              <div className="text-[10px] leading-snug whitespace-pre-wrap font-tech text-stone-300">
                {markdownOutput}
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-stone-500 text-[10px] gap-1 py-1">
              <Sparkles className="w-3 h-3" style={{ color: neon.glowColor }} />
              <span>Type a query or URL to execute search.</span>
            </div>
          )}
        </div>

        {/* Bottom Engine Status */}
        <div className="pt-1 border-t border-stone-800/80 flex items-center justify-between text-[9px] text-stone-400 font-tech">
          <span>FIRECRAWL ENGINE</span>
          <span className="font-bold font-orbitron" style={{ color: neon.glowColor }}>
            {isLoading ? 'FETCHING...' : 'STANDBY'}
          </span>
        </div>
      </div>
    </HudCard>
  );
};
