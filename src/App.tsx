import React, { useState, useEffect, useRef } from 'react';
import {
  Printer,
  Plane,
  Fuel,
  FileText,
  Layers,
  Sparkles,
  Download,
  Info,
  Maximize2,
  Minimize2,
  HelpCircle,
  Share2,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Cloud,
  Calculator,
} from 'lucide-react';
import { FlightPlan, NavLeg, Waypoint } from './types';
import { A5KneeboardView } from './components/A5KneeboardView';
import { FlightPlanEditor } from './components/FlightPlanEditor';
import { FRENCH_AERODROMES } from './data/aerodromes';
import { DEFAULT_OPENAIP_KEY } from './services/openaip';
import { subscribeToAnalytics, incrementPrintCount } from './services/firebase';
import { WindCalculator } from './components/WindCalculator';

const BLANK_FLIGHT_PLAN: FlightPlan = {
  aircraftModel: '',
  aircraftReg: '',
  fuelPerHour: 0,
  cruiseSpeedKt: 0,
  fuelOnBoard: 0,
  taxiFuel: 0,
  reserveMin: 0,
  flightDate: '',
  altimeterQnh: '',
  windInfo: '',
  squawk: '',
  departure: {
    id: 'dep-blank',
    type: 'aerodrome',
    name: '',
    oaci: '',
    notes: '',
  },
  destination: {
    id: 'dest-blank',
    type: 'aerodrome',
    name: '',
    oaci: '',
    notes: '',
  },
  waypoints: [
    { id: 'wp-blank-1', type: 'vide', name: '', notes: '' },
    { id: 'wp-blank-2', type: 'vide', name: '', notes: '' },
    { id: 'wp-blank-3', type: 'vide', name: '', notes: '' },
  ],
  legs: [
    { id: 'leg-blank-0', alt: '', rm: '', dist: '', ete: '', eta: '', consoTotale: '', notes: '' },
    { id: 'leg-blank-1', alt: '', rm: '', dist: '', ete: '', eta: '', consoTotale: '', notes: '' },
    { id: 'leg-blank-2', alt: '', rm: '', dist: '', ete: '', eta: '', consoTotale: '', notes: '' },
    { id: 'leg-blank-3', alt: '', rm: '', dist: '', ete: '', eta: '', consoTotale: '', notes: '' },
  ],
  generalNotes: '',
};

export default function App() {
  // Flight plan state with strict defaults as requested by user
  const [flightPlan, setFlightPlan] = useState<FlightPlan>(() => {
    const today = new Date().toISOString().split('T')[0];
    return {
      aircraftModel: 'P200',
      aircraftReg: 'F-HXYZ',
      fuelPerHour: 17,
      cruiseSpeedKt: 90,
      fuelOnBoard: 45,
      taxiFuel: 3,
      reserveMin: 30, // Réserve réglementaire VFR jour
      flightDate: today,
      altimeterQnh: '1013',
      windInfo: '',
      squawk: '7000',
      departure: {
        id: 'dep-lfpx',
        type: 'aerodrome',
        name: 'LFPX Chavenay - Villepreux',
        oaci: 'LFPX',
        coordinates: 'Alt 426 ft',
        notes:
          'ATIS: 129.405 | TWR: 120.300 | SIV Paris: 126.100\nAlt: 426 ft | Pistes: 05/23 (850m/915m)\nTdP 05/23 à 1400 ft QNH. Sortie Sud Mantes.',
        frequencies: {
          atis: '129.405',
          twr: '120.300',
          siv: 'Paris Info 126.100',
        },
        tableNotes: '',
      },
      destination: {
        // Point d'arrivée est laissé vide par défaut
        id: 'dest-empty',
        type: 'aerodrome',
        name: '',
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
          ete: '',
          temps: '',
          eta: '',
          consoTotale: '',
          notes: '',
        },
      ],
      legs: [
        {
          id: 'leg-0',
          alt: '',
          rm: '',
          dist: '',
          ete: '',
          temps: '',
          eta: '',
          consoTotale: '',
          notes: '',
        },
        {
          id: 'leg-1',
          alt: '',
          rm: '',
          dist: '',
          ete: '',
          temps: '',
          eta: '',
          consoTotale: '',
          notes: '',
        },
      ],
      departureTime: '10:00',
      generalNotes: '',
    };
  });

  const [openAipApiKey, setOpenAipApiKey] = useState<string>(DEFAULT_OPENAIP_KEY);
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
  const [previewZoom, setPreviewZoom] = useState<number>(100);
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [showWindCalc, setShowWindCalc] = useState<boolean>(false);
  const [logsCreatedCount, setLogsCreatedCount] = useState<number | null>(null);

  // Subscribe to live Firestore analytics counter
  useEffect(() => {
    const unsubscribe = subscribeToAnalytics((count) => {
      setLogsCreatedCount(count);
    });
    return () => unsubscribe();
  }, []);

  // Weather dropdown menu & blank print states
  const [isWeatherMenuOpen, setIsWeatherMenuOpen] = useState<boolean>(false);
  const [isPrintingBlank, setIsPrintingBlank] = useState<boolean>(false);
  const weatherMenuRef = useRef<HTMLDivElement>(null);

  // Close weather menu when clicking outside (header toggle or outside click)
  useEffect(() => {
    if (!isWeatherMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (weatherMenuRef.current && !weatherMenuRef.current.contains(event.target as Node)) {
        setIsWeatherMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isWeatherMenuOpen]);

  // Windy links list
  const WINDY_LINKS = [
    'https://www.windy.com/fr/-Menu/menu?47.499,1.608,7,i:pressure,p:favs,m:e1Uagds',
    'https://www.windy.com/fr/-Menu/menu?900h,47.499,1.608,7,i:pressure,p:favs,m:e1Uagds',
    'https://www.windy.com/fr/-Menu/menu?800h,47.499,1.608,7,i:pressure,p:favs,m:e1Uagds',
    'https://www.windy.com/fr/-Menu/menu?cbase,47.499,1.608,7,i:pressure,p:favs,m:eYEagfL',
    'https://www.windy.com/fr/-Menu/menu?visibility,47.175,0.397,6,i:pressure,p:favs,m:eUNaf6H',
  ];

  const handleOpenAllWindy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    WINDY_LINKS.forEach((url) => {
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  };

  // Listen to afterprint event to reset blank print state
  useEffect(() => {
    const handleAfterPrint = () => {
      setIsPrintingBlank(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  const handlePrintBlankLog = () => {
    incrementPrintCount();
    setIsPrintingBlank(true);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  // Table notes handlers (keeps table's 1/3 notes column blank for handwriting)
  const handleUpdateDepartureTableNotes = (tableNotes: string) => {
    setFlightPlan((prev) => ({
      ...prev,
      departure: {
        ...prev.departure,
        tableNotes,
      },
    }));
  };

  const handleUpdateDestinationTableNotes = (tableNotes: string) => {
    setFlightPlan((prev) => ({
      ...prev,
      destination: {
        ...prev.destination,
        tableNotes,
        notes: tableNotes,
      },
    }));
  };

  const handleUpdateWaypointTableNotes = (id: string, tableNotes: string) => {
    setFlightPlan((prev) => ({
      ...prev,
      waypoints: prev.waypoints.map((wp) => (wp.id === id ? { ...wp, tableNotes } : wp)),
    }));
  };

  // Update departure notes directly from table
  const handleUpdateDepartureNotes = (notes: string) => {
    setFlightPlan((prev) => ({
      ...prev,
      departure: {
        ...prev.departure,
        notes,
      },
    }));
  };

  // Update destination notes directly from table
  const handleUpdateDestinationNotes = (notes: string) => {
    setFlightPlan((prev) => ({
      ...prev,
      destination: {
        ...prev.destination,
        notes,
      },
    }));
  };

  // Update waypoint notes directly from table
  const handleUpdateWaypointNotes = (id: string, notes: string) => {
    setFlightPlan((prev) => ({
      ...prev,
      waypoints: prev.waypoints.map((wp) => (wp.id === id ? { ...wp, notes } : wp)),
    }));
  };

  // Update leg fields directly from table
  const handleUpdateLeg = (index: number, field: keyof NavLeg, value: string) => {
    setFlightPlan((prev) => {
      const updatedLegs = [...prev.legs];
      if (updatedLegs[index]) {
        updatedLegs[index] = {
          ...updatedLegs[index],
          [field]: value,
        };
      }
      
      let updatedPlan: FlightPlan = {
        ...prev,
        legs: updatedLegs,
      };

      if (field === 'notes') {
        if (index < prev.waypoints.length) {
          updatedPlan = {
            ...updatedPlan,
            waypoints: prev.waypoints.map((wp, i) =>
              i === index ? { ...wp, tableNotes: value } : wp
            ),
          };
        } else {
          updatedPlan = {
            ...updatedPlan,
            destination: {
              ...updatedPlan.destination,
              tableNotes: value,
              notes: value,
            },
          };
        }
      }

      return updatedPlan;
    });
  };

  // Update general notes
  const handleUpdateGeneralNotes = (notes: string) => {
    setFlightPlan((prev) => ({
      ...prev,
      generalNotes: notes,
    }));
  };

  // Update aircraft field directly
  const handleUpdateAircraftField = (field: keyof FlightPlan, value: any) => {
    setFlightPlan((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Print function
  const handlePrint = (_mode?: string) => {
    incrementPrintCount();
    window.print();
  };

  // Quick Preset navigation routes
  const loadPresetRoute = (destinationOaci: string) => {
    if (destinationOaci === 'LFOP') {
      // Rouen
      setFlightPlan((prev) => ({
        ...prev,
        destination: {
          id: 'dest-rouen',
          type: 'aerodrome',
          name: 'LFOP Rouen - Vallée de Seine',
          oaci: 'LFOP',
          coordinates: 'Alt 512 ft',
          notes:
            'ATIS: 121.025 | TWR: 118.300 | APP: 120.450\nAlt: 512 ft | Piste 04/22 (1700m)\nTdP 1500 ft QNH. Points d’entrée: Sierra, Novembre.',
        },
        waypoints: [
          {
            id: 'wp-mantes',
            type: 'ville',
            name: 'Mantes-la-Jolie',
            notes: 'Sortie transit Sud Mantes, passer avec Seine Info 120.325.',
          },
          {
            id: 'wp-vernon',
            type: 'ville',
            name: 'Vernon / Giverny',
            notes: 'Suivi de la Seine. Alt 2500 ft QNH.',
          },
        ],
        legs: [
          {
            id: 'leg-0',
            alt: '',
            rm: '',
            dist: '',
            temps: '',
            ete: '',
            heureEst: '',
            heureReelle: '',
            notes: '',
          },
          {
            id: 'leg-1',
            alt: '',
            rm: '',
            dist: '',
            temps: '',
            ete: '',
            heureEst: '',
            heureReelle: '',
            notes: '',
          },
          {
            id: 'leg-2',
            alt: '',
            rm: '',
            dist: '',
            temps: '',
            ete: '',
            heureEst: '',
            heureReelle: '',
            notes: '',
          },
        ],
      }));
    } else if (destinationOaci === 'LFAT') {
      // Le Touquet
      setFlightPlan((prev) => ({
        ...prev,
        destination: {
          id: 'dest-touquet',
          type: 'aerodrome',
          name: 'LFAT Le Touquet - Côte d’Opale',
          oaci: 'LFAT',
          coordinates: 'Alt 35 ft',
          notes:
            'ATIS: 118.050 | TWR: 118.450 | AFIS: 118.450\nAlt: 35 ft | Piste 13/31 (1850m)\nTdP 1000 ft QNH mer/terre.',
        },
        waypoints: [
          {
            id: 'wp-pontoise',
            type: 'aerodrome',
            name: 'LFPT Pontoise',
            notes: 'Transit classe D. TWR 121.200 si traversée.',
          },
          {
            id: 'wp-abbeville',
            type: 'aerodrome',
            name: 'LFOI Abbeville',
            notes: 'A/A 123.500. Alt 2500 ft.',
          },
          {
            id: 'wp-vide',
            type: 'vide',
            name: '',
            notes: '',
          },
        ],
        legs: [
          {
            id: 'leg-0',
            alt: '',
            rm: '',
            dist: '',
            temps: '',
            ete: '',
            heureEst: '',
            heureReelle: '',
            notes: '',
          },
          {
            id: 'leg-1',
            alt: '',
            rm: '',
            dist: '',
            temps: '',
            ete: '',
            heureEst: '',
            heureReelle: '',
            notes: '',
          },
          {
            id: 'leg-2',
            alt: '',
            rm: '',
            dist: '',
            temps: '',
            ete: '',
            heureEst: '',
            heureReelle: '',
            notes: '',
          },
          {
            id: 'leg-3',
            alt: '',
            rm: '',
            dist: '',
            temps: '',
            ete: '',
            heureEst: '',
            heureReelle: '',
            notes: '',
          },
        ],
      }));
    } else if (destinationOaci === 'LFRG') {
      // Deauville
      setFlightPlan((prev) => ({
        ...prev,
        destination: {
          id: 'dest-deauville',
          type: 'aerodrome',
          name: 'LFRG Deauville - Normandie',
          oaci: 'LFRG',
          coordinates: 'Alt 479 ft',
          notes:
            'ATIS: 129.575 | TWR: 118.300 | GND: 121.750 | APP: 120.350\nAlt: 479 ft | Piste 12/30 (2550m)\nTdP 1500 ft QNH.',
        },
        waypoints: [
          {
            id: 'wp-evreux',
            type: 'ville',
            name: 'Évreux (Contournement Sud)',
            notes: 'Attention BA 105 Évreux Fauville (R275 active). Alt sécu 2000ft.',
          },
          {
            id: 'wp-bernay',
            type: 'aerodrome',
            name: 'LFBD Bernay Saint-Martin',
            notes: 'A/A 123.500. Alt 558 ft.',
          },
        ],
        legs: [
          {
            id: 'leg-0',
            alt: '',
            rm: '',
            dist: '',
            temps: '',
            ete: '',
            heureEst: '',
            heureReelle: '',
            notes: '',
          },
          {
            id: 'leg-1',
            alt: '',
            rm: '',
            dist: '',
            temps: '',
            ete: '',
            heureEst: '',
            heureReelle: '',
            notes: '',
          },
          {
            id: 'leg-2',
            alt: '',
            rm: '',
            dist: '',
            temps: '',
            ete: '',
            heureEst: '',
            heureReelle: '',
            notes: '',
          },
        ],
      }));
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans">
      {/* 1. TOP APPLICATION BAR (Hidden when printing) */}
      <header className="no-print bg-slate-900 text-white border-b border-slate-800 shadow-md sticky top-0 z-40">
        <        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-3">
          {/* Logo & Title & Analytics Counter */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-600 flex items-center justify-center text-white shadow-sm shrink-0">
              <Plane className="w-6 h-6" />
            </div>
            <div className="flex flex-col justify-center">
              <div className="flex items-center gap-2 leading-none">
                <h1 className="font-extrabold text-xl sm:text-2xl tracking-tight text-white leading-none">
                  Log VFR
                </h1>
                <div className="flex flex-col justify-between h-[15px] sm:h-[16.5px] items-start leading-none -translate-y-[1.5px] sm:-translate-y-[2px]">
                  <span className="text-[7.5px] sm:text-[8px] text-white font-normal leading-none select-none">
                    by
                  </span>
                  <a
                    href="https://teletravan.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-400 hover:text-sky-300 font-normal text-[9.5px] sm:text-[10px] underline decoration-sky-400/70 transition-colors leading-none"
                    title="Visiter teletravan.com"
                  >
                    teletravan.com
                  </a>
                </div>
              </div>
              <span className="text-xs text-white font-medium mt-1 select-none leading-none">
                {logsCreatedCount !== null ? `${logsCreatedCount} logs créés.` : '... logs créés.'}
              </span>
            </div>
          </div>

          {/* 3 Header Items: Météo & Notam, Calculette Vent ETE, Imprimer log vierge */}
                   <div className="flex-1 flex items-center justify-center gap-2.5 sm:gap-3 flex-wrap">
            {/* 1. Météo et notam Menu */}
            <div className="relative" ref={weatherMenuRef}>
              <button
                type="button"
                id="meteo-notam-header-btn"
                onClick={() => setIsWeatherMenuOpen((prev) => !prev)}
                className="bg-slate-200 hover:bg-slate-100 text-slate-900 border border-slate-300 font-semibold px-3 py-1 rounded text-xs flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <Cloud className="w-3.5 h-3.5 text-slate-700" />
                <span>Météo et notam</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-700 transition-transform duration-150 ${
                    isWeatherMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isWeatherMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-64 bg-white rounded-lg shadow-xl border border-slate-200 py-1.5 z-50 text-slate-800 text-xs">
                  {/* AeroWeb */}
                  <a
                    href="https://aviation.meteo.fr/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 flex items-center justify-between hover:bg-sky-50 text-slate-900 hover:text-sky-900 font-semibold transition-colors group"
                  >
                    <span>AeroWeb</span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-sky-600" />
                  </a>

                  {/* Ligne de séparation discrète */}
                  <div className="border-t border-slate-200 my-1" />

                  {/* Windy Header */}
                  <div className="px-3.5 py-1.5 text-xs font-bold text-slate-900">
                    <span>Windy :</span>
                  </div>

                  {/* Vent Sol (SFC) */}
                  <a
                    href="https://www.windy.com/fr/-Menu/menu?47.499,1.608,7,i:pressure,p:favs,m:e1Uagds"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-1.5 pl-4 flex items-center justify-between hover:bg-sky-50 text-slate-800 hover:text-sky-900 transition-colors"
                  >
                    <span>Vent Sol (SFC)</span>
                    <ExternalLink className="w-3 h-3 text-slate-400" />
                  </a>

                  {/* Vent 900m (FL030) */}
                  <a
                    href="https://www.windy.com/fr/-Menu/menu?900h,47.499,1.608,7,i:pressure,p:favs,m:e1Uagds"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-1.5 pl-4 flex items-center justify-between hover:bg-sky-50 text-slate-800 hover:text-sky-900 transition-colors"
                  >
                    <span>Vent 900m (FL030)</span>
                    <ExternalLink className="w-3 h-3 text-slate-400" />
                  </a>

                  {/* Vent 2000m (FL060) */}
                  <a
                    href="https://www.windy.com/fr/-Menu/menu?800h,47.499,1.608,7,i:pressure,p:favs,m:e1Uagds"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-1.5 pl-4 flex items-center justify-between hover:bg-sky-50 text-slate-800 hover:text-sky-900 transition-colors"
                  >
                    <span>Vent 2000m (FL060)</span>
                    <ExternalLink className="w-3 h-3 text-slate-400" />
                  </a>

                  {/* Base des nuages (Plafond) */}
                  <a
                    href="https://www.windy.com/fr/-Menu/menu?cbase,47.499,1.608,7,i:pressure,p:favs,m:eYEagfL"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-1.5 pl-4 flex items-center justify-between hover:bg-sky-50 text-slate-800 hover:text-sky-900 transition-colors"
                  >
                    <span>Base des nuages (Plafond)</span>
                    <ExternalLink className="w-3 h-3 text-slate-400" />
                  </a>

                  {/* Visibilité */}
                  <a
                    href="https://www.windy.com/fr/-Menu/menu?visibility,47.175,0.397,6,i:pressure,p:favs,m:eUNaf6H"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-1.5 pl-4 flex items-center justify-between hover:bg-sky-50 text-slate-800 hover:text-sky-900 transition-colors"
                  >
                    <span>Visibilité</span>
                    <ExternalLink className="w-3 h-3 text-slate-400" />
                  </a>

                  {/* Ligne de séparation discrète */}
                  <div className="border-t border-slate-200 my-1" />

                  {/* NOTAM Info */}
                  <a
                    href="https://notaminfo.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 flex items-center justify-between hover:bg-sky-50 text-slate-900 hover:text-sky-900 font-semibold transition-colors group"
                  >
                    <span>NOTAM Info</span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-sky-600" />
                  </a>

                  {/* Ligne de séparation discrète */}
                  <div className="border-t border-slate-200 my-1" />

                  {/* Lever / Coucher soleil */}
                  <a
                    href="https://www.sunrise-and-sunset.com/fr/sun/france/strasbourg"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 flex items-center justify-between hover:bg-sky-50 text-slate-900 hover:text-sky-900 font-semibold transition-colors group"
                  >
                    <span>Lever / Coucher soleil</span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-sky-600" />
                  </a>
                </div>
              )}
            </div>

            {/* 2. Calculette Vent ETE (Pour le moment ne fait rien) */}
                        <div className="relative">
              <button
                type="button"
                id="calculette-ete-header-btn"
                className="bg-slate-200 hover:bg-slate-100 text-slate-900 border border-slate-300 font-semibold px-3 py-1 rounded text-xs flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                             onClick={() => setShowWindCalc((v) => !v)}

                title="Calculette Vent ETE"
              >
                <Calculator className="w-3.5 h-3.5 text-slate-700" />
                <span>Calculette Vent ETE</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-700" />
              </button>
              <WindCalculator
        isOpen={showWindCalc}
        onClose={() => setShowWindCalc(false)}
        aircraftModel={flightPlan.aircraftModel}
        cruiseSpeedKt={flightPlan.cruiseSpeedKt}
      />
            </div>

            {/* 3. Imprimer log vierge (fond sombre d'origine, contour et texte grisés subtilement plus clairs) */}
            <div className="flex flex-col items-center">
              <button
                type="button"
                id="print-blank-log-header-btn"
                onClick={handlePrintBlankLog}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-400 hover:border-slate-300 rounded text-xs font-medium flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                title="Imprimer le log 100% vierge en double"
              >
                <Printer className="w-3.5 h-3.5 text-slate-300" />
                <span>Imprimer log vierge</span>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Sub-Navigation Tabs */}
        <div className="lg:hidden flex border-t border-slate-800 px-4 bg-slate-950/50">
          <button
            type="button"
            id="mobile-tab-editor"
            onClick={() => setActiveTab('editor')}
            className={`flex-1 py-2 text-xs font-bold text-center border-b-2 transition-colors ${
              activeTab === 'editor'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            1. Saisie & Navigation
          </button>
          <button
            type="button"
            id="mobile-tab-preview"
            onClick={() => setActiveTab('preview')}
            className={`flex-1 py-2 text-xs font-bold text-center border-b-2 transition-colors ${
              activeTab === 'preview'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            2. Aperçu Planchette A5
          </button>
        </div>
      </header>

      {/* 2. MAIN WORKSPACE (Desktop Split Screen: Left Editor, Right Live A5 Preview) */}
      <main className="no-print flex-1 max-w-7xl w-full mx-auto p-4 flex flex-col lg:flex-row gap-6 items-start">
        {/* LEFT COLUMN: FLIGHT PLAN EDITOR */}
        <div
          className={`w-full lg:w-1/2 space-y-4 ${
            activeTab === 'preview' ? 'hidden lg:block' : 'block'
          }`}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-sky-600" />
              <span>Paramétrage</span>
            </h2>
          </div>

          <FlightPlanEditor
            flightPlan={flightPlan}
            onChange={setFlightPlan}
            openAipApiKey={openAipApiKey}
            onOpenAipApiKeyChange={setOpenAipApiKey}
          />
        </div>

        {/* RIGHT COLUMN: LIVE A5 KNEEBOARD PREVIEW */}
        <div
          className={`w-full lg:w-1/2 flex flex-col items-center sticky top-20 ${
            activeTab === 'editor' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* Preview Toolbar */}
                    <div className="w-full max-w-[148mm] flex items-center justify-end mb-2 text-xs text-slate-600 px-1">
           
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                id="quick-print-preview-btn"
                onClick={() => handlePrint()}
                className="px-4 py-1.5 sm:py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm hover:shadow transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimer</span>
              </button>
            </div>
          </div>

          {/* Interactive A5 Sheet Preview */}
          <div className="overflow-x-auto w-full flex justify-center py-2 bg-slate-200/60 rounded-xl border border-slate-300 shadow-inner">
            <div>
              <A5KneeboardView
                flightPlan={flightPlan}
                onUpdateDepartureNotes={handleUpdateDepartureNotes}
                onUpdateDestinationNotes={handleUpdateDestinationNotes}
                onUpdateWaypointNotes={handleUpdateWaypointNotes}
                onUpdateLeg={handleUpdateLeg}
                onUpdateGeneralNotes={handleUpdateGeneralNotes}
                onUpdateAircraftField={handleUpdateAircraftField}
                onUpdateDepartureTableNotes={handleUpdateDepartureTableNotes}
                onUpdateDestinationTableNotes={handleUpdateDestinationTableNotes}
                onUpdateWaypointTableNotes={handleUpdateWaypointTableNotes}
              />
            </div>
          </div>
        </div>
      </main>

      {/* 3. DEDICATED PRINT CONTAINER (Active ONLY during browser print @media print) */}
      <div className="print-only hidden">
        <div className="w-full">
          <A5KneeboardView
            flightPlan={isPrintingBlank ? BLANK_FLIGHT_PLAN : flightPlan}
            isPrintMode={true}
                        duplicateIfSinglePage={isPrintingBlank}
          />
        </div>
      </div>

            <WindCalculator
        isOpen={showWindCalc}
        onClose={() => setShowWindCalc(false)}
        aircraftModel={flightPlan.aircraftModel}
        cruiseSpeedKt={flightPlan.cruiseSpeedKt}
      />

      {/* 4. HELP & PRINTING GUIDE MODAL */}
      {showHelpModal && (
        <div className="no-print fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 text-slate-800 text-xs space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Printer className="w-4 h-4 text-sky-600" />
                <span>Guide d'impression au format A5 VFR</span>
              </h3>
              <button
                type="button"
                id="close-help-modal-btn"
                onClick={() => setShowHelpModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-slate-700">
              <p>
                <strong>1. Papier A5 direct :</strong> Si votre imprimante dispose d'un bac réglé
                pour le papier <strong>A5 (148 × 210 mm)</strong>, cliquez simplement sur{' '}
                <span className="text-sky-700 font-bold">"Imprimer en A5"</span>. Dans la fenêtre
                d'impression de votre navigateur, sélectionnez le format A5 portrait et marges par
                défaut ou minimales.
              </p>
              <p>
                <strong>2. Papier A4 standard (Option 2x A5) :</strong> Si vous imprimez sur du
                papier A4 ordinaire, utilisez le bouton{' '}
                <span className="text-slate-900 font-bold">"2x A5 sur A4"</span>. Deux exemplaires
                identiques seront positionnés côte-à-côte avec un trait de coupe central. Parfait
                pour avoir un log aller-retour ou un double de sécurité !
              </p>
              <p>
                <strong>3. WP "VIDE" (Écriture à la main) :</strong> Le bouton{' '}
                <span className="text-amber-800 font-bold">+ WP VIDE</span> insère des lignes
                vierges dotées de cases d'altitudes, caps, distances, temps et notes afin que vous
                puissiez écrire confortablement au crayon sur la planchette en vol.
              </p>
              <p>
                <strong>4. Fréquences radio :</strong> La saisie d'un aérodrome (ex: LFPX, LFPN,
                LFPT, LFOP, etc.) renseigne automatiquement les fréquences ATIS, Tour (TWR), Sol
                (GND) et SIV dans les notes.
              </p>
            </div>

            <div className="pt-2 border-t flex justify-end">
              <button
                type="button"
                id="ack-help-btn"
                onClick={() => setShowHelpModal(false)}
                className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg"
              >
                J'ai compris
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
