'use client';

/**
 * Choix de l'ordre de la liste des stations.
 *
 * La liste était triée par point kilométrique : le classement Floway — qui
 * pèse le besoin de carburant, l'heure de passage, les horaires, le prix, le
 * détour et l'affluence — n'avait donc aucun effet visible. L'ordre est
 * désormais explicite, et l'utilisateur peut revenir à l'ordre du trajet.
 */

import styles from './station-order.module.css';

export type StationOrder = 'classement' | 'distance';

const CHOIX: { id: StationOrder; label: string; title: string }[] = [
  {
    id: 'classement',
    label: 'Classement',
    title: 'Carburant nécessaire, heure de passage, horaires, prix, détour et affluence',
  },
  { id: 'distance', label: 'Ordre du trajet', title: 'Les stations dans l’ordre où vous les croiserez' },
];

export default function StationOrderSwitch({
  value,
  onChange,
}: {
  value: StationOrder;
  onChange: (order: StationOrder) => void;
}) {
  return (
    <div className={styles.group} role="group" aria-label="Ordre des stations">
      {CHOIX.map((c) => (
        <button
          key={c.id}
          type="button"
          title={c.title}
          aria-pressed={value === c.id}
          className={value === c.id ? styles.on : undefined}
          onClick={() => onChange(c.id)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
