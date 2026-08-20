/** Déclarations de types pour le temps de parcours le long d'un itinéraire. */

export type RouteTimeline = {
  /** Secondes écoulées depuis le départ, à chaque point de la géométrie. */
  secondsAt: number[];
  /**
   * `osrm` quand les durées réelles par segment ont pu être utilisées,
   * `interpolation` quand on est retombé sur un calcul proportionnel à la
   * distance. À exposer plutôt qu'à masquer.
   */
  source: 'osrm' | 'interpolation';
};

export function buildRouteTimeline(input: {
  durations?: number[] | null;
  cumulativeKm: number[];
  totalDurationMin: number;
}): RouteTimeline;

export function passageTime(departureAt: Date, secondsAt: number[], index: number): Date | null;
