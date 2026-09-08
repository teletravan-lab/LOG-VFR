import React from 'react';
import { Sunset } from 'lucide-react';
import { Waypoint, NavLeg } from '../types';
import { FRENCH_AERODROMES } from '../data/aerodromes';

export interface LogTableSegment {
  point?: Waypoint;
  isOriginDeparture: boolean;
  branchNumber?: number;
  fromName?: string;
  toName?: string;
  leg: NavLeg;
  legIndex: number;
}

interface LogTableA5Props {
  departure: Waypoint;
  destination: Waypoint;
  waypoints?: Waypoint[];
  legs?: NavLeg[];
  isPrintMode?: boolean;
  onUpdateLeg?: (index: number, field: keyof NavLeg, value: string) => void;
  onUpdateDepartureNotes?: (notes: string) => void;
  onUpdateDestinationTableNotes?: (notes: string) => void;
  // Specific segments when paginating
  segments?: LogTableSegment[];
  showDestination?: boolean;
  reprisePointNotice?: string;
}

export const LogTableA5: React.FC<LogTableA5Props> = ({
  departure,
  destination,
  waypoints = [],
  legs = [],
  isPrintMode = false,
  onUpdateLeg,
  onUpdateDepartureNotes,
  onUpdateDestinationTableNotes,
  segments,
  showDestination = true,
  reprisePointNotice,
}) => {
  // Resolve Destination VAC information
  const destAero = React.useMemo(() => {
    if (!destination.name && !destination.oaci) return null;
    const destOaci = destination.oaci?.toUpperCase();
    if (destOaci) {
      const match = FRENCH_AERODROMES.find((a) => a.oaci.toUpperCase() === destOaci);
      if (match) return match;
    }
    const nameLower = (destination.name || '').toLowerCase();
    return (
      FRENCH_AERODROMES.find(
        (a) =>
          (a.oaci && nameLower.includes(a.oaci.toLowerCase())) ||
          (a.name && nameLower.includes(a.name.toLowerCase()))
      ) || null
    );
  }, [destination.name, destination.oaci]);

  const depAero = React.useMemo(() => {
    if (!departure.name && !departure.oaci) return null;
    const depOaci = departure.oaci?.toUpperCase();
    if (depOaci) {
      const match = FRENCH_AERODROMES.find((a) => a.oaci.toUpperCase() === depOaci);
      if (match) return match;
    }
    const nameLower = (departure.name || '').toLowerCase();
    return (
      FRENCH_AERODROMES.find(
        (a) =>
          (a.oaci && nameLower.includes(a.oaci.toLowerCase())) ||
          (a.name && nameLower.includes(a.name.toLowerCase()))
      ) || null
    );
  }, [departure.name, departure.oaci]);


const destFreqs = {
    atis: destination.frequencies?.atis || destAero?.frequencies?.atis || '',
    twr: destination.frequencies?.twr || destAero?.frequencies?.twr || '',
    gnd: destination.frequencies?.gnd || destAero?.frequencies?.gnd || '',
    afis: destination.frequencies?.afis || destAero?.frequencies?.afis || '',
    aa: destination.frequencies?.aa || destAero?.frequencies?.aa || '',
    afis_aa:
      destination.frequencies?.afis_aa ||
      destination.frequencies?.afis ||
      destination.frequencies?.aa ||
      destAero?.frequencies?.afis_aa ||
      destAero?.frequencies?.afis ||
      destAero?.frequencies?.aa ||
      '',
    app: destination.frequencies?.app || destAero?.frequencies?.app || '',
    siv: destination.frequencies?.siv || destAero?.frequencies?.siv || '',
  };
  const depFreqs = {
    atis: departure.frequencies?.atis || depAero?.frequencies?.atis || '',
    twr: departure.frequencies?.twr || depAero?.frequencies?.twr || '',
    gnd: departure.frequencies?.gnd || depAero?.frequencies?.gnd || '',
    afis: departure.frequencies?.afis || depAero?.frequencies?.afis || '',
    aa: departure.frequencies?.aa || depAero?.frequencies?.aa || '',
    afis_aa:
      departure.frequencies?.afis_aa ||
      departure.frequencies?.afis ||
      departure.frequencies?.aa ||
      depAero?.frequencies?.afis_aa ||
      depAero?.frequencies?.afis ||
      depAero?.frequencies?.aa ||
      '',
    app: departure.frequencies?.app || depAero?.frequencies?.app || '',
    siv: departure.frequencies?.siv || depAero?.frequencies?.siv || '',
  };

  const destElevation = destination.elevationFt ?? destAero?.elevationFt;
  const destRunways = destination.runways || destAero?.runways || '';
  const destTdp =
    destination.tdpQnhFt ||
    (destElevation !== undefined ? `${Math.round((destElevation + 1000) / 50) * 50}` : '');

  // Strip any auto-generated frequencies/runway lines from user manual notes
  const cleanTableNotes = React.useMemo(() => {
    const raw = destination.tableNotes ?? destination.notes ?? '';
    return raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => {
        if (!l) return false;
        if (/^(coucher\s*(de)?\s*soleil|cs\s*:)/i.test(l)) return false;
        if (/^(atis|twr|gnd|afis|a\/a|app|siv):/i.test(l)) return false;
        if (/^(alt|piste|pistes):/i.test(l)) return false;
        if (/^tdp\s+/i.test(l)) return false;
        if (/sortie sud mantes/i.test(l)) return false;
        if (/\bparis info\b/i.test(l)) return false;
        return true;
      })
      .join('\n')
      .trim();
  }, [destination.tableNotes, destination.notes]);

  // If explicit segments are not passed, build default single-page segments
  const activeSegments: LogTableSegment[] = React.useMemo(() => {
    if (segments) return segments;

    const list: LogTableSegment[] = [];
    // 1. Departure row: DÉPART : [Departure] => PON (no altitude row)
    list.push({
      point: departure,
      isOriginDeparture: true,
      branchNumber: undefined,
      fromName: departure.name || (isPrintMode ? '__________________________' : 'LFPX Chavenay'),
      toName: 'PON',
      leg: legs[0] || {
        id: 'leg-0',
        alt: '',
        rm: '',
        dist: '',
        ete: '',
        eta: '',
        consoTotale: '',
        notes: '',
      },
      legIndex: 0,
    });

    // 2. Navigation branches: 1, 2, 3...
    const totalBranches = Math.max(1, waypoints.length > 0 ? waypoints.length + 1 : 1);
    for (let k = 0; k < totalBranches; k++) {
      const branchNum = k + 1;
      const fromName =
        k === 0
          ? 'PON'
          : waypoints[k - 1]?.name?.trim() || `WP ${k}`;
      const toName =
        k < waypoints.length
          ? waypoints[k]?.name?.trim() || `WP ${k + 1}`
          : destination.name?.trim() || (isPrintMode ? '__________________________' : 'Arrivée');

      const pt = k < waypoints.length ? waypoints[k] : destination;

      list.push({
        point: pt,
        isOriginDeparture: false,
        branchNumber: branchNum,
        fromName,
        toName,
        leg: legs[k] || {
          id: `leg-${k}`,
          alt: '',
          rm: '',
          dist: '',
          ete: '',
          eta: '',
          consoTotale: '',
          notes: '',
        },
        legIndex: k,
      });
    }

    return list;
  }, [segments, departure, waypoints, legs, destination.name, isPrintMode]);

  const formatRadio = (frequencies?: Waypoint['frequencies']) => {
    if (!frequencies) return '';
    return [
      frequencies.atis ? `ATIS ${frequencies.atis}` : '',
      frequencies.twr ? `TWR ${frequencies.twr}` : '',
      frequencies.afis ? `AFIS ${frequencies.afis}` : '',
      frequencies.aa ? `A/A ${frequencies.aa}` : '',
    ]
      .filter(Boolean)
      .join(' | ');
  };

  const numLegsOnPage = activeSegments.filter((s) => !s.isOriginDeparture).length;
  // Hauteurs fixes, identiques quel que soit le nombre de tronçons.
  // Valeurs reprises du log vierge (cas 4 tronçons ou plus).
  const paramRowMinHeightClass = 'min-h-[31px]';
  const notesCellMinHeightClass = 'min-h-[48px]';
  const arrivalBlockMinHeightClass = 'min-h-[56px]';

  return (
    <div className="w-full border-2 border-black text-black bg-white select-text">
      {/* Reprise notice if starting page from previous page's last point */}
      {reprisePointNotice && (
        <div className="bg-amber-50 border-b border-black text-[9.5px] font-semibold text-amber-900 px-2 py-0.5 text-center">
          {reprisePointNotice}
        </div>
      )}

      {/* 2. SEGMENTS (MERGED LIEU + PARAMETRES DE VOL WITH A SINGLE NOTES CELL) */}
      {activeSegments.map((seg) => {
        const { point, isOriginDeparture, branchNumber, fromName, toName, leg, legIndex } = seg;
        const radioSummary = point ? formatRadio(point.frequencies) : '';

        if (isOriginDeparture) {
          return (
            <div
              key={`seg-dep-${departure.id || departure.name}`}
              className="grid grid-cols-12 border-b-2 border-black"
            >
              {/* Left 2/3 (8 cols): Info Départ => PON (sur une seule ligne compacte) */}
              <div className="col-span-8 border-r-2 border-black px-1.5 py-1 flex items-center bg-slate-50/60 min-h-[26px]">
                <div className="flex items-center gap-1.5 flex-wrap leading-tight">
                  <span className="font-extrabold text-[10.5px] uppercase tracking-tight text-black">
                    DÉPART :
                  </span>
                  <span className="font-bold text-[11px] uppercase text-slate-900">
                    {departure.name || (isPrintMode ? '__________________________' : 'LFPX Chavenay')}
                  </span>
                  <span className="font-extrabold text-[11px] text-black uppercase">
                    =&gt; PON
                  </span>
                </div>
              </div>

              {/* Right 1/3 (4 cols): Fréquences de Départ placées dans la colonne Notes */}
              <div className="col-span-4 px-1.5 py-1 flex flex-col justify-center bg-white min-h-[26px]">
                <div className="font-mono text-[8px] sm:text-[8.5px] text-slate-900 flex flex-wrap gap-x-1.5 gap-y-0.5 items-center leading-tight">
                  {depFreqs.atis ? (
                    <span>
                      <strong>ATIS:</strong> {depFreqs.atis}
                    </span>
                  ) : isPrintMode ? (
                    <span>
                      <strong>ATIS:</strong> ___
                    </span>
                  ) : null}
                  {depFreqs.atis && (depFreqs.twr || depFreqs.afis_aa) ? (
                    <span className="text-slate-400">|</span>
                  ) : null}
                  {depFreqs.twr ? (
                    <span>
                      <strong>TWR:</strong> {depFreqs.twr}
                    </span>
                  ) : isPrintMode ? (
                    <span>
                      <strong>TWR:</strong> ___
                    </span>
                  ) : null}
                  {depFreqs.afis_aa ? (
                    <>
                      <span className="text-slate-400">|</span>
                      <span>
                        <strong>A/A:</strong> {depFreqs.afis_aa}
                      </span>
                    </>
                  ) : null}
                  {depFreqs.siv ? (
                    <>
                      <span className="text-slate-400">|</span>
                      <span>
                        <strong>SIV:</strong> {depFreqs.siv}
                      </span>
                    </>
                  ) : null}
                  {!depFreqs.atis && !depFreqs.twr && !depFreqs.afis_aa && !depFreqs.siv && !isPrintMode && (
                    <span className="text-slate-400 italic text-[7.5px]">Fréquences non définies</span>
                  )}
                </div>
              </div>
            </div>
          );
        }

        return (
          <div
            key={`seg-branch-${branchNumber}-${legIndex}`}
            className="grid grid-cols-12 border-b-2 border-black"
          >
            {/* Left 2/3 (8 columns): Sub-row 1 (Numéro de branche : Départ => Arrivée) + Sub-row 2 (Paramètres de vol) */}
            <div className="col-span-8 border-r-2 border-black flex flex-col">
              {/* SUB-ROW 1: LIEU & BRANCHE (ex: 1 : PON => Waypoint suivant) - Espace vertical réduit significativement */}
              <div className="px-1.5 py-0.5 border-b border-black flex flex-col justify-center bg-slate-50/40">
                <div className="flex items-center gap-1.5 flex-wrap leading-tight">
                  <span className="font-extrabold text-[10.5px] uppercase tracking-tight text-black">
                    {branchNumber} :
                  </span>
                  <span className="font-bold text-[11px] uppercase text-slate-900">
                    {fromName} =&gt; {toName || (isPrintMode ? '__________________________' : 'Waypoint suivant')}
                  </span>
                </div>
                {radioSummary ? (
                  <div className="mt-0.5">
                    <span className="font-mono text-[8.5px] font-semibold text-slate-700 bg-slate-200/70 px-1 py-0.2 rounded-xs inline-block">
                      {radioSummary}
                    </span>
                  </div>
                ) : point?.coordinates ? (
                  <span className="text-[8px] text-slate-600 font-mono mt-0.5">
                    {point.coordinates}
                  </span>
                ) : null}
              </div>

              {/* SUB-ROW 2: PARAMETRES DE VOL (6 colonnes : RM | DIST | ALTITUDE | T SANS / AC VW | ETA | ATA) */}
              <div className="flex flex-col">
                {/* Ligne d'en-tête des paramètres - Alignement parfait avec grille stricte */}
                <div className="grid grid-cols-[13.5%_13.5%_17%_22%_17%_17%] divide-x divide-black border-b border-black text-center font-bold text-[7.5px] uppercase tracking-tight bg-slate-100/90 min-h-[22px]">
                  {/* 1. RM */}
                  <div className="py-0.5 flex items-center justify-center">
                    RM
                  </div>
                  {/* 2. DIST */}
                  <div className="py-0.5 flex items-center justify-center">
                    DIST
                  </div>
                  {/* 3. Altitude */}
                  <div className="py-0.5 flex items-center justify-center">
                    ALTITUDE
                  </div>
                  {/* 4. T SANS / AC VW (resserré avec texte compact et marges limitées) */}
                  <div className="py-0.5 px-0.5 flex items-center justify-center text-center font-bold text-[7px] sm:text-[7.5px] text-black uppercase tracking-tight whitespace-nowrap">
                    T SANS / AC VW
                  </div>
                  {/* 5. ETA (élargi) */}
                  <div className="py-0.5 flex items-center justify-center">
                    ETA
                  </div>
                  {/* 6. ATA (élargi) */}
                  <div className="py-0.5 flex items-center justify-center">
                    ATA
                  </div>
                </div>

                {/* Ligne des valeurs des paramètres */}
                <div className={`grid grid-cols-[13.5%_13.5%_17%_22%_17%_17%] divide-x divide-black text-center ${paramRowMinHeightClass}`}>
                  {/* 1. RM */}
                  <div className="p-0.5 flex items-center justify-center">
                    {isPrintMode ? (
                      <span className="font-bold font-mono text-[10px]">
                        {leg.rm || ''}
                      </span>
                    ) : (
                      <input
                        type="text"
                        id={`a5-leg-${legIndex}-rm`}
                        value={leg.rm || ''}
                        onChange={(e) => onUpdateLeg?.(legIndex, 'rm', e.target.value)}
                        placeholder=""
                        className="w-full text-center font-mono font-bold text-[9.5px] p-0.5 border-0 focus:ring-1 focus:ring-black rounded bg-transparent"
                      />
                    )}
                  </div>

                  {/* 2. DIST */}
                  <div className="p-0.5 flex items-center justify-center bg-slate-50/60">
                    {isPrintMode ? (
                      <span className="font-bold font-mono text-[10px]">
                        {leg.dist ? `${leg.dist}` : ''}
                      </span>
                    ) : (
                      <input
                        type="text"
                        id={`a5-leg-${legIndex}-dist`}
                        value={leg.dist || ''}
                        onChange={(e) => onUpdateLeg?.(legIndex, 'dist', e.target.value)}
                        placeholder=""
                        className="w-full text-center font-mono font-bold text-[9.5px] p-0.5 border-0 focus:ring-1 focus:ring-black rounded bg-transparent"
                      />
                    )}
                  </div>

                  {/* 3. Altitude */}
                  <div className="p-0.5 flex items-center justify-center">
                    {isPrintMode ? (
                      <span className="font-bold font-mono text-[10px]">
                        {leg.alt || ''}
                      </span>
                    ) : (
                      <input
                        type="text"
                        id={`a5-leg-${legIndex}-alt`}
                        value={leg.alt || ''}
                        onChange={(e) => onUpdateLeg?.(legIndex, 'alt', e.target.value)}
                        placeholder=""
                        className="w-full text-center font-mono font-bold text-[9.5px] p-0.5 border-0 focus:ring-1 focus:ring-black rounded bg-transparent"
                      />
                    )}
                  </div>

                  {/* 4. T SANS / AC VW (avec séparation diagonale maintenue sur la ligne du dessous et marges réduites) */}
                  <div className="p-0.5 relative flex flex-col justify-between overflow-hidden bg-slate-50/60 h-full">
                    <svg
                      className="absolute inset-0 w-full h-full pointer-events-none stroke-black"
                      preserveAspectRatio="none"
                    >
                      <line x1="0" y1="100%" x2="100%" y2="0" strokeWidth="1" />
                    </svg>
                    {isPrintMode ? (
                      <>
                        <div className="text-left font-mono font-bold text-[9px] pl-0.5 pt-0.5 leading-none z-1">
                          {leg.tSansVw || leg.ete || leg.temps || ''}
                        </div>
                        <div className="text-right font-mono font-bold text-[9px] pr-0.5 pb-0.5 leading-none z-1">
                          {leg.tAvecVw || ''}
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col justify-between h-full z-1">
                        <div className="flex justify-start">
                          <input
                            type="text"
                            id={`a5-leg-${legIndex}-tSansVw`}
                            value={leg.tSansVw ?? leg.ete ?? leg.temps ?? ''}
                            onChange={(e) => onUpdateLeg?.(legIndex, 'tSansVw', e.target.value)}
                            placeholder=""
                            className="w-1/2 text-left font-mono font-bold text-[8.5px] p-0 border-0 focus:ring-1 focus:ring-black rounded bg-transparent leading-none"
                            title="T sans Vw"
                          />
                        </div>
                        <div className="flex justify-end">
                          <input
                            type="text"
                            id={`a5-leg-${legIndex}-tAvecVw`}
                            value={leg.tAvecVw || ''}
                            onChange={(e) => onUpdateLeg?.(legIndex, 'tAvecVw', e.target.value)}
                            placeholder=""
                            className="w-1/2 text-right font-mono font-bold text-[8.5px] p-0 border-0 focus:ring-1 focus:ring-black rounded bg-transparent leading-none"
                            title="T avec Vw"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 5. ETA (élargi à 17%) */}
                  <div className="p-0.5 flex items-center justify-center">
                    {isPrintMode ? (
                      <span className="font-mono text-[10px] font-semibold">
                        {leg.eta || ''}
                      </span>
                    ) : (
                      <input
                        type="text"
                        id={`a5-leg-${legIndex}-eta`}
                        value={leg.eta || ''}
                        onChange={(e) => onUpdateLeg?.(legIndex, 'eta', e.target.value)}
                        placeholder=""
                        className="w-full text-center font-mono text-[9.5px] p-0.5 border-0 focus:ring-1 focus:ring-black rounded bg-transparent"
                      />
                    )}
                  </div>

                  {/* 6. ATA (élargi à 17%) */}
                  <div className="p-0.5 flex items-center justify-center bg-slate-50/60">
                    {isPrintMode ? (
                      <span className="font-mono text-[10px] font-semibold">
                        {leg.ata || ''}
                      </span>
                    ) : (
                      <input
                        type="text"
                        id={`a5-leg-${legIndex}-ata`}
                        value={leg.ata || ''}
                        onChange={(e) => onUpdateLeg?.(legIndex, 'ata', e.target.value)}
                        placeholder=""
                        className="w-full text-center font-mono text-[9.5px] p-0.5 border-0 focus:ring-1 focus:ring-black rounded bg-transparent"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right 1/3 (4 columns): SINGLE MERGED NOTES CELL across both rows */}
            <div className="col-span-4 p-1.5 flex flex-col justify-start bg-white">
              {isPrintMode ? (
                <div className={`text-[9.5px] font-mono leading-tight whitespace-pre-line text-black w-full h-full ${notesCellMinHeightClass}`}>
                  {leg.notes || ''}
                </div>
              ) : (
                <textarea
                  id={`a5-leg-${legIndex}-notes`}
                  value={leg.notes || ''}
                  onChange={(e) => onUpdateLeg?.(legIndex, 'notes', e.target.value)}
                  placeholder=""
                  rows={2}
                  className="w-full h-full text-[9.5px] font-mono p-1 border-0 focus:ring-1 focus:ring-black bg-transparent resize-none leading-relaxed"
                />
              )}
            </div>
          </div>
        );
      })}

      {/* 3. FINAL DESTINATION / ARRIVÉE (if this page reaches destination) */}
      {showDestination && (
        <div className={`grid grid-cols-12 ${arrivalBlockMinHeightClass} bg-slate-50/50`}>
          {/* Left side (2/3 = 8 cols): Données aérodrome d'arrivée */}
          <div className="col-span-8 p-1.5 border-r-2 border-black flex flex-col justify-between text-left">
            {/* Header row: Arrivée (sans badge RÉSUMÉ VAC) */}
            <div className="flex items-center justify-between gap-1 flex-wrap border-b border-black/20 pb-0.5 mb-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-extrabold text-[11px] uppercase tracking-tight text-black">
                  Arrivée :
                </span>
                <span className="font-bold text-[11.5px] uppercase text-slate-900">
                  {destination.name || (isPrintMode ? (
                    '__________________________'
                  ) : (
                    <span className="text-slate-400 italic font-normal">
                      (Point d'arrivée laissé libre)
                    </span>
                  ))}
                </span>
              </div>
            </div>

            {/* VAC Data lines (3 formatted rows) */}
            <div className="space-y-0.5 text-[9.5px] leading-tight">
              {/* Ligne 1: ATIS: [atis] | TWR: [twr] | AFIS/A/A: [afis_aa] */}
              <div className="font-mono text-[9px] text-slate-900 flex flex-wrap gap-x-2 gap-y-0.5 items-center">
                <span>
                  <strong>ATIS:</strong> {destFreqs.atis || '___'}
                </span>
                <span className="text-slate-400">|</span>
                <span>
                  <strong>TWR:</strong> {destFreqs.twr || '___'}
                </span>
                <span className="text-slate-400">|</span>
                <span>
                  <strong>AFIS/A/A:</strong> {destFreqs.afis_aa || '___'}
                </span>
              </div>

              {/* Ligne 2: Alt terrain: [alt] ft  Piste(s): [pistes] */}
              <div className="font-mono text-[9px] text-slate-900 flex flex-wrap gap-x-3 gap-y-0.5 items-center pt-0.5 border-t border-slate-200">
                <div>
                  <span className="font-bold text-black">Alt terrain:</span>{' '}
                  {destElevation !== undefined ? `${destElevation} ft` : '___ ft'}
                </div>
                <div>
                  <span className="font-bold text-black">Piste(s):</span>{' '}
                  {destRunways || '___'}
                </div>
              </div>

              {/* Ligne 3: TDP / VAC : TdP: [tdp] ft QNH */}
              <div className="font-mono text-[9px] text-slate-900 flex flex-wrap gap-x-2 gap-y-0.5 items-center pt-0.5 border-t border-slate-200">
                <span className="font-bold text-black uppercase text-[8.5px]">TDP / VAC :</span>
                <span>
                  TdP: {destTdp ? (destTdp.includes('ft') ? destTdp : `${destTdp} ft QNH`) : '___ ft QNH'}
                </span>
              </div>
            </div>
          </div>

          {/* Right side (1/3 = 4 cols): Destination NOTES */}
          <div className="col-span-4 p-1.5 flex flex-col justify-start bg-white text-left">
            {/* Ligne 1 : Picto + Coucher de soleil (heure locale) */}
            <div className="flex items-center gap-1.5 font-mono text-[9.5px] font-bold text-black leading-tight">
              <Sunset className="w-3.5 h-3.5 text-black shrink-0 stroke-[2.2]" />
              <span>
                Coucher soleil : {destination.sunsetLocal || '___'}
              </span>
            </div>

            {/* Notes complémentaires saisies par l'utilisateur */}
            {isPrintMode ? (
              cleanTableNotes ? (
                <div className="text-[9px] font-mono leading-tight whitespace-pre-line text-black w-full mt-1">
                  {cleanTableNotes}
                </div>
              ) : null
            ) : (
              <textarea
                id="a5-dest-table-notes"
                value={cleanTableNotes}
                onChange={(e) => onUpdateDestinationTableNotes?.(e.target.value)}
                placeholder=""
                rows={2}
                className="w-full flex-1 text-[9px] font-mono p-0 mt-1 border-0 focus:ring-1 focus:ring-black bg-transparent resize-none leading-tight"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
