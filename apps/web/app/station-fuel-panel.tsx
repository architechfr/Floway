'use client';

import { useStationData, type StationRef } from './lib/station-lookup';
import styles from './station-fuel-panel.module.css';

type Fuel = {
  key: string;
  label: string;
  price: number;
  updatedAt: string | null;
  ageHours: number | null;
  freshness: string;
};

type FuelResponse = {
  source?: string;
  official?: boolean;
  fuels?: Fuel[];
  message?: string;
};

function ageLabel(f: Fuel) {
  if (f.ageHours == null) return 'Mise à jour inconnue';
  if (f.ageHours < 1) return 'Mis à jour il y a moins d’1 h';
  if (f.ageHours < 24) return `Mis à jour il y a ${Math.round(f.ageHours)} h`;
  return `Mis à jour il y a ${Math.round(f.ageHours / 24)} j`;
}

function freshnessClass(f: Fuel) {
  if (f.freshness === 'récente') return styles.fresh;
  if (f.freshness === 'à vérifier') return styles.aging;
  if (f.freshness === 'ancienne') return styles.old;
  return '';
}

/**
 * Prix carburants officiels de la station affichee.
 *
 * Remplace le layer `station-fuel` : celui-ci guettait l'apparition de
 * `.v3detail` par un MutationObserver sur `document.body`, puis construisait
 * son panneau en `innerHTML` en y interpolant directement `data.source`,
 * `data.message` et le libelle de chaque carburant — des chaines qui viennent
 * d'un jeu de donnees public, donc jamais a injecter telles quelles dans du
 * HTML. React les rend comme du texte.
 */
export default function StationFuelPanel({ station }: { station: StationRef }) {
  const { data, state } = useStationData<FuelResponse>('/api/station-fuels', station);

  if (state === 'loading' || state === 'idle') {
    return (
      <section className={styles.panel}>
        <div className={styles.head}>
          <span>PRIX CARBURANTS</span>
          <small>Chargement des prix officiels…</small>
        </div>
      </section>
    );
  }

  if (state === 'error' || !data) {
    return (
      <section className={styles.panel}>
        <div className={styles.head}>
          <span>PRIX CARBURANTS</span>
          <small>Prix momentanément indisponibles.</small>
        </div>
      </section>
    );
  }

  const fuels = data.fuels || [];
  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <div>
          <span>PRIX CARBURANTS</span>
          <strong>{data.official ? 'Données officielles' : 'Source disponible'}</strong>
        </div>
        <small>{data.source || 'Source carburants'}</small>
      </div>
      {fuels.length ? (
        <div className={styles.grid}>
          {fuels.map((f) => (
            <article key={f.key} className={`${styles.card} ${freshnessClass(f)}`}>
              <div>
                <strong>{f.label}</strong>
                <small>{ageLabel(f)}</small>
              </div>
              <b>
                {f.price.toFixed(3)} <em>€/L</em>
              </b>
              <span>{f.freshness}</span>
            </article>
          ))}
        </div>
      ) : (
        <p className={styles.empty}>
          {data.message || 'Aucun prix disponible pour cette station.'}
        </p>
      )}
    </section>
  );
}
