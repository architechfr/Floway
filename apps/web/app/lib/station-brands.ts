'use client';

/**
 * Enseignes des stations d'un lot, chargées à la demande.
 *
 * Le flux du ministère ne porte aucune marque. Celle-ci vient de TomTom, et
 * chaque station coûte un appel : le lot reste donc petit et réservé aux
 * étapes du voyage, jamais à la liste entière.
 *
 * Ce qui n'est pas trouvé reste absent. Aucune enseigne n'est déduite du nom
 * de la commune ou de l'adresse.
 */

import { useEffect, useRef, useState } from 'react';

export type StationBrand = { brand: string; poiName: string | null; distanceM: number };

export type BrandPoint = { id: string; lat?: number; lon?: number };

/** Même plafond que la route : au-delà, le lot est tronqué côté serveur. */
export const MAX_BRAND_POINTS = 6;

export function useStationBrands(points: BrandPoint[]) {
  const [brands, setBrands] = useState<Record<string, StationBrand | null>>({});
  const [connected, setConnected] = useState<boolean | null>(null);
  const enCours = useRef<AbortController | null>(null);

  // Clé stable : sans elle, un nouveau tableau à chaque rendu relancerait la
  // requête en boucle.
  const utiles = points
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .slice(0, MAX_BRAND_POINTS);
  const cle = utiles.map((p) => `${p.id}:${p.lat!.toFixed(4)},${p.lon!.toFixed(4)}`).join('|');

  useEffect(() => {
    if (!cle) {
      setBrands({});
      return;
    }
    const corps = cle.split('|').map((entree) => {
      const [id, position] = entree.split(':');
      const [lat, lon] = position.split(',').map(Number);
      return { id, lat, lon };
    });

    enCours.current?.abort();
    const controller = new AbortController();
    enCours.current = controller;

    (async () => {
      try {
        const r = await fetch('/api/station-brands', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points: corps }),
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (!r.ok) {
          setConnected(false);
          return;
        }
        const d = (await r.json()) as {
          provider?: { connected?: boolean };
          brands?: Record<string, StationBrand | null>;
        };
        if (controller.signal.aborted) return;
        setConnected(Boolean(d.provider?.connected));
        setBrands(d.brands || {});
      } catch {
        if (!controller.signal.aborted) setConnected(false);
      }
    })();

    return () => controller.abort();
  }, [cle]);

  useEffect(() => () => enCours.current?.abort(), []);

  return { brands, connected };
}
