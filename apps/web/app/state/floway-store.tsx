'use client';

/**
 * Socle d'état partagé de Floway — phase 1 du plan de refonte.
 *
 * Objectif : remplacer la coordination par le DOM (querySelector sur des
 * classes CSS, MutationObserver, patches du setter natif des inputs,
 * monkey-patch de window.fetch) par un état React unique que les composants
 * lisent et écrivent normalement.
 *
 * Ce fichier démarre avec l'origine du trajet, migrée depuis l'ancien layer
 * `current-location-origin.tsx`. Les autres domaines (véhicule, session,
 * lieux favoris, carburant) viendront s'y ajouter au fil des migrations,
 * un layer par commit.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { EnergyKind, TripContext, VehicleProfile, VehicleSize } from '../lib/vehicles/types';
import {
  estimateBattery,
  estimateElectricConsumption,
  estimateFuelConsumption,
  estimateTank,
} from '../lib/vehicles/capacity-estimates';

const AUTO_ORIGIN_KEY = 'floway:auto-origin';
const VEHICLE_KEY = 'floway:vehicle-profile';
const TRIP_CONTEXT_KEY = 'floway:trip-context';
const LAST_ORIGIN_KEY = 'floway:last-origin-gps';

/** Au-delà de ce délai, une position mémorisée est considérée comme périmée. */
const POSITION_MAX_AGE_MS = 10 * 60 * 1000;

export type OriginMode = 'auto' | 'manual';
export type GeoStatus = 'idle' | 'locating' | 'ready' | 'denied' | 'unavailable';

export type GeoOrigin = {
  lat: number;
  lon: number;
  accuracy: number;
  label: string;
  updatedAt: number;
};

export const DEFAULT_TRIP_CONTEXT: TripContext = {
  fuelLevelPct: 75,
  batteryLevelPct: 80,
  reservePct: 10,
  passengers: 1,
  meal: 'auto',
};

/**
 * Construit un profil à partir du seul couple gabarit / énergie.
 *
 * Toutes les valeurs sortent estimées : c'est le point de départ que
 * l'utilisateur va corriger, pas une vérité.
 */
export function buildEstimatedProfile(
  size: VehicleSize,
  energyKind: EnergyKind,
  name = '',
): VehicleProfile {
  const tank = estimateTank(size, energyKind);
  const battery = estimateBattery(size, energyKind);
  const fuel = estimateFuelConsumption(size, energyKind);
  const electric = estimateElectricConsumption(size, energyKind);
  return {
    name,
    energyKind,
    size,
    tank: tank ? { value: tank.suggested, provenance: 'estimee' } : null,
    battery: battery ? { value: battery.suggested, provenance: 'estimee' } : null,
    fuelConsumption: fuel ? { value: fuel, provenance: 'estimee' } : null,
    electricConsumption: electric ? { value: electric, provenance: 'estimee' } : null,
  };
}

type FlowayStore = {
  /** 'auto' : le départ suit la position GPS. 'manual' : l'utilisateur saisit. */
  originMode: OriginMode;
  setOriginMode: (mode: OriginMode) => void;
  /** Dernière position connue, ou null. */
  geoOrigin: GeoOrigin | null;
  /** Vrai si `geoOrigin` est encore assez récente pour être utilisée telle quelle. */
  geoOriginIsFresh: boolean;
  geoStatus: GeoStatus;
  /** Message court destiné à l'utilisateur, déjà formulé en français. */
  geoMessage: string;
  /** Déclenche une localisation. Sans effet si une requête est déjà en vol. */
  locate: () => void;

  /** Véhicule retenu, ou null tant que l'utilisateur n'a rien renseigné. */
  vehicle: VehicleProfile | null;
  setVehicle: (profile: VehicleProfile | null) => void;
  /** Contexte du trajet en cours : niveaux, réserve, passagers, repas. */
  trip: TripContext;
  setTrip: (patch: Partial<TripContext>) => void;
  /** Vrai une fois que l'utilisateur a validé son véhicule au moins une fois. */
  vehicleConfirmed: boolean;
  setVehicleConfirmed: (confirmed: boolean) => void;
};

const FlowayStoreContext = createContext<FlowayStore | null>(null);

/**
 * Relit une position mémorisée en validant sa forme.
 *
 * La validation n'est pas défensive par principe : l'ancien code faisait
 * `{...defaut, ...JSON.parse(brut)}` sans contrôle, ce qui laissait un champ
 * hérité d'une version précédente propager des `NaN` dans tout le calcul.
 */
function readStoredOrigin(): GeoOrigin | null {
  try {
    const raw = localStorage.getItem(LAST_ORIGIN_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<GeoOrigin>;
    if (!Number.isFinite(value?.lat) || !Number.isFinite(value?.lon)) return null;
    if (typeof value?.label !== 'string' || !value.label.trim()) return null;
    if (!Number.isFinite(value?.updatedAt)) return null;
    return {
      lat: value.lat as number,
      lon: value.lon as number,
      accuracy: Number.isFinite(value.accuracy) ? (value.accuracy as number) : 0,
      label: value.label.trim(),
      updatedAt: value.updatedAt as number,
    };
  } catch {
    return null;
  }
}

/** Écriture tolérante : en navigation privée, `setItem` peut lever. */
/** Relit un objet JSON du stockage local sans jamais lever. */
function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? (value as T) : null;
  } catch {
    return null;
  }
}

/** Nombre borné, avec repli sur une valeur par défaut si l'entrée est invalide. */
function numberOr(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Quota ou stockage indisponible : l'état reste valable en mémoire.
  }
}

export function FlowayStoreProvider({ children }: { children: ReactNode }) {
  const [originMode, setOriginModeState] = useState<OriginMode>('auto');
  const [geoOrigin, setGeoOrigin] = useState<GeoOrigin | null>(null);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>('idle');
  const [geoMessage, setGeoMessage] = useState('');
  const [now, setNow] = useState(0);
  const [vehicle, setVehicleState] = useState<VehicleProfile | null>(null);
  const [trip, setTripState] = useState<TripContext>(DEFAULT_TRIP_CONTEXT);
  const [vehicleConfirmed, setVehicleConfirmedState] = useState(false);
  const locateInFlight = useRef(false);

  // Hydratation depuis le stockage local, après le montage uniquement :
  // localStorage n'existe pas au rendu serveur.
  useEffect(() => {
    setNow(Date.now());
    const stored = readStoredOrigin();
    if (stored) {
      setGeoOrigin(stored);
      if (Date.now() - stored.updatedAt < POSITION_MAX_AGE_MS) {
        setGeoStatus('ready');
        setGeoMessage(`Position mémorisée · GPS ±${Math.round(stored.accuracy)} m`);
      }
    }
    try {
      if (localStorage.getItem(AUTO_ORIGIN_KEY) === '0') setOriginModeState('manual');
    } catch {
      // Stockage indisponible : on reste sur le mode automatique par défaut.
    }

    // Le profil et le contexte sont relus en vérifiant leur forme : un objet
    // hérité d'une version précédente ne doit pas propager des NaN dans les
    // calculs d'autonomie.
    const storedVehicle = readJson<VehicleProfile>(VEHICLE_KEY);
    if (storedVehicle && typeof storedVehicle.energyKind === 'string' && storedVehicle.size) {
      setVehicleState(storedVehicle);
      setVehicleConfirmedState(true);
    }
    const storedTrip = readJson<Partial<TripContext>>(TRIP_CONTEXT_KEY);
    if (storedTrip) {
      setTripState({
        fuelLevelPct: numberOr(storedTrip.fuelLevelPct, DEFAULT_TRIP_CONTEXT.fuelLevelPct, 0, 100),
        batteryLevelPct: numberOr(storedTrip.batteryLevelPct, DEFAULT_TRIP_CONTEXT.batteryLevelPct, 0, 100),
        reservePct: numberOr(storedTrip.reservePct, DEFAULT_TRIP_CONTEXT.reservePct, 0, 40),
        passengers: Math.round(numberOr(storedTrip.passengers, DEFAULT_TRIP_CONTEXT.passengers, 1, 9)),
        meal: storedTrip.meal === 'oui' || storedTrip.meal === 'non' ? storedTrip.meal : 'auto',
      });
    }
  }, []);

  const setVehicle = useCallback((profile: VehicleProfile | null) => {
    setVehicleState(profile);
    if (profile) writeStorage(VEHICLE_KEY, JSON.stringify(profile));
  }, []);

  const setTrip = useCallback((patch: Partial<TripContext>) => {
    setTripState((current) => {
      const next = { ...current, ...patch };
      writeStorage(TRIP_CONTEXT_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setVehicleConfirmed = useCallback((confirmed: boolean) => {
    setVehicleConfirmedState(confirmed);
  }, []);

  const setOriginMode = useCallback((mode: OriginMode) => {
    setOriginModeState(mode);
    writeStorage(AUTO_ORIGIN_KEY, mode === 'auto' ? '1' : '0');
    if (mode === 'manual') {
      setGeoStatus('idle');
      setGeoMessage('Départ saisi manuellement');
    }
  }, []);

  const locate = useCallback(() => {
    if (locateInFlight.current) return;

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoStatus('unavailable');
      setGeoMessage('GPS indisponible · saisissez un départ');
      return;
    }

    locateInFlight.current = true;
    setGeoStatus('locating');
    setGeoMessage('Localisation en cours…');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        let label = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

        // Le géocodage inverse est un confort : son échec ne doit pas
        // empêcher d'utiliser les coordonnées comme libellé de départ.
        try {
          const response = await fetch(
            `/api/reverse-geocode?lat=${latitude}&lon=${longitude}`,
            { cache: 'no-store' },
          );
          const data = await response.json();
          if (typeof data?.label === 'string' && data.label.trim()) label = data.label.trim();
        } catch {
          // On garde les coordonnées brutes.
        }

        const next: GeoOrigin = {
          lat: latitude,
          lon: longitude,
          accuracy,
          label,
          updatedAt: Date.now(),
        };
        writeStorage(LAST_ORIGIN_KEY, JSON.stringify(next));
        setGeoOrigin(next);
        setNow(Date.now());
        setGeoStatus('ready');
        setGeoMessage(`Ma position actuelle · GPS ±${Math.round(accuracy)} m`);
        locateInFlight.current = false;
      },
      (error) => {
        locateInFlight.current = false;
        const denied = error.code === error.PERMISSION_DENIED;
        setGeoStatus(denied ? 'denied' : 'unavailable');
        setGeoMessage(
          denied
            ? 'Localisation refusée · autorisez le GPS ou saisissez un départ'
            : 'Position GPS indisponible · saisissez un départ',
        );
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 12000 },
    );
  }, []);

  const geoOriginIsFresh = Boolean(geoOrigin && now - geoOrigin.updatedAt < POSITION_MAX_AGE_MS);

  const value = useMemo<FlowayStore>(
    () => ({
      originMode, setOriginMode, geoOrigin, geoOriginIsFresh, geoStatus, geoMessage, locate,
      vehicle, setVehicle, trip, setTrip, vehicleConfirmed, setVehicleConfirmed,
    }),
    [
      originMode, setOriginMode, geoOrigin, geoOriginIsFresh, geoStatus, geoMessage, locate,
      vehicle, setVehicle, trip, setTrip, vehicleConfirmed, setVehicleConfirmed,
    ],
  );

  return <FlowayStoreContext.Provider value={value}>{children}</FlowayStoreContext.Provider>;
}

/**
 * Branche un champ « Départ » sur la localisation automatique.
 *
 * Contient toute la logique, aucun rendu : chaque page garde son propre
 * balisage et ses propres classes. `floway-v3` et `/ev` n'ont pas la même
 * structure de formulaire, mais elles partagent ce comportement.
 */
export function useOriginAuto(value: string, onChange: (v: string) => void) {
  const store = useFlowayStore();
  const { originMode, geoOrigin, geoOriginIsFresh, geoStatus, locate } = store;
  const auto = originMode === 'auto';

  // Relance une localisation si la dernière position connue est périmée.
  useEffect(() => {
    if (auto && !geoOriginIsFresh && geoStatus === 'idle') locate();
  }, [auto, geoOriginIsFresh, geoStatus, locate]);

  // Le libellé GPS devient la valeur du champ : c'est lui qui partira dans la
  // requête, sans que personne n'ait à réécrire l'URL après coup.
  useEffect(() => {
    if (auto && geoOrigin && geoOrigin.label !== value) onChange(geoOrigin.label);
  }, [auto, geoOrigin, value, onChange]);

  return {
    ...store,
    auto,
    failed: geoStatus === 'denied' || geoStatus === 'unavailable',
    /** Bascule automatique <-> manuel. */
    toggle: () => {
      if (auto) {
        store.setOriginMode('manual');
      } else {
        store.setOriginMode('auto');
        locate();
      }
    },
  };
}

export function useFlowayStore(): FlowayStore {
  const store = useContext(FlowayStoreContext);
  if (!store) throw new Error('useFlowayStore doit être utilisé dans <FlowayStoreProvider>');
  return store;
}
