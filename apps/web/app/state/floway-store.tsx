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
const LAST_ROUTE_KEY = 'floway:last-route';
const SAVED_PLACES_KEY = 'floway:saved-places';
const FAVORITE_ROUTES_KEY = 'floway:favorite-routes';
const ACKNOWLEDGED_ALERTS_KEY = 'floway:alertes-acquittees';

/** Au-dela, la liste d'acquittements ne sert plus a rien : on la borne. */
const MAX_ACKNOWLEDGED_ALERTS = 200;
/** Au-dela, les favoris les plus anciens sortent de la liste. */
const MAX_FAVORITE_ROUTES = 8;
/** Ancienne cle du layer `session-restore`, retiree en phase 1. */
const LEGACY_SESSION_KEY = 'floway:active-session';

/** Au-delà de ce délai, une position mémorisée est considérée comme périmée. */
const POSITION_MAX_AGE_MS = 10 * 60 * 1000;

export type OriginMode = 'auto' | 'manual';
export type GeoStatus = 'idle' | 'locating' | 'ready' | 'denied' | 'unavailable';

/** Dernier trajet calcule avec succes, tel qu'il repart au prochain demarrage. */
export type LastRoute = {
  origin: string;
  destination: string;
};

/** Destination memorisee, proposee en raccourci dans la fenetre d'itineraire. */
export type SavedPlace = {
  id: string;
  label: string;
  /** Vide tant que l'utilisateur n'a pas renseigne l'adresse. */
  address: string;
  icon: string;
  /** Les trois emplacements toujours proposes, meme vides. */
  priority: boolean;
};

/** Toujours presents, meme sans adresse : ils invitent a la renseigner. */
export const DEFAULT_PLACES: readonly SavedPlace[] = [
  { id: 'home', label: 'Domicile', address: '', icon: '🏠', priority: true },
  { id: 'work', label: 'Bureau', address: '', icon: '💼', priority: true },
  { id: 'second-home', label: 'Maison secondaire', address: '', icon: '⭐', priority: true },
];

/** Itineraire mis de cote, rejouable en un clic. */
export type FavoriteRoute = {
  id: string;
  origin: string;
  destination: string;
  savedAt: number;
};

/** Cle de comparaison de deux itineraires, insensible a la casse. */
export function routeKey(origin: string, destination: string): string {
  return `${origin.trim().toLowerCase()}::${destination.trim().toLowerCase()}`;
}

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

  /** Dernier trajet calculé, ou null au tout premier lancement. */
  lastRoute: LastRoute | null;
  setLastRoute: (route: LastRoute) => void;
  /**
   * Vrai une fois la relecture du stockage local terminée.
   *
   * Les effets des enfants s'exécutent avant ceux du provider : un composant
   * qui a besoin d'une valeur persistée pour son premier chargement doit
   * attendre ce drapeau, sinon il lit un état encore vide.
   */
  hydrated: boolean;

  /** Destinations mémorisées : les trois emplacements fixes, puis les favoris. */
  savedPlaces: SavedPlace[];
  /** Renseigne ou corrige l'adresse d'un emplacement existant. */
  setPlaceAddress: (id: string, address: string) => void;
  /** Ajoute un favori. Sans effet si le nom ou l'adresse est vide. */
  addSavedPlace: (label: string, address: string) => void;
  /** Retire un favori. Les trois emplacements fixes ne sont jamais retirés. */
  removeSavedPlace: (id: string) => void;

  /** Itinéraires mis de côté, du plus récent au plus ancien. */
  favoriteRoutes: FavoriteRoute[];
  /** Cles d'alertes deja vues, pour que la pastille puisse s'eteindre. */
  acknowledgedAlerts: string[];
  acknowledgeAlerts: (keys: string[]) => void;
  /** Oublie les acquittements d'incidents qui ne sont plus sur la route. */
  pruneAcknowledgedAlerts: (present: string[]) => void;
  /** Ajoute l'itinéraire s'il est absent, le retire s'il est déjà là. Rend l'état obtenu. */
  toggleFavoriteRoute: (origin: string, destination: string) => boolean;
  removeFavoriteRoute: (id: string) => void;
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

/**
 * Relit le dernier trajet en verifiant sa forme.
 *
 * L'ancien layer `session-restore` memorisait le libelle *raccourci* affiche
 * dans l'en-tete (`placeLabel`), pas le libelle complet : un depart GPS y
 * etait ecrit « Position GPS », chaine qu'aucun geocodeur ne sait resoudre.
 * On repart donc d'une cle neuve et on ignore ce qui reste de l'ancienne.
 */
function readLastRoute(): LastRoute | null {
  const value = readJson<Partial<LastRoute>>(LAST_ROUTE_KEY);
  const origin = typeof value?.origin === 'string' ? value.origin.trim() : '';
  const destination = typeof value?.destination === 'string' ? value.destination.trim() : '';
  if (!origin || !destination) return null;
  return { origin, destination };
}

/**
 * Relit les destinations memorisees en verifiant leur forme.
 *
 * Les trois emplacements fixes sont toujours presents en tete, complets de
 * leur adresse si elle a ete renseignee ; les favoris libres suivent.
 */
function readSavedPlaces(): SavedPlace[] {
  let raw: unknown = null;
  try {
    raw = JSON.parse(localStorage.getItem(SAVED_PLACES_KEY) || '[]');
  } catch {
    return DEFAULT_PLACES.map((p) => ({ ...p }));
  }
  if (!Array.isArray(raw)) return DEFAULT_PLACES.map((p) => ({ ...p }));

  const clean = raw.flatMap((value): SavedPlace[] => {
    const v = value as Partial<SavedPlace>;
    if (typeof v?.id !== 'string' || !v.id.trim()) return [];
    if (typeof v?.label !== 'string' || !v.label.trim()) return [];
    return [{
      id: v.id,
      label: v.label.trim(),
      address: typeof v.address === 'string' ? v.address.trim() : '',
      icon: typeof v.icon === 'string' && v.icon ? v.icon : '☆',
      priority: v.priority === true,
    }];
  });

  const byId = new Map(clean.map((p) => [p.id, p]));
  const fixed = DEFAULT_PLACES.map((d) => ({ ...d, address: byId.get(d.id)?.address ?? '' }));
  const extra = clean.filter((p) => !DEFAULT_PLACES.some((d) => d.id === p.id));
  return [...fixed, ...extra];
}

/** Relit les alertes acquittees, en ne gardant que des cles exploitables. */
function readAcknowledgedAlerts(): string[] {
  let raw: unknown = null;
  try {
    raw = JSON.parse(localStorage.getItem(ACKNOWLEDGED_ALERTS_KEY) || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string' && v.length > 0).slice(0, MAX_ACKNOWLEDGED_ALERTS);
}

/** Relit les itineraires favoris en verifiant leur forme. */
function readFavoriteRoutes(): FavoriteRoute[] {
  let raw: unknown = null;
  try {
    raw = JSON.parse(localStorage.getItem(FAVORITE_ROUTES_KEY) || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((value): FavoriteRoute[] => {
      const v = value as Partial<FavoriteRoute>;
      const origin = typeof v?.origin === 'string' ? v.origin.trim() : '';
      const destination = typeof v?.destination === 'string' ? v.destination.trim() : '';
      if (!origin || !destination) return [];
      return [{
        id: typeof v.id === 'string' && v.id ? v.id : routeKey(origin, destination),
        origin,
        destination,
        savedAt: Number.isFinite(v.savedAt) ? (v.savedAt as number) : 0,
      }];
    })
    .slice(0, MAX_FAVORITE_ROUTES);
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
  const [lastRoute, setLastRouteState] = useState<LastRoute | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [savedPlaces, setSavedPlacesState] = useState<SavedPlace[]>(() => DEFAULT_PLACES.map((p) => ({ ...p })));
  const [favoriteRoutes, setFavoriteRoutesState] = useState<FavoriteRoute[]>([]);
  const [acknowledgedAlerts, setAcknowledgedAlertsState] = useState<string[]>([]);
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

    setLastRouteState(readLastRoute());
    setSavedPlacesState(readSavedPlaces());
    setFavoriteRoutesState(readFavoriteRoutes());
    setAcknowledgedAlertsState(readAcknowledgedAlerts());
    try {
      localStorage.removeItem(LEGACY_SESSION_KEY);
    } catch {
      // Stockage indisponible : rien a nettoyer.
    }

    // En dernier : les composants qui attendent ce drapeau lisent alors un
    // etat complet, pas une hydratation a moitie faite.
    setHydrated(true);
  }, []);

  const setPlaceAddress = useCallback((id: string, address: string) => {
    setSavedPlacesState((current) => {
      const next = current.map((p) => (p.id === id ? { ...p, address: address.trim() } : p));
      writeStorage(SAVED_PLACES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const addSavedPlace = useCallback((label: string, address: string) => {
    const name = label.trim();
    const where = address.trim();
    if (!name || !where) return;
    setSavedPlacesState((current) => {
      const next = [...current, { id: `fav-${Date.now()}`, label: name, address: where, icon: '☆', priority: false }];
      writeStorage(SAVED_PLACES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeSavedPlace = useCallback((id: string) => {
    setSavedPlacesState((current) => {
      const next = current.filter((p) => p.id !== id || p.priority);
      writeStorage(SAVED_PLACES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  /**
   * Bascule d'un itineraire en favori.
   *
   * Rend l'etat obtenu — ajoute (`true`) ou retire (`false`) — pour que
   * l'appelant formule son message sans avoir a relire la liste.
   */
  const toggleFavoriteRoute = useCallback((origin: string, destination: string) => {
    const from = origin.trim();
    const to = destination.trim();
    if (!from || !to) return false;
    const key = routeKey(from, to);
    let added = false;
    setFavoriteRoutesState((current) => {
      const existing = current.find((r) => routeKey(r.origin, r.destination) === key);
      const next = existing
        ? current.filter((r) => r.id !== existing.id)
        : [{ id: key, origin: from, destination: to, savedAt: Date.now() }, ...current].slice(0, MAX_FAVORITE_ROUTES);
      added = !existing;
      writeStorage(FAVORITE_ROUTES_KEY, JSON.stringify(next));
      return next;
    });
    return added;
  }, []);

  /** Marque des alertes comme vues. La pastille ne les compte plus. */
  const acknowledgeAlerts = useCallback((keys: string[]) => {
    const utiles = keys.filter((k) => typeof k === 'string' && k.length > 0);
    if (!utiles.length) return;
    setAcknowledgedAlertsState((current) => {
      const next = [...new Set([...utiles, ...current])].slice(0, MAX_ACKNOWLEDGED_ALERTS);
      writeStorage(ACKNOWLEDGED_ALERTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  /**
   * Oublie les acquittements d'incidents disparus.
   *
   * Sans cela, un bouchon resolu resterait acquitte pour toujours ; s'il
   * revenait au meme endroit des mois plus tard, il ne serait jamais signale.
   */
  const pruneAcknowledgedAlerts = useCallback((present: string[]) => {
    const vivantes = new Set(present);
    setAcknowledgedAlertsState((current) => {
      const next = current.filter((c) => vivantes.has(c));
      if (next.length === current.length) return current;
      writeStorage(ACKNOWLEDGED_ALERTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeFavoriteRoute = useCallback((id: string) => {
    setFavoriteRoutesState((current) => {
      const next = current.filter((r) => r.id !== id);
      writeStorage(FAVORITE_ROUTES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setLastRoute = useCallback((route: LastRoute) => {
    const origin = route.origin.trim();
    const destination = route.destination.trim();
    if (!origin || !destination) return;
    const next = { origin, destination };
    setLastRouteState(next);
    writeStorage(LAST_ROUTE_KEY, JSON.stringify(next));
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
      lastRoute, setLastRoute, hydrated,
      savedPlaces, setPlaceAddress, addSavedPlace, removeSavedPlace,
      favoriteRoutes, toggleFavoriteRoute, removeFavoriteRoute,
      acknowledgedAlerts, acknowledgeAlerts, pruneAcknowledgedAlerts,
    }),
    [
      originMode, setOriginMode, geoOrigin, geoOriginIsFresh, geoStatus, geoMessage, locate,
      vehicle, setVehicle, trip, setTrip, vehicleConfirmed, setVehicleConfirmed,
      lastRoute, setLastRoute, hydrated,
      savedPlaces, setPlaceAddress, addSavedPlace, removeSavedPlace,
      favoriteRoutes, toggleFavoriteRoute, removeFavoriteRoute,
      acknowledgedAlerts, acknowledgeAlerts, pruneAcknowledgedAlerts,
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
