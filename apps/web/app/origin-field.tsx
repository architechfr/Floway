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

import { useEffect } from 'react';
import { useFlowayStore } from './state/floway-store';
import styles from './origin-field.module.css';

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export default function OriginField({ value, onChange, disabled }: Props) {
  const { originMode, setOriginMode, geoOrigin, geoOriginIsFresh, geoStatus, geoMessage, locate } =
    useFlowayStore();

  const auto = originMode === 'auto';

  // À l'ouverture du formulaire en mode automatique, on relance une
  // localisation si la dernière position connue est périmée.
  useEffect(() => {
    if (auto && !geoOriginIsFresh && geoStatus === 'idle') locate();
  }, [auto, geoOriginIsFresh, geoStatus, locate]);

  // Le libellé GPS devient la valeur du champ : c'est lui qui partira dans la
  // requête, sans que personne n'ait à réécrire l'URL après coup.
  useEffect(() => {
    if (auto && geoOrigin && geoOrigin.label !== value) onChange(geoOrigin.label);
  }, [auto, geoOrigin, value, onChange]);

  const failed = geoStatus === 'denied' || geoStatus === 'unavailable';

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
          onClick={() => {
            if (auto) {
              setOriginMode('manual');
            } else {
              setOriginMode('auto');
              locate();
            }
          }}
        >
          {auto ? 'AUTRE DÉPART' : 'MA POSITION'}
        </button>
      </div>
    </div>
  );
}
