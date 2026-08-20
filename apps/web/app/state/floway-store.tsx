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

const AUTO_ORIGIN_KEY = 'floway:auto-origin';
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
    () => ({ originMode, setOriginMode, geoOrigin, geoOriginIsFresh, geoStatus, geoMessage, locate }),
    [originMode, setOriginMode, geoOrigin, geoOriginIsFresh, geoStatus, geoMessage, locate],
  );

  return <FlowayStoreContext.Provider value={value}>{children}</FlowayStoreContext.Provider>;
}

export function useFlowayStore(): FlowayStore {
  const store = useContext(FlowayStoreContext);
  if (!store) throw new Error('useFlowayStore doit être utilisé dans <FlowayStoreProvider>');
  return store;
}
