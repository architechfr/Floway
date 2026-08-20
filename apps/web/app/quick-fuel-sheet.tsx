'use client';

import styles from './quick-fuel-sheet.module.css';

/**
 * Correction rapide du niveau de carburant.
 *
 * Remplace le layer `quick-fuel` : celui-ci ecoutait tous les clics du
 * document en phase de capture pour reconnaitre trois selecteurs CSS
 * (`.v3fuelHero strong`, `.roadFuel span`, et la jauge du panneau vehicule
 * depuis supprime), relisait le
 * niveau dans localStorage puis repoussait la valeur dans React en
 * appelant le setter natif de HTMLInputElement sur le curseur.
 *
 * Ici le composant ne fait que du rendu : la valeur et son ecriture
 * viennent de `floway-v3`, qui detient deja l'etat du vehicule.
 */
export default function QuickFuelSheet({
  pct,
  onChange,
  onClose,
}: {
  pct: number;
  onChange: (pct: number) => void;
  onClose: () => void;
}) {
  return (
    <div className={styles.backdrop} onClick={onClose}>
      <section
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label="Corriger le niveau de carburant"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <div>
            <small>NIVEAU CARBURANT</small>
            <strong>Corriger maintenant</strong>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>
        <div className={styles.value}>
          <b>{pct}%</b>
          <span>Les recommandations sont recalculées immédiatement.</span>
        </div>
        <input
          className={styles.slider}
          aria-label="Pourcentage carburant"
          type="range"
          min="0"
          max="100"
          value={pct}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <div className={styles.steps}>
          <button type="button" onClick={() => onChange(pct - 5)}>−5</button>
          <button type="button" onClick={() => onChange(pct - 1)}>−1</button>
          <button type="button" onClick={() => onChange(pct + 1)}>+1</button>
          <button type="button" onClick={() => onChange(pct + 5)}>+5</button>
        </div>
        <button type="button" className={styles.done} onClick={onClose}>
          VALIDER {pct}%
        </button>
      </section>
    </div>
  );
}
