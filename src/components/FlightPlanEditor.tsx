import React, { useState, useEffect, useRef } from 'react';
import {
  Plane,
  Fuel,
  Gauge,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  MapPin,
  Building2,
  Compass,
  FileSpreadsheet,
  RotateCcw,
  Settings,
  ChevronDown,
  ChevronUp,
  Calendar,
  Loader2,
} from 'lucide-react';
import { FlightPlan, Waypoint, NavLeg, WaypointType, AerodromeInfo } from '../types';
import { AerodromeSearchInput } from './AerodromeSearchInput';
import { fetchArrivalAirportData, fetchSunTimes } from '../services/openaip';
import { FRENCH_AERODROMES } from '../data/aerodromes';

interface FlightPlanEditorProps {
  flightPlan: FlightPlan;
  onChange: (updated: FlightPlan) => void;
  openAipApiKey?: string;
  onOpenAipApiKeyChange?: (key: string) => void;
}

export const FlightPlanEditor: React.FC<FlightPlanEditorProps> = ({
  flightPlan,
  onChange,
  openAipApiKey,
  onOpenAipApiKeyChange,
}) => {
  const [showAircraftSettings, setShowAircraftSettings] = useState(false);
  const [isLoadingArrivalData, setIsLoadingArrivalData] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const formatFrenchDate = (isoDate?: string) => {
    if (!isoDate) return 'JJ/MM/AAAA';
    const parts = isoDate.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return isoDate;
  };

  // Update Aircraft info
  const handleAircraftChange = (field: keyof FlightPlan, value: any) => {
    const updated = {
      ...flightPlan,
      [field]: value,
    };
    onChange(updated);

    if (field === 'flightDate' && value) {
      // Re-fetch sunrise & sunset when the flight date changes
      const destOaci = flightPlan.destination.oaci || '';
      const destName = flightPlan.destination.name || '';
      if (destOaci || destName) {
        const local = FRENCH_AERODROMES.find((a) => a.oaci.toUpperCase() === destOaci.toUpperCase());
        triggerFetchArrivalData(destOaci || destName, local, value);
      }
    }
  };

  // Departure Select
  const handleSelectDeparture = (aero: AerodromeInfo, defaultNotes: string) => {
    onChange({
      ...flightPlan,
      departure: {
        ...flightPlan.departure,
        name: `${aero.oaci} ${aero.name}`,
        oaci: aero.oaci,
        coordinates: aero.elevationFt ? `Alt ${aero.elevationFt}ft` : '',
        notes: defaultNotes,
        frequencies: aero.frequencies,
      },
    });
  };

  // Automated fetch of arrival airport data from OpenAIP & ephemeris from sunrise-sunset
  const triggerFetchArrivalData = async (
    targetOaciOrName: string,
    baseAero?: AerodromeInfo,
    forcedDate?: string
  ) => {
    if (!targetOaciOrName || !targetOaciOrName.trim()) return;
    setIsLoadingArrivalData(true);

    const dateToUse = forcedDate || flightPlan.flightDate || new Date().toISOString().split('T')[0];

    try {
      // 1. If we already have coordinates, fetch sun times immediately for instant responsiveness
      const currentLat = flightPlan.destination.lat ?? baseAero?.lat;
      const currentLng = flightPlan.destination.lng ?? baseAero?.lon;
      let instantSunTimes = null;
      if (currentLat !== undefined && currentLng !== undefined) {
        instantSunTimes = await fetchSunTimes(currentLat, currentLng, dateToUse);
      }

      // 2. Query OpenAIP & ephemeris
      const data = await fetchArrivalAirportData(
        baseAero?.oaci || targetOaciOrName,
        dateToUse,
        openAipApiKey
      );

      if (data) {
        const oaciCode = baseAero?.oaci || data.oaci || '';
        const displayName = baseAero
          ? `${baseAero.oaci} ${baseAero.name}`
          : (data.name
              ? (data.name.toUpperCase().includes(oaciCode) ? data.name : `${oaciCode} ${data.name}`.trim())
              : targetOaciOrName);

        const mergedFrequencies = {
          ...(baseAero?.frequencies || {}),
          ...data.frequencies,
        };

        onChange({
          ...flightPlan,
          destination: {
            ...flightPlan.destination,
            name: displayName,
            oaci: oaciCode,
            coordinates: data.elevationFt
              ? `Alt ${data.elevationFt}ft`
              : baseAero?.elevationFt
              ? `Alt ${baseAero.elevationFt}ft`
              : '',
            elevationFt: data.elevationFt ?? baseAero?.elevationFt,
            runways: data.runways || baseAero?.runways || '',
            tdpQnhFt: data.tdpQnhFt || '',
            integration: '',
            notes: flightPlan.destination.tableNotes || '',
            tableNotes: flightPlan.destination.tableNotes || '',
            frequencies: mergedFrequencies,
            lat: data.lat ?? baseAero?.lat,
            lng: data.lng ?? baseAero?.lon,
            sunriseUtc: data.sunriseUtc || instantSunTimes?.sunriseUtc,
            sunriseLocal: data.sunriseLocal || instantSunTimes?.sunriseLocal,
            sunsetUtc: data.sunsetUtc || instantSunTimes?.sunsetUtc,
            sunsetLocal: data.sunsetLocal || instantSunTimes?.sunsetLocal,
            vfrDayStartUtc: data.vfrDayStartUtc || instantSunTimes?.vfrDayStartUtc,
            vfrDayStartLocal: data.vfrDayStartLocal || instantSunTimes?.vfrDayStartLocal,
            vfrDayEndUtc: data.vfrDayEndUtc || instantSunTimes?.vfrDayEndUtc,
            vfrDayEndLocal: data.vfrDayEndLocal || instantSunTimes?.vfrDayEndLocal,
          },
          destinationSunriseLocal: data.sunriseLocal || instantSunTimes?.sunriseLocal,
          destinationSunsetLocal: data.sunsetLocal || instantSunTimes?.sunsetLocal,
        });
      } else if (baseAero) {
        onChange({
          ...flightPlan,
          destination: {
            ...flightPlan.destination,
            name: `${baseAero.oaci} ${baseAero.name}`,
            oaci: baseAero.oaci,
            coordinates: baseAero.elevationFt ? `Alt ${baseAero.elevationFt}ft` : '',
            elevationFt: baseAero.elevationFt,
            runways: baseAero.runways || '',
            notes: flightPlan.destination.tableNotes || '',
            tableNotes: flightPlan.destination.tableNotes || '',
            frequencies: baseAero.frequencies,
            lat: baseAero.lat,
            lng: baseAero.lon,
            sunriseUtc: instantSunTimes?.sunriseUtc,
            sunriseLocal: instantSunTimes?.sunriseLocal,
            sunsetUtc: instantSunTimes?.sunsetUtc,
            sunsetLocal: instantSunTimes?.sunsetLocal,
            vfrDayStartUtc: instantSunTimes?.vfrDayStartUtc,
            vfrDayStartLocal: instantSunTimes?.vfrDayStartLocal,
            vfrDayEndUtc: instantSunTimes?.vfrDayEndUtc,
            vfrDayEndLocal: instantSunTimes?.vfrDayEndLocal,
          },
          destinationSunriseLocal: instantSunTimes?.sunriseLocal,
          destinationSunsetLocal: instantSunTimes?.sunsetLocal,
        });
      }
    } catch (err) {
      console.error('Error fetching arrival airport data:', err);
    } finally {
      setIsLoadingArrivalData(false);
    }
  };

  // Synchronize ephemeris on mount or when flight date / destination is set without sunset
  useEffect(() => {
    const destOaci = flightPlan.destination.oaci || '';
    const destName = flightPlan.destination.name || '';
    if ((destOaci || destName) && !flightPlan.destination.sunsetLocal) {
      const local = FRENCH_AERODROMES.find((a) => a.oaci.toUpperCase() === destOaci.toUpperCase());
      triggerFetchArrivalData(destOaci || destName, local);
    }
  }, [flightPlan.flightDate]);

  // Destination Select: immediately update flight plan state for instant VAC refresh, then fetch OpenAIP
  const handleSelectDestination = (aero: AerodromeInfo) => {
    const oaciCode = aero.oaci || '';
    const initialName = aero.oaci ? `${aero.oaci} ${aero.name}` : aero.name;

    // 1. Instant update of VAC data in state
    onChange({
      ...flightPlan,
      destination: {
        ...flightPlan.destination,
        name: initialName,
        oaci: oaciCode,
        coordinates: aero.elevationFt ? `Alt ${aero.elevationFt}ft` : '',
        elevationFt: aero.elevationFt,
        runways: aero.runways || '',
        notes: '',
        tableNotes: '',
        frequencies: aero.frequencies,
        lat: aero.lat,
        lng: aero.lon,
      },
    });

    // 2. Fetch remote OpenAIP & ephemeris data
    triggerFetchArrivalData(oaciCode || aero.name, aero);
  };

  // Destination manual text change
  const handleDestinationTextChange = (text: string) => {
    onChange({
      ...flightPlan,
      destination: {
        ...flightPlan.destination,
        name: text,
      },
    });
  };

  // Add a Waypoint - values alt, rm, dist, ete are empty by default
  const handleAddWaypoint = (type: WaypointType) => {
    const newId = `wp-${Date.now()}`;

    const newWp: Waypoint = {
      id: newId,
      type,
      name: '',
      notes: '',
      tableNotes: '',
    };

    // New leg between this waypoint and the next point
    const newLeg: NavLeg = {
      id: `leg-${Date.now()}`,
      alt: '',
      rm: '',
      dist: '',
      ete: '',
      temps: '',
      eta: '',
      consoTotale: '',
      notes: '',
    };

    const newWaypoints = [...flightPlan.waypoints, newWp];
    const newLegs = [...flightPlan.legs, newLeg];

    onChange({
      ...flightPlan,
      waypoints: newWaypoints,
      legs: newLegs,
    });
  };

  // Delete Waypoint
  const handleDeleteWaypoint = (index: number) => {
    const newWaypoints = [...flightPlan.waypoints];
    newWaypoints.splice(index, 1);

    const newLegs = [...flightPlan.legs];
    if (newLegs.length > newWaypoints.length + 1) {
      newLegs.splice(index + 1, 1);
    }

    onChange({
      ...flightPlan,
      waypoints: newWaypoints,
      legs: newLegs,
    });
  };

  // Move Waypoint Up
  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newWps = [...flightPlan.waypoints];
    const tempWp = newWps[index];
    newWps[index] = newWps[index - 1];
    newWps[index - 1] = tempWp;

    const newLegs = [...flightPlan.legs];
    if (newLegs[index] && newLegs[index - 1]) {
      const tempLeg = newLegs[index];
      newLegs[index] = newLegs[index - 1];
      newLegs[index - 1] = tempLeg;
    }

    onChange({
      ...flightPlan,
      waypoints: newWps,
      legs: newLegs,
    });
  };

  // Move Waypoint Down
  const handleMoveDown = (index: number) => {
    if (index >= flightPlan.waypoints.length - 1) return;
    const newWps = [...flightPlan.waypoints];
    const tempWp = newWps[index];
    newWps[index] = newWps[index + 1];
    newWps[index + 1] = tempWp;

    const newLegs = [...flightPlan.legs];
    if (newLegs[index + 1] && newLegs[index + 2]) {
      const tempLeg = newLegs[index + 1];
      newLegs[index + 1] = newLegs[index + 2];
      newLegs[index + 2] = tempLeg;
    }

    onChange({
      ...flightPlan,
      waypoints: newWps,
      legs: newLegs,
    });
  };

  // Waypoint Name & Notes edit
  const handleWaypointChange = (index: number, field: keyof Waypoint, val: any) => {
    const newWps = [...flightPlan.waypoints];
    newWps[index] = {
      ...newWps[index],
      [field]: val,
    };
    onChange({
      ...flightPlan,
      waypoints: newWps,
    });
  };

  // Change a leg field (alt, rm, dist, tSansVw, tAvecVw, eta, ata, notes)
  const handleLegChange = (index: number, field: keyof NavLeg, value: string) => {
    const updatedLegs = [...flightPlan.legs];
    while (updatedLegs.length <= index) {
      updatedLegs.push({
        id: `leg-${updatedLegs.length}`,
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
        notes: '',
      });
    }

    updatedLegs[index] = {
      ...updatedLegs[index],
      [field]: value,
      ...(field === 'tSansVw' ? { ete: value, temps: value } : {}),
      ...(field === 'ete' ? { tSansVw: value, temps: value } : {}),
    };

    let updatedWaypoints = flightPlan.waypoints;
    let updatedDestination = flightPlan.destination;

    if (field === 'notes') {
      if (index < flightPlan.waypoints.length) {
        updatedWaypoints = flightPlan.waypoints.map((wp, i) =>
          i === index ? { ...wp, tableNotes: value } : wp
        );
      } else {
        updatedDestination = {
          ...flightPlan.destination,
          tableNotes: value,
          notes: value,
        };
      }
    }

    onChange({
      ...flightPlan,
      waypoints: updatedWaypoints,
      destination: updatedDestination,
      legs: updatedLegs,
    });
  };

  // Calculations for total navigation summary
  const parseNum = (val?: string) => {
    if (!val) return 0;
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
  };

  const computedDist = flightPlan.legs.reduce((acc, leg) => acc + parseNum(leg.dist), 0);
  const computedEteMin = flightPlan.legs.reduce(
    (acc, leg) => acc + parseNum(leg.ete || leg.temps),
    0
  );
  const flightConso = Math.round(((computedEteMin / 60) * flightPlan.fuelPerHour) * 10) / 10;
  const taxiConso = flightPlan.taxiFuel || 3;
  const computedConsoLiters = Math.round((flightConso + taxiConso) * 10) / 10;

  // Reset : vider toutes les infos incluant les données de l'avion et afficher la date du jour
  const handleReset = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayDateStr = `${yyyy}-${mm}-${dd}`;

    onChange({
      aircraftModel: '',
      aircraftReg: '',
      fuelPerHour: 0,
      cruiseSpeedKt: 0,
      fuelOnBoard: 0,
      taxiFuel: 0,
      reserveMin: 0,
      flightDate: todayDateStr,
      altimeterQnh: '',
      windInfo: '',
      squawk: '',
      totalDistOverride: '',
      totalEteOverride: '',
      totalConsoOverride: '',
      departure: {
        id: `dep-${Date.now()}`,
        type: 'aerodrome',
        name: '',
        oaci: '',
        coordinates: '',
        notes: '',
        tableNotes: '',
        frequencies: {
          atis: '',
          twr: '',
          siv: '',
        },
      },
      destination: {
        id: `dest-${Date.now()}`,
        type: 'aerodrome',
        name: '',
        oaci: '',
        coordinates: '',
        notes: '',
        tableNotes: '',
      },
      waypoints: [
        {
          id: `wp-1-${Date.now()}`,
          type: 'custom',
          name: '',
          notes: '',
          tableNotes: '',
        },
      ],
      legs: [
        {
          id: 'leg-0',
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
          notes: '',
        },
        {
          id: 'leg-1',
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
          notes: '',
        },
      ],
      departureTime: '',
      generalNotes: '',
      destinationSunriseLocal: '',
      destinationSunsetLocal: '',
    });
  };

  const getLeg = (index: number): NavLeg => {
    return (
      flightPlan.legs[index] || {
        id: `leg-${index}`,
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
        notes: '',
      }
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 text-slate-800 space-y-4">
      {/* 1. TOP HEADER: Paramétrage direct & Box Totaux (Dist Tot / ETE Tot / Conso Tot) */}
      <div className="flex flex-col gap-2 pb-3 border-b border-slate-100">
        {/* Ligne 1 : Avion, Conso, Vitesse propre & Date sur une seule ligne */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-nowrap overflow-x-auto pb-0.5">
          {/* 1. Avion : Modèle | Immatriculation */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 hover:bg-slate-100/90 border border-slate-300 rounded-lg text-xs shadow-2xs transition-all shrink-0">
            <Plane className="w-3.5 h-3.5 text-sky-600 shrink-0" />
            <input
              type="text"
              value={flightPlan.aircraftModel || ''}
              onChange={(e) => handleAircraftChange('aircraftModel', e.target.value)}
              placeholder="—"
              className="w-12 font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded px-1 py-0.5 text-center text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none placeholder:text-slate-400 placeholder:font-normal"
              title="Cliquer pour changer le modèle d'avion"
            />
            <span className="text-slate-400 font-normal select-none">|</span>
            <input
              type="text"
              value={flightPlan.aircraftReg || ''}
              onChange={(e) => handleAircraftChange('aircraftReg', e.target.value.toUpperCase())}
              placeholder="—"
              className="w-16 font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded px-1 py-0.5 text-center text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none uppercase placeholder:text-slate-400 placeholder:font-normal"
              title="Cliquer pour changer l'immatriculation"
            />
          </div>

          {/* 2. Conso (sans flèches d'incrément, chiffres uniquement) */}
          <div className="flex items-center gap-1 px-2 py-1 bg-slate-50 hover:bg-slate-100/90 border border-slate-300 rounded-lg text-xs shadow-2xs transition-all shrink-0">
            <Fuel className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <input
              type="text"
              inputMode="numeric"
              value={flightPlan.fuelPerHour ? String(flightPlan.fuelPerHour) : ''}
              onChange={(e) => {
                const clean = e.target.value.replace(/[^0-9.]/g, '');
                handleAircraftChange('fuelPerHour', clean === '' ? 0 : parseFloat(clean) || 0);
              }}
              placeholder="—"
              className="w-9 font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded px-1 py-0.5 text-center text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none placeholder:text-slate-400 placeholder:font-normal"
              title="Consommation horaire en L/h (chiffres uniquement)"
            />
            <span className="text-slate-500 font-normal text-[11px]">L/h</span>
          </div>

          {/* 3. Vitesse propre (sans flèches d'incrément, chiffres uniquement) */}
          <div className="flex items-center gap-1 px-2 py-1 bg-slate-50 hover:bg-slate-100/90 border border-slate-300 rounded-lg text-xs shadow-2xs transition-all shrink-0">
            <Gauge className="w-3.5 h-3.5 text-sky-600 shrink-0" />
            <input
              type="text"
              inputMode="numeric"
              value={flightPlan.cruiseSpeedKt ? String(flightPlan.cruiseSpeedKt) : ''}
              onChange={(e) => {
                const clean = e.target.value.replace(/[^0-9]/g, '');
                handleAircraftChange('cruiseSpeedKt', clean === '' ? 0 : parseInt(clean, 10) || 0);
              }}
              placeholder="—"
              className="w-9 font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded px-1 py-0.5 text-center text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none placeholder:text-slate-400 placeholder:font-normal"
              title="Vitesse propre en kt (chiffres uniquement)"
            />
            <span className="text-slate-500 font-normal text-[11px]">kt</span>
          </div>

          {/* 4. Date du vol - uniquement le picto bleu, le picto noir est retiré */}
          <div
            onClick={() => {
              try {
                dateInputRef.current?.showPicker?.();
              } catch {
                dateInputRef.current?.focus();
              }
            }}
            className="relative flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs shadow-2xs hover:border-slate-400 hover:bg-slate-50 transition-colors cursor-pointer select-none shrink-0"
            title="Cliquer pour choisir la date de vol"
          >
            <Calendar className="w-3.5 h-3.5 text-sky-600 shrink-0 pointer-events-none" />
            <span className="text-[10px] text-slate-500 font-semibold uppercase pointer-events-none">Date :</span>
            <span className="text-xs font-bold text-slate-900 pointer-events-none font-sans">
              {formatFrenchDate(flightPlan.flightDate)}
            </span>

            <input
              ref={dateInputRef}
              type="date"
              id="header-flight-date-input"
              value={flightPlan.flightDate || ''}
              onChange={(e) => handleAircraftChange('flightDate', e.target.value)}
              onClick={(e) => {
                try {
                  (e.target as HTMLInputElement).showPicker?.();
                } catch {}
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 date-picker-full-hit"
              aria-label="Date du vol"
            />
          </div>
        </div>

        {/* Ligne 2 : Box Totaux (Dist Tot / ETE Tot / Conso Tot) & Bouton Défaut au bout de la flèche */}
        <div className="flex items-center gap-2.5 flex-wrap pt-0.5">
          {/* Box Dist Tot */}
          <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 hover:bg-slate-100/90 border border-slate-300 rounded-lg text-xs shadow-2xs transition-all">
            <span className="font-bold text-slate-800 text-[11px] select-none">Dist Tot</span>
            <input
              type="text"
              inputMode="numeric"
              value={flightPlan.totalDistOverride !== undefined ? flightPlan.totalDistOverride : (computedDist > 0 ? `${computedDist}` : '')}
              onChange={(e) => {
                const clean = e.target.value.replace(/[^0-9.]/g, '');
                handleAircraftChange('totalDistOverride', clean);
              }}
              placeholder={computedDist > 0 ? `${computedDist}` : '—'}
              className="w-12 font-mono font-normal text-slate-900 bg-white border border-slate-300 rounded px-1.5 py-0.5 text-center text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
              title="Distance totale (NM) - modifiable, remplit le récap du log"
            />
            <span className="text-slate-500 font-normal text-[11px]">NM</span>
          </div>

          {/* Box ETE Tot */}
          <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 hover:bg-slate-100/90 border border-slate-300 rounded-lg text-xs shadow-2xs transition-all">
            <span className="font-bold text-slate-800 text-[11px] select-none">ETE Tot</span>
            <input
              type="text"
              inputMode="numeric"
              value={flightPlan.totalEteOverride !== undefined ? flightPlan.totalEteOverride : (computedEteMin > 0 ? `${computedEteMin}` : '')}
              onChange={(e) => {
                const clean = e.target.value.replace(/[^0-9]/g, '');
                handleAircraftChange('totalEteOverride', clean);
              }}
              placeholder={computedEteMin > 0 ? `${computedEteMin}` : '—'}
              className="w-12 font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded px-1.5 py-0.5 text-center text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
              title="ETE totale - modifiable, remplit le récap du log (sans min)"
            />
          </div>

          {/* Box Conso Tot */}
          <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 hover:bg-slate-100/90 border border-slate-300 rounded-lg text-xs shadow-2xs transition-all">
            <span className="font-bold text-slate-800 text-[11px] select-none">Conso Tot</span>
            <input
              type="text"
              inputMode="numeric"
              value={flightPlan.totalConsoOverride !== undefined ? flightPlan.totalConsoOverride : (computedEteMin > 0 ? `${computedConsoLiters}` : '')}
              onChange={(e) => {
                const clean = e.target.value.replace(/[^0-9.]/g, '');
                handleAircraftChange('totalConsoOverride', clean);
              }}
              placeholder={computedEteMin > 0 ? `${computedConsoLiters}` : '—'}
              className="w-12 font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded px-1.5 py-0.5 text-center text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
              title="Consommation totale (L) - modifiable, remplit le récap du log"
            />
            <span className="text-slate-500 font-normal text-[11px]">L</span>
          </div>

          {/* Bouton Reset déplacé au bout de la flèche orange */}
          <button
            type="button"
            id="reset-flight-plan-btn"
            onClick={handleReset}
            className="ml-2 text-[11px] text-slate-400 hover:text-slate-700 flex items-center gap-1 transition-colors px-2 py-1 rounded hover:bg-slate-100 cursor-pointer"
            title="Reset : vider toutes les informations (avion, tronçons, notes) et afficher la date du jour"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Optional Collapsible Aircraft Settings (kept neat & out of the way) */}
      {showAircraftSettings && (
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-900 text-xs">Paramètres détaillés de l'appareil</span>
            <button
              type="button"
              onClick={() => setShowAircraftSettings(false)}
              className="text-[10px] text-slate-500 hover:underline"
            >
              Fermer
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div>
              <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                Modèle Avion
              </label>
              <input
                type="text"
                id="aircraft-model-input"
                value={flightPlan.aircraftModel}
                onChange={(e) => handleAircraftChange('aircraftModel', e.target.value)}
                placeholder="P200"
                className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                Immatriculation
              </label>
              <input
                type="text"
                id="aircraft-reg-input"
                value={flightPlan.aircraftReg}
                onChange={(e) => handleAircraftChange('aircraftReg', e.target.value.toUpperCase())}
                placeholder="F-HXYZ"
                className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono font-semibold"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                Conso (L/h)
              </label>
              <input
                type="number"
                id="fuel-per-hour-input"
                step="0.5"
                value={flightPlan.fuelPerHour}
                onChange={(e) =>
                  handleAircraftChange('fuelPerHour', parseFloat(e.target.value) || 0)
                }
                className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-bold"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                Vitesse Vp (kt)
              </label>
              <input
                type="number"
                id="cruise-speed-input"
                value={flightPlan.cruiseSpeedKt}
                onChange={(e) =>
                  handleAircraftChange('cruiseSpeedKt', parseInt(e.target.value) || 90)
                }
                className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-200">
            <div>
              <span className="text-[10px] text-slate-500 block mb-0.5">Carburant à bord (L)</span>
              <input
                type="number"
                id="fuel-onboard-input"
                value={flightPlan.fuelOnBoard}
                onChange={(e) =>
                  handleAircraftChange('fuelOnBoard', parseFloat(e.target.value) || 0)
                }
                className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs font-semibold"
              />
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block mb-0.5">Réserve VFR (min)</span>
              <input
                type="number"
                id="reserve-min-input"
                value={flightPlan.reserveMin}
                onChange={(e) =>
                  handleAircraftChange('reserveMin', parseInt(e.target.value) || 30)
                }
                className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs font-semibold"
              />
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block mb-0.5">Date de vol</span>
              <input
                type="date"
                id="flight-date-input"
                value={flightPlan.flightDate}
                onChange={(e) => handleAircraftChange('flightDate', e.target.value)}
                className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs"
              />
            </div>
          </div>
        </div>
      )}

      {/* 2. ITINERARY LIST: ÉTAPES & BRANCHES MERGÉES */}
      <div className="space-y-0">
        {/* --- DÉPART (Origine) --- */}
        <div className="border-2 border-sky-600 ring-1 ring-sky-700/30 bg-white rounded-xl shadow-xs overflow-hidden">
          {/* En-tête Départ */}
          <div className="p-3 bg-sky-50/40 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-sky-600 text-white font-bold text-xs shadow-2xs">
                  <MapPin className="w-3.5 h-3.5 text-white fill-white" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-sky-950 flex items-center gap-1.5 font-mono">
                  <span className="text-slate-700">Départ</span>
                  <span className="text-slate-400 font-sans">=&gt;</span>
                  <span className="text-sky-950 font-extrabold">PON</span>
                </span>
              </div>
              {flightPlan.departure.oaci && (
                <span className="text-[10px] font-mono font-bold bg-sky-100 text-sky-800 px-2 py-0.5 rounded border border-sky-200">
                  {flightPlan.departure.oaci}
                </span>
              )}
            </div>

            <AerodromeSearchInput
              id="departure-search-input"
              value={flightPlan.departure.name}
              placeholder="Recherche OACI ou Nom (ex: LFPX, Chavenay)..."
              onSelect={handleSelectDeparture}
              onChangeText={(text) => {
                onChange({
                  ...flightPlan,
                  departure: {
                    ...flightPlan.departure,
                    name: text,
                  },
                });
              }}
              openAipApiKey={openAipApiKey}
            />
          </div>
        </div>

        {/* Connecteur vers la suite */}
        <div className="flex justify-center py-1.5">
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 border border-slate-300 text-slate-500">
            <ArrowDown className="w-3 h-3" />
          </div>
        </div>

        {/* --- WAYPOINTS LOOP (Étapes intermédiaires) --- */}
        {flightPlan.waypoints.map((wp, wpIndex) => {
          const isAero = wp.type === 'aerodrome';
          const prevLabel =
            wpIndex === 0
              ? 'PON'
              : flightPlan.waypoints[wpIndex - 1]?.name?.trim() || `WP ${wpIndex}`;
          const currentLabel = wp.name?.trim() || `WP ${wpIndex + 1}`;
          const legIndex = wpIndex;
          const leg = getLeg(legIndex);

          return (
            <React.Fragment key={wp.id}>
              {/* Carte Étape + Paramètres de Branche intégrés */}
              <div
                className={`border-2 ${
                  isAero
                    ? 'border-sky-600 ring-1 ring-sky-700/30 bg-white'
                    : 'border-slate-700 ring-1 ring-slate-800/30 hover:border-slate-900 bg-white'
                } rounded-xl shadow-xs transition-colors overflow-hidden`}
              >
                {/* Section Point de passage / Étape */}
                <div className={`p-3 ${isAero ? 'bg-sky-50/40' : 'bg-slate-100/70'} rounded-t-[10px]`}>
                  <div className="flex items-center justify-between gap-1 mb-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex items-center justify-center w-6 h-6 rounded-full font-bold text-xs shadow-2xs ${
                          isAero ? 'bg-sky-600 text-white' : 'bg-slate-900 text-white'
                        }`}
                      >
                        {wpIndex + 1}
                      </div>
                      <span
                        className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 font-mono ${
                          isAero ? 'text-sky-950' : 'text-slate-950'
                        }`}
                      >
                        <span className="text-slate-700">{prevLabel}</span>
                        <span className="text-slate-400 font-sans">=&gt;</span>
                        <span className="font-extrabold">{currentLabel}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-0.5">
                      {isAero && wp.oaci && (
                        <span className="text-[10px] font-mono font-bold bg-sky-100 text-sky-800 px-2 py-0.5 rounded border border-sky-200 mr-1">
                          {wp.oaci}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleMoveUp(wpIndex)}
                        disabled={wpIndex === 0}
                        className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer"
                        title="Monter cette étape"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveDown(wpIndex)}
                        disabled={wpIndex === flightPlan.waypoints.length - 1}
                        className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer"
                        title="Descendre cette étape"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteWaypoint(wpIndex)}
                        className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                        title="Supprimer cette étape"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Input for name */}
                  {isAero ? (
                    <AerodromeSearchInput
                      id={`wp-${wp.id}-search`}
                      value={wp.name}
                      placeholder="Recherche OACI ou Nom aérodrome (ex: LFPX, LFOP)..."
                      onSelect={(aero, notes) => {
                        handleWaypointChange(wpIndex, 'name', `${aero.oaci} ${aero.name}`);
                        handleWaypointChange(wpIndex, 'oaci', aero.oaci);
                        handleWaypointChange(wpIndex, 'notes', notes);
                        handleWaypointChange(wpIndex, 'frequencies', aero.frequencies);
                      }}
                      onChangeText={(text) => handleWaypointChange(wpIndex, 'name', text)}
                      openAipApiKey={openAipApiKey}
                    />
                  ) : (
                    <input
                      type="text"
                      id={`wp-${wp.id}-name-input`}
                      value={wp.name}
                      onChange={(e) => handleWaypointChange(wpIndex, 'name', e.target.value)}
                      placeholder="Nom du waypoint personnalisé..."
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:ring-1 focus:ring-slate-700"
                    />
                  )}
                </div>

                {/* Section Paramètres de Branche intégrés (RM, DIST, ALTITUDE, T sans/avec Vw, Notes) */}
                <div
                  className={`border-t ${
                    isAero ? 'border-sky-200/80 bg-sky-50/20' : 'border-slate-200 bg-slate-50/80'
                  } p-2.5 rounded-b-[10px]`}
                >
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <div>
                      <label className="block text-[8.5px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                        RM (°)
                      </label>
                      <input
                        type="text"
                        id={`leg-${legIndex}-rm`}
                        value={leg.rm || ''}
                        onChange={(e) => handleLegChange(legIndex, 'rm', e.target.value)}
                        placeholder="ex: 292°"
                        className={`w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono font-medium focus:ring-1 ${
                          isAero ? 'focus:ring-sky-500' : 'focus:ring-slate-700'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-[8.5px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                        DIST (NM)
                      </label>
                      <input
                        type="text"
                        id={`leg-${legIndex}-dist`}
                        value={leg.dist || ''}
                        onChange={(e) => handleLegChange(legIndex, 'dist', e.target.value)}
                        placeholder="ex: 14"
                        className={`w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono font-medium focus:ring-1 ${
                          isAero ? 'focus:ring-sky-500' : 'focus:ring-slate-700'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-[8.5px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                        Altitude
                      </label>
                      <input
                        type="text"
                        id={`leg-${legIndex}-alt`}
                        value={leg.alt || ''}
                        onChange={(e) => handleLegChange(legIndex, 'alt', e.target.value)}
                        placeholder="ex: 2000 ft"
                        className={`w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono font-medium focus:ring-1 ${
                          isAero ? 'focus:ring-sky-500' : 'focus:ring-slate-700'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <label className="block text-[8.5px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                        T sans Vw (min)
                      </label>
                      <input
                        type="text"
                        id={`leg-${legIndex}-tSansVw`}
                        value={leg.tSansVw ?? leg.ete ?? leg.temps ?? ''}
                        onChange={(e) => handleLegChange(legIndex, 'tSansVw', e.target.value)}
                        placeholder="ex: 12"
                        className={`w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono font-medium focus:ring-1 ${
                          isAero ? 'focus:ring-sky-500' : 'focus:ring-slate-700'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-[8.5px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                        T avec Vw (min)
                      </label>
                      <input
                        type="text"
                        id={`leg-${legIndex}-tAvecVw`}
                        value={leg.tAvecVw || ''}
                        onChange={(e) => handleLegChange(legIndex, 'tAvecVw', e.target.value)}
                        placeholder="ex: 14"
                        className={`w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono font-medium focus:ring-1 ${
                          isAero ? 'focus:ring-sky-500' : 'focus:ring-slate-700'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Box Notes */}
                  <div>
                    <label
                      className={`block text-[8.5px] font-bold uppercase tracking-wider mb-0.5 ${
                        isAero ? 'text-sky-900' : 'text-slate-600'
                      }`}
                    >
                      Notes
                    </label>
                    <input
                      type="text"
                      id={`leg-${legIndex}-notes`}
                      value={leg.notes || wp.tableNotes || ''}
                      onChange={(e) => handleLegChange(legIndex, 'notes', e.target.value)}
                      placeholder="Notes (remplit la colonne Notes du log de nav)..."
                      className={`w-full px-2 py-1 bg-white border rounded text-xs font-mono font-medium focus:ring-1 ${
                        isAero
                          ? 'border-sky-300 focus:ring-sky-500'
                          : 'border-slate-300 focus:ring-slate-700'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Connecteur vers l'étape suivante */}
              <div className="flex justify-center py-1.5">
                <div className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 border border-slate-300 text-slate-500">
                  <ArrowDown className="w-3 h-3" />
                </div>
              </div>
            </React.Fragment>
          );
        })}

        {/* --- BOUTONS AJOUT D'ÉTAPE --- */}
        <div className="flex justify-center py-2 mb-1">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Bouton Aérodrome : + en bleu clair, bordure bleue comme Départ, box bleue */}
            <button
              type="button"
              id="add-wp-aerodrome-btn"
              onClick={() => handleAddWaypoint('aerodrome')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white hover:bg-sky-50 text-sky-950 rounded-lg border-2 border-sky-600 ring-1 ring-sky-700/30 text-xs font-bold shadow-xs transition-all cursor-pointer"
            >
              <span className="text-sky-500 font-extrabold text-sm leading-none">+</span>
              <Building2 className="w-3.5 h-3.5 text-sky-600" />
              <span>Aérodrome</span>
            </button>

            {/* Bouton Waypoint personnalisé : + picto pin map, charte noire comme étape noir */}
            <button
              type="button"
              id="add-wp-custom-btn"
              onClick={() => handleAddWaypoint('custom')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-900 rounded-lg border-2 border-slate-700 ring-1 ring-slate-800/30 text-xs font-bold shadow-xs transition-all cursor-pointer"
            >
              <span className="text-slate-500 font-extrabold text-sm leading-none">+</span>
              <MapPin className="w-3.5 h-3.5 text-slate-900" />
              <span>Waypoint personnalisé</span>
            </button>
          </div>
        </div>

        {/* Connecteur vers l'arrivée */}
        <div className="flex justify-center py-1">
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 border border-slate-300 text-slate-500">
            <ArrowDown className="w-3 h-3" />
          </div>
        </div>

        {/* --- STEP FINAL: ARRIVÉE (Destination) --- */}
        {(() => {
          const prevPointName =
            flightPlan.waypoints.length > 0
              ? flightPlan.waypoints[flightPlan.waypoints.length - 1]?.name?.trim() || `WP ${flightPlan.waypoints.length}`
              : 'PON';
          const currentPointName = flightPlan.destination.name?.trim() || 'Arrivée';
          const destLegIndex = flightPlan.waypoints.length;
          const destLeg = getLeg(destLegIndex);

          return (
            <div className="border-2 border-sky-600 ring-1 ring-sky-700/30 bg-white rounded-xl shadow-xs overflow-hidden">
              <div className="p-3 bg-sky-50/40 rounded-t-[10px]">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-sky-600 text-white font-bold text-xs shadow-2xs">
                      <MapPin className="w-3.5 h-3.5 text-white fill-white" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider text-sky-950 flex items-center gap-1.5 font-mono">
                      <span className="text-slate-700">{prevPointName}</span>
                      <span className="text-slate-400 font-sans">=&gt;</span>
                      <span className="text-sky-950 font-extrabold">{currentPointName}</span>
                    </span>
                  </div>
                  {flightPlan.destination.oaci && (
                    <span className="text-[10px] font-mono font-bold bg-sky-100 text-sky-800 px-2 py-0.5 rounded border border-sky-200">
                      {flightPlan.destination.oaci}
                    </span>
                  )}
                </div>

                <div>
                  <AerodromeSearchInput
                    id="destination-search-input"
                    value={flightPlan.destination.name}
                    placeholder="Entrer aéroclub/destination (ex: LFOP Rouen, LFRG Deauville)..."
                    onSelect={handleSelectDestination}
                    onChangeText={handleDestinationTextChange}
                    openAipApiKey={openAipApiKey}
                    isLoading={isLoadingArrivalData}
                  />
                </div>
              </div>

              {/* Section Paramètres de Branche de destination (RM, DIST, ALTITUDE, T sans/avec Vw, Notes) */}
              <div className="border-t border-sky-200/80 bg-sky-50/20 p-2.5 rounded-b-[10px]">
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div>
                    <label className="block text-[8.5px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                      RM (°)
                    </label>
                    <input
                      type="text"
                      id={`leg-${destLegIndex}-rm`}
                      value={destLeg.rm || ''}
                      onChange={(e) => handleLegChange(destLegIndex, 'rm', e.target.value)}
                      placeholder="ex: 292°"
                      className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono font-medium focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[8.5px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                      DIST (NM)
                    </label>
                    <input
                      type="text"
                      id={`leg-${destLegIndex}-dist`}
                      value={destLeg.dist || ''}
                      onChange={(e) => handleLegChange(destLegIndex, 'dist', e.target.value)}
                      placeholder="ex: 14"
                      className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono font-medium focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[8.5px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                      Altitude
                    </label>
                    <input
                      type="text"
                      id={`leg-${destLegIndex}-alt`}
                      value={destLeg.alt || ''}
                      onChange={(e) => handleLegChange(destLegIndex, 'alt', e.target.value)}
                      placeholder="ex: 2000 ft"
                      className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono font-medium focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="block text-[8.5px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                      T sans Vw (min)
                    </label>
                    <input
                      type="text"
                      id={`leg-${destLegIndex}-tSansVw`}
                      value={destLeg.tSansVw ?? destLeg.ete ?? destLeg.temps ?? ''}
                      onChange={(e) => handleLegChange(destLegIndex, 'tSansVw', e.target.value)}
                      placeholder="ex: 12"
                      className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono font-medium focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[8.5px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                      T avec Vw (min)
                    </label>
                    <input
                      type="text"
                      id={`leg-${destLegIndex}-tAvecVw`}
                      value={destLeg.tAvecVw || ''}
                      onChange={(e) => handleLegChange(destLegIndex, 'tAvecVw', e.target.value)}
                      placeholder="ex: 14"
                      className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono font-medium focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                </div>

                {/* Box Notes */}
                <div>
                  <label className="block text-[8.5px] font-bold uppercase tracking-wider text-sky-900 mb-0.5">
                    Notes
                  </label>
                  <input
                    type="text"
                    id="destination-table-notes-input"
                    value={destLeg.notes || flightPlan.destination.tableNotes || flightPlan.destination.notes || ''}
                    onChange={(e) => handleLegChange(destLegIndex, 'notes', e.target.value)}
                    placeholder="Notes (remplit la colonne Notes du log de nav)..."
                    className="w-full px-2 py-1 bg-white border border-sky-300 rounded text-xs font-mono font-medium focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};
