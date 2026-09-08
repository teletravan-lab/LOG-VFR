import React, { useState, useEffect, useRef } from 'react';
import { Plane, X, Loader2 } from 'lucide-react';
import { AerodromeInfo } from '../types';
import { searchAerodromes, AerodromeIndexEntry } from '../data/aerodromes';
import { fetchAerodromeDetails, formatAerodromeNotes } from '../services/openaip';

interface AerodromeSearchInputProps {
  id?: string;
  value: string;
  placeholder?: string;
  onSelect: (aero: AerodromeInfo, defaultNotes: string) => void;
  onChangeText?: (text: string) => void;
  openAipApiKey?: string;
  className?: string;
  isLoading?: boolean;
  onLoadingChange?: (loading: boolean) => void;
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
  onLoadingChange,
}) => {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState<AerodromeIndexEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const justSelectedRef = useRef(false);

  const isBusy = isLoading || externalLoading;

  // Resynchronise avec le parent, SAUF juste après une sélection :
  // sinon cet effet écrase le terrain qu'on vient de choisir.
  useEffect(() => {
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    if (!isFocused) setQuery(value || '');
  }, [value, isFocused]);

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
    };
  }, []);

    // Recherche purement locale : instantanée, hors ligne, sans quota.
  // OpenAIP n'est interrogé qu'au moment de la sélection.
  const handleSearch = (text: string) => {
    setQuery(text);
    if (onChangeText) onChangeText(text);
    setResults(searchAerodromes(text));
    setIsOpen(true);
  };

  const handleFocus = () => {
    setIsFocused(true);
    setResults(searchAerodromes(query));
    setIsOpen(true);
  };

  /**
   * Sélection d'un terrain : on ferme la liste, puis on va chercher
   * les données opérationnelles chez OpenAIP. Si OpenAIP ne connaît pas
   * le terrain, on remonte un objet aux champs vides et les notes le disent.
   */
  const handleSelectAerodrome = async (entry: AerodromeIndexEntry) => {
    justSelectedRef.current = true;
    setQuery(`${entry.oaci} ${entry.name}`);
    setIsOpen(false);
    setIsFocused(false);
    setIsLoading(true);
    if (onLoadingChange) onLoadingChange(true);

    try {
      const details = await fetchAerodromeDetails(
        entry.id,
        openAipApiKey && openAipApiKey.trim().length > 5 ? openAipApiKey.trim() : undefined
      );

      const info: AerodromeInfo = details ?? {
        oaci: entry.oaci,
        name: entry.name,
        openAipId: entry.id,
        frequencies: {},
      };

      onSelect(info, formatAerodromeNotes(details, entry.oaci));
    } catch (err) {
      console.warn('Sélection aérodrome : échec OpenAIP', err);
      onSelect(
        { oaci: entry.oaci, name: entry.name, openAipId: entry.id, frequencies: {} },
        formatAerodromeNotes(null, entry.oaci)
      );
    } finally {
      setIsLoading(false);
      if (onLoadingChange) onLoadingChange(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    if (onChangeText) onChangeText('');
    setResults(searchAerodromes(''));
    setIsOpen(true);
  };

    return (
    <div ref={containerRef} className={`relative ${isOpen ? 'z-40' : 'z-10'} ${className}`}>
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

        {isBusy && (
          <div className="absolute right-2 pointer-events-none flex items-center" title="Recherche OpenAIP...">
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
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-300 rounded-xl shadow-2xl overflow-y-auto divide-y divide-slate-100 max-h-[380px]">
          <div className="px-3 py-1.5 bg-slate-50 text-[11px] font-semibold text-slate-500 flex justify-between items-center uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
            <span>Aérodromes ({results.length})</span>
            {isBusy && <span className="text-sky-600 animate-pulse font-normal">OpenAIP...</span>}
          </div>

          {results.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500">
              <p className="font-semibold text-slate-700">Aucun aérodrome trouvé</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Vérifiez l'orthographe ou le code OACI, ou saisissez un nom libre.
              </p>
            </div>
          ) : (
            results.map((aero) => (
              <button
                key={aero.oaci}
                type="button"
                id={`aero-item-${aero.oaci}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelectAerodrome(aero);
                }}
                className="w-full text-left px-3 py-2.5 hover:bg-sky-50 transition-colors flex items-center gap-2 cursor-pointer focus:bg-sky-50 focus:outline-none"
              >
                <span className="font-bold text-sky-900 bg-sky-100 px-1.5 py-0.5 rounded text-xs tracking-wider font-mono">
                  {aero.oaci}
                </span>
                <span className="font-semibold text-slate-900 text-sm">{aero.name}</span>
              </button>
            ))
          )}

          <div className="px-3 py-1.5 bg-slate-50 text-[10px] text-slate-400 italic border-t border-slate-200">
            Fréquences et altitudes récupérées à la sélection — à recouper sur VAC.
          </div>
        </div>
      )}
    </div>
  );
};