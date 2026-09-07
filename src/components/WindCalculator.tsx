import React, { useState, useEffect, useMemo } from 'react';
import { X, Info, RotateCcw } from 'lucide-react';

interface WindCalculatorProps {
  isOpen: boolean;
  onClose: () => void;
  aircraftModel: string;
  cruiseSpeedKt: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;
const norm360 = (deg: number) => ((deg % 360) + 360) % 360;
const KM_PER_NM = 1.852;
const STORE_KEY = 'windcalc:v2';

export const WindCalculator: React.FC<WindCalculatorProps> = ({
  isOpen,
  onClose,
  aircraftModel,
  cruiseSpeedKt,
}) => {
  const [rm, setRm] = useState('');
  const [distNm, setDistNm] = useState('');
  const [windDir, setWindDir] = useState('');
  const [windSpeed, setWindSpeed] = useState('');
  const [showInfo, setShowInfo] = useState(false);

  // Les valeurs survivent à la fermeture du panneau et au rechargement.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      setRm(s.rm || '');
      setDistNm(s.distNm || '');
      setWindDir(s.windDir || '');
      setWindSpeed(s.windSpeed || '');
    } catch {
      // stockage indisponible : on démarre à vide
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ rm, distNm, windDir, windSpeed })
      );
    } catch {
      // quota plein : sans conséquence
    }
  }, [rm, distNm, windDir, windSpeed]);

  const reset = () => {
    setRm('');
    setDistNm('');
    setWindDir('');
    setWindSpeed('');
  };

  const res = useMemo(() => {
    const vp = Number(cruiseSpeedKt);
    const r = parseFloat(rm.replace(',', '.'));
    const d = parseFloat(distNm.replace(',', '.'));
    const wd = parseFloat(windDir.replace(',', '.'));
    const ws = parseFloat(windSpeed.replace(',', '.'));

    if (!vp || vp <= 0) {
      return { error: 'Vitesse propre absente : renseignez-la dans le paramétrage du log.' };
    }

    const hasRoute = Number.isFinite(r);
    const hasDist = Number.isFinite(d) && d > 0;
    const hasWind = Number.isFinite(wd) && Number.isFinite(ws);
    const distKm = hasDist ? d * KM_PER_NM : null;

    const tSansVent = hasDist ? (d / vp) * 60 : null;
    if (!hasRoute || !hasWind) return { tSansVent, distKm };

    const theta = toRad(norm360(wd - r));
    const crossWind = ws * Math.sin(theta);
    const headWind = ws * Math.cos(theta);

    if (Math.abs(crossWind) > vp) {
      return { tSansVent, distKm, error: 'Vent traversier supérieur à la vitesse propre : route intenable.' };
    }

    const driftRad = Math.asin(crossWind / vp);
    const cap = norm360(r + toDeg(driftRad));
    const vs = vp * Math.cos(driftRad) - headWind;

    if (vs <= 0) {
      return { tSansVent, distKm, cap, vs, error: 'Vitesse sol nulle ou négative : aucune progression.' };
    }

    return { tSansVent, tAvecVent: hasDist ? (d / vs) * 60 : null, distKm, cap, vs };
  }, [cruiseSpeedKt, rm, distNm, windDir, windSpeed]);

  if (!isOpen) return null;
  const fmt = (n: number | null | undefined, unit: string, dec = 0) =>
    n === null || n === undefined || !Number.isFinite(n)
      ? '—'
      : n.toFixed(dec) + ' ' + unit;

  const champ = (
    label: string,
    hint: string,
    val: string,
    set: (v: string) => void
  ) => (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
        {label}
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={val}
        onChange={(e) => set(e.target.value)}
        placeholder="—"
        className="w-full px-2.5 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm font-mono text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
      />
      {hint ? (
        <span className="text-[10px] text-neutral-500 italic leading-tight">{hint}</span>
      ) : null}
    </label>
  );

  const sortie = (label: string, value: string, fort = false) => (
    <div
      className={
        'flex flex-col gap-0.5 px-3 py-2 rounded-lg border ' +
        (fort ? 'bg-amber-500/10 border-amber-500/40' : 'bg-neutral-800 border-neutral-700')
      }
    >
      <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
        {label}
      </span>
      <span
        className={
          'font-mono ' +
          (fort ? 'text-lg font-bold text-amber-400' : 'text-base text-white')
        }
      >
        {value}
      </span>
    </div>
  );

  return (
        <div className="no-print absolute left-1/2 -translate-x-1/2 top-full mt-1.5 w-[min(92vw,32rem)] bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl z-50 p-4 text-left">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-xs text-neutral-200">
          <strong className="text-white">{aircraftModel || '—'}</strong>
          <span className="text-neutral-400"> — Vp </span>
          <strong className="font-mono text-white">{cruiseSpeedKt || '—'} kt</strong>
        </div>
        <button
          type="button"
          id="wind-calc-reset-btn"
          onClick={reset}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-neutral-800 border border-neutral-600 text-white hover:bg-neutral-700 hover:border-neutral-400 transition-colors"
          title="Réinitialiser les champs"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          id="wind-calc-close-btn"
          onClick={onClose}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-neutral-800 border border-neutral-600 text-white hover:bg-neutral-700 hover:border-neutral-400 transition-colors"
          title="Fermer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {champ('RM (°)', '', rm, setRm)}
        {champ(
          'Dist (NM)',
          res.distKm ? 'soit ' + res.distKm.toFixed(0) + ' km' : '',
          distNm,
          setDistNm
        )}
        {champ('Vent du', '', windDir, setWindDir)}
        {champ('Vit. vent (kt)', '', windSpeed, setWindSpeed)}
      </div>

      {res.error && (
        <div className="mb-3 px-3 py-2 bg-amber-500/10 border border-amber-500/40 rounded-lg text-xs text-amber-300">
          {res.error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        {sortie('T sans vent', fmt(res.tSansVent, 'min'))}
        {sortie('T avec vent', fmt(res.tAvecVent, 'min'), true)}
        {sortie('Cap à tenir', res.cap === undefined ? '—' : Math.round(res.cap) + '°', true)}
        {sortie('Vitesse sol', fmt(res.vs, 'kt'))}
      </div>
      <div className="flex items-start gap-2">
                        <div className="text-[11px] leading-snug">
          <p className="text-gray-250">
            Aucune valeur n'est reportée automatiquement dans le log.
          </p>
          <p className="text-red-400">
            Vous êtes responsable de les inscrire en les ayant vérifiées.
          </p>
        </div>
        <button
          type="button"
          id="wind-calc-info-btn"
          onClick={() => setShowInfo((v) => !v)}
          className={
            'shrink-0 w-7 h-7 flex items-center justify-center rounded-full border transition-colors ' +
            (showInfo
              ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
              : 'bg-neutral-800 border-neutral-600 text-white hover:bg-neutral-700')
          }
          title="Détail des calculs et formules"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </div>
            {showInfo && (
        <div className="border-t border-neutral-700 pt-3 mt-3 text-xs text-neutral-300 space-y-3">
          <p className="font-bold text-white text-sm">Détail des calculs</p>

          <div>
            <p className="font-semibold text-neutral-200">Variables</p>
            <ul className="list-disc list-inside space-y-0.5 mt-1 font-mono text-[11px] text-neutral-400">
              <li>Vp — vitesse propre (kt), reprise du log</li>
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

          <div className="px-2.5 py-2 bg-neutral-800 border border-neutral-600 rounded text-[11px] text-neutral-300">
            <strong className="text-white">Référentiels.</strong> Le vent des METAR, TAF et Windy
            est en direction vraie ; celui de la tour ou de l'ATIS est en magnétique. La route
            saisie ici est magnétique. En France la déclinaison est faible (1 à 2°), l'écart reste
            négligeable — mais par vent fort, vérifiez la source de votre donnée.
          </div>

          <div className="px-2.5 py-2 bg-neutral-800 border border-neutral-600 rounded text-[11px] text-neutral-300">
            Vent supposé constant sur tout le tronçon, altitude ignorée. Aide au calcul, pas
            préparation de vol : le commandant de bord reste responsable de ses valeurs.
          </div>
        </div>
      )}
    </div>
  );
};