'use client';

import styles from './route-price-ribbon.module.css';

export type PriceSummary = {
  /** Carburant sur lequel porte la synthese, tel que choisi par l'utilisateur. */
  fuel: string;
  min: number;
  median: number;
  max: number;
  /** Nombre de stations du trajet dont le prix est exploitable. */
  count: number;
};

/**
 * Calcule la synthese des prix a partir des stations deja recues.
 *
 * Rend `null` si aucune station ne porte de prix utilisable : on n'affiche
 * pas un bandeau vide, et surtout aucune valeur de remplacement.
 */
export function summarizePrices(
  stations: readonly { price?: number | null }[],
  fuel: string,
): PriceSummary | null {
  const prices = stations
    .map((s) => Number(s.price))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  if (!prices.length) return null;
  return {
    fuel,
    min: prices[0],
    median: prices[Math.floor(prices.length / 2)],
    max: prices[prices.length - 1],
    count: prices.length,
  };
}

/**
 * Bandeau « prix sur le trajet ».
 *
 * Remplace le layer `route-price` : celui-ci relancait un `/api/route`
 * complet — un second calcul d'itineraire a chaque ouverture de la page,
 * puis toutes les 30 s et a chaque evenement `change` du document — pour
 * n'en garder que les prix, alors que la page detient deja ces stations.
 * Il lisait de surcroit l'origine et la destination dans le texte du bouton
 * `.v3routeTitle`, donc les libelles raccourcis par `placeLabel`.
 */
export default function RoutePriceRibbon({ summary }: { summary: PriceSummary | null }) {
  if (!summary) return null;
  return (
    <section className={styles.ribbon} aria-label="Prix carburant sur le trajet">
      <div>
        <span>PRIX SUR LE TRAJET</span>
        <strong>{summary.fuel}</strong>
        <small>
          {summary.count} station{summary.count > 1 ? 's' : ''} avec prix exploitable
          {summary.count > 1 ? 's' : ''}
        </small>
      </div>
      <div>
        <small>MEILLEUR PRIX</small>
        <b>{summary.min.toFixed(3)} €/L</b>
      </div>
      <div>
        <small>PRIX MÉDIAN</small>
        <b>{summary.median.toFixed(3)} €/L</b>
      </div>
      <div>
        <small>ÉCART MAX</small>
        <b>+{(summary.max - summary.min).toFixed(3)} €/L</b>
      </div>
    </section>
  );
}
