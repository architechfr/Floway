/**
 * Accès typé au planificateur d'arrêts.
 *
 * Le module lui-même vit dans `packages/algorithms` : pur, testé par la CI,
 * ignorant des sources de données comme des composants.
 */

export {
  MEAL_WINDOWS,
  MIN_MEAL_OVERLAP_MIN,
  WEIGHTS,
  arrivalAtKm,
  mealsDuringTrip,
  rankStops,
} from '../../../../../packages/algorithms/stop-planner.mjs';

export type { PlannedStop, StopPlan } from '../../../../../packages/algorithms/stop-planner.mjs';
