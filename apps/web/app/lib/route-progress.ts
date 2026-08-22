/**
 * Accès typé au calcul de progression sur l'itinéraire.
 *
 * Le module lui-même vit dans `packages/algorithms` : pur, testé par la CI.
 */

export {
  cumulativeDistances,
  haversine,
  projectOnSegment,
  routeProgress,
} from '../../../../packages/algorithms/route-progress.mjs';
