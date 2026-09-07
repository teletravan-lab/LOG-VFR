import React from 'react';
import { FlightPlan, NavLeg } from '../types';
import { LogTableA5, LogTableSegment } from './LogTableA5';

interface A5KneeboardViewProps {
  flightPlan: FlightPlan;
  isPrintMode?: boolean;
  duplicateIfSinglePage?: boolean;
  forcePageBreakAfter?: boolean;
  onUpdateDepartureNotes?: (notes: string) => void;
  onUpdateDestinationNotes?: (notes: string) => void;
  onUpdateWaypointNotes?: (id: string, notes: string) => void;
  onUpdateLeg?: (index: number, field: keyof NavLeg, value: string) => void;
  onUpdateGeneralNotes?: (notes: string) => void;
  onUpdateAircraftField?: (field: keyof FlightPlan, value: any) => void;
  onUpdateDepartureTableNotes?: (notes: string) => void;
  onUpdateDestinationTableNotes?: (notes: string) => void;
  onUpdateWaypointTableNotes?: (id: string, notes: string) => void;
}

interface PageData {
  pageIndex: number;
  totalPages: number;
  segments: LogTableSegment[];
  showDestination: boolean;
  reprisePointNotice?: string;
}

export const A5KneeboardView: React.FC<A5KneeboardViewProps> = ({
  flightPlan,
  isPrintMode = false,
  duplicateIfSinglePage = false,
  forcePageBreakAfter = false,
  onUpdateDepartureNotes,
  onUpdateLeg,
  onUpdateGeneralNotes,
  onUpdateAircraftField,
  onUpdateDestinationTableNotes,
}) => {
  // Calculations
  const parseNum = (val?: string) => {
    if (!val) return 0;
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
  };

  const totalDist = flightPlan.legs.reduce((acc, leg) => acc + parseNum(leg.dist), 0);
  const totalEteMin = flightPlan.legs.reduce(
    (acc, leg) => acc + parseNum(leg.ete || leg.temps),
    0
  );

  // Total Trip fuel
  const flightConso = Math.round(((totalEteMin / 60) * flightPlan.fuelPerHour) * 10) / 10;
  const taxiConso = flightPlan.taxiFuel || 3;
  const totalConsoLiters = Math.round((flightConso + taxiConso) * 10) / 10;

  const displayDist =
    flightPlan.totalDistOverride !== undefined && flightPlan.totalDistOverride !== ''
      ? flightPlan.totalDistOverride
      : totalDist > 0
      ? `${totalDist}`
      : '';

  const displayEte =
    flightPlan.totalEteOverride !== undefined && flightPlan.totalEteOverride !== ''
      ? flightPlan.totalEteOverride
      : totalEteMin > 0
      ? `${totalEteMin}`
      : '';

  const displayConso =
    flightPlan.totalConsoOverride !== undefined && flightPlan.totalConsoOverride !== ''
      ? flightPlan.totalConsoOverride
      : totalEteMin > 0
      ? `${totalConsoLiters}`
      : '';

  // Format OACI codes for Header (e.g. LFPX => LFOO)
  const getOaciCode = (name: string, oaci?: string) => {
    if (oaci && oaci.trim().length === 4) return oaci.trim().toUpperCase();
    const trimmed = (name || '').trim();
    const match = trimmed.match(/^[A-Za-z]{4}\b/);
    if (match) return match[0].toUpperCase();
    return trimmed.slice(0, 4).toUpperCase() || '____';
  };

  const depOaci = getOaciCode(flightPlan.departure.name, flightPlan.departure.oaci);
  const destOaci = getOaciCode(flightPlan.destination.name, flightPlan.destination.oaci);

  // Format flight date as DD/MM/YYYY
  const formatFlightDate = (rawDate?: string) => {
    if (!rawDate || rawDate.trim() === '') return '__/__/____';
    if (rawDate.includes('-')) {
      const parts = rawDate.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }
    return rawDate;
  };

  const formattedDate = formatFlightDate(flightPlan.flightDate);

  // PAGINATION ENGINE:
  // If waypoints <= 4, fits on a single A5 sheet.
  // If waypoints > 4, splits into multiple pages.
  // Next page resumes from the LAST point reached on previous page!
  const LEGS_PER_PAGE = 4;

  const pages: PageData[] = React.useMemo(() => {
    // 1. Build all segments
    const allSegments: LogTableSegment[] = [];

    // Departure row: DÉPART : [Departure] => PON (no altitude row, case notes vide)
    allSegments.push({
      point: flightPlan.departure,
      isOriginDeparture: true,
      branchNumber: undefined,
      fromName: flightPlan.departure.name || (isPrintMode ? '__________________________' : 'LFPX Chavenay'),
      toName: 'PON',
      leg: {
        ...(flightPlan.legs[0] || {
          id: 'leg-0',
          alt: '',
          rm: '',
          dist: '',
          ete: '',
          eta: '',
          consoTotale: '',
          notes: '',
        }),
        notes: '',
      },
      legIndex: 0,
    });

    // Navigation branches: 1, 2, 3...
    const totalBranches = Math.max(1, flightPlan.waypoints.length > 0 ? flightPlan.waypoints.length + 1 : 1);
    for (let k = 0; k < totalBranches; k++) {
      const branchNum = k + 1;
      const fromName =
        k === 0
          ? 'PON'
          : flightPlan.waypoints[k - 1]?.name?.trim() || `WP ${k}`;
      const toName =
        k < flightPlan.waypoints.length
          ? flightPlan.waypoints[k]?.name?.trim() || `WP ${k + 1}`
          : flightPlan.destination.name?.trim() || (isPrintMode ? '__________________________' : 'Arrivée');

      const pt = k < flightPlan.waypoints.length ? flightPlan.waypoints[k] : flightPlan.destination;

      allSegments.push({
        point: pt,
        isOriginDeparture: false,
        branchNumber: branchNum,
        fromName,
        toName,
        leg: {
          id: `leg-${k}`,
          alt: '',
          rm: '',
          dist: '',
          tSansVw: '',
          tAvecVw: '',
          ete: '',
          temps: '',
          eta: '',
          ata: '',
          consoTotale: '',
          ...(flightPlan.legs[k] || {}),
          notes: flightPlan.legs[k]?.notes || '',
        },
        legIndex: k,
      });
    }

    // Single page case: up to 5 rows (Departure + up to 4 branches) fit comfortably on a single A5 sheet
    if (allSegments.length <= 5) {
      return [
        {
          pageIndex: 1,
          totalPages: 1,
          segments: allSegments,
          showDestination: true,
        },
      ];
    }

    // Multi-page case
    const totalPages = Math.ceil(allSegments.length / LEGS_PER_PAGE);
    const result: PageData[] = [];

    for (let p = 0; p < totalPages; p++) {
      const startIdx = p * LEGS_PER_PAGE;
      const endIdx = Math.min(startIdx + LEGS_PER_PAGE, allSegments.length);
      const pageSegments = allSegments.slice(startIdx, endIdx);
      const isLastPage = p === totalPages - 1;

      let repriseNotice: string | undefined;
      if (p > 0) {
        const resumePointName = pageSegments[0]?.fromName || 'Point intermédiaire';
        repriseNotice = `↪ Reprise du dernier point : ${resumePointName} (Suite de la page ${p}/${totalPages})`;
      }

      result.push({
        pageIndex: p + 1,
        totalPages,
        segments: pageSegments,
        showDestination: isLastPage,
        reprisePointNotice: repriseNotice,
      });
    }

    return result;
  }, [flightPlan.departure, flightPlan.waypoints, flightPlan.legs, flightPlan.destination.name, isPrintMode]);

  const pagesToRender: PageData[] = React.useMemo(() => {
    if (isPrintMode && duplicateIfSinglePage && pages.length === 1) {
      return [pages[0], pages[0]];
    }
    return pages;
  }, [pages, isPrintMode, duplicateIfSinglePage]);

  const renderPageContent = (page: PageData) => {
    const isBlankFlight =
      depOaci === '____' &&
      destOaci === '____' &&
      (!flightPlan.flightDate || flightPlan.flightDate.trim() === '');

    const pageHeaderInfo = isBlankFlight
      ? '____  =>  ____   -   __/__/____'
      : `${depOaci} => ${destOaci} - ${formattedDate}${
          page.totalPages > 1 ? ` (Page ${page.pageIndex}/${page.totalPages})` : ''
        }`;

    return (
      <div className="w-full h-full flex flex-col justify-between select-text bg-white box-border text-black font-sans">
        {/* Top brand header & info */}
        <div>
          {/* 1. BRAND HEADER & PAGE HEADER INFO */}
          <div className="flex items-center justify-between pb-1 border-b border-black/15 mb-1.5">
            <h1 className="font-bold text-xs tracking-normal text-black font-sans flex items-center">
              <span>Log VFR</span>
              <a
                href="https://teletravan.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-600 hover:text-sky-700 font-medium text-[11px] ml-1.5 transition-colors underline"
                title="Visiter teletravan.com"
              >
                teletravan.com
              </a>
            </h1>
            <span className="font-mono font-bold text-black uppercase tracking-tight text-[15px]">
              {pageHeaderInfo}
            </span>
          </div>

          {/* 2. TOP BOX: Avion : / Conso / Vitesse propre & Récapitulatif navigation */}
          <div className="border-2 border-black py-1 px-1.5 mb-2 bg-white text-xs text-black">
            {/* Ligne 1 : Paramètres avion */}
            {isPrintMode ? (
              <div className="py-0.25 text-[10.5px] sm:text-[11px] text-left px-0.5 flex items-center gap-1 flex-wrap leading-tight">
                <span className="text-slate-800 font-normal">Avion :</span>{' '}
                <span className="font-normal inline-block min-w-[42px] text-left">
                  {flightPlan.aircraftModel || ''}
                </span>
                <span className="font-normal inline-block min-w-[50px] text-left">
                  {flightPlan.aircraftReg || ''}
                </span>
                <span className="text-slate-400 mx-1">/</span>
                <span className="text-slate-800 font-normal">Conso :</span>{' '}
                <span className="font-bold inline-block min-w-[28px] text-left">
                  {flightPlan.fuelPerHour ? `${flightPlan.fuelPerHour}` : ''}
                </span>
                <span className="text-slate-700 font-normal">L/h</span>
                <span className="text-slate-400 mx-1">/</span>
                <span className="text-slate-800 font-normal">Vitesse propre :</span>{' '}
                <span className="font-normal inline-block min-w-[28px] text-left">
                  {flightPlan.cruiseSpeedKt ? `${flightPlan.cruiseSpeedKt}` : ''}
                </span>
                <span className="text-slate-700 font-normal">kt</span>
              </div>
            ) : (
              <div className="flex items-center justify-start gap-1 flex-wrap text-[10.5px] sm:text-[11px] py-0.25 px-0.5 leading-tight">
                <div className="flex items-center gap-1">
                  <span className="text-slate-800 font-normal">Avion :</span>
                  <input
                    type="text"
                    value={flightPlan.aircraftModel}
                    onChange={(e) => onUpdateAircraftField?.('aircraftModel', e.target.value)}
                    placeholder="Modèle"
                    className="w-14 font-normal text-black border-0 text-left p-0 text-xs bg-transparent focus:ring-1 focus:ring-slate-400 rounded"
                  />
                  <input
                    type="text"
                    value={flightPlan.aircraftReg || ''}
                    onChange={(e) => onUpdateAircraftField?.('aircraftReg', e.target.value)}
                    placeholder="Immat"
                    className="w-16 font-normal text-black border-0 text-left p-0 text-xs bg-transparent focus:ring-1 focus:ring-slate-400 rounded"
                  />
                </div>
                <span className="text-slate-400 mx-1">/</span>
                <div className="flex items-center gap-1">
                  <span className="text-slate-800 font-normal">Conso :</span>
                  <input
                    type="number"
                    value={flightPlan.fuelPerHour || ''}
                    onChange={(e) => onUpdateAircraftField?.('fuelPerHour', Number(e.target.value))}
                    className="w-10 font-bold text-black border-0 text-left p-0 text-xs bg-transparent focus:ring-1 focus:ring-slate-400 rounded"
                  />
                  <span className="text-slate-700 font-normal">L/h</span>
                </div>
                <span className="text-slate-400 mx-1">/</span>
                <div className="flex items-center gap-1">
                  <span className="text-slate-800 font-normal">Vitesse propre :</span>
                  <input
                    type="number"
                    value={flightPlan.cruiseSpeedKt || ''}
                    onChange={(e) => onUpdateAircraftField?.('cruiseSpeedKt', Number(e.target.value))}
                    className="w-10 font-normal text-black border-0 text-left p-0 text-xs bg-transparent focus:ring-1 focus:ring-slate-400 rounded"
                  />
                  <span className="text-slate-700 font-normal">kt</span>
                </div>
              </div>
            )}

            {/* Séparateur fin */}
            <div className="border-t border-black my-0.5" />

            {/* Ligne 2 : Récap navigation : Dist Tot / ETE Tot / Conso Tot / ETA */}
            <div className="flex justify-between items-center flex-wrap gap-1 text-[10px] sm:text-[10.5px] py-0.25 px-0.5 leading-tight">
              <div>
                <span className="font-normal text-slate-800">Dist Tot :</span>{' '}
                <span className="font-normal font-mono text-xs inline-block min-w-[28px] text-center">
                  {displayDist}
                </span>{' '}
                <span className="font-normal text-slate-700">NM</span>
              </div>
              <span className="text-slate-300">/</span>
              <div>
                <span className="font-normal text-slate-800">ETE Tot :</span>{' '}
                <span className="font-bold font-mono text-xs inline-block min-w-[28px] text-center">
                  {displayEte}
                </span>
              </div>
              <span className="text-slate-300">/</span>
              <div>
                <span className="font-normal text-slate-800">Conso Tot :</span>{' '}
                <span className="font-bold font-mono text-xs inline-block min-w-[28px] text-center">
                  {displayConso}
                </span>{' '}
                <span className="font-normal text-slate-700">L</span>
              </div>
              <span className="text-slate-300">/</span>
              <div>
                <span className="font-normal text-slate-800">ETA :</span>{' '}
                <span className="font-bold font-mono text-xs inline-block min-w-[32px] text-center">
                  {/* Laissé vide pour saisie manuelle en vol */}
                </span>
              </div>
            </div>

            {/* Séparateur fin */}
            <div className="border-t border-black my-0.5" />

            {/* Ligne 3 : Lever et Coucher du soleil terrain d'arrivée (heure locale) */}
            <div className="flex justify-end items-center gap-3 sm:gap-4 flex-wrap text-[10px] sm:text-[10.5px] py-0.25 px-0.5 leading-tight">
              <div>
                <span className="text-slate-800 font-normal">
                  Terrain d'arrivée (
                  <span className="font-bold text-black">
                    {flightPlan.destination.oaci || (flightPlan.destination.name ? flightPlan.destination.name.slice(0, 14) : '____')}
                  </span>
                  ) :
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div>
                  <span className="text-slate-800 font-normal">Lever soleil :</span>{' '}
                  <span className="font-normal font-mono text-xs inline-block min-w-[36px] text-center">
                    {flightPlan.destination.sunriseLocal || flightPlan.destinationSunriseLocal || ''}
                  </span>
                </div>
                <span className="text-slate-300">/</span>
                <div>
                  <span className="text-slate-800 font-normal">Coucher soleil :</span>{' '}
                  <span className="font-bold font-mono text-xs inline-block min-w-[36px] text-center">
                    {flightPlan.destination.sunsetLocal || flightPlan.destinationSunsetLocal || ''}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. MAIN NAVIGATION LOG TABLE (EN ROUTE / NOTES) - juste en dessous */}
          <div className="mb-2">
            <LogTableA5
              departure={flightPlan.departure}
              destination={flightPlan.destination}
              waypoints={flightPlan.waypoints}
              legs={flightPlan.legs}
              isPrintMode={isPrintMode}
              onUpdateLeg={onUpdateLeg}
              onUpdateDepartureNotes={onUpdateDepartureNotes}
              onUpdateDestinationTableNotes={onUpdateDestinationTableNotes}
              segments={page.segments}
              showDestination={page.showDestination}
              reprisePointNotice={page.reprisePointNotice}
            />
          </div>
        </div>

        {/* 4. SECTION BASSE : Ligne Urgence */}
        <div className="mt-auto pt-1 border-t border-black/20">
          <div className="text-[8.5px] sm:text-[9px] text-center font-medium text-black tracking-tight whitespace-nowrap">
            Transpondeur <span className="font-bold">7700</span> : Détresse générale - <span className="font-bold">7600</span> : Panne radio - Fréquence urgence : <span className="font-bold">121.500 MHz</span> - Sauvetage aéro <span className="font-bold">191</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {pagesToRender.map((page, idx) => {
        const isLast = idx === pagesToRender.length - 1;
        const shouldPageBreak = forcePageBreakAfter || !isLast;

        return (
          <div
            key={`a5-sheet-page-${page.pageIndex}-${idx}`}
            className="a5-sheet bg-white text-black font-sans mx-auto border-2 border-slate-300 shadow-md p-3 flex flex-col justify-between select-text"
            style={{
              width: '148mm',
              maxWidth: '148mm',
              height: '210mm',
              minHeight: '210mm',
              maxHeight: '210mm',
              boxSizing: 'border-box',
              breakAfter: shouldPageBreak ? 'page' : 'auto',
              pageBreakAfter: shouldPageBreak ? 'always' : 'auto',
            }}
          >
            {renderPageContent(page)}
          </div>
        );
      })}
    </div>
  );
};
