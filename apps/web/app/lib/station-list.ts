/**
 * Accès typé à la mise en forme d'une liste de stations.
 *
 * Le module lui-même vit dans `packages/algorithms` : pur, testé par la CI,
 * ignorant des sources de données comme des composants.
 */

export {
  distinguerTitres,
  regrouperParLieu,
} from '../../../../packages/algorithms/station-list.mjs';
