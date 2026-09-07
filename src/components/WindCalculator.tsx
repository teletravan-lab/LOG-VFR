import React, { useState, useMemo } from 'react';
import { Calculator, X, Info } from 'lucide-react';

interface WindCalculatorProps {
  isOpen: boolean;
  onClose: () => void;
  aircraftModel: string;
  cruiseSpeedKt: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;
const norm360 = (deg: number) => ((deg % 360) + 360) % 360;

export const WindCalculator: React.FC<WindCalculatorProps> = ({
  isOpen,
  onClose,
  aircraftModel,
  cruiseSpeedKt,
}) => {
  const [rm, setRm] = useState('');
  const [dist, setDist] = useState('');
  const [windDir, setWindDir] = useState('');
  const [windSpeed, setWindSpeed] = useState('');
  const [showInfo, setShowInfo] = useState(false);

  const res = useMemo(() => {
    const vp = Number(cruiseSpeedKt);
    const r = parseFloat(rm.replace(',', '.'));
    const d = parseFloat(dist.replace(',', '.'));
    const wd = parseFloat(windDir.replace(',', '.'));
    const ws = parseFloat(windSpeed.replace(',', '.'));

    if (!vp || vp <= 0) {
      return { error: "Vitesse propre absente : renseignez-la dans le paramétrage du log." };
    }

    const hasRoute = Number.isFinite(r);
    const hasDist = Number.isFinite(d) && d > 0;
    const hasWind = Number.isFinite(wd) && Number.isFinite(ws);

    const tSansVent = hasDist ? (d / vp) * 60 : null;
    if (!hasRoute || !hasWind) return { tSansVent };

    // theta : écart entre la direction D'OÙ vient le vent et la route
    const theta = toRad(norm360(wd - r));
    const crossWind = ws * Math.sin(theta); // composante traversière
    const headWind = ws * Math.cos(theta);  // > 0 = vent de face

    if (Math.abs(crossWind) > vp) {
      return {
        tSansVent,
        error: "Vent traversier supérieur à la vitesse propre : la route ne peut pas être tenue.",
      };
    }

    const driftRad = Math.asin(crossWind / vp);
    const drift = toDeg(driftRad);
    const cap = norm360(r + drift);
    const vs = vp * Math.cos(driftRad) - headWind;

    if (vs <= 0) {
      return {
        tSansVent,
        drift,
        cap,
        vs,
        error: "Vitesse sol nulle ou négative : le vent annule toute progression.",
      };
    }

    return {
      tSansVent,
      tAvecVent: hasDist ? (d / vs) * 60 : null,
      drift,
      cap,
      vs,
      crossWind,
      headWind,
    };
  }, [cruiseSpeedKt, rm, dist, windDir, windSpeed]);

  if (!isOpen) return null;

  const fmt = (n: number | null | undefined, unit: string, dec = 0) =>
       n === null || n === undefined || !Number.isFinite(n)
      ? '—'
      : n.toFixed(dec) + ' ' + unit;

  const champ = (
    label: string,
    hint: string,
    val: string,
    set: (v: string) => void,
    ph: string
  ) => (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={val}
        onChange={(e) => set(e.target.value)}
        placeholder={ph}
        className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
      />
      <span className="text-[10px] text-slate-400 italic leading-tight">{hint}</span>
    </label>
  );

  const sortie = (label: string, value: string, fort = false) => (
    <div
      className={
        'flex flex-col gap-0.5 px-3 py-2 rounded-lg border ' +
        (fort ? 'bg-sky-50 border-sky-200' : 'bg-slate-50 border-slate-200')
      }
    >
      <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
        {label}
      </span>
      <span
        className={
          'font-mono ' +
          (fort ? 'text-lg font-bold text-sky-900' : 'text-base text-slate-900')
        }
      >
        {value}
      </span>
    </div>
  );

  return (
    <div className="no-print fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full p-5 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b pb-2 mb-3">
          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
            <Calculator className="w-4 h-4 text-sky-600" />
            <span>Calculette vent et temps de tronçon</span>
          </h3>
          <div className="flex items-center gap-1">
            <button
              type="button"
              id="wind-calc-info-btn"
              onClick={() => setShowInfo((v) => !v)}
                            className={
                'p-1.5 rounded-lg transition-colors ' +
                (showInfo
                  ? 'bg-sky-100 text-sky-700'
                  : 'text-slate-400 hover:text-sky-600 hover:bg-slate-100')
              }
              title="Détail des calculs et formules"
            >
              <Info className="w-4 h-4" />
            </button>
            <button
              type="button"
              id="wind-calc-close-btn"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              title="Fermer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-3 py-2 mb-3 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-800">
          Avion <strong>{aircraftModel || '—'}</strong> — vitesse propre{' '}
          <strong className="font-mono">{cruiseSpeedKt || '—'} kt</strong>
          <span className="block text-[10px] text-slate-500 italic mt-0.5">
            Reprise du paramétrage du log. Modifiez-la là-bas si besoin.
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {champ('RM', 'Route magnétique, en degrés', rm, setRm, '292')}
          {champ('Dist', 'Distance du tronçon, en NM', dist, setDist, '14')}
          {champ('Dir. vent', 'Direction VRAIE (METAR, Windy)', windDir, setWindDir, '240')}
          {champ('Vit. vent', 'Vitesse du vent, en kt', windSpeed, setWindSpeed, '15')}
        </div>

        {res.error && (
          <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900">
            {res.error}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">

        {sortie('T sans vent', fmt(res.tSansVent, 'min'))}
          {sortie('T avec vent', fmt(res.tAvecVent, 'min'), true)}
                    {sortie('Cap à tenir', res.cap === undefined ? '—' : Math.round(res.cap) + '°', true)}
          {sortie('Vitesse sol', fmt(res.vs, 'kt'))}
        </div>

        <p className="text-[10px] text-slate-500 italic mb-3">
          Aucune valeur n'est reportée automatiquement dans le log : à vous de les recopier après vérification.
        </p>
        {showInfo && (
          <div className="border-t pt-3 mt-1 text-xs text-slate-700 space-y-3">
            <p className="font-bold text-slate-900 text-sm">Détail des calculs</p>

            <div>
              <p className="font-semibold text-slate-800">Variables</p>
              <ul className="list-disc list-inside space-y-0.5 mt-1 font-mono text-[11px]">
                <li>Vp — vitesse propre de l'avion (kt), reprise du log</li>
                <li>RM — route magnétique souhaitée (°)</li>
                <li>D — distance du tronçon (NM)</li>
                <li>Dv — direction d'où vient le vent (°, vraie)</li>
                <li>Vw — vitesse du vent (kt)</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-slate-800">Décomposition du vent</p>
                           <pre className="bg-slate-50 border border-slate-200 rounded p-2 mt-1 font-mono text-[11px] whitespace-pre-wrap">
                {'θ  = Dv − RM              (angle vent / route)\nXw = Vw × sin(θ)         (composante traversière)\nHw = Vw × cos(θ)         (composante de face, > 0 = face)'}
              </pre>
            </div>

            <div>
              <p className="font-semibold text-slate-800">Dérive et cap</p>
                            <pre className="bg-slate-50 border border-slate-200 rounded p-2 mt-1 font-mono text-[11px] whitespace-pre-wrap">
                {'δ   = arcsin(Xw / Vp)     (angle de dérive)\nCap = RM + δ'}
              </pre>
              <p className="mt-1 text-[11px]">
                Le nez de l'avion est décalé de δ vers le vent pour que la trajectoire au sol suive
                la route voulue. Si |Xw| dépasse Vp, aucun cap ne permet de tenir la route.
              </p>
            </div>

            <div>
              <p className="font-semibold text-slate-800">Vitesse sol et temps</p>
                            <pre className="bg-slate-50 border border-slate-200 rounded p-2 mt-1 font-mono text-[11px] whitespace-pre-wrap">
                {'Vs          = Vp × cos(δ) − Hw\nT sans vent = D / Vp × 60   (minutes)\nT avec vent = D / Vs × 60   (minutes)'}
              </pre>
            </div>

            <div className="px-2.5 py-2 bg-amber-50 border border-amber-300 rounded text-[11px] text-amber-900">
              <strong>Référentiels.</strong> Le vent des METAR, TAF et Windy est en direction
              <em> vraie</em> ; celui annoncé par la tour ou l'ATIS est en <em>magnétique</em>. La route
              saisie ici est magnétique. En France la déclinaison est faible (1 à 2°), l'écart reste
              négligeable — mais avec un vent fort, vérifiez la source de votre donnée.
            </div>

            <div className="px-2.5 py-2 bg-slate-100 border border-slate-300 rounded text-[11px]">
              Le vent est supposé constant sur tout le tronçon et l'altitude est ignorée. Ces
              résultats sont une aide au calcul, pas une préparation de vol : le commandant de bord
              reste responsable de ses valeurs.
            </div>
          </div>
        )}
              </div>
    </div>
  );
};

