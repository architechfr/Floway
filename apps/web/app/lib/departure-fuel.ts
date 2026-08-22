'use client';

import { useEffect, useState } from 'react';

/** Station proposée pour faire le plein avant de prendre la route. */
export type DepartureStation = {
  id: string;
  name: string;
  address: string;
  city: string;
  lat: number;
  lon: number;
  price: number;
  /** Distance au point de départ, en kilomètres. */
  detourKm: number;
  services: string[];
  serviceCategories: string[];
  highway: boolean;
  openingHours: string | null;
};

/**
 * Cherche une station autour du départ, quand le réservoir ne suffit pas.
 *
 * `/api/route` ne rend que les stations du couloir de l'itinéraire. Or ce que
 * veut l'utilisateur au réservoir bas n'est pas la première station *sur* la
 * route, c'est celle d'à côté avant de partir. C'est une recherche par rayon,
 * servie par `/api/stations-near`.
 *
 * L'appel n'a lieu que si le besoin est avéré : pas de réservoir suffisant,
 * pas de requête. Il est abandonné au démontage et au changement de départ.
 */
export function useDepartureFuelStation(
  origin: { lat?: number; lon?: number } | null | undefined,
  fuel: string,
  needed: boolean,
) {
  const [station, setStation] = useState<DepartureStation | null>(null);
  const lat = origin?.lat;
  const lon = origin?.lon;

  useEffect(() => {
    if (!needed || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      setStation(null);
      return;
    }
    const controller = new AbortController();
    (async () => {
      try {
        const params = new URLSearchParams({
          lat: String(lat),
          lon: String(lon),
          fuel,
        });
        const response = await fetch(`/api/stations-near?${params}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('NEAR');
        const data = (await response.json()) as { stations?: DepartureStation[] };
        if (controller.signal.aborted) return;
        // La liste est déjà classée par l'API : proximité pondérée par le prix.
        setStation(data.stations?.[0] ?? null);
      } catch {
        // Source indisponible : on retombe simplement sur un arrêt en route,
        // plutôt que de proposer une station qu'on n'a pas vérifiée.
        if (!controller.signal.aborted) setStation(null);
      }
    })();
    return () => controller.abort();
  }, [lat, lon, fuel, needed]);

  return station;
}
