/** Déclarations de types pour la lecture des horaires OpenStreetMap. */

export const OPEN: 'ouvert';
export const CLOSED: 'ferme';
export const UNKNOWN: 'inconnu';

/** Statut d'ouverture, ou 'inconnu' si la spécification n'est pas comprise. */
export function openingStatus(
  spec: string | null | undefined,
  at: Date,
): 'ouvert' | 'ferme' | 'inconnu';

export function isConfirmedOpen(spec: string | null | undefined, at: Date): boolean;
