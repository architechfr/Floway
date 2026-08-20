'use client';

import { useEffect, useState } from 'react';

/**
 * Ce dont les panneaux de la fiche station ont besoin pour interroger leurs
 * sources. Volontairement etroit : n'importe quel objet station convient.
 */
export type StationRef = {
  name: string;
  brand?: string;
  address?: string;
  city?: string;
  lat?: number;
  lon?: number;
};

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Parametres d'interrogation d'une station.
 *
 * `/api/station-details` et `/api/station-fuels` acceptent tous deux `lat` et
 * `lon`, et ne geocodent `q` qu'a defaut. Les anciens layers ne passaient que
 * `q`, reconstitue en **relisant le texte affiche** : le `h2` de la fiche
 * concatene l'enseigne et le nom sans espace (« TotalEnergiesAire de Beaune »),
 * ce qui partait tel quel au geocodeur. En partant de l'objet station, on
 * envoie les coordonnees exactes et on economise un aller-retour de geocodage
 * par panneau.
 */
export function stationQuery(station: StationRef): string {
  const params = new URLSearchParams();
  if (Number.isFinite(station.lat) && Number.isFinite(station.lon)) {
    params.set('lat', String(station.lat));
    params.set('lon', String(station.lon));
  }
  // `q` reste envoye : il sert de repli cote API quand les coordonnees manquent.
  const label = [station.brand, station.name, station.address, station.city]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (label) params.set('q', label);
  return params.toString();
}

/**
 * Interroge une source pour la station affichee.
 *
 * La requete est abandonnee au demontage et au changement de station : ouvrir
 * une fiche puis une autre ne peut plus faire apparaitre la reponse de la
 * premiere par-dessus la seconde.
 */
export function useStationData<T>(path: string, station: StationRef | null) {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<LoadState>('idle');
  const query = station ? stationQuery(station) : '';

  useEffect(() => {
    if (!query) {
      setData(null);
      setState('idle');
      return;
    }
    const controller = new AbortController();
    setData(null);
    setState('loading');

    (async () => {
      try {
        const response = await fetch(`${path}?${query}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const json = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) {
          setState('error');
          return;
        }
        setData(json as T);
        setState('ready');
      } catch {
        // AbortError inclus : dans ce cas plus personne n'attend le resultat.
        if (!controller.signal.aborted) setState('error');
      }
    })();

    return () => controller.abort();
  }, [path, query]);

  return { data, state };
}
