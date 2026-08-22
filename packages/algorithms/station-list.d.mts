/** Déclarations de types pour la mise en forme d'une liste de stations. */

export function distinguerTitres(
  entrees: Array<{ id: string; titre: string; adresse?: string }>,
): Map<string, string>;

export function regrouperParLieu<T>(entrees: T[], lieuDe: (entree: T) => string): T[];
