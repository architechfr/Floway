'use client';

import styles from './route-actions.module.css';

/**
 * Inverser le trajet, le mettre en favori.
 *
 * Remplace le bloc que `interaction-layer` injectait en `innerHTML` apres
 * `.v3routeTitle`, reinjecte a chaque mutation du document par un
 * MutationObserver, et dont les clics etaient recuperes par un ecouteur en
 * phase de capture sur `document`.
 */
export default function RouteActions({
  onReverse,
  onToggleFavorite,
  isFavorite,
  disabled,
}: {
  onReverse: () => void;
  onToggleFavorite: () => void;
  isFavorite: boolean;
  disabled?: boolean;
}) {
  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={styles.reverse}
        disabled={disabled}
        onClick={onReverse}
        aria-label="Inverser le trajet"
      >
        ⇄ <span>Inverser</span>
      </button>
      <button
        type="button"
        className={`${styles.favorite} ${isFavorite ? styles.on : ''}`}
        disabled={disabled}
        onClick={onToggleFavorite}
        aria-pressed={isFavorite}
        aria-label={isFavorite ? 'Retirer cet itinéraire des favoris' : 'Ajouter cet itinéraire aux favoris'}
      >
        {isFavorite ? '★' : '☆'} <span>Favori</span>
      </button>
    </div>
  );
}
