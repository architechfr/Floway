/**
 * Point d'entrée de l'application vers le moteur de calcul d'énergie.
 *
 * Le moteur lui-même vit dans `packages/algorithms` : il est pur, testé par la
 * CI (`node --test packages/algorithms/*.test.mjs`) et ne connaît aucune
 * source de données. Ce fichier ne fait que le réexporter avec ses types, pour
 * que le reste de l'app n'ait pas à manipuler des chemins relatifs profonds.
 */

export {
  ENERGY_KINDS,
  correctedConsumption,
  planEnergy,
  planTrip,
  requiredQuantity,
  theoreticalRange,
  usesBattery,
  usesFuel,
} from '../../../../../packages/algorithms/energy-model.mjs';

export type {
  EnergyKind,
  EnergyPlan,
  TripPlan,
} from '../../../../../packages/algorithms/energy-model.mjs';
