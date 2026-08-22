'use client';

import { useStationData, type StationRef } from './lib/station-lookup';
import styles from './station-poi-panel.module.css';

type Poi = {
  name: string;
  brand: string | null;
  distanceM: number;
};

type Details = {
  provider: { name: string; connected: boolean };
  station: Poi | null;
  restaurants: Poi[];
  message?: string;
};

const HEADING = 'Enseigne & restauration autour de l’arrêt';

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <section className={styles.panel}>
      <small className={styles.eyebrow}>DONNÉES LOCALES ENRICHIES</small>
      <h3>{HEADING}</h3>
      {children}
    </section>
  );
}

/**
 * Commerces et restauration autour de l'arret.
 *
 * Remplace le layer `station-enrichment` : celui-ci guettait l'apparition de
 * `.v3detail` par un MutationObserver sur `document.body`, relisait le nom et
 * l'adresse dans le texte deja affiche pour reconstituer sa requete, puis
 * assemblait son panneau noeud par noeud en `document.createElement`.
 */
export default function StationPoiPanel({ station }: { station: StationRef }) {
  const { data, state } = useStationData<Details>('/api/station-details', station);

  if (state === 'loading' || state === 'idle') {
    return (
      <Frame>
        <p className={styles.notice}>Recherche des commerces et restaurants proches…</p>
      </Frame>
    );
  }

  if (state === 'error' || !data) {
    return (
      <Frame>
        <p className={styles.notice}>Enrichissement temporairement indisponible.</p>
      </Frame>
    );
  }

  if (!data.provider?.connected) {
    return (
      <Frame>
        <p className={styles.notice}>{data.message || 'Source POI non connectée.'}</p>
      </Frame>
    );
  }

  const restaurants = data.restaurants || [];
  const brand = data.station?.brand || data.station?.name || 'Enseigne à confirmer';

  return (
    <Frame>
      <div className={styles.station}>
        <span>⛽</span>
        <div>
          <small>STATION / ENSEIGNE</small>
          <strong>{brand}</strong>
          {data.station?.name && data.station.name !== brand && <em>{data.station.name}</em>}
        </div>
      </div>

      <div className={styles.title}>
        <strong>🍴 Restauration à proximité</strong>
        <small>
          {restaurants.length} résultat{restaurants.length > 1 ? 's' : ''}
        </small>
      </div>

      {restaurants.length ? (
        <div className={styles.list}>
          {restaurants.slice(0, 8).map((poi, i) => (
            <div key={`${poi.name}-${i}`} className={styles.row}>
              <strong>{poi.brand || poi.name}</strong>
              <small>
                {poi.distanceM} m
                {poi.brand && poi.name !== poi.brand ? ` · ${poi.name}` : ''}
              </small>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.notice}>Aucun restaurant identifié dans un rayon de 1,2 km.</p>
      )}

      <small className={styles.source}>
        Source : {data.provider.name} · données POI distinctes des prix carburant officiels.
      </small>
    </Frame>
  );
}
