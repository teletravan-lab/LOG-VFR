import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Info, RotateCcw } from 'lucide-react';

interface WindCalculatorProps {
  isOpen: boolean;
  onClose: () => void;
  aircraftModel?: string;
  cruiseSpeedKt?: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;
const norm360 = (deg: number) => ((deg % 360) + 360) % 360;
const KM_PER_NM = 1.852;
const STORE_KEY = 'windcalc:v2';

export const WindCalculator: React.FC<WindCalculatorProps> = ({
  isOpen,
  onClose,
  cruiseSpeedKt,
}) => {
  // Respect strict du localStorage existant :
  // Les valeurs par défaut ne s'appliquent que si le localStorage est vierge.
  const [rm, setRm] = useState('315');
  const [distNm, setDistNm] = useState('10');
  const [windDir, setWindDir] = useState('0');
  const [windSpeed, setWindSpeed] = useState('0');
  const [vp, setVp] = useState(cruiseSpeedKt ? String(cruiseSpeedKt) : '85');
  const [isLoaded, setIsLoaded] = useState(false);

  const [showInfo, setShowInfo] = useState(false);
  const [activeDrag, setActiveDrag] = useState<'rm' | 'wind' | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

  // 1. Restauration depuis localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.rm !== undefined) setRm(String(s.rm));
        if (s.distNm !== undefined) setDistNm(String(s.distNm));
        if (s.windDir !== undefined) setWindDir(String(s.windDir));
        if (s.windSpeed !== undefined) setWindSpeed(String(s.windSpeed));
        if (s.vp !== undefined) setVp(String(s.vp));
      }
    } catch {
      // localStorage inaccessible
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // 2. Persistance continue
  useEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ rm, distNm, windDir, windSpeed, vp })
      );
    } catch {
      // quota plein
    }
  }, [rm, distNm, windDir, windSpeed, vp, isLoaded]);

  const reset = () => {
    setRm('315');
    setDistNm('10');
    setWindDir('0');
    setWindSpeed('0');
    setVp(cruiseSpeedKt ? String(cruiseSpeedKt) : '85');
  };

  // Valeurs numériques parsées
  const parsedRm = parseFloat(rm.replace(',', '.'));
  const parsedDist = parseFloat(distNm.replace(',', '.'));
  const parsedWindDir = parseFloat(windDir.replace(',', '.'));
  const parsedWindSpeed = parseFloat(windSpeed.replace(',', '.'));
  const parsedVp = parseFloat(vp.replace(',', '.'));

  const currentRm = Number.isFinite(parsedRm) ? norm360(parsedRm) : 315;
  const currentWindDir = Number.isFinite(parsedWindDir) ? norm360(parsedWindDir) : 0;

  // Calculs du vol (strictement inchangés)
  const res = useMemo(() => {
    const vpNum = Number.isFinite(parsedVp) ? parsedVp : Number(cruiseSpeedKt || 85);
    const r = parsedRm;
    const d = parsedDist;
    const wd = parsedWindDir;
    const ws = parsedWindSpeed;

    if (!vpNum || vpNum <= 0) {
      return { error: 'Vitesse propre absente : renseignez-la.' };
    }

    const hasRoute = Number.isFinite(r);
    const hasDist = Number.isFinite(d) && d > 0;
    const hasWind = Number.isFinite(wd) && Number.isFinite(ws);
    const distKm = hasDist ? d * KM_PER_NM : null;

    const tSansVent = hasDist ? (d / vpNum) * 60 : null;
    if (!hasRoute || !hasWind) return { tSansVent, distKm };

    const theta = toRad(norm360(wd - r));
    const crossWind = ws * Math.sin(theta);
    const headWind = ws * Math.cos(theta);

    if (Math.abs(crossWind) > vpNum) {
      return { tSansVent, distKm, error: 'Vent traversier supérieur à la vitesse propre : route intenable.' };
    }

    const driftRad = Math.asin(crossWind / vpNum);
    const cap = norm360(r + toDeg(driftRad));
    const vs = vpNum * Math.cos(driftRad) - headWind;

    if (vs <= 0) {
      return { tSansVent, distKm, cap, vs, error: 'Vitesse sol nulle ou négative : aucune progression.' };
    }

    return { tSansVent, tAvecVent: hasDist ? (d / vs) * 60 : null, distKm, cap, vs };
  }, [parsedVp, parsedRm, parsedDist, parsedWindDir, parsedWindSpeed, cruiseSpeedKt]);

  // Curseurs vs champs texte
  // 1. Distance : curseur de 0 à 50 NM
  const sliderDist = Math.min(50, Math.max(0, Number.isFinite(parsedDist) ? parsedDist : 0));
  const isDistOutOfRange = Number.isFinite(parsedDist) && (parsedDist < 0 || parsedDist > 50);

  // 2. Vitesse vent : curseur de 0 à 55 kt
  const sliderWindSpeed = Math.min(55, Math.max(0, Number.isFinite(parsedWindSpeed) ? parsedWindSpeed : 0));
  const isWsOutOfRange = Number.isFinite(parsedWindSpeed) && (parsedWindSpeed < 0 || parsedWindSpeed > 55);

  // 3. Vp : curseur de 60 à 150 kt (pas de 5), saisie manuelle de 30 à 250 kt
  const sliderVp = Math.min(150, Math.max(60, Number.isFinite(parsedVp) ? parsedVp : 85));
  const isVpOutOfRange = Number.isFinite(parsedVp) && (parsedVp < 60 || parsedVp > 150);

  // Conversion position pointeur -> cap
  const updateAngleFromPointer = (type: 'rm' | 'wind', clientX: number, clientY: number) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const cx = 150;
    const cy = 150;
    const scaleX = 300 / rect.width;
    const scaleY = 300 / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    const cap = Math.round((Math.atan2(x - cx, cy - y) * 180 / Math.PI + 360) % 360);
    if (type === 'rm') {
      setRm(String(cap));
    } else {
      setWindDir(String(cap));
    }
  };

  const handlePointerDown = (type: 'rm' | 'wind', e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setActiveDrag(type);
    updateAngleFromPointer(type, e.clientX, e.clientY);
  };

  const handlePointerMove = (type: 'rm' | 'wind', e: React.PointerEvent) => {
    if (activeDrag === type) {
      e.preventDefault();
      updateAngleFromPointer(type, e.clientX, e.clientY);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {}
    setActiveDrag(null);
  };

  // Clavier
  const handleKeyDownRm = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1;
    let curr = Number.isFinite(parsedRm) ? Math.round(parsedRm) : 315;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      setRm(String(norm360(curr - step)));
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      setRm(String(norm360(curr + step)));
    }
  };

  const handleKeyDownWind = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1;
    let curr = Number.isFinite(parsedWindDir) ? Math.round(parsedWindDir) : 0;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      setWindDir(String(norm360(curr - step)));
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      setWindDir(String(norm360(curr + step)));
    }
  };

  // Conversions et pourcentages pour les pistes dégradées
  const vpKmh = Number.isFinite(parsedVp) && parsedVp > 0 ? Math.round(parsedVp * KM_PER_NM) : null;
  const distKm = Number.isFinite(parsedDist) && parsedDist >= 0
    ? parsedDist % 1 !== 0
      ? (parsedDist * KM_PER_NM).toFixed(1)
      : Math.round(parsedDist * KM_PER_NM)
    : null;
  const vpPercent = Math.min(100, Math.max(0, ((sliderVp - 60) / (150 - 60)) * 100));
  const distPercent = Math.min(100, Math.max(0, (sliderDist / 50) * 100));
  const windPercent = Math.min(100, Math.max(0, (sliderWindSpeed / 55) * 100));

  if (!isOpen) return null;

  const fmt = (n: number | null | undefined, unit: string, dec = 0) =>
    n === null || n === undefined || !Number.isFinite(n)
      ? '—'
      : n.toFixed(dec) + ' ' + unit;

  // Géométrie SVG (300 x 300)
  const cx = 150;
  const cy = 150;
  const R = 86; // Rayon du cercle des caps
  const R_windButton = 134; // Rayon du bouton V à l'extérieur éloigné de la barbule

  // Position du bouton V à l'extérieur
  const windRad = toRad(currentWindDir);
  const windBtnX = cx + R_windButton * Math.sin(windRad);
  const windBtnY = cy - R_windButton * Math.cos(windRad);

  // Position du bouton RM (calculée directement en coordonnées pour éliminer tout délai / lag)
  const rmRad = toRad(currentRm);
  const rmBtnX = cx + R * Math.sin(rmRad);
  const rmBtnY = cy - R * Math.cos(rmRad);

  // Barbule météo (située au niveau du cercle, barbes orientées vers la droite)
  const effectiveWindSpeed = Number.isFinite(parsedWindSpeed) ? parsedWindSpeed : 0;
  const isCalmWind = effectiveWindSpeed <= 3;
  const roundedWindSpeed = Math.round(effectiveWindSpeed / 5) * 5;

  const flags50 = Math.floor(roundedWindSpeed / 50);
  const rem50 = roundedWindSpeed % 50;
  const fullBarbs10 = Math.floor(rem50 / 10);
  const halfBarb5 = (rem50 % 10) >= 5 ? 1 : 0;

  // Hampe de barbule : longueur 36px, milieu positionné exactement sur le cercle de la boussole (cy - R)
  const barbShaftLen = 36;
  const barbShaftInnerY = cy - (R - barbShaftLen / 2); // cy - R + 18 (côté intérieur)
  const barbShaftOuterY = cy - (R + barbShaftLen / 2); // cy - R - 18 (côté extérieur)

  const barbElements: React.ReactNode[] = [];
  if (!isCalmWind && roundedWindSpeed >= 5) {
    let barbY = barbShaftOuterY + 2; // Commencer proche de l'extrémité extérieure
    for (let i = 0; i < flags50; i++) {
      barbElements.push(
        <polygon
          key={`flag-${i}`}
          points={`${cx},${barbY} ${cx - 14},${barbY - 3} ${cx},${barbY + 7}`}
          fill="#38bdf8"
          stroke="#38bdf8"
          strokeWidth="1"
        />
      );
      barbY += 8;
    }
    for (let i = 0; i < fullBarbs10; i++) {
      barbElements.push(
        <line
          key={`barb-${i}`}
          x1={cx}
          y1={barbY}
          x2={cx - 13}
          y2={barbY - 4}
          stroke="#38bdf8"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      );
      barbY += 6;
    }
    if (halfBarb5 === 1) {
      barbElements.push(
        <line
          key="half-barb"
          x1={cx}
          y1={barbY}
          x2={cx - 7.5}
          y2={barbY - 2.5}
          stroke="#38bdf8"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      );
    }
  }

  return (
    <div className="no-print fixed sm:absolute left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 top-2 sm:top-full sm:mt-2 w-[min(96vw,34rem)] max-h-[calc(100dvh-20px)] sm:max-h-[92vh] flex flex-col bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl z-50 text-left overflow-hidden">
      {/* ZONE FIGÉE / EN-TÊTE FIXE (100% opaque noir, immobile en haut : titre mobile + boutons + 4 résultats) */}
      <div className="shrink-0 bg-neutral-900 px-3 sm:px-4 pt-2.5 sm:pt-3.5 pb-2.5 border-b border-neutral-800 z-20">
        {/* Message d'erreur éventuel */}
        {res.error && (
          <div className="mb-2 px-3 py-2 bg-amber-500/10 border border-amber-500/40 rounded-lg text-xs text-amber-300">
            {res.error}
          </div>
        )}

        {/* Barre d'en-tête mobile : titre + boutons Info, Reset, Fermer remontés tout en haut */}
        <div className="flex sm:hidden items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 text-neutral-300 min-w-0">
            <button
              type="button"
              id="mobile-wind-calc-info-btn"
              onClick={() => setShowInfo(true)}
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-neutral-800 border border-neutral-600 text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors cursor-pointer"
              title="Détail des calculs et formules"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-bold text-white tracking-tight truncate">
              Calculette Vent ETE
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              id="mobile-wind-calc-reset-btn"
              onClick={reset}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-neutral-800 border border-neutral-600 text-white hover:bg-neutral-700 transition-colors cursor-pointer"
              title="Réinitialiser les valeurs par défaut"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              id="mobile-wind-calc-close-btn"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-neutral-800 border border-neutral-600 text-white hover:bg-neutral-700 transition-colors cursor-pointer"
              title="Fermer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 1. LES QUATRE RÉSULTATS (T SANS VENT, T AVEC VENT, CAP À TENIR, VITESSE SOL) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="flex flex-col gap-0.5 px-3 py-1.5 sm:py-2 rounded-lg border bg-neutral-800 border-neutral-700">
            <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
              T sans vent
            </span>
            <span className="font-mono text-base text-white">
              {fmt(res.tSansVent, 'min')}
            </span>
          </div>

          <div className="flex flex-col gap-0.5 px-3 py-1.5 sm:py-2 rounded-lg border bg-amber-500/10 border-amber-500/40">
            <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
              T avec vent
            </span>
            <span className="font-mono text-lg font-bold text-amber-400">
              {fmt(res.tAvecVent, 'min')}
            </span>
          </div>

          <div className="flex flex-col gap-0.5 px-3 py-1.5 sm:py-2 rounded-lg border bg-amber-500/10 border-amber-500/40">
            <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
              Cap à tenir
            </span>
            <span className="font-mono text-lg font-bold text-amber-400">
              {res.cap === undefined ? '—' : Math.round(res.cap) + '°'}
            </span>
          </div>

          <div className="flex flex-col gap-0.5 px-3 py-1.5 sm:py-2 rounded-lg border bg-neutral-800 border-neutral-700">
            <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
              Vitesse sol
            </span>
            <span className="font-mono text-base text-white">
              {fmt(res.vs, 'kt')}
            </span>
          </div>
        </div>
      </div>

      {/* CORPS DÉFILANT : AVERTISSEMENT, NOTE, PARAMÈTRES VP, ROSE DES VENTS, VENT */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-2.5">
        {/* NOTE D'AVERTISSEMENT */}
        <div className="flex items-center justify-between gap-2.5 my-2 px-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              id="wind-calc-info-btn"
              onClick={() => setShowInfo(true)}
              className="hidden sm:flex shrink-0 w-7 h-7 items-center justify-center rounded-full bg-neutral-800 border border-neutral-600 text-neutral-300 hover:bg-neutral-700 hover:text-white hover:border-neutral-400 transition-colors cursor-pointer"
              title="Détail des calculs et formules"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
            <div className="text-[11px] leading-snug">
              <p className="text-neutral-300">
                Aucune valeur n'est reportée automatiquement dans le log.
              </p>
              <p className="text-red-400 font-medium">
                Vous êtes responsable de les inscrire en les ayant vérifiées.
              </p>
            </div>
          </div>

          {/* Boutons Reset & Fermer tout à droite (Affichés sur desktop ici) */}
          <div className="hidden sm:flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              id="wind-calc-reset-btn"
              onClick={reset}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-neutral-800 border border-neutral-600 text-white hover:bg-neutral-700 hover:border-neutral-400 transition-colors cursor-pointer"
              title="Réinitialiser les valeurs par défaut"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              id="wind-calc-close-btn"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-neutral-800 border border-neutral-600 text-white hover:bg-neutral-700 hover:border-neutral-400 transition-colors cursor-pointer"
              title="Fermer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      {/* TRAIT GRIS FIN DE SÉPARATION DE LA ZONE DE PARAMÉTRAGE DES VALEURS */}
      <div className="border-b border-neutral-700/60 my-2.5" />

      {/* 2. ZONE DE PARAMÉTRAGE VP : même charte, même taille de texte que RM et vent */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 bg-neutral-800/40 p-2.5 rounded-xl border border-neutral-800 mb-2.5">
        {/* Box de valeur VP :
            Desktop : En haut à gauche "VP", en haut à droite conversion (km/h), unité "kt" à droite de la box
            Mobile : "VP" à gauche de la box, puis unité "kt", puis conversion (km/h) */}
        <div className="flex flex-row sm:flex-col items-center sm:items-stretch gap-1.5 sm:gap-0.5 shrink-0">
          <div className="hidden sm:flex items-center justify-between w-full pr-0.5">
            <span className="text-[9px] font-semibold text-neutral-400 uppercase tracking-wider">
              VP
            </span>
            <span className="text-[9px] font-semibold text-neutral-400 font-mono">
              {vpKmh !== null ? `${vpKmh} km/h` : 'km/h'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="sm:hidden text-[10px] font-semibold text-neutral-400 uppercase tracking-wider shrink-0">
              VP
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={vp}
              onChange={(e) => setVp(e.target.value)}
              placeholder="80"
              className="w-16 sm:w-20 px-1.5 sm:px-2 py-1 bg-neutral-900 border border-neutral-700 rounded-lg text-base sm:text-sm font-mono font-bold text-white text-center focus:ring-1 focus:ring-amber-500 focus:outline-none"
              title="Vitesse propre (30 à 250 kt)"
            />
            <span className="text-xs font-bold text-neutral-300 shrink-0">
              kt
            </span>
            {vpKmh !== null && (
              <span className="sm:hidden text-[10px] font-semibold text-neutral-400 font-mono shrink-0">
                {vpKmh} km/h
              </span>
            )}
          </div>
        </div>

        {/* Slider Vp à droite, centré verticalement */}
        <div className="flex-1 flex flex-col justify-center px-1">
          <div className="flex items-center justify-between text-xs mb-0.5">
            <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
              Vitesse propre
            </span>
            <div className="flex items-center gap-1.5">
              {isVpOutOfRange && (
                <span className="text-[9.5px] text-amber-400 font-medium italic">
                  hors plage (60–150 kt)
                </span>
              )}
              <span className="font-mono text-white text-xs font-bold">
                {parsedVp && parsedVp > 0 ? `${parsedVp} kt` : '80 kt'}
              </span>
            </div>
          </div>
          <input
            type="range"
            min="60"
            max="150"
            step="5"
            value={sliderVp}
            onChange={(e) => setVp(e.target.value)}
            style={{
              background: `linear-gradient(to right, #f59e0b ${vpPercent}%, #374151 ${vpPercent}%)`,
            }}
            className="w-full accent-amber-500 h-2 rounded-lg cursor-pointer appearance-none border border-neutral-700/60"
            title="Curseur Vp (60 à 150 kt, pas de 5)"
          />
        </div>
      </div>

      {/* 2. AU-DESSUS DE LA ROSE : Box RM & Dist à gauche, slider Distance branche à droite */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 bg-neutral-800/40 p-2.5 rounded-xl border border-neutral-800 mb-1">
        {/* Box RM et Box Dist :
            Desktop : En haut à gauche nom, en haut à droite conversion (uniquement Dist en km), unités à droite de la box
            Mobile : Nom à gauche de la box, puis unité, puis conversion (Dist en km) */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-2.5 shrink-0">
          {/* Box RM */}
          <div className="flex flex-row sm:flex-col items-center sm:items-stretch gap-1.5 sm:gap-0.5 shrink-0">
            <div className="hidden sm:flex items-center justify-between w-full pr-0.5">
              <span className="text-[9px] font-semibold text-neutral-400 uppercase tracking-wider">
                RM
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="sm:hidden text-[10px] font-semibold text-neutral-400 uppercase tracking-wider shrink-0">
                RM
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={rm}
                onChange={(e) => setRm(e.target.value)}
                placeholder="315"
                className="w-16 sm:w-20 px-1.5 sm:px-2 py-1 bg-neutral-900 border border-neutral-700 rounded-lg text-base sm:text-sm font-mono font-bold text-white text-center focus:ring-1 focus:ring-amber-500 focus:outline-none"
              />
              <span className="text-xs font-bold text-neutral-300 shrink-0">
                (°)
              </span>
            </div>
          </div>

          {/* Box Dist */}
          <div className="flex flex-row sm:flex-col items-center sm:items-stretch gap-1.5 sm:gap-0.5 shrink-0">
            <div className="hidden sm:flex items-center justify-between w-full pr-0.5">
              <span className="text-[9px] font-semibold text-neutral-400 uppercase tracking-wider">
                DIST
              </span>
              <span className="text-[9px] font-semibold text-neutral-400 font-mono">
                {distKm !== null ? `${distKm} km` : 'km'}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="sm:hidden text-[10px] font-semibold text-neutral-400 uppercase tracking-wider shrink-0">
                DIST
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={distNm}
                onChange={(e) => setDistNm(e.target.value)}
                placeholder="10"
                className="w-16 sm:w-20 px-1.5 sm:px-2 py-1 bg-neutral-900 border border-neutral-700 rounded-lg text-base sm:text-sm font-mono font-bold text-white text-center focus:ring-1 focus:ring-amber-500 focus:outline-none"
              />
              <span className="text-xs font-bold text-neutral-300 shrink-0">
                NM
              </span>
              {distKm !== null && (
                <span className="sm:hidden text-[10px] font-semibold text-neutral-400 font-mono shrink-0">
                  {distKm} km
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Slider Distance branche à droite */}
        <div className="flex-1 flex flex-col justify-center px-1">
          <div className="flex items-center justify-between text-xs mb-0.5">
            <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
              Distance branche
            </span>
            <div className="flex items-center gap-1.5">
              {isDistOutOfRange && (
                <span className="text-[9.5px] text-amber-400 font-medium italic">
                  hors plage (0–50 NM)
                </span>
              )}
              <span className="font-mono text-[#FFB900] text-xs font-bold">
                {parsedDist && parsedDist > 0 ? `${parsedDist} NM` : '0 NM'}
              </span>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="50"
            step="1"
            value={sliderDist}
            onChange={(e) => setDistNm(e.target.value)}
            style={{
              background: `linear-gradient(to right, #f59e0b ${distPercent}%, #374151 ${distPercent}%)`,
            }}
            className="w-full accent-amber-500 h-2 rounded-lg cursor-pointer appearance-none border border-neutral-700/60"
            title="Curseur Distance branche (0 à 50 NM)"
          />
        </div>
      </div>

      {/* 3. SCHÉMA CIRCULAIRE : Rose des vents interactive */}
      <div
        className="relative my-0.5 flex items-center justify-center select-none touch-pan-y"
        style={{ touchAction: 'pan-y' }}
      >
        <svg
          ref={svgRef}
          viewBox="0 0 300 300"
          className="w-full max-w-[280px] sm:max-w-[300px] aspect-square overflow-visible"
          style={{ touchAction: 'pan-y' }}
        >
          {/* ÉLÉMENTS GRAPHIQUES NON-INTERACTIFS : les clics/touchers passent au travers (pointer-events: none)
              pour permettre un défilement / scroll vertical fluide sur mobile sur toutes les zones sombres */}
          <g pointerEvents="none">
            {/* Cercle plein des caps d'avant avec fond sombre et contour */}
            <circle
              cx={cx}
              cy={cy}
              r={R}
              fill="#171717"
              stroke="#404040"
              strokeWidth="1.5"
            />

            {/* Graduations tous les 30° avec cardinaux plus marqués */}
            {Array.from({ length: 12 }).map((_, i) => {
              const deg = i * 30;
              const isMajor = deg % 90 === 0;
              const len = isMajor ? 8 : 5;
              return (
                <line
                  key={deg}
                  x1={cx}
                  y1={cy - R}
                  x2={cx}
                  y2={cy - R + len}
                  stroke={isMajor ? '#a3a3a3' : '#525252'}
                  strokeWidth={isMajor ? 1.5 : 1}
                  transform={`rotate(${deg} ${cx} ${cy})`}
                />
              );
            })}

            {/* Repères cardinaux 0, 90, 180, 270 */}
            <text
              x={cx}
              y={cy - R - 10}
              fill="#e5e5e5"
              fontSize="12"
              fontWeight="bold"
              fontFamily="monospace"
              textAnchor="middle"
            >
              0
            </text>
            <text
              x={cx + R + 14}
              y={cy + 4.5}
              fill="#e5e5e5"
              fontSize="12"
              fontWeight="bold"
              fontFamily="monospace"
              textAnchor="middle"
            >
              90
            </text>
            <text
              x={cx}
              y={cy + R + 18}
              fill="#e5e5e5"
              fontSize="12"
              fontWeight="bold"
              fontFamily="monospace"
              textAnchor="middle"
            >
              180
            </text>
            <text
              x={cx - R - 15}
              y={cy + 4.5}
              fill="#e5e5e5"
              fontSize="12"
              fontWeight="bold"
              fontFamily="monospace"
              textAnchor="middle"
            >
              270
            </text>

            {/* AXE DU VENT : pointillé puis barbule (valeurs inversées) puis pointillé jusqu'au bouton V */}
            <g transform={`rotate(${currentWindDir} ${cx} ${cy})`}>
              {isCalmWind ? (
                // Vent calme : petit cercle au centre + pointillés jusqu'au bouton
                <>
                  <circle cx={cx} cy={cy} r={7} fill="none" stroke="#38bdf8" strokeWidth="2" />
                  <line
                    x1={cx}
                    y1={cy - 7}
                    x2={cx}
                    y2={cy - R_windButton + 12}
                    stroke="#38bdf8"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                </>
              ) : (
                // Vent actif : pointillés depuis le centre -> barbule sur l'axe -> 3 pointillés jusqu'au bouton V éloigné
                <>
                  {/* 1. Pointillés du centre jusqu'à la barbule */}
                  <line
                    x1={cx}
                    y1={cy}
                    x2={cx}
                    y2={barbShaftInnerY}
                    stroke="#38bdf8"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                  {/* 2. Hampe continue de la barbule */}
                  <line
                    x1={cx}
                    y1={barbShaftInnerY}
                    x2={cx}
                    y2={barbShaftOuterY}
                    stroke="#38bdf8"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  {/* Barbes météo orientées vers l'extérieur */}
                  {barbElements}
                  {/* 3. Exactement 3 pointillés nets reliant l'extrémité extérieure de la barbule à la bulle de vent */}
                  <line x1={cx} y1={cy - 107} x2={cx} y2={cy - 110} stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" opacity="0.9" />
                  <line x1={cx} y1={cy - 113} x2={cx} y2={cy - 116} stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" opacity="0.9" />
                  <line x1={cx} y1={cy - 119} x2={cx} y2={cy - 122} stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" opacity="0.9" />
                </>
              )}
            </g>

            {/* AXE DE LA ROUTE MAGNÉTIQUE (RM) : Ligne en pointillés reliant l'avion au marqueur RM */}
            <line
              x1={cx}
              y1={cy}
              x2={rmBtnX}
              y2={rmBtnY}
              stroke="#f59e0b"
              strokeWidth="1.5"
              strokeDasharray="3 3"
              opacity="0.85"
            />

            {/* SILHOUETTE D'AVION DE TOURISME À HÉLICE AU CENTRE (Gris #94A3B9) */}
            <g transform={`translate(${cx}, ${cy}) rotate(${currentRm})`}>
              {/* Hélice à l'avant (pales transversales) */}
              <ellipse cx="0" cy="-24" rx="14" ry="1.2" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.6" />
              {/* Casserole d'hélice / nez */}
              <path d="M -2,-21 C -2,-25 0,-26 0,-26 C 0,-26 2,-25 2,-21 Z" fill="#94A3B9" stroke="#64748b" strokeWidth="0.8" />

              {/* Ailes basses de tourisme (#94A3B9) */}
              <path
                d="M -30,1 C -30,-0.5 -29,-2 -27,-2 L -4,-4 L 4,-4 L 27,-2 C 29,-2 30,-0.5 30,1 L 29,4 C 29,5 27,5.5 25,5 L 4,4 L -4,4 L -25,5 C -27,5.5 -29,5 -29,4 Z"
                fill="#94A3B9"
                stroke="#64748b"
                strokeWidth="1"
              />
              {/* Lignes volets/ailerons */}
              <line x1="-26" y1="3.5" x2="-8" y2="3.5" stroke="#475569" strokeWidth="0.8" />
              <line x1="8" y1="3.5" x2="26" y2="3.5" stroke="#475569" strokeWidth="0.8" />

              {/* Empennage arrière horizontal (#94A3B9) */}
              <path
                d="M -12,18 C -12,17 -11,16 -9,16 L -1.5,16.5 L 1.5,16.5 L 9,16 C 11,16 12,17 12,18 L 11.5,20.5 C 11.5,21 10,21.5 8.5,21.5 L 1.5,21 L -1.5,21 L -8.5,21.5 C -10,21.5 -11.5,21 -11.5,20.5 Z"
                fill="#94A3B9"
                stroke="#64748b"
                strokeWidth="1"
              />

              {/* Fuselage profilé (#94A3B9) */}
              <path
                d="M 0,-22 C 3.5,-20 4.2,-14 4.5,-5 C 4.5,2 4.2,10 3,17 C 2.2,21.5 1.5,23.5 0,24.5 C -1.5,23.5 -2.2,21.5 -3,17 C -4.2,10 -4.5,2 -4.5,-5 C -4.2,-14 -3.5,-20 0,-22 Z"
                fill="#94A3B9"
                stroke="#64748b"
                strokeWidth="1.2"
              />

              {/* Dérive centrale arrière */}
              <path d="M -0.8,15 L 0.8,15 L 0.8,24 L -0.8,24 Z" fill="#64748b" />

              {/* Cockpit / Verrière avec montants */}
              <path
                d="M 0,-15 C 2.5,-15 3.2,-12 3.2,-6 C 3.2,0 2.8,4 1.8,7 C 1.2,8.5 0.5,9.5 0,9.5 C -0.5,9.5 -1.2,8.5 -1.8,7 C -2.8,4 -3.2,0 -3.2,-6 C -3.2,-12 -2.5,-15 0,-15 Z"
                fill="#f8fafc"
                stroke="#64748b"
                strokeWidth="0.8"
              />
              {/* Reflet verrière */}
              <path
                d="M 0,-13.5 C 1.6,-13.5 2.2,-11 2.2,-6 C 2.2,-1 1.8,2 1.2,4.5 C 0.8,5.5 0.3,6.2 0,6.2 Z"
                fill="#ffffff"
                opacity="0.9"
              />
              {/* Montant cockpit */}
              <line x1="-3" y1="-4" x2="3" y2="-4" stroke="#64748b" strokeWidth="1" />
            </g>
          </g>

          {/* MARQUEUR BULLE RM AVION (Bulle orange visible partout, touchAction: none pour tourner l'avion sans scroller) */}
          <g
            tabIndex={0}
            role="slider"
            aria-label="Route magnétique souhaitée"
            aria-valuenow={Math.round(currentRm)}
            aria-valuemin={0}
            aria-valuemax={359}
            aria-valuetext={`${Math.round(currentRm)} degrés`}
            onPointerDown={(e) => handlePointerDown('rm', e)}
            onPointerMove={(e) => handlePointerMove('rm', e)}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={handleKeyDownRm}
            className="cursor-grab active:cursor-grabbing outline-none"
            style={{ touchAction: 'none' }}
            pointerEvents="auto"
          >
            {/* Zone de capture transparente élargie (48px de diamètre) */}
            <circle cx={rmBtnX} cy={rmBtnY} r={24} fill="transparent" pointerEvents="auto" />

            {/* Ombre portée SVG native (rendu garanti sur mobile sans filtre SVG) */}
            <circle
              cx={rmBtnX}
              cy={rmBtnY + 1.5}
              r={13}
              fill="#000000"
              opacity="0.45"
            />

            {/* Bulle circulaire orange RM bien visible */}
            <circle
              cx={rmBtnX}
              cy={rmBtnY}
              r={13}
              fill="#d97706"
              stroke="#fbbf24"
              strokeWidth="2"
            />

            {/* Texte RM centré dans la bulle sur une ligne */}
            <text
              x={rmBtnX}
              y={rmBtnY + 3.5}
              fill="#ffffff"
              fontSize="9"
              fontWeight="800"
              fontFamily="sans-serif"
              textAnchor="middle"
              pointerEvents="none"
              letterSpacing="0.5"
            >
              RM
            </text>
          </g>

          {/* MARQUEUR BOUTON V POUR ORIENTER LE VENT (Bulle bleue visible partout, touchAction: none pour tourner le vent sans scroller) */}
          <g
            tabIndex={0}
            role="slider"
            aria-label="Direction d'où vient le vent"
            aria-valuenow={Math.round(currentWindDir)}
            aria-valuemin={0}
            aria-valuemax={359}
            aria-valuetext={`${Math.round(currentWindDir)} degrés`}
            onPointerDown={(e) => handlePointerDown('wind', e)}
            onPointerMove={(e) => handlePointerMove('wind', e)}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={handleKeyDownWind}
            className="cursor-grab active:cursor-grabbing outline-none"
            style={{ touchAction: 'none' }}
            pointerEvents="auto"
          >
            {/* Zone de capture transparente élargie (48px de diamètre) */}
            <circle cx={windBtnX} cy={windBtnY} r={24} fill="transparent" pointerEvents="auto" />

            {/* Ombre portée SVG native */}
            <circle
              cx={windBtnX}
              cy={windBtnY + 1.5}
              r={12.5}
              fill="#000000"
              opacity="0.45"
            />

            {/* Bulle circulaire bleue d'orientation du vent bien visible */}
            <circle
              cx={windBtnX}
              cy={windBtnY}
              r={12.5}
              fill="#0284c7"
              stroke="#38bdf8"
              strokeWidth="2"
            />

            {/* Lettre V au centre du cercle */}
            <text
              x={windBtnX}
              y={windBtnY + 3.5}
              fill="#ffffff"
              fontSize="10"
              fontWeight="extrabold"
              fontFamily="sans-serif"
              textAnchor="middle"
              pointerEvents="none"
            >
              V
            </text>
          </g>
        </svg>
      </div>

      {/* 4. EN-DESSOUS DE LA ROSE : Box Vent du & Vit. vent à gauche, slider Vitesse vent à droite */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 bg-neutral-800/40 p-2.5 rounded-xl border border-neutral-800 mb-3">
        {/* Box Vent du et Box Vit. vent :
            Desktop : En haut à gauche nom, pas de conversion, unités à droite de la box
            Mobile : Nom à gauche de la box, puis unité, pas de conversion */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-2.5 shrink-0">
          {/* Box Vent du */}
          <div className="flex flex-row sm:flex-col items-center sm:items-stretch gap-1.5 sm:gap-0.5 shrink-0">
            <div className="hidden sm:flex items-center justify-between w-full pr-0.5">
              <span className="text-[9px] font-semibold text-neutral-400 uppercase tracking-wider">
                VENT DU
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="sm:hidden text-[10px] font-semibold text-neutral-400 uppercase tracking-wider shrink-0">
                VENT DU
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={windDir}
                onChange={(e) => setWindDir(e.target.value)}
                placeholder="0"
                className="w-16 sm:w-20 px-1.5 sm:px-2 py-1 bg-neutral-900 border border-neutral-700 rounded-lg text-base sm:text-sm font-mono font-bold text-white text-center focus:ring-1 focus:ring-cyan-500 focus:outline-none"
              />
              <span className="text-xs font-bold text-neutral-300 shrink-0">
                (°)
              </span>
            </div>
          </div>

          {/* Box Vit. vent */}
          <div className="flex flex-row sm:flex-col items-center sm:items-stretch gap-1.5 sm:gap-0.5 shrink-0">
            <div className="hidden sm:flex items-center justify-between w-full pr-0.5">
              <span className="text-[9px] font-semibold text-neutral-400 uppercase tracking-wider">
                VIT. VENT
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="sm:hidden text-[10px] font-semibold text-neutral-400 uppercase tracking-wider shrink-0">
                VIT. VENT
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={windSpeed}
                onChange={(e) => setWindSpeed(e.target.value)}
                placeholder="0"
                className="w-16 sm:w-20 px-1.5 sm:px-2 py-1 bg-neutral-900 border border-neutral-700 rounded-lg text-base sm:text-sm font-mono font-bold text-white text-center focus:ring-1 focus:ring-cyan-500 focus:outline-none"
              />
              <span className="text-xs font-bold text-neutral-300 shrink-0">
                kt
              </span>
            </div>
          </div>
        </div>

        {/* Slider Vitesse vent à droite */}
        <div className="flex-1 flex flex-col justify-center px-1">
          <div className="flex items-center justify-between text-xs mb-0.5">
            <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
              Vitesse du vent
            </span>
            <div className="flex items-center gap-1.5">
              {isWsOutOfRange && (
                <span className="text-[9.5px] text-amber-400 font-medium italic">
                  hors plage (0–55 kt)
                </span>
              )}
              <span className="font-mono text-[#3ABDF9] text-xs font-bold">
                {parsedWindSpeed && parsedWindSpeed > 0 ? `${parsedWindSpeed} kt` : '0 kt'}
              </span>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="55"
            step="1"
            value={sliderWindSpeed}
            onChange={(e) => setWindSpeed(e.target.value)}
            style={{
              background: `linear-gradient(to right, #3ABDF9 ${windPercent}%, #374151 ${windPercent}%)`,
              accentColor: '#3ABDF9',
            }}
            className="w-full accent-[#3ABDF9] h-2.5 sm:h-2 rounded-lg cursor-pointer appearance-none border border-neutral-700/60"
            title="Curseur Vitesse du vent (0 à 55 kt)"
          />
        </div>
      </div>

      {/* Espace de sécurité en bas pour que le slider de vent soit toujours 100% accessible au doigt sur mobile */}
      <div className="h-8 sm:h-2" />
    </div>

    {/* POPUP MODALE : Détail des calculs et formules mathématiques / aéronautiques */}
      {showInfo && (
        <div
          className="fixed inset-0 z-[100] bg-black/75 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setShowInfo(false)}
        >
          <div
            className="bg-neutral-900 border border-neutral-700 rounded-2xl p-5 max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl text-xs text-neutral-300 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-white text-sm">Détail des calculs</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowInfo(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                title="Fermer la fenêtre d'information"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <p className="font-semibold text-neutral-200">Variables</p>
              <ul className="list-disc list-inside space-y-0.5 mt-1 font-mono text-[11px] text-neutral-400">
                <li>Vp — vitesse propre (kt)</li>
                <li>RM — route magnétique (°)</li>
                <li>D — distance du tronçon (NM)</li>
                <li>Dv — direction d'où vient le vent (°, vraie)</li>
                <li>Vw — vitesse du vent (kt)</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-neutral-200">Décomposition du vent</p>
              <pre className="bg-neutral-800 border border-neutral-700 rounded p-2 mt-1 font-mono text-[11px] text-amber-200 whitespace-pre-wrap">
                {'θ  = Dv − RM              (angle vent / route)\nXw = Vw × sin(θ)         (composante traversière)\nHw = Vw × cos(θ)         (composante de face, > 0 = face)'}
              </pre>
            </div>

            <div>
              <p className="font-semibold text-neutral-200">Dérive et cap</p>
              <pre className="bg-neutral-800 border border-neutral-700 rounded p-2 mt-1 font-mono text-[11px] text-amber-200 whitespace-pre-wrap">
                {'δ   = arcsin(Xw / Vp)     (angle de dérive)\nCap = RM + δ'}
              </pre>
              <p className="mt-1 text-[11px] text-neutral-400">
                Le nez est décalé de δ vers le vent pour que la trajectoire au sol suive la route
                voulue. Si Xw dépasse Vp en valeur absolue, aucun cap ne permet de tenir la route.
              </p>
            </div>

            <div>
              <p className="font-semibold text-neutral-200">Vitesse sol et temps</p>
              <pre className="bg-neutral-800 border border-neutral-700 rounded p-2 mt-1 font-mono text-[11px] text-amber-200 whitespace-pre-wrap">
                {'Vs          = Vp × cos(δ) − Hw\nT sans vent = D / Vp × 60   (minutes)\nT avec vent = D / Vs × 60   (minutes)'}
              </pre>
            </div>

            <div className="px-2.5 py-2 bg-neutral-800 border border-neutral-700 rounded text-[11px] text-neutral-300">
              <strong className="text-white">Référentiels.</strong> Le vent des METAR, TAF et Windy
              est en direction vraie ; celui de la tour ou de l'ATIS est en magnétique. La route
              saisie ici est magnétique. En France la déclinaison est faible (1 à 2°), l'écart reste
              négligeable — mais par vent fort, vérifiez la source de votre donnée.
            </div>

            <div className="px-2.5 py-2 bg-neutral-800 border border-neutral-700 rounded text-[11px] text-neutral-300">
              Vent supposé constant sur tout le tronçon, altitude ignorée. Aide au calcul, pas
              préparation de vol : le commandant de bord reste responsable de ses valeurs.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
