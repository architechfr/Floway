/** Déclarations de types pour la lecture des paramètres de requête. */

export function nombreDeRequete(
  brut: string | null | undefined,
  options?: { min?: number; max?: number; defaut?: number | null },
): number | null;

export function positionDeRequete(
  latBrut: string | null | undefined,
  lonBrut: string | null | undefined,
): { lat: number; lon: number } | null;
