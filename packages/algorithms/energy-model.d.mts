/** Déclarations de types pour le moteur de calcul d'énergie. */

export type EnergyKind =
  | 'essence'
  | 'gazole'
  | 'superethanol'
  | 'gpl'
  | 'hybride'
  | 'hybride-rechargeable'
  | 'electrique';

export const ENERGY_KINDS: readonly EnergyKind[];

export function usesFuel(kind: string): boolean;
export function usesBattery(kind: string): boolean;
export function correctedConsumption(wltp: number | undefined, factor?: number): number | null;
export function theoreticalRange(capacity: number | undefined, consumption: number | undefined): number | null;
export function requiredQuantity(distanceKm: number | undefined, consumption: number | undefined): number | null;

/** Plan pour une seule source d'énergie. Tout champ vaut `null` si `missing` n'est pas vide. */
export type EnergyPlan = {
  /** Entrées absentes ou invalides : 'capacite' | 'consommation' | 'niveau' | 'distance'. */
  missing: string[];
  /** Autonomie réservoir ou batterie plein(e), en km. */
  fullRangeKm: number | null;
  /** Idem, réserve de sécurité déduite. */
  usableFullRangeKm: number | null;
  /** Autonomie au niveau actuel, en km. */
  remainingRangeKm: number | null;
  /** Idem, réserve déduite : c'est la distance réellement parcourable. */
  usableRemainingRangeKm: number | null;
  /** Quantité totale consommée sur le trajet (L ou kWh). */
  requiredQuantity: number | null;
  reachesDestination: boolean | null;
  /** Nombre de ravitaillements ou de recharges. */
  refuelStops: number | null;
  /** Quantité à acheter en route (L ou kWh). */
  totalQuantityToBuy: number | null;
  estimatedCost: number | null;
  /** Kilomètre auquel le premier arrêt devient nécessaire. */
  firstStopAtKm: number | null;
};

export function planEnergy(input: {
  capacity?: number;
  consumption?: number;
  levelPct?: number;
  distanceKm?: number;
  reservePct?: number;
  unitPrice?: number;
}): EnergyPlan;

export type TripPlan = {
  energyKind: string;
  distanceKm: number | null;
  reservePct: number;
  realWorldFactor: number;
  /** Kilomètres couverts en électrique sur un hybride rechargeable. */
  electricCoveredKm: number;
  fuel: EnergyPlan | null;
  battery: EnergyPlan | null;
  stops: number | null;
  totalCost: number | null;
  missing: string[];
  complete: boolean;
};

export function planTrip(input: {
  energyKind: string;
  distanceKm?: number;
  fuel?: { capacityL?: number; consumptionL100?: number; levelPct?: number; pricePerL?: number };
  battery?: { capacityKwh?: number; consumptionKwh100?: number; levelPct?: number; pricePerKwh?: number };
  reservePct?: number;
  realWorldFactor?: number;
}): TripPlan;
