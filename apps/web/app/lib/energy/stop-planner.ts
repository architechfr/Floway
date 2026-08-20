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
  WAIT_LEVELS,
  waitLevel,
  arrivalAtKm,
  mealsDuringTrip,
  rankStops,
  buildJourney,
  MIN_STOP_SPACING_KM,
  MAX_DRIVING_STRETCH_MIN,
} from '../../../../../packages/algorithms/stop-planner.mjs';

export type { PlannedStop, StopPlan, JourneyStep, WaitLevel, WaitLevelId } from '../../../../../packages/algorithms/stop-planner.mjs';
