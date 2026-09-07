import React, { useState, useEffect, useRef } from 'react';
import { Search, Plane, MapPin, X, Building2, Radio, Loader2 } from 'lucide-react';
import { AerodromeInfo } from '../types';
import { searchAerodromes } from '../data/aerodromes';
import { searchOpenAIPOrLocal, formatAerodromeNotes } from '../services/openaip';

interface AerodromeSearchInputProps {
  id?: string;
  value: string;
  placeholder?: string;
  onSelect: (aero: AerodromeInfo, defaultNotes: string) => void;
  onChangeText?: (text: string) => void;
  openAipApiKey?: string;
  className?: string;
  isLoading?: boolean;
}

export const AerodromeSearchInput: React.FC<AerodromeSearchInputProps> = ({
  id,
  value,
  placeholder = 'Code OACI ou nom (ex: LFPX ou Chavenay)...',
  onSelect,
  onChangeText,
  openAipApiKey,
  className = '',
  isLoading: externalLoading = false,
}) => {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState<AerodromeInfo[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<any>(null);
  const textMeasureRef = useRef<HTMLSpanElement>(null);
  const [textWidth, setTextWidth] = useState(0);

  const isBusy = isLoading || externalLoading;

  // Keep query in sync with parent value only when user is NOT actively typing/focused
  useEffect(() => {
    if (!isFocused) {
      setQuery(value || '');
    }
  }, [value, isFocused]);

  useEffect(() => {
    if (textMeasureRef.current) {
      setTextWidth(textMeasureRef.current.offsetWidth);
    }
  }, [query]);

  // Click outside and escape handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsFocused(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const handleSearch = (text: string) => {
    setQuery(text);
    if (onChangeText) {
      onChangeText(text);
    }

    // 1. Instant local search (0ms) so user gets immediate results
    const local = searchAerodromes(text);
    setResults(local);
    setIsOpen(true);

    // 2. Debounce remote OpenAIP lookup if API key is configured
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (openAipApiKey && openAipApiKey.trim().length > 5 && text.trim().length >= 2) {
      setIsLoading(true);
      searchTimeoutRef.current = setTimeout(async () => {
        try {
          const remote = await searchOpenAIPOrLocal(text, openAipApiKey);
          if (remote && remote.length > 0) {
            setResults((prev) => {
              const combined = [...prev];
              for (const r of remote) {
                if (!combined.some((c) => c.oaci.toUpperCase() === r.oaci.toUpperCase())) {
                  combined.push(r);
                }
              }
              return combined;
            });
          }
        } catch (err) {
          console.warn('OpenAIP query error:', err);
        } finally {
          setIsLoading(false);
        }
      }, 350);
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    const initialList = searchAerodromes(query);
    setResults(initialList);
    setIsOpen(true);
  };

  const handleSelectAerodrome = (aero: AerodromeInfo) => {
    const displayName = `${aero.oaci} ${aero.name}`;
    setQuery(displayName);
    const notes = formatAerodromeNotes(aero);
    onSelect(aero, notes);
    setIsOpen(false);
    setIsFocused(false);
  };

  const handleClear = () => {
    setQuery('');
    if (onChangeText) onChangeText('');
    const all = searchAerodromes('');
    setResults(all);
    setIsOpen(true);
  };

  // Calculate position right after the text (input has pl-9 = 36px)
  const loaderLeft = query ? Math.min(36 + textWidth + 8, 300) : 36 + 6;

  return (
    <div ref={containerRef} className={`relative ${isOpen ? 'z-40' : 'z-10'} ${className}`}>
      {/* Invisible measurement element to calculate text width in pixels */}
      <span
        ref={textMeasureRef}
        className="invisible absolute pointer-events-none whitespace-pre text-sm font-medium"
        aria-hidden="true"
        style={{
          fontFamily: 'inherit',
          fontSize: '0.875rem',
          fontWeight: '500',
          letterSpacing: 'normal',
        }}
      >
        {query}
      </span>

      <div className="relative flex items-center">
        <div className="absolute left-3 text-slate-400 pointer-events-none">
          <Plane className="w-4 h-4 text-sky-600" />
        </div>
        <input
          id={id}
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={handleFocus}
          placeholder={placeholder}
          className="w-full pl-9 pr-8 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-all font-medium"
        />

        {/* Loader animation right after typed text */}
        {isBusy && (
          <div
            className="absolute pointer-events-none flex items-center z-10 transition-all duration-75"
            style={{ left: `${loaderLeft}px` }}
            title="Recherche en cours..."
          >
            <Loader2 className="w-3.5 h-3.5 text-sky-600 animate-spin" />
          </div>
        )}

        {query && !isBusy && (
          <button
            type="button"
            id={`${id || 'aero'}-clear-btn`}
            onClick={handleClear}
            className="absolute right-2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
            title="Effacer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {isOpen && (
        <div
          className={`absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-300 rounded-xl shadow-2xl overflow-y-auto divide-y divide-slate-100 max-h-[380px] ${
            results.length >= 3 ? 'min-h-[220px]' : results.length > 0 ? 'min-h-[140px]' : 'min-h-0'
          }`}
        >
          <div className="px-3 py-1.5 bg-slate-50 text-[11px] font-semibold text-slate-500 flex justify-between items-center uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
            <span>Aérodromes & Terrains ULM ({results.length})</span>
            {isBusy && <span className="text-sky-600 animate-pulse font-normal">Recherche...</span>}
          </div>

          {results.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500">
              <p className="font-semibold text-slate-700">Aucun aérodrome trouvé</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Vous pouvez saisir directement le nom libre ou vérifier l'orthographe / le code OACI.
              </p>
            </div>
          ) : (
            results.map((aero) => {
              const f = aero.frequencies;
              return (
                <button
                  key={`${aero.oaci}-${aero.name}`}
                  type="button"
                  id={`aero-item-${aero.oaci}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelectAerodrome(aero);
                  }}
                  onClick={() => handleSelectAerodrome(aero)}
                  className="w-full text-left px-3 py-2.5 hover:bg-sky-50 transition-colors flex flex-col gap-0.5 cursor-pointer focus:bg-sky-50 focus:outline-none"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sky-900 bg-sky-100 px-1.5 py-0.5 rounded text-xs tracking-wider font-mono">
                        {aero.oaci}
                      </span>
                      {aero.isUlm ? (
                        <span className="font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded text-[10px] tracking-wide border border-emerald-200">
                          ULM
                        </span>
                      ) : (
                        <span className="font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded text-[10px] tracking-wide border border-slate-200">
                          AVION
                        </span>
                      )}
                      <span className="font-semibold text-slate-900 text-sm">
                        {aero.name}
                      </span>
                    </div>
                    {aero.elevationFt !== undefined && (
                      <span className="text-[11px] text-slate-500 font-mono">
                        Alt: {aero.elevationFt} ft
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600 mt-0.5">
                    {f.atis && (
                      <span className="inline-flex items-center gap-1 font-mono text-amber-800 bg-amber-50 px-1 rounded">
                        ATIS: <strong>{f.atis}</strong>
                      </span>
                    )}
                    {f.twr && (
                      <span className="inline-flex items-center gap-1 font-mono text-emerald-800 bg-emerald-50 px-1 rounded">
                        TWR: <strong>{f.twr}</strong>
                      </span>
                    )}
                    {f.gnd && (
                      <span className="inline-flex items-center gap-1 font-mono text-indigo-800 bg-indigo-50 px-1 rounded">
                        GND: <strong>{f.gnd}</strong>
                      </span>
                    )}
                    {f.afis && (
                      <span className="inline-flex items-center gap-1 font-mono text-blue-800 bg-blue-50 px-1 rounded">
                        AFIS: <strong>{f.afis}</strong>
                      </span>
                    )}
                    {f.aa && (
                      <span className="inline-flex items-center gap-1 font-mono text-slate-700 bg-slate-100 px-1 rounded">
                        A/A: <strong>{f.aa}</strong>
                      </span>
                    )}
                    {aero.region && (
                      <span className="text-slate-400 text-[10px] ml-auto">
                        {aero.region}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
