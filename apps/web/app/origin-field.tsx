'use client';

/**
 * Champ « Départ » du formulaire d'itinéraire, avec localisation automatique.
 *
 * Remplace le layer `current-location-origin.tsx`, qui injectait ce bloc dans
 * le DOM par `insertAdjacentElement` après avoir retrouvé l'input via
 * `document.querySelector('.v3modal')` puis `labels[0]`, et qui réécrivait le
 * paramètre `origin` de tous les appels à /api/route en remplaçant
 * `window.fetch`. Ici, la position choisie remonte simplement par `onChange` :
 * l'appel réseau part avec la bonne valeur sans interception.
 */

import { useOriginAuto } from './state/floway-store';
import styles from './origin-field.module.css';

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export default function OriginField({ value, onChange, disabled }: Props) {
  const { auto, failed, geoMessage, toggle } = useOriginAuto(value, onChange);

  return (
    <div className={styles.field}>
      <label>
        Départ
        <input
          className={styles.input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          readOnly={auto}
          placeholder={auto ? 'Localisation automatique…' : 'Ville ou adresse de départ'}
          required
        />
      </label>

      <div className={`${styles.status} ${failed ? styles.warning : ''}`}>
        <span className={styles.statusText}>
          <strong className={styles.statusTitle}>
            {auto ? '📍 Ma position actuelle' : '✎ Départ manuel'}
          </strong>
          <small className={styles.statusDetail}>
            {geoMessage || (auto ? 'Localisation GPS en cours…' : 'Saisissez votre point de départ')}
          </small>
        </span>
        <button
          type="button"
          className={styles.toggle}
          disabled={disabled}
          onClick={toggle}
        >
          {auto ? 'AUTRE DÉPART' : 'MA POSITION'}
        </button>
      </div>
    </div>
  );
}
