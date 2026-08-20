/** Déclarations de types pour la conversion des horaires du flux carburants. */

/**
 * Convertit le champ `horaires` du flux officiel en notation OpenStreetMap.
 *
 * @param horaires valeur brute du champ `horaires` (JSON sérialisé, ou objet)
 * @param automate24 valeur du champ `horaires_automate_24_24` (« Oui » / « Non »)
 * @returns spécification exploitable par `openingStatus`, ou null si inconnue
 */
export function stationOpeningHours(
  horaires: unknown,
  automate24: unknown,
): string | null;
