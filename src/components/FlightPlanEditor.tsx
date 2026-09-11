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
import { AerodromeIndexEntry, FRENCH_AERODROMES } from '../data/aerodromes';
import { truncateWpName, truncateDepartureName } from '../lib/formatters';
import { getAirfieldVacLink, resolveAirfieldVac } from '../services/sia';

interface FlightPlanEditorProps {
  flightPlan: FlightPlan;
  onChange: (updated: FlightPlan) => void;
  openAipApiKey?: string;
  onOpenAipApiKeyChange?: (key: string) => void;
  onLoadingChange?: (loading: boolean) => void;
  onEasterEgg?: () => void;
}

export const FlightPlanEditor: React.FC<FlightPlanEditorProps> = ({
  flightPlan,
  onChange,
  openAipApiKey,
  onOpenAipApiKeyChange,
  onLoadingChange,
  onEasterEgg,
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
      const destOpenAipId = flightPlan.destination.openAipId;
      const destOaci = flightPlan.destination.oaci || '';
      const destName = flightPlan.destination.name || '';
      if (destOpenAipId || destOaci || destName) {
        const local = destOpenAipId
          ? FRENCH_AERODROMES.find((a) => a.id === destOpenAipId)
          : FRENCH_AERODROMES.find((a) => a.oaci.toUpperCase() === destOaci.toUpperCase());
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
        openAipId: aero.openAipId,
        coordinates: aero.elevationFt ? `Alt ${aero.elevationFt}ft` : '',
        notes: defaultNotes,
        frequencies: aero.frequencies,
      },
    });
  };

  // Automated fetch of arrival airport data from OpenAIP & ephemeris from sunrise-sunset
  const triggerFetchArrivalData = async (
    targetOaciOrName: string,
    baseAero?: AerodromeInfo | AerodromeIndexEntry,
    forcedDate?: string
  ) => {
    if (!targetOaciOrName && !baseAero) return;
    setIsLoadingArrivalData(true);
    if (onLoadingChange) onLoadingChange(true);

    const dateToUse = forcedDate || flightPlan.flightDate || new Date().toISOString().split('T')[0];

    try {
      const openAipIdToUse =
        (baseAero && 'openAipId' in baseAero ? baseAero.openAipId : undefined) ||
        (baseAero && 'id' in baseAero ? baseAero.id : undefined) ||
        flightPlan.destination.openAipId ||
        FRENCH_AERODROMES.find(
          (a) =>
            a.oaci.toUpperCase() === (baseAero?.oaci || targetOaciOrName || '').trim().toUpperCase() ||
            a.name.toUpperCase() === (targetOaciOrName || '').trim().toUpperCase()
        )?.id;

      const baseLat = baseAero && 'lat' in baseAero ? baseAero.lat : undefined;
      const baseLng = baseAero && 'lon' in baseAero ? baseAero.lon : undefined;
      const baseElev = baseAero && 'elevationFt' in baseAero ? baseAero.elevationFt : undefined;
      const baseRunways = baseAero && 'runways' in baseAero ? baseAero.runways : undefined;
      const baseFreqs = baseAero && 'frequencies' in baseAero ? baseAero.frequencies : undefined;

      // 1. If we already have coordinates, fetch sun times immediately for instant responsiveness
      const currentLat = flightPlan.destination.lat ?? baseLat;
      const currentLng = flightPlan.destination.lng ?? baseLng;
      let instantSunTimes = null;
      if (currentLat !== undefined && currentLng !== undefined) {
        instantSunTimes = await fetchSunTimes(currentLat, currentLng, dateToUse);
      }

      // 2. Query OpenAIP by openAipId & ephemeris
      const data = openAipIdToUse
        ? await fetchArrivalAirportData(openAipIdToUse, dateToUse, openAipApiKey)
        : null;

      if (data) {
        const oaciCode = baseAero?.oaci || data.oaci || '';
        const displayName = baseAero
          ? `${baseAero.oaci} ${baseAero.name}`
          : (data.name
              ? (data.name.toUpperCase().includes(oaciCode) ? data.name : `${oaciCode} ${data.name}`.trim())
              : targetOaciOrName);

        const mergedFrequencies = {
          ...(baseFreqs || {}),
          ...data.frequencies,
        };

        onChange({
          ...flightPlan,
          destination: {
            ...flightPlan.destination,
            name: displayName,
            oaci: oaciCode,
            openAipId: openAipIdToUse,
            coordinates: data.elevationFt
              ? `Alt ${data.elevationFt}ft`
              : baseElev
              ? `Alt ${baseElev}ft`
              : '',
            elevationFt: data.elevationFt ?? baseElev,
            runways: data.runways || baseRunways || '',
            tdpQnhFt: data.tdpQnhFt || '',
            integration: '',
            notes: flightPlan.destination.tableNotes || '',
            tableNotes: flightPlan.destination.tableNotes || '',
            frequencies: mergedFrequencies,
            lat: data.lat ?? baseLat,
            lng: data.lng ?? baseLng,
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
            openAipId: openAipIdToUse,
            coordinates: baseElev ? `Alt ${baseElev}ft` : '',
            elevationFt: baseElev,
            runways: baseRunways || '',
            notes: flightPlan.destination.tableNotes || '',
            tableNotes: flightPlan.destination.tableNotes || '',
            frequencies: baseFreqs,
            lat: baseLat,
            lng: baseLng,
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
      } else if (instantSunTimes) {
        onChange({
          ...flightPlan,
          destination: {
            ...flightPlan.destination,
            sunriseUtc: instantSunTimes.sunriseUtc,
            sunriseLocal: instantSunTimes.sunriseLocal,
            sunsetUtc: instantSunTimes.sunsetUtc,
            sunsetLocal: instantSunTimes.sunsetLocal,
            vfrDayStartUtc: instantSunTimes.vfrDayStartUtc,
            vfrDayStartLocal: instantSunTimes.vfrDayStartLocal,
            vfrDayEndUtc: instantSunTimes.vfrDayEndUtc,
            vfrDayEndLocal: instantSunTimes.vfrDayEndLocal,
          },
          destinationSunriseLocal: instantSunTimes.sunriseLocal,
          destinationSunsetLocal: instantSunTimes.sunsetLocal,
        });
      }
    } catch (err) {
      console.error('Error fetching arrival airport data:', err);
    } finally {
      setIsLoadingArrivalData(false);
      if (onLoadingChange) onLoadingChange(false);
    }
  };

  // Synchronize ephemeris on mount or when flight date / destination is set without sunset
  useEffect(() => {
    const destOpenAipId = flightPlan.destination.openAipId;
    const destOaci = flightPlan.destination.oaci || '';
    const destName = flightPlan.destination.name || '';
    const destLat = flightPlan.destination.lat;
    const destLng = flightPlan.destination.lng;
    if (
      (destOpenAipId || destOaci || destName || (destLat !== undefined && destLng !== undefined)) &&
      !flightPlan.destination.sunsetLocal
    ) {
      const local = destOpenAipId
        ? FRENCH_AERODROMES.find((a) => a.id === destOpenAipId)
        : FRENCH_AERODROMES.find((a) => a.oaci.toUpperCase() === destOaci.toUpperCase());
      triggerFetchArrivalData(destOaci || destName, local);
    }
  }, [
    flightPlan.flightDate,
    flightPlan.destination.id,
    flightPlan.destination.openAipId,
    flightPlan.destination.oaci,
    flightPlan.destination.name,
    flightPlan.destination.lat,
    flightPlan.destination.lng,
    flightPlan.destination.sunsetLocal,
  ]);

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
        openAipId: aero.openAipId,
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

  // Atomic update for selecting an aerodrome waypoint
  const handleSelectAerodromeWaypoint = (index: number, aero: AerodromeInfo, defaultNotes: string) => {
    const fullName = aero.oaci ? `${aero.oaci} ${aero.name}`.trim() : aero.name;
    const newWps = flightPlan.waypoints.map((wp, i) => {
      if (i !== index) return wp;
      return {
        ...wp,
        name: fullName,
        oaci: aero.oaci,
        openAipId: aero.openAipId,
        notes: defaultNotes,
        frequencies: aero.frequencies,
        lat: aero.lat,
        lng: aero.lon,
        elevationFt: aero.elevationFt,
        runways: aero.runways,
      };
    });
    onChange({
      ...flightPlan,
      waypoints: newWps,
    });
  };

  // Sanitize numeric inputs for legs (RM, DIST, ALT, T sans/avec Vw)
  // Rejects negative values, letters, and symbols
  const sanitizeLegValue = (field: keyof NavLeg, raw: string): string => {
    if (field === 'notes') return raw;
    if (field === 'rm') {
      const digits = raw.replace(/[^0-9]/g, '');
      if (!digits) return '';
      const num = parseInt(digits, 10);
      if (num > 360) return '360';
      return digits;
    }
    if (field === 'alt') {
      return raw.replace(/[^0-9]/g, '');
    }
    if (field === 'dist' || field === 'tSansVw' || field === 'tAvecVw' || field === 'ete' || field === 'temps') {
      const clean = raw.replace(/[^0-9.]/g, '');
      const parts = clean.split('.');
      return parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : clean;
    }
    return raw;
  };

  // Keyboard filter to block negative '-', '+', and alphabetic characters on numeric inputs
  const handleNumericKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, allowDecimal = false) => {
    if (
      e.key === 'Backspace' ||
      e.key === 'Delete' ||
      e.key === 'Tab' ||
      e.key === 'Escape' ||
      e.key === 'Enter' ||
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowRight' ||
      e.key === 'ArrowUp' ||
      e.key === 'ArrowDown' ||
      e.key === 'Home' ||
      e.key === 'End' ||
      e.ctrlKey ||
      e.metaKey
    ) {
      return;
    }

    // Allow decimal separator (. or ,) if permitted and not already in input
    if (allowDecimal && (e.key === '.' || e.key === ',')) {
      if (!e.currentTarget.value.includes('.')) {
        return;
      }
      e.preventDefault();
      return;
    }

    // Block non-digits
    if (!/^[0-9]$/.test(e.key)) {
      e.preventDefault();
    }
  };

  // Change a leg field (alt, rm, dist, tSansVw, tAvecVw, eta, ata, notes)
  const handleLegChange = (index: number, field: keyof NavLeg, value: string) => {
    const sanitizedValue = sanitizeLegValue(field, value.replace(',', '.'));
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
      [field]: sanitizedValue,
      ...(field === 'tSansVw' ? { ete: sanitizedValue, temps: sanitizedValue } : {}),
      ...(field === 'ete' ? { tSansVw: sanitizedValue, temps: sanitizedValue } : {}),
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

  // Calculs totaux saisis à la main par le pilote (ne font pas la somme des infos waypoints)
  const manualEteMin = parseFloat(flightPlan.totalEteOverride || '0') || 0;
  const flightConso = Math.round(((manualEteMin / 60) * flightPlan.fuelPerHour) * 10) / 10;
  const taxiConso = flightPlan.taxiFuel || 3;
  const computedConsoLiters = manualEteMin > 0 && flightPlan.fuelPerHour > 0 ? Math.round((flightConso + taxiConso) * 10) / 10 : 0;

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
      waypoints: [],
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
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-3.5 sm:p-4 text-slate-800 space-y-4">
      {/* 1. TOP HEADER: Paramétrage direct & Box Totaux (Dist Tot / ETE Tot / Conso Tot) */}
      <div className="flex flex-col gap-2 pb-3 border-b border-slate-100">
        {/* Paramètres appareil : sur desktop 1 seule ligne, sur mobile 2 lignes (Ligne 1: Avion, Conso / Ligne 2: Vitesse, Date) sans scrollbar */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 sm:gap-2">
          {/* Ligne 1 sur mobile : Avion (Modèle | Immatriculation) + Conso */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* 1. Avion : Modèle | Immatriculation */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 hover:bg-slate-100/90 border border-slate-300 rounded-lg text-xs shadow-2xs transition-all shrink-0">
              <button
                type="button"
                id="easter-egg-plane-btn"
                onClick={onEasterEgg}
                className="hover:scale-110 active:scale-95 transition-transform p-0 rounded cursor-pointer focus:outline-none"
                title="Paramétrer mon vol par défaut (P200, F-JUJN, 17L/h, 90kt, LFPX Chavenay)"
              >
                <Plane className="w-3.5 h-3.5 text-sky-600 shrink-0" />
              </button>
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
          </div>

          {/* Ligne 2 sur mobile : Vitesse propre + Date */}
          <div className="flex items-center gap-1.5 shrink-0">
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
        </div>

        {/* Ligne 2 : Box Totaux (Dist Tot / ETE Tot / Conso Tot) & Bouton Défaut au bout de la flèche */}
        <div className="flex items-center gap-2.5 flex-wrap pt-0.5">
          {/* Box Dist Tot */}
          <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 hover:bg-slate-100/90 border border-slate-300 rounded-lg text-xs shadow-2xs transition-all">
            <span className="font-bold text-slate-800 text-[11px] select-none">Dist Tot</span>
            <input
              type="text"
              inputMode="decimal"
              value={flightPlan.totalDistOverride || ''}
              onKeyDown={(e) => handleNumericKeyDown(e, true)}
              onChange={(e) => {
                const clean = e.target.value.replace(',', '.').replace(/[^0-9.]/g, '');
                const parts = clean.split('.');
                const sanitized = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : clean;
                handleAircraftChange('totalDistOverride', sanitized);
              }}
              placeholder="—"
              className="w-12 font-mono font-normal text-slate-900 bg-white border border-slate-300 rounded px-1.5 py-0.5 text-center text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
              title="Distance totale (NM) - saisie manuelle par le pilote (ne fait pas la somme des waypoints)"
            />
            <span className="text-slate-500 font-normal text-[11px]">NM</span>
          </div>

          {/* Box ETE Tot */}
          <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 hover:bg-slate-100/90 border border-slate-300 rounded-lg text-xs shadow-2xs transition-all">
            <span className="font-bold text-slate-800 text-[11px] select-none">ETE Tot</span>
            <input
              type="text"
              inputMode="numeric"
              value={flightPlan.totalEteOverride || ''}
              onKeyDown={(e) => handleNumericKeyDown(e, false)}
              onChange={(e) => {
                const clean = e.target.value.replace(/[^0-9]/g, '');
                handleAircraftChange('totalEteOverride', clean);
              }}
              placeholder="—"
              className="w-12 font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded px-1.5 py-0.5 text-center text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
              title="ETE totale (min) - saisie manuelle par le pilote (ne fait pas la somme des waypoints)"
            />
          </div>

          {/* Box Conso Tot */}
          <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 hover:bg-slate-100/90 border border-slate-300 rounded-lg text-xs shadow-2xs transition-all">
            <span className="font-bold text-slate-800 text-[11px] select-none">Conso Tot</span>
            <input
              type="text"
              inputMode="decimal"
              value={flightPlan.totalConsoOverride !== undefined ? flightPlan.totalConsoOverride : ''}
              onKeyDown={(e) => handleNumericKeyDown(e, true)}
              onChange={(e) => {
                const clean = e.target.value.replace(',', '.').replace(/[^0-9.]/g, '');
                const parts = clean.split('.');
                const sanitized = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : clean;
                handleAircraftChange('totalConsoOverride', sanitized);
              }}
              placeholder={computedConsoLiters > 0 ? `${computedConsoLiters}` : '—'}
              className="w-12 font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded px-1.5 py-0.5 text-center text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
              title="Consommation totale (L) - saisie manuelle ou calculée depuis l'ETE saisie"
            />
            <span className="text-slate-500 font-normal text-[11px]">L</span>
          </div>

          {/* Bouton Reset déplacé au bout de la flèche orange */}
          <button
            type="button"
            id="reset-flight-plan-btn"
            onClick={handleReset}
            className="ml-2 text-xs font-semibold text-black hover:text-slate-800 flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded hover:bg-slate-100 cursor-pointer"
            title="Reset : vider toutes les informations (avion, tronçons, notes) et afficher la date du jour"
          >
            <RotateCcw className="w-3.5 h-3.5 text-black shrink-0" />
            <span className="text-black font-semibold text-xs">Reset</span>
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
        {(() => {
          const depVac = resolveAirfieldVac(flightPlan.departure);

          return (
            <div className="border-2 border-sky-600 ring-1 ring-sky-700/30 bg-white rounded-xl shadow-xs">
              {/* En-tête Départ */}
              <div className="p-3 bg-sky-50/40 rounded-xl">
                <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-sky-600 text-white font-bold text-xs shadow-2xs">
                  <MapPin className="w-3.5 h-3.5 text-white fill-white" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-sky-950 flex items-center gap-1.5 font-mono">
                  <span className="text-slate-700">
                    {flightPlan.departure.name ? truncateDepartureName(flightPlan.departure.name, 28) : 'Départ'}
                  </span>
                  <span className="text-slate-400 font-sans">=&gt;</span>
                  <span className="text-sky-950 font-extrabold">PON</span>
                </span>
              </div>
              {depVac ? (
                <a
                  href={depVac.vacLink.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={depVac.vacLink.title}
                  className="text-[10px] font-bold bg-white text-sky-800 px-2.5 py-0.5 rounded border border-sky-200 shadow-2xs inline-flex items-center gap-1.5 shrink-0 hover:bg-sky-50 hover:text-sky-950 transition-colors"
                >
                  <span className="underline decoration-sky-400 hover:decoration-sky-700">Carte VAC (SIA)</span>
                  <span className="font-mono">{depVac.oaci}</span>
                </a>
              ) : flightPlan.departure.oaci ? (
                <span className="text-[10px] font-mono font-bold bg-white text-sky-800 px-2 py-0.5 rounded border border-sky-200 shrink-0">
                  {flightPlan.departure.oaci}
                </span>
              ) : null}
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
              onLoadingChange={onLoadingChange}
            />
          </div>
        </div>
          );
        })()}

        {/* Connecteur vers la suite */}
        <div className="flex justify-center py-1.5">
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 border border-slate-300 text-slate-500">
            <ArrowDown className="w-3 h-3" />
          </div>
        </div>

        {/* --- WAYPOINTS LOOP (Étapes intermédiaires) --- */}
        {flightPlan.waypoints.map((wp, wpIndex) => {
          const wpVac = resolveAirfieldVac(wp);
          const isAero = wp.type === 'aerodrome' || Boolean(wpVac);
          const prevRaw =
            wpIndex === 0
              ? 'PON'
              : flightPlan.waypoints[wpIndex - 1]?.name?.trim() || `WP ${wpIndex}`;
          const currentRaw = wp.name?.trim() || `WP ${wpIndex + 1}`;
          const prevLabel = wpIndex === 0 ? 'PON' : truncateWpName(prevRaw);
          const currentLabel = truncateWpName(currentRaw);
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
                      {wpVac ? (
                        <a
                          href={wpVac.vacLink.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={wpVac.vacLink.title}
                          className="text-[10px] font-bold bg-white text-sky-800 px-2.5 py-0.5 rounded border border-sky-200 mr-1 shadow-2xs inline-flex items-center gap-1.5 shrink-0 hover:bg-sky-50 hover:text-sky-950 transition-colors"
                        >
                          <span className="underline decoration-sky-400 hover:decoration-sky-700">Carte VAC (SIA)</span>
                          <span className="font-mono">{wpVac.oaci}</span>
                        </a>
                      ) : (isAero && wp.oaci) ? (
                        <span className="text-[10px] font-mono font-bold bg-white text-sky-800 px-2 py-0.5 rounded border border-sky-200 mr-1 shrink-0">
                          {wp.oaci}
                        </span>
                      ) : null}
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
                      onSelect={(aero, notes) => handleSelectAerodromeWaypoint(wpIndex, aero, notes)}
                      onChangeText={(text) => handleWaypointChange(wpIndex, 'name', text)}
                      openAipApiKey={openAipApiKey}
                      onLoadingChange={onLoadingChange}
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
                  <div className="grid grid-cols-1 min-[480px]:grid-cols-3 gap-2.5 items-stretch">
                    {/* Gauche (2/3) : 1ère ligne RM/DIST/ALT, 2ème ligne T sans/avec Vw */}
                    <div className="min-[480px]:col-span-2 flex flex-col justify-between gap-2">
                      {/* 1ère ligne : RM / DIST / ALTITUDE */}
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[8.5px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                            RM (°)
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            id={`leg-${legIndex}-rm`}
                            value={leg.rm || ''}
                            onKeyDown={(e) => handleNumericKeyDown(e, false)}
                            onChange={(e) => handleLegChange(legIndex, 'rm', e.target.value)}
                            placeholder="-"
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
                            inputMode="decimal"
                            id={`leg-${legIndex}-dist`}
                            value={leg.dist || ''}
                            onKeyDown={(e) => handleNumericKeyDown(e, true)}
                            onChange={(e) => handleLegChange(legIndex, 'dist', e.target.value)}
                            placeholder="-"
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
                            inputMode="numeric"
                            id={`leg-${legIndex}-alt`}
                            value={leg.alt || ''}
                            onKeyDown={(e) => handleNumericKeyDown(e, false)}
                            onChange={(e) => handleLegChange(legIndex, 'alt', e.target.value)}
                            placeholder="-"
                            className={`w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono font-medium focus:ring-1 ${
                              isAero ? 'focus:ring-sky-500' : 'focus:ring-slate-700'
                            }`}
                          />
                        </div>
                      </div>

                      {/* 2ème ligne : T sans Vw / T avec Vw */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[8.5px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                            T sans Vw (min)
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            id={`leg-${legIndex}-tSansVw`}
                            value={leg.tSansVw ?? leg.ete ?? leg.temps ?? ''}
                            onKeyDown={(e) => handleNumericKeyDown(e, true)}
                            onChange={(e) => handleLegChange(legIndex, 'tSansVw', e.target.value)}
                            placeholder="-"
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
                            inputMode="decimal"
                            id={`leg-${legIndex}-tAvecVw`}
                            value={leg.tAvecVw || ''}
                            onKeyDown={(e) => handleNumericKeyDown(e, true)}
                            onChange={(e) => handleLegChange(legIndex, 'tAvecVw', e.target.value)}
                            placeholder="-"
                            className={`w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono font-medium focus:ring-1 ${
                              isAero ? 'focus:ring-sky-500' : 'focus:ring-slate-700'
                            }`}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Droite (1/3) : Notes */}
                    <div className="min-[480px]:col-span-1 flex flex-col h-full">
                      <label
                        className={`block text-[8.5px] font-bold uppercase tracking-wider mb-0.5 ${
                          isAero ? 'text-sky-900' : 'text-slate-600'
                        }`}
                      >
                        Notes
                      </label>
                      <textarea
                        id={`leg-${legIndex}-notes`}
                        value={leg.notes || wp.tableNotes || ''}
                        onChange={(e) => handleLegChange(legIndex, 'notes', e.target.value)}
                        placeholder="Notes (remplit la colonne Notes du log de nav)..."
                        className={`w-full flex-1 min-h-[66px] px-2 py-1.5 bg-white border rounded text-xs font-mono font-medium focus:ring-1 resize-none ${
                          isAero
                            ? 'border-sky-300 focus:ring-sky-500'
                            : 'border-slate-300 focus:ring-slate-700'
                        }`}
                      />
                    </div>
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
        <div className="flex justify-center py-2 mb-1 w-full">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 w-full">
            {/* Bouton Aérodrome : + en bleu clair, bordure bleue comme Départ, box bleue */}
            <button
              type="button"
              id="add-wp-aerodrome-btn"
              onClick={() => handleAddWaypoint('aerodrome')}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-white hover:bg-sky-50 text-sky-950 rounded-lg border-2 border-sky-600 ring-1 ring-sky-700/30 text-xs font-bold shadow-xs transition-all cursor-pointer"
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
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-100 text-slate-900 rounded-lg border-2 border-slate-700 ring-1 ring-slate-800/30 text-xs font-bold shadow-xs transition-all cursor-pointer"
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
          const prevRaw =
            flightPlan.waypoints.length > 0
              ? flightPlan.waypoints[flightPlan.waypoints.length - 1]?.name?.trim() || `WP ${flightPlan.waypoints.length}`
              : 'PON';
          const prevPointName = flightPlan.waypoints.length > 0 ? truncateWpName(prevRaw, 18) : 'PON';
          const currentPointName = flightPlan.destination.name?.trim() ? truncateWpName(flightPlan.destination.name.trim(), 18) : 'Arrivée';
          const destLegIndex = flightPlan.waypoints.length;
          const destLeg = getLeg(destLegIndex);
          const destVac = resolveAirfieldVac(flightPlan.destination);

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
                  {destVac ? (
                    <a
                      href={destVac.vacLink.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={destVac.vacLink.title}
                      className="text-[10px] font-bold bg-white text-sky-800 px-2.5 py-0.5 rounded border border-sky-200 shadow-2xs inline-flex items-center gap-1.5 shrink-0 hover:bg-sky-50 hover:text-sky-950 transition-colors"
                    >
                      <span className="underline decoration-sky-400 hover:decoration-sky-700">Carte VAC (SIA)</span>
                      <span className="font-mono">{destVac.oaci}</span>
                    </a>
                  ) : flightPlan.destination.oaci ? (
                    <span className="text-[10px] font-mono font-bold bg-white text-sky-800 px-2 py-0.5 rounded border border-sky-200 shrink-0">
                      {flightPlan.destination.oaci}
                    </span>
                  ) : null}
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
                    onLoadingChange={onLoadingChange}
                  />
                </div>
              </div>

              {/* Section Paramètres de Branche de destination (RM, DIST, ALTITUDE, T sans/avec Vw, Notes) */}
              <div className="border-t border-sky-200/80 bg-sky-50/20 p-2.5 rounded-b-[10px]">
                <div className="grid grid-cols-1 min-[480px]:grid-cols-3 gap-2.5 items-stretch">
                  {/* Gauche (2/3) : 1ère ligne RM/DIST/ALT, 2ème ligne T sans/avec Vw */}
                  <div className="min-[480px]:col-span-2 flex flex-col justify-between gap-2">
                    {/* 1ère ligne : RM / DIST / ALTITUDE */}
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[8.5px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                          RM (°)
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          id={`leg-${destLegIndex}-rm`}
                          value={destLeg.rm || ''}
                          onKeyDown={(e) => handleNumericKeyDown(e, false)}
                          onChange={(e) => handleLegChange(destLegIndex, 'rm', e.target.value)}
                          placeholder="-"
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono font-medium focus:ring-1 focus:ring-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[8.5px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                          DIST (NM)
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          id={`leg-${destLegIndex}-dist`}
                          value={destLeg.dist || ''}
                          onKeyDown={(e) => handleNumericKeyDown(e, true)}
                          onChange={(e) => handleLegChange(destLegIndex, 'dist', e.target.value)}
                          placeholder="-"
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono font-medium focus:ring-1 focus:ring-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[8.5px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                          Altitude
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          id={`leg-${destLegIndex}-alt`}
                          value={destLeg.alt || ''}
                          onKeyDown={(e) => handleNumericKeyDown(e, false)}
                          onChange={(e) => handleLegChange(destLegIndex, 'alt', e.target.value)}
                          placeholder="-"
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono font-medium focus:ring-1 focus:ring-sky-500"
                        />
                      </div>
                    </div>

                    {/* 2ème ligne : T sans Vw / T avec Vw */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[8.5px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                          T sans Vw (min)
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          id={`leg-${destLegIndex}-tSansVw`}
                          value={destLeg.tSansVw ?? destLeg.ete ?? destLeg.temps ?? ''}
                          onKeyDown={(e) => handleNumericKeyDown(e, true)}
                          onChange={(e) => handleLegChange(destLegIndex, 'tSansVw', e.target.value)}
                          placeholder="-"
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono font-medium focus:ring-1 focus:ring-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[8.5px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                          T avec Vw (min)
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          id={`leg-${destLegIndex}-tAvecVw`}
                          value={destLeg.tAvecVw || ''}
                          onKeyDown={(e) => handleNumericKeyDown(e, true)}
                          onChange={(e) => handleLegChange(destLegIndex, 'tAvecVw', e.target.value)}
                          placeholder="-"
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono font-medium focus:ring-1 focus:ring-sky-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Droite (1/3) : Notes */}
                  <div className="min-[480px]:col-span-1 flex flex-col h-full">
                    <label className="block text-[8.5px] font-bold uppercase tracking-wider text-sky-900 mb-0.5">
                      Notes
                    </label>
                    <textarea
                      id="destination-table-notes-input"
                      value={destLeg.notes || flightPlan.destination.tableNotes || flightPlan.destination.notes || ''}
                      onChange={(e) => handleLegChange(destLegIndex, 'notes', e.target.value)}
                      placeholder="Notes (remplit la colonne Notes du log de nav)..."
                      className="w-full flex-1 min-h-[66px] px-2 py-1.5 bg-white border border-sky-300 rounded text-xs font-mono font-medium focus:ring-1 focus:ring-sky-500 resize-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};
