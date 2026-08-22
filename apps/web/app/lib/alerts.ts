/**
 * Accès typé aux alertes routières.
 *
 * Le module lui-même vit dans `packages/algorithms` : pur, testé par la CI,
 * ignorant des sources de données comme des composants.
 */

export {
  cleIncident,
  nonAcquittes,
  acquittementsUtiles,
} from '../../../../packages/algorithms/alerts.mjs';

export type { IncidentLike } from '../../../../packages/algorithms/alerts.mjs';
