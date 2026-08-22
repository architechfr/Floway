'use client';

import { useState } from 'react';

import { useFlowayStore } from './state/floway-store';
import styles from './saved-places.module.css';

/**
 * Destinations rapides, sous le champ « Destination ».
 *
 * Remplace le layer `saved-places` : celui-ci construisait sa section en
 * `innerHTML`, la reinjectait a chaque mutation du document via un
 * MutationObserver sur `document.body`, ecrivait dans le champ destination
 * en appelant le setter natif de HTMLInputElement, et demandait nom et
 * adresse par des `window.prompt()` — des fenetres bloquantes, impossibles a
 * styler et incompatibles avec une PWA installee.
 *
 * Ici : de l'etat React, la saisie se fait en ligne, et le choix d'une
 * destination remonte par `onPick`.
 */
export default function SavedPlaces({
  onPick,
  disabled,
}: {
  onPick: (address: string) => void;
  disabled?: boolean;
}) {
  const { savedPlaces, setPlaceAddress, addSavedPlace, removeSavedPlace } = useFlowayStore();

  /** Emplacement fixe en cours de renseignement, ou 'new' pour un favori. */
  const [editing, setEditing] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');

  const priority = savedPlaces.filter((p) => p.priority);
  const favourites = savedPlaces.filter((p) => !p.priority);

  function open(id: string) {
    setEditing(id);
    setLabel('');
    setAddress('');
  }

  function close() {
    setEditing(null);
    setLabel('');
    setAddress('');
  }

  function confirm() {
    if (!editing) return;
    if (editing === 'new') addSavedPlace(label, address);
    else setPlaceAddress(editing, address);
    close();
  }

  const editingPlace = editing && editing !== 'new' ? savedPlaces.find((p) => p.id === editing) : null;
  // Un favori a besoin d'un nom et d'une adresse ; un emplacement fixe a deja son nom.
  const complete = editing === 'new' ? Boolean(label.trim() && address.trim()) : Boolean(address.trim());

  /**
   * Ces champs vivent dans le formulaire d'itineraire : sans ce garde-fou,
   * « Entree » y declenche le calcul du trajet au lieu d'enregistrer.
   */
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (complete) confirm();
  }

  return (
    <section className={styles.box} aria-label="Destinations rapides">
      <small>DESTINATIONS RAPIDES</small>

      <div className={styles.row}>
        {priority.map((place) => (
          <button
            key={place.id}
            type="button"
            disabled={disabled}
            className={`${styles.place} ${place.address ? styles.ready : styles.empty}`}
            title={place.address || `Renseigner l’adresse de ${place.label}`}
            onClick={() => (place.address ? onPick(place.address) : open(place.id))}
          >
            {place.icon} {place.label}
            {place.address ? '' : ' +'}
          </button>
        ))}
      </div>

      <div className={styles.row}>
        {favourites.map((place) => (
          <span key={place.id}>
            <button
              type="button"
              disabled={disabled}
              className={`${styles.place} ${styles.regular}`}
              title={place.address}
              onClick={() => onPick(place.address)}
            >
              {place.icon} {place.label}
            </button>
            <button
              type="button"
              disabled={disabled}
              className={styles.remove}
              aria-label={`Retirer ${place.label} des favoris`}
              onClick={() => removeSavedPlace(place.id)}
            >
              ×
            </button>
          </span>
        ))}
        <button
          type="button"
          disabled={disabled}
          className={`${styles.place} ${styles.add}`}
          onClick={() => open('new')}
        >
          + FAVORI
        </button>
      </div>

      {editing && (
        // Pas de <form> imbriqué : ce bloc vit déjà dans le formulaire
        // d'itinéraire, et « Entrée » ne doit pas lancer le calcul du trajet.
        <div className={styles.form}>
          {editing === 'new' && (
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Nom du favori"
              aria-label="Nom du favori"
              onKeyDown={onKeyDown}
            />
          )}
          <input
            autoFocus={editing !== 'new'}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={editingPlace ? `Adresse — ${editingPlace.label}` : 'Adresse'}
            aria-label={editingPlace ? `Adresse de ${editingPlace.label}` : 'Adresse du favori'}
            onKeyDown={onKeyDown}
          />
          <button type="button" className={styles.confirm} disabled={!complete} onClick={confirm}>
            ENREGISTRER
          </button>
          <button type="button" className={styles.cancel} onClick={close}>
            ANNULER
          </button>
        </div>
      )}
    </section>
  );
}
