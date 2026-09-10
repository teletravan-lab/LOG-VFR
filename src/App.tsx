import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Cloud,
  Calculator,
  Save,
  Copy,
  Check,
  Loader2,
  X,
  Upload,
  Wrench,
  ArrowLeftRight,
  AlertCircle,
} from 'lucide-react';
import { FlightPlan, NavLeg, Waypoint } from './types';
import { A5KneeboardView } from './components/A5KneeboardView';
import { FlightPlanEditor } from './components/FlightPlanEditor';
import { FRENCH_AERODROMES } from './data/aerodromes';
import { DEFAULT_OPENAIP_KEY } from './services/openaip';
import { importGpxToFlightPlan } from './services/gpxImport';
import { createReturnFlightPlan } from './services/flightReturn';
import {
  subscribeToAnalytics,
  incrementPrintCount,
  getParisDateStrings,
  recordVisit,
  subscribeToVisitorCount,
  fetchYesterdayVisitorCount,
} from './services/firebase';
import { WindCalculator } from './components/WindCalculator';
import {
  generateLogId,
  saveFlightLogToFirestore,
  loadFlightLogFromFirestore,
  getLogUrl,
  getLogUrlForDisplay,
} from './services/logStore';

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
    { id: 'wp-blank-4', type: 'vide', name: '', notes: '' },
    { id: 'wp-blank-5', type: 'vide', name: '', notes: '' },
  ],
  legs: [
    { id: 'leg-blank-0', alt: '', rm: '', dist: '', ete: '', eta: '', consoTotale: '', notes: '' },
    { id: 'leg-blank-1', alt: '', rm: '', dist: '', ete: '', eta: '', consoTotale: '', notes: '' },
    { id: 'leg-blank-2', alt: '', rm: '', dist: '', ete: '', eta: '', consoTotale: '', notes: '' },
    { id: 'leg-blank-3', alt: '', rm: '', dist: '', ete: '', eta: '', consoTotale: '', notes: '' },
    { id: 'leg-blank-4', alt: '', rm: '', dist: '', ete: '', eta: '', consoTotale: '', notes: '' },
    { id: 'leg-blank-5', alt: '', rm: '', dist: '', ete: '', eta: '', consoTotale: '', notes: '' },
  ],
  generalNotes: '',
};

export default function App() {
  // Flight plan state: vol aller (outbound) par défaut
  const [outboundPlan, setOutboundPlan] = useState<FlightPlan>(() => {
    const today = new Date().toISOString().split('T')[0];
    return {
      aircraftModel: '',
      aircraftReg: '',
      fuelPerHour: 0,
      cruiseSpeedKt: 0,
      fuelOnBoard: 0,
      taxiFuel: 0,
      reserveMin: 0,
      flightDate: today,
      altimeterQnh: '',
      windInfo: '',
      squawk: '',
      departure: {
        id: 'dep-default',
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
        id: 'dest-default',
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
    };
  });

  const [returnPlan, setReturnPlan] = useState<FlightPlan | null>(null);
  const [activeLeg, setActiveLeg] = useState<'outbound' | 'return'>('outbound');

  // Plan de vol actuellement visualisé et édité
  const flightPlan = activeLeg === 'return' && returnPlan ? returnPlan : outboundPlan;

  const setFlightPlan = (action: React.SetStateAction<FlightPlan>) => {
    if (activeLeg === 'return') {
      setReturnPlan((prev) => {
        const base = prev || createReturnFlightPlan(outboundPlan);
        return typeof action === 'function'
          ? (action as (p: FlightPlan) => FlightPlan)(base)
          : action;
      });
    } else {
      setOutboundPlan(action);
    }
  };

  const [openAipApiKey, setOpenAipApiKey] = useState<string>(DEFAULT_OPENAIP_KEY);
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
  const [previewZoom, setPreviewZoom] = useState<number>(100);
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [showWindCalc, setShowWindCalc] = useState<boolean>(false);
  const [logsCreatedCount, setLogsCreatedCount] = useState<number | null>(null);
  const [totalVisitors, setTotalVisitors] = useState<number | null>(null);
  const [yesterdayVisitors, setYesterdayVisitors] = useState<number | null>(null);
  const visitRecordedRef = useRef<boolean>(false);

  // --- Gestion de la persistance Firestore des logs de vol ---
  const [logId, setLogId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      return searchParams.get('log');
    }
    return null;
  });

  type SaveState = 'unsaved' | 'saving' | 'saved' | 'error';
  const [saveStatus, setSaveStatus] = useState<{ state: SaveState; label: string }>({
    state: 'unsaved',
    label: 'Non enregistré',
  });

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isLogLoading, setIsLogLoading] = useState<boolean>(false);

  // --- Gestion de l'import GPX SkyVector ---
  const gpxFileInputRef = useRef<HTMLInputElement>(null);
  const [pendingGpxText, setPendingGpxText] = useState<string | null>(null);
  const [showGpxConfirmModal, setShowGpxConfirmModal] = useState<boolean>(false);
  const [gpxErrorMessage, setGpxErrorMessage] = useState<string | null>(null);
  const [isImportingGpx, setIsImportingGpx] = useState<boolean>(false);

  // --- Gestion du vol retour ---
  const [showReturnNote, setShowReturnNote] = useState<boolean>(false);
  const returnNoteTimerRef = useRef<NodeJS.Timeout | number | null>(null);

  const isReadyForReturn = Boolean(
    (outboundPlan.departure?.oaci?.trim() || outboundPlan.departure?.name?.trim()) &&
      (outboundPlan.destination?.oaci?.trim() || outboundPlan.destination?.name?.trim())
  );

  const createdAtRef = useRef<string | undefined>(undefined);
  const lastSavedHashRef = useRef<string>('');
  const debounceTimerRef = useRef<NodeJS.Timeout | number | null>(null);
  const outboundPlanRef = useRef<FlightPlan>(outboundPlan);
  const returnPlanRef = useRef<FlightPlan | null>(returnPlan);
  const activeLegRef = useRef<'outbound' | 'return'>(activeLeg);
  const flightPlanRef = useRef<FlightPlan>(flightPlan);
  const isInitialMountRef = useRef<boolean>(true);
  const saveStatusRef = useRef<SaveState>('unsaved');

  useEffect(() => {
    saveStatusRef.current = saveStatus.state;
  }, [saveStatus.state]);

  // Synchronise les refs sur les plans de vol et le leg actif
  useEffect(() => {
    outboundPlanRef.current = outboundPlan;
  }, [outboundPlan]);

  useEffect(() => {
    returnPlanRef.current = returnPlan;
  }, [returnPlan]);

  useEffect(() => {
    activeLegRef.current = activeLeg;
  }, [activeLeg]);

  useEffect(() => {
    flightPlanRef.current = flightPlan;
  }, [flightPlan]);

  // Chargement initial au montage : URL (?log=...) prioritaire, sinon localStorage
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const paramLogId = searchParams.get('log');
    const vParam = searchParams.get('v'); // 'aller' ou 'retour'

    if (paramLogId) {
      setSaveStatus({ state: 'saving', label: 'Enregistrement...' });
      loadFlightLogFromFirestore(paramLogId)
        .then((result) => {
          if (result && result.outbound) {
            setOutboundPlan(result.outbound);
            setReturnPlan(result.returnPlan);

            let initialLeg: 'outbound' | 'return' = result.activeLeg || 'outbound';
            if (vParam === 'aller') {
              initialLeg = 'outbound';
            } else if (vParam === 'retour' && result.returnPlan) {
              initialLeg = 'return';
            }
            setActiveLeg(initialLeg);

            outboundPlanRef.current = result.outbound;
            returnPlanRef.current = result.returnPlan;
            activeLegRef.current = initialLeg;
            createdAtRef.current = result.createdAt;

            lastSavedHashRef.current = JSON.stringify({
              outbound: result.outbound,
              return: result.returnPlan,
              activeLeg: initialLeg,
            });

            setLogId(paramLogId);
            localStorage.setItem('skylog_current_log_id', paramLogId);
            setSaveStatus({ state: 'saved', label: 'Enregistré' });
          } else {
            setSaveStatus({ state: 'error', label: 'Échec' });
          }
        })
        .catch(() => {
          setSaveStatus({ state: 'error', label: 'Échec' });
        });
    }
  }, []);

  // Easter egg : au clic sur l'icône à gauche de Paramétrage :
  // Avion P200, Immat F-JUJN, Conso 17L, Vitesse 90 kts, départ LFPX Chavenay
  const handleEasterEggDefaultFlight = () => {
    setFlightPlan((prev) => ({
      ...prev,
      aircraftModel: 'P200',
      aircraftReg: 'F-JUJN',
      fuelPerHour: 17,
      cruiseSpeedKt: 90,
      fuelOnBoard: 45,
      taxiFuel: 3,
      reserveMin: 30,
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
    }));
  };

  // Import GPX SkyVector
  const executeGpxImport = async (xmlText: string) => {
    setIsImportingGpx(true);
    try {
      const updatedPlan = await importGpxToFlightPlan(xmlText, flightPlan, openAipApiKey);
      setFlightPlan(updatedPlan);
      setGpxErrorMessage(null);
    } catch (err) {
      setGpxErrorMessage(
        err instanceof Error ? err.message : "Erreur lors de l'import du plan GPX."
      );
    } finally {
      setIsImportingGpx(false);
      setPendingGpxText(null);
      setShowGpxConfirmModal(false);
    }
  };

  const handleGpxFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > 1024 * 1024) {
      setGpxErrorMessage('Le fichier dépasse la taille maximale autorisée de 1 Mo.');
      return;
    }

    try {
      const text = await file.text();
      const hasWaypoints = flightPlan.waypoints && flightPlan.waypoints.length > 0;
      if (hasWaypoints) {
        setPendingGpxText(text);
        setShowGpxConfirmModal(true);
      } else {
        await executeGpxImport(text);
      }
    } catch (err) {
      setGpxErrorMessage(
        err instanceof Error ? err.message : 'Impossible de lire le fichier sélectionné.'
      );
    }
  };

  // Fonction centrale d'exécution d'une sauvegarde Firestore
  const executeSave = async (
    targetLogId: string,
    outbound: FlightPlan,
    retPlan: FlightPlan | null,
    actLeg: 'outbound' | 'return'
  ) => {
    setIsSaving(true);
    if (saveStatusRef.current !== 'error') {
      setSaveStatus({ state: 'saving', label: 'Enregistrement...' });
    }
    try {
      const res = await saveFlightLogToFirestore(
        targetLogId,
        outbound,
        retPlan,
        actLeg,
        createdAtRef.current
      );
      if (res.success) {
        lastSavedHashRef.current = JSON.stringify({
          outbound,
          return: retPlan,
          activeLeg: actLeg,
        });
        setSaveStatus({ state: 'saved', label: 'Enregistré' });
      } else {
        setSaveStatus({ state: 'error', label: 'Échec' });
      }
    } catch {
      setSaveStatus({ state: 'error', label: 'Échec' });
    } finally {
      setIsSaving(false);
    }
  };

  // Déclenchement automatique avec debounce de 1500 ms lors de toute modification
  useEffect(() => {
    // Sauvegarde intermédiaire locale systématique
    try {
      localStorage.setItem('skylog_intermediate_outbound', JSON.stringify(outboundPlan));
      if (returnPlan) {
        localStorage.setItem('skylog_intermediate_return', JSON.stringify(returnPlan));
      } else {
        localStorage.removeItem('skylog_intermediate_return');
      }
      localStorage.setItem('skylog_intermediate_active_leg', activeLeg);
      localStorage.setItem('skylog_intermediate_plan', JSON.stringify(flightPlan));
    } catch (e) {
      // ignore
    }

    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }

    if (!logId) {
      // Pas encore sauvegardé sur Firestore
      return;
    }

    const currentHash = JSON.stringify({
      outbound: outboundPlan,
      return: returnPlan,
      activeLeg,
    });
    if (currentHash === lastSavedHashRef.current) {
      // Données identiques : aucune écriture inutile
      return;
    }

    // Données modifiées : passage en état "Enregistrement..." si pas en erreur
    if (saveStatusRef.current !== 'error') {
      setSaveStatus({ state: 'saving', label: 'Enregistrement...' });
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current as any);
    }

    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      executeSave(logId, outboundPlan, returnPlan, activeLeg);
    }, 1500);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current as any);
      }
    };
  }, [outboundPlan, returnPlan, activeLeg, logId]);

  // Sauvegarde forcée lors du changement de visibilité (départ / masquage de l'onglet)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && logId) {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current as any);
          debounceTimerRef.current = null;
        }
        const currentHash = JSON.stringify({
          outbound: outboundPlanRef.current,
          return: returnPlanRef.current,
          activeLeg: activeLegRef.current,
        });
        if (currentHash !== lastSavedHashRef.current) {
          executeSave(
            logId,
            outboundPlanRef.current,
            returnPlanRef.current,
            activeLegRef.current
          );
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [logId]);

  // Action clic sur le bouton "Créer vol retour" / commutateur "Voir vol retour / aller"
  const handleReturnButtonClick = async () => {
    if (!returnPlan) {
      // État 1 : AÉRODROMES MANQUANTS
      if (!isReadyForReturn) {
        setShowReturnNote(true);
        if (returnNoteTimerRef.current) {
          clearTimeout(returnNoteTimerRef.current as any);
        }
        returnNoteTimerRef.current = setTimeout(() => {
          setShowReturnNote(false);
          returnNoteTimerRef.current = null;
        }, 4000);
        return;
      }

      // État 2 : PRÊT
      // Au clic : crée le vol retour, sauvegarde le log si ce n'était pas déjà fait
      // (génère l'identifiant et le lien), puis bascule l'affichage sur le retour.
      const newReturn = createReturnFlightPlan(outboundPlan);
      setReturnPlan(newReturn);
      setActiveLeg('return');

      let currentLogId = logId;
      if (!currentLogId) {
        currentLogId = generateLogId();
        setLogId(currentLogId);
        createdAtRef.current = new Date().toISOString();
        localStorage.setItem('skylog_current_log_id', currentLogId);
      }

      const searchParams = new URLSearchParams(window.location.search);
      searchParams.set('log', currentLogId);
      searchParams.set('v', 'retour');
      const newUrl = `${window.location.pathname}?${searchParams.toString()}`;
      window.history.replaceState(null, '', newUrl);

      setSaveStatus({ state: 'saving', label: 'Enregistrement...' });
      await executeSave(currentLogId, outboundPlan, newReturn, 'return');
    } else {
      // État 3 : UN RETOUR EXISTE
      // Le bouton devient un commutateur.
      const nextLeg: 'outbound' | 'return' = activeLeg === 'outbound' ? 'return' : 'outbound';
      setActiveLeg(nextLeg);

      const searchParams = new URLSearchParams(window.location.search);
      searchParams.set('v', nextLeg === 'return' ? 'retour' : 'aller');
      const newUrl = `${window.location.pathname}?${searchParams.toString()}`;
      window.history.replaceState(null, '', newUrl);
    }
  };

  // Action clic sur le bouton "Sauvegarder" ou "Échec — Réessayer"
  const handleManualSave = async () => {
    if (!logId) {
      // Premier enregistrement : génère l'identifiant unique JJ-MM-XXXXXX une fois pour toutes
      const newLogId = generateLogId();
      setLogId(newLogId);
      createdAtRef.current = new Date().toISOString();
      localStorage.setItem('skylog_current_log_id', newLogId);

      // Met à jour l'URL sans recharger la page
      const searchParams = new URLSearchParams(window.location.search);
      searchParams.set('log', newLogId);
      if (returnPlan) {
        searchParams.set('v', activeLeg === 'return' ? 'retour' : 'aller');
      }
      const newUrl = `${window.location.pathname}?${searchParams.toString()}`;
      window.history.replaceState(null, '', newUrl);

      setSaveStatus({ state: 'saving', label: 'Enregistrement...' });
      await executeSave(newLogId, outboundPlan, returnPlan, activeLeg);
    } else {
      // Document déjà existant ou relance après échec : force une sauvegarde immédiate
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current as any);
        debounceTimerRef.current = null;
      }
      setSaveStatus({ state: 'saving', label: 'Enregistrement...' });
      await executeSave(logId, outboundPlan, returnPlan, activeLeg);
    }
  };

  // Calcul mémorisé des URLs (statique après la première sauvegarde)
  const logUrls = useMemo(
    () =>
      logId
        ? {
            copyUrl: getLogUrl(logId, activeLeg === 'return' ? 'return' : undefined),
            displayUrl: getLogUrlForDisplay(logId, activeLeg === 'return' ? 'return' : undefined),
          }
        : { copyUrl: '', displayUrl: '' },
    [logId, activeLeg]
  );

  // Copie de l'URL complète dans le presse-papiers avec feedback
  const handleCopyUrl = async () => {
    if (!logId) return;
    const copyUrl = getLogUrl(logId, activeLeg === 'return' ? 'return' : undefined);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(copyUrl);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = copyUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Erreur lors de la copie du lien:', err);
    }
  };

  // Subscribe to live Firestore analytics counter
  useEffect(() => {
    const unsubscribe = subscribeToAnalytics((count) => {
      setLogsCreatedCount(count);
    });
    return () => unsubscribe();
  }, []);

  // Enregistrement unique de la visite au chargement + lecture de la veille
  useEffect(() => {
    if (visitRecordedRef.current) return;
    visitRecordedRef.current = true;

    const { today, yesterday } = getParisDateStrings();

    // Enregistrement atomique sans bloquer
    recordVisit(today);

    // Lecture de la veille
    fetchYesterdayVisitorCount(yesterday).then((count) => {
      setYesterdayVisitors(count);
    });
  }, []);

  // Écoute temps réel (LECTURE SEULE) du total cumulé de visiteurs
  useEffect(() => {
    const unsubscribe = subscribeToVisitorCount((count) => {
      setTotalVisitors(count);
    });
    return () => unsubscribe();
  }, []);

  // Weather dropdown menu & blank print states
  const [isWeatherMenuOpen, setIsWeatherMenuOpen] = useState<boolean>(false);
  const [isPrintingBlank, setIsPrintingBlank] = useState<boolean>(false);
  const weatherMenuRef = useRef<HTMLDivElement>(null);
  const mobileWeatherMenuRef = useRef<HTMLDivElement>(null);
  const [printBlankLeft, setPrintBlankLeft] = useState<number | null>(null);
  const headerContainerRef = useRef<HTMLDivElement>(null);
  const printCeLogBtnRef = useRef<HTMLButtonElement>(null);

  // Alignement précis du bord gauche de "Imprimer log vierge" sur celui de "Imprimer ce log"
  useEffect(() => {
    const updatePosition = () => {
      if (window.innerWidth < 1024) {
        setPrintBlankLeft(null);
        return;
      }
      if (printCeLogBtnRef.current && headerContainerRef.current) {
        const btnRect = printCeLogBtnRef.current.getBoundingClientRect();
        const headerRect = headerContainerRef.current.getBoundingClientRect();
        const leftOffset = btnRect.left - headerRect.left;
        setPrintBlankLeft(leftOffset);
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    const observer = new ResizeObserver(updatePosition);
    if (printCeLogBtnRef.current) observer.observe(printCeLogBtnRef.current);
    if (headerContainerRef.current) observer.observe(headerContainerRef.current);

    return () => {
      window.removeEventListener('resize', updatePosition);
      observer.disconnect();
    };
  }, [activeTab]);

  // Close weather menu when clicking outside (header toggle or outside click)
  useEffect(() => {
    if (!isWeatherMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedDesktop = weatherMenuRef.current && weatherMenuRef.current.contains(target);
      const clickedMobile = mobileWeatherMenuRef.current && mobileWeatherMenuRef.current.contains(target);
      if (!clickedDesktop && !clickedMobile) {
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
        <div
          ref={headerContainerRef}
          className="relative max-w-7xl mx-auto px-4 py-3 flex items-center justify-between min-h-[64px]"
        >
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
              <span className="hidden lg:block text-xs text-white font-medium mt-1 select-none leading-none">
                {logsCreatedCount !== null ? `${logsCreatedCount} logs créés.` : '... logs créés.'}
              </span>
            </div>
          </div>

          {/* Sur mobile : Compteur de logs tout en haut à droite */}
          <div className="lg:hidden flex items-center shrink-0">
            <span className="text-xs sm:text-sm text-white font-semibold select-none">
              {logsCreatedCount !== null ? `${logsCreatedCount} logs créés.` : '... logs créés.'}
            </span>
          </div>

          {/* 2 Header Items: Météo & Notam (aligné à droite sur la colonne Paramétrage), Calculette Vent ETE (aligné à gauche sur la colonne Log) */}
          {/* 1. Météo et notam Menu : bord droit calé sur calc(50% - 12px) */}
          <div
            className="hidden lg:flex absolute right-[calc(50%+12px)] top-1/2 -translate-y-1/2 items-center"
            ref={weatherMenuRef}
          >
            <button
              type="button"
              id="meteo-notam-header-btn"
              onClick={() => setIsWeatherMenuOpen((prev) => !prev)}
              className="h-10 px-3.5 bg-slate-200 hover:bg-slate-100 active:bg-slate-300 text-slate-900 border border-slate-300 font-semibold rounded-lg text-xs sm:text-sm flex items-center gap-2 shadow-2xs transition-colors cursor-pointer"
            >
              <Cloud className="w-4 h-4 text-slate-700 shrink-0" />
              <span>Météo et notam</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-700 transition-transform duration-150 ${
                  isWeatherMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isWeatherMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-xl border border-slate-200 py-1.5 z-50 text-slate-800 text-xs">
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
                  href="https://notaminfo.com/francemap"
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

          {/* 2. Calculette Vent ETE : bord gauche calé sur calc(50% + 12px) */}
          <div className="hidden lg:flex absolute left-[calc(50%+12px)] top-1/2 -translate-y-1/2 items-center">
            <button
              type="button"
              id="calculette-ete-header-btn"
              className="h-10 px-3.5 bg-slate-200 hover:bg-slate-100 active:bg-slate-300 text-slate-900 border border-slate-300 font-semibold rounded-lg text-xs sm:text-sm flex items-center gap-2 shadow-2xs transition-colors cursor-pointer"
              onClick={() => setShowWindCalc((v) => !v)}
              title="Calculette Vent ETE"
            >
              <Calculator className="w-4 h-4 text-slate-700 shrink-0" />
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

          {/* 3. Imprimer log vierge (bord gauche aligné sur le bord gauche de "Imprimer ce log") */}
          <div
            className="hidden lg:flex items-center"
            style={
              printBlankLeft !== null
                ? {
                    position: 'absolute',
                    left: `${printBlankLeft}px`,
                    top: '50%',
                    transform: 'translateY(-50%)',
                  }
                : undefined
            }
          >
            <button
              type="button"
              id="print-blank-log-header-btn"
              onClick={handlePrintBlankLog}
              className="h-8 px-3 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-400 hover:text-slate-300 border border-slate-500/70 hover:border-slate-400 rounded-lg text-xs font-normal flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
              title="Imprimer le log 100% vierge en double"
            >
              <Printer className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>Imprimer log vierge</span>
            </button>
          </div>
        </div>

        {/* Mobile Big Buttons (Calculette puis liens Météo) */}
        <div className="lg:hidden px-4 pt-1 pb-3 flex flex-col gap-2.5 items-center">
          {/* Gros bouton 1 : Calculette Vent ETE */}
          <div className="relative w-[74%] max-w-[280px]">
            <button
              type="button"
              id="mobile-calculette-btn"
              onClick={() => {
                setShowWindCalc((prev) => !prev);
                setIsWeatherMenuOpen(false);
              }}
              className="w-full h-[50px] px-3 bg-slate-100 hover:bg-white active:bg-slate-200 text-slate-900 font-bold rounded-2xl border border-slate-200 shadow-sm flex items-center justify-center gap-2 transition-colors text-xs sm:text-sm cursor-pointer"
            >
              <Calculator className="w-4 h-4 sm:w-5 sm:h-5 text-slate-700 shrink-0" />
              <span className="truncate">Calculette Vent ETE</span>
              <ChevronDown
                className={`w-4 h-4 text-slate-700 shrink-0 transition-transform duration-150 ${
                  showWindCalc ? 'rotate-180' : ''
                }`}
              />
            </button>

            {showWindCalc && (
              <WindCalculator
                isOpen={showWindCalc}
                onClose={() => setShowWindCalc(false)}
                aircraftModel={flightPlan.aircraftModel}
                cruiseSpeedKt={flightPlan.cruiseSpeedKt}
              />
            )}
          </div>

          {/* Gros bouton 2 : Météo et notam */}
          <div className="relative w-[74%] max-w-[280px]" ref={mobileWeatherMenuRef}>
            <button
              type="button"
              id="mobile-meteo-notam-btn"
              onClick={() => {
                setIsWeatherMenuOpen((prev) => !prev);
                setShowWindCalc(false);
              }}
              className="w-full h-[50px] px-3 bg-slate-100 hover:bg-white active:bg-slate-200 text-slate-900 font-bold rounded-2xl border border-slate-200 shadow-sm flex items-center justify-center gap-2 transition-colors text-xs sm:text-sm cursor-pointer"
            >
              <Cloud className="w-4 h-4 sm:w-5 sm:h-5 text-slate-700 shrink-0" />
              <span className="truncate">Météo et notam</span>
              <ChevronDown
                className={`w-4 h-4 text-slate-700 shrink-0 transition-transform duration-150 ${
                  isWeatherMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isWeatherMenuOpen && (
              <div className="absolute left-0 right-0 top-full mt-2 w-full bg-white rounded-2xl shadow-2xl border border-slate-200 py-2 z-50 text-slate-800 text-xs sm:text-sm">
                {/* AeroWeb */}
                <a
                  href="https://aviation.meteo.fr/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 flex items-center justify-between hover:bg-sky-50 text-slate-900 hover:text-sky-900 font-semibold transition-colors group"
                >
                  <span>AeroWeb</span>
                  <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-sky-600" />
                </a>

                {/* Ligne de séparation discrète */}
                <div className="border-t border-slate-200 my-1" />

                {/* Windy Header */}
                <div className="px-4 py-1 text-xs font-bold text-slate-900">
                  <span>Windy :</span>
                </div>

                {/* Vent Sol (SFC) */}
                <a
                  href="https://www.windy.com/fr/-Menu/menu?47.499,1.608,7,i:pressure,p:favs,m:e1Uagds"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-1.5 pl-5 flex items-center justify-between hover:bg-sky-50 text-slate-800 hover:text-sky-900 transition-colors"
                >
                  <span>Vent Sol (SFC)</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                </a>

                {/* Vent 900m (FL030) */}
                <a
                  href="https://www.windy.com/fr/-Menu/menu?900h,47.499,1.608,7,i:pressure,p:favs,m:e1Uagds"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-1.5 pl-5 flex items-center justify-between hover:bg-sky-50 text-slate-800 hover:text-sky-900 transition-colors"
                >
                  <span>Vent 900m (FL030)</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                </a>

                {/* Vent 2000m (FL060) */}
                <a
                  href="https://www.windy.com/fr/-Menu/menu?800h,47.499,1.608,7,i:pressure,p:favs,m:e1Uagds"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-1.5 pl-5 flex items-center justify-between hover:bg-sky-50 text-slate-800 hover:text-sky-900 transition-colors"
                >
                  <span>Vent 2000m (FL060)</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                </a>

                {/* Base des nuages (Plafond) */}
                <a
                  href="https://www.windy.com/fr/-Menu/menu?cbase,47.499,1.608,7,i:pressure,p:favs,m:eYEagfL"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-1.5 pl-5 flex items-center justify-between hover:bg-sky-50 text-slate-800 hover:text-sky-900 transition-colors"
                >
                  <span>Base des nuages (Plafond)</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                </a>

                {/* Visibilité */}
                <a
                  href="https://www.windy.com/fr/-Menu/menu?visibility,47.175,0.397,6,i:pressure,p:favs,m:eUNaf6H"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-1.5 pl-5 flex items-center justify-between hover:bg-sky-50 text-slate-800 hover:text-sky-900 transition-colors"
                >
                  <span>Visibilité</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                </a>

                {/* Ligne de séparation discrète */}
                <div className="border-t border-slate-200 my-1" />

                {/* NOTAM Info */}
                <a
                  href="https://notaminfo.com/francemap"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 flex items-center justify-between hover:bg-sky-50 text-slate-900 hover:text-sky-900 font-semibold transition-colors group"
                >
                  <span>NOTAM Info</span>
                  <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-sky-600" />
                </a>

                {/* Ligne de séparation discrète */}
                <div className="border-t border-slate-200 my-1" />

                {/* Lever / Coucher soleil */}
                <a
                  href="https://www.sunrise-and-sunset.com/fr/sun/france/strasbourg"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 flex items-center justify-between hover:bg-sky-50 text-slate-900 hover:text-sky-900 font-semibold transition-colors group"
                >
                  <span>Lever / Coucher soleil</span>
                  <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-sky-600" />
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Sub-Navigation Tabs */}
        <div className="lg:hidden flex border-t border-slate-800 px-4 bg-slate-950/50">
          <button
            type="button"
            id="mobile-tab-editor"
            onClick={() => setActiveTab('editor')}
            className={`flex-1 py-2.5 text-xs font-bold text-center border-b-2 transition-colors ${
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
            className={`flex-1 py-2.5 text-xs font-bold text-center border-b-2 transition-colors ${
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
          <div className="relative flex items-center justify-between gap-2 min-w-0 min-h-[32px] lg:min-h-[40px]">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 shrink-0 z-10">
              <button
                type="button"
                id="easter-egg-default-flight-btn"
                onClick={handleEasterEggDefaultFlight}
                className="hover:scale-110 active:scale-95 transition-transform p-0.5 rounded cursor-pointer group focus:outline-none"
                title="Easter egg : paramétrer mon vol par défaut (P200, F-JUJN, 17L/h, 90kt, LFPX Chavenay)"
              >
                <FileText className="w-4 h-4 text-sky-600 group-hover:text-sky-800 transition-colors shrink-0" />
              </button>
              <span>Paramétrage</span>
            </h2>

            {/* Bouton GPX centré sur la colonne paramétrage */}
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center z-10 pointer-events-auto">
              <button
                type="button"
                id="import-gpx-btn"
                onClick={() => gpxFileInputRef.current?.click()}
                disabled={isImportingGpx}
                className="h-8 lg:h-10 px-2.5 lg:px-3.5 lg:py-2 bg-sky-700 hover:bg-sky-800 active:bg-sky-900 disabled:opacity-60 text-white rounded-lg text-xs lg:text-sm font-bold flex items-center justify-center gap-1.5 lg:gap-2 shadow-2xs lg:shadow-sm hover:shadow transition-all cursor-pointer whitespace-nowrap shrink-0"
                title="Importer un fichier GPX SkyVector"
              >
                {isImportingGpx ? (
                  <Loader2 className="w-3.5 h-3.5 lg:w-4 lg:h-4 animate-spin shrink-0" />
                ) : (
                  <Upload className="w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0" />
                )}
                <span>GPX</span>
              </button>

              <input
                ref={gpxFileInputRef}
                type="file"
                accept=".gpx"
                className="hidden"
                onChange={handleGpxFileChange}
              />
            </div>

            {/* Bouton vol retour à trois états sur la bordure droite de la colonne paramètre */}
            <div className="relative flex items-center justify-end z-20">
              <button
                type="button"
                id="return-flight-btn"
                onClick={handleReturnButtonClick}
                className={`h-8 lg:h-10 px-2.5 lg:px-3.5 lg:py-2 rounded-lg text-xs lg:text-sm font-bold flex items-center justify-center gap-1.5 lg:gap-2 transition-all cursor-pointer whitespace-nowrap min-w-[145px] lg:min-w-[165px] ${
                  !returnPlan
                    ? isReadyForReturn
                      ? 'bg-sky-700 hover:bg-sky-800 active:bg-sky-900 text-white shadow-2xs lg:shadow-sm hover:shadow'
                      : 'bg-slate-200 hover:bg-slate-200 text-slate-400 border border-slate-300 shadow-2xs'
                    : 'bg-sky-700 hover:bg-sky-800 active:bg-sky-900 text-white shadow-2xs lg:shadow-sm hover:shadow'
                }`}
                title={
                  !returnPlan
                    ? isReadyForReturn
                      ? 'Créer le vol retour'
                      : 'Aérodromes manquants pour créer le vol retour'
                    : activeLeg === 'outbound'
                    ? 'Basculer vers le vol retour'
                    : 'Basculer vers le vol aller'
                }
              >
                {!returnPlan ? (
                  <Wrench className="w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0" />
                ) : (
                  <ArrowLeftRight className="w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0" />
                )}
                <span>
                  {!returnPlan
                    ? 'Créer vol retour'
                    : activeLeg === 'outbound'
                    ? 'Voir vol retour'
                    : 'Voir vol aller'}
                </span>
              </button>

              {/* Note explicative visible 4 secondes à l'écran si clic en État 1 */}
              {showReturnNote && (
                <div
                  id="return-flight-explanation-note"
                  role="alert"
                  className="absolute right-0 top-full mt-2 w-72 sm:w-80 p-3 bg-amber-50 border border-amber-300 text-amber-900 text-xs rounded-lg shadow-lg z-50 animate-in fade-in slide-in-from-top-1 pointer-events-none text-left"
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="leading-snug font-medium">
                      Renseignez un aérodrome de départ et un aérodrome d'arrivée pour créer le vol retour.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <FlightPlanEditor
            flightPlan={flightPlan}
            onChange={setFlightPlan}
            openAipApiKey={openAipApiKey}
            onOpenAipApiKeyChange={setOpenAipApiKey}
            onLoadingChange={setIsLogLoading}
            onEasterEgg={handleEasterEggDefaultFlight}
          />
        </div>

        {/* RIGHT COLUMN: LIVE A5 KNEEBOARD PREVIEW */}
        <div
          className={`w-full lg:w-1/2 flex flex-col items-center sticky top-20 ${
            activeTab === 'editor' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* Preview Toolbar (Bouton Sauvegarder ou Barre d'état + Lien à gauche, Imprimer à droite) */}
          <div className="no-print w-full max-w-[148mm] flex items-center justify-between gap-2 mb-2 px-1">
            {/* GAUCHE : Outil de sauvegarde */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap min-w-0">
              {!logId ? (
                <button
                  type="button"
                  id="save-flight-log-btn"
                  onClick={handleManualSave}
                  disabled={isSaving}
                  className="h-10 px-3.5 py-2 bg-sky-700 hover:bg-sky-800 active:bg-sky-900 disabled:opacity-60 text-white rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-sm hover:shadow transition-all cursor-pointer"
                  title="Sauvegarder le plan de vol"
                >
                  <Save className="w-4 h-4 shrink-0" />
                  <span>Sauvegarder</span>
                </button>
              ) : (
                <>
                  {/* BOÎTE STATUT D'ENREGISTREMENT : format quasi carré avec pastille et picto */}
                  <button
                    type="button"
                    id="log-status-bar"
                    disabled={saveStatus.state !== 'error' || isSaving}
                    onClick={saveStatus.state === 'error' ? handleManualSave : undefined}
                    className={`h-10 w-12 rounded-lg flex items-center justify-center gap-1.5 border transition-all shrink-0 select-none ${
                      saveStatus.state === 'error'
                        ? 'bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border-rose-300 text-rose-700 cursor-pointer shadow-2xs'
                        : saveStatus.state === 'saving'
                        ? 'bg-slate-100 border-slate-200 text-slate-700 cursor-default'
                        : 'bg-slate-100 border-slate-200 text-slate-700 cursor-default'
                    }`}
                    title={
                      saveStatus.state === 'error'
                        ? 'Erreur lors de l’enregistrement. Cliquez pour réessayer.'
                        : saveStatus.state === 'saving'
                        ? 'Enregistrement en cours...'
                        : 'Enregistré'
                    }
                  >
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        saveStatus.state === 'error'
                          ? 'bg-rose-500'
                          : saveStatus.state === 'saving'
                          ? 'bg-amber-500 animate-pulse'
                          : 'bg-emerald-500'
                      }`}
                    />
                    {saveStatus.state === 'error' ? (
                      <X className="w-4 h-4 text-rose-600 shrink-0" strokeWidth={2.5} />
                    ) : saveStatus.state === 'saving' ? (
                      <Loader2 className="w-4 h-4 text-amber-500 animate-spin shrink-0" />
                    ) : (
                      <Save className="w-4 h-4 text-emerald-600 shrink-0" />
                    )}
                  </button>

                  {/* LIEN (élément de droite) : picto copier en premier, URL sans https://, et texte 'Conservez ce lien pour ce log' */}
                  <button
                    type="button"
                    id="log-share-link-btn"
                    onClick={handleCopyUrl}
                    title="Conservez ce lien pour retrouver et modifier ce log"
                    className="h-10 pl-2.5 pr-3.5 bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-300 text-slate-700 hover:text-slate-900 rounded-lg flex items-center gap-2 transition-colors cursor-pointer shadow-2xs min-w-0 max-w-[260px] sm:max-w-[320px] overflow-hidden"
                  >
                    {isCopied ? (
                      <div className="flex items-center gap-2 min-w-0 w-full">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <div className="flex flex-col items-start justify-center text-left min-w-0 overflow-hidden w-full">
                          <span className="font-semibold text-[11px] sm:text-xs text-emerald-700 leading-tight block truncate w-full">
                            Copié !
                          </span>
                          <span className="text-[9.5px] text-slate-500 font-normal leading-tight mt-0.5 block truncate w-full">
                            Conservez ce lien pour ce log
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 min-w-0 w-full">
                        <Copy className="w-4 h-4 text-slate-400 shrink-0" />
                        <div className="flex flex-col items-start justify-center text-left min-w-0 overflow-hidden w-full">
                          <span className="font-mono text-[11px] sm:text-xs text-sky-700 hover:underline underline-offset-2 font-semibold leading-tight block truncate w-full">
                            {logUrls.displayUrl}
                          </span>
                          <span className="text-[9.5px] text-slate-500 font-normal leading-tight mt-0.5 block truncate w-full">
                            Conservez ce lien pour ce log
                          </span>
                        </div>
                      </div>
                    )}
                  </button>
                </>
              )}
            </div>

            {/* DROITE : Bouton Imprimer ce log (+ Imprimer log vierge sur mobile) */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Sur mobile, 'Imprimer log vierge' apparaît ici dans la page 2 Aperçu */}
              <button
                type="button"
                id="mobile-print-blank-log-preview-btn"
                onClick={handlePrintBlankLog}
                className="lg:hidden h-10 px-3 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 hover:text-white border border-slate-600/80 rounded-lg text-xs font-normal flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
                title="Imprimer le log 100% vierge en double"
              >
                <Printer className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Imprimer log vierge</span>
              </button>

              <button
                ref={printCeLogBtnRef}
                type="button"
                id="quick-print-preview-btn"
                onClick={() => handlePrint()}
                className="h-10 px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm hover:shadow transition-all cursor-pointer whitespace-nowrap"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimer ce log</span>
              </button>
            </div>
          </div>

          {/* Interactive A5 Sheet Preview */}
          <div className="overflow-x-auto w-full flex justify-center py-2 bg-slate-200/60 rounded-xl border border-slate-300 shadow-inner relative min-h-[400px]">
            <div className={`transition-opacity duration-200 ${isLogLoading ? 'opacity-30 pointer-events-none select-none' : ''}`}>
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
            {isLogLoading && (
              <div className="absolute inset-0 bg-slate-900/15 backdrop-blur-[1.5px] rounded-xl flex flex-col items-center justify-center gap-3 z-30 pointer-events-none">
                <div className="bg-white/95 px-4 py-2.5 rounded-xl shadow-lg border border-slate-200 flex items-center gap-2.5">
                  <Loader2 className="w-5 h-5 text-sky-600 animate-spin" />
                  <span className="text-xs font-bold text-slate-800">
                    Chargement des données du log...
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* FOOTER : Compteurs de visites */}
      <footer className="no-print mt-auto py-3 px-4 border-t border-slate-800 bg-slate-900 text-center text-xs select-none">
        <div className="max-w-7xl mx-auto flex items-center justify-center flex-wrap gap-x-2 gap-y-1">
          <span className="font-medium text-white">
            Pilotes visiteurs : <span className="font-bold text-white">{totalVisitors !== null ? totalVisitors : '—'}</span>
          </span>
          <span className="text-slate-600 font-light select-none">·</span>
          <span className="text-slate-400 font-normal">
            Visiteurs hier : <span className="text-slate-300 font-normal">{yesterdayVisitors !== null ? yesterdayVisitors : '—'}</span>
          </span>
        </div>
      </footer>

      {/* 3. DEDICATED PRINT CONTAINER (Active ONLY during browser print @media print) */}
      <div className="print-only hidden">
        <div className="w-full">
          <A5KneeboardView
            flightPlan={isPrintingBlank ? BLANK_FLIGHT_PLAN : flightPlan}
            isPrintMode={true}
            duplicateIfSinglePage={isPrintingBlank}
            isBlankLog={isPrintingBlank}
          />
        </div>
      </div>

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

      {/* 5. GPX CONFIRMATION MODAL */}
      {showGpxConfirmModal && (
        <div className="no-print fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-2xl border border-slate-200 text-slate-800 text-xs space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Upload className="w-4 h-4 text-sky-700" />
                <span>Remplacer les waypoints existants ?</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowGpxConfirmModal(false);
                  setPendingGpxText(null);
                }}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <p className="text-slate-700 leading-relaxed">
              Le plan de vol actuel contient déjà des waypoints. L'importation du fichier GPX SkyVector
              remplacera le départ, l'arrivée, les waypoints et les branches de navigation.
              Tous vos autres paramètres de vol (avion, immatriculation, vitesse, vent, carburant, etc.) seront conservés.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => {
                  setShowGpxConfirmModal(false);
                  setPendingGpxText(null);
                }}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-xs transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                id="confirm-gpx-replace-btn"
                onClick={() => {
                  if (pendingGpxText) {
                    executeGpxImport(pendingGpxText);
                  }
                }}
                disabled={isImportingGpx}
                className="px-3.5 py-2 bg-sky-700 hover:bg-sky-800 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {isImportingGpx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Remplacer les waypoints</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. GPX ERROR MODAL */}
      {gpxErrorMessage && (
        <div className="no-print fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-2xl border border-rose-200 text-slate-800 text-xs space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-sm text-rose-700 flex items-center gap-2">
                <Info className="w-4 h-4 text-rose-600" />
                <span>Erreur d'import GPX</span>
              </h3>
              <button
                type="button"
                onClick={() => setGpxErrorMessage(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <p className="text-slate-700 leading-relaxed font-medium">
              {gpxErrorMessage}
            </p>

            <div className="flex justify-end pt-2 border-t">
              <button
                type="button"
                onClick={() => setGpxErrorMessage(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
