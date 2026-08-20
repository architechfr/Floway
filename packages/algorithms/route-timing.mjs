/**
 * Temps de parcours réel jusqu'à chaque point d'un itinéraire.
 *
 * Le calcul précédent était une règle de trois :
 *
 *   heure = départ + (distance_station / distance_totale) × durée_totale
 *
 * Elle suppose une vitesse uniforme. Sur un trajet Île-de-France → Hérault,
 * les trente premiers kilomètres de périphérie sont alors comptés à la même
 * vitesse que l'autoroute : une station à 180 km était annoncée bien trop tôt,
 * et l'écart s'accumulait tout au long du parcours.
 *
 * OSRM sait donner la durée de chaque segment de la géométrie, via
 * `annotations=duration`. Ce module en fait un cumul, ce qui donne l'heure de
 * passage réelle en un point donné, profil de vitesse compris.
 *
 * Quand l'annotation manque ou ne correspond pas à la géométrie, on retombe
 * explicitement sur l'interpolation par la distance, et la source est
 * signalée : mieux vaut une estimation annoncée comme telle qu'une précision
 * feinte.
 */

/**
 * @param {object} input
 * @param {number[]|null|undefined} input.durations `annotation.duration` d'OSRM,
 *   une entrée par segment, soit `coords.length - 1` valeurs
 * @param {number[]} input.cumulativeKm distance cumulée à chaque point
 * @param {number} input.totalDurationMin durée totale annoncée par OSRM
 * @returns {{secondsAt:number[], source:'osrm'|'interpolation'}}
 */
export function buildRouteTimeline({ durations, cumulativeKm, totalDurationMin }) {
  const points = Array.isArray(cumulativeKm) ? cumulativeKm.length : 0;
  const totalSeconds = Number.isFinite(totalDurationMin) ? Math.max(0, totalDurationMin) * 60 : 0;

  if (points === 0) return { secondsAt: [], source: 'interpolation' };

  const usable =
    Array.isArray(durations) &&
    durations.length === points - 1 &&
    durations.every((d) => Number.isFinite(d) && d >= 0);

  if (usable) {
    const secondsAt = new Array(points);
    secondsAt[0] = 0;
    for (let i = 1; i < points; i += 1) secondsAt[i] = secondsAt[i - 1] + durations[i - 1];
    return { secondsAt, source: 'osrm' };
  }

  // Repli : proportionnel à la distance, comme avant, mais assumé.
  const totalKm = cumulativeKm[points - 1] || 0;
  const secondsAt = cumulativeKm.map((km) => {
    if (!(totalKm > 0)) return 0;
    const ratio = Math.min(1, Math.max(0, km / totalKm));
    return ratio * totalSeconds;
  });
  return { secondsAt, source: 'interpolation' };
}

/**
 * Instant de passage à un point de la géométrie.
 *
 * @param {Date} departureAt
 * @param {number[]} secondsAt
 * @param {number} index
 * @returns {Date|null}
 */
export function passageTime(departureAt, secondsAt, index) {
  if (!(departureAt instanceof Date) || Number.isNaN(departureAt.getTime())) return null;
  if (!Array.isArray(secondsAt) || !secondsAt.length) return null;
  const bounded = Math.min(secondsAt.length - 1, Math.max(0, Math.round(index)));
  const seconds = secondsAt[bounded];
  if (!Number.isFinite(seconds)) return null;
  return new Date(departureAt.getTime() + seconds * 1000);
}
