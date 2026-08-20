/** Déclarations de types pour la progression sur l'itinéraire. */

export function haversine(a: [number, number], b: [number, number]): number;

export function cumulativeDistances(coords: [number, number][]): number[];

export function projectOnSegment(
  point: [number, number],
  a: [number, number],
  b: [number, number],
): { t: number; distanceKm: number };

export function routeProgress(
  coords: [number, number][],
  cum: number[],
  point: [number, number],
  options?: { fromIndex?: number; window?: number },
): { km: number; offRouteKm: number; index: number } | null;
