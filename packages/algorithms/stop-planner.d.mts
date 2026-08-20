/** Déclarations de types pour le planificateur d'arrêts. */

export const MEAL_WINDOWS: readonly { id: string; label: string; from: number; to: number }[];
export const MIN_MEAL_OVERLAP_MIN: number;
export const WEIGHTS: Record<string, number>;

export function arrivalAtKm(
  departureAt: Date,
  durationMin: number,
  distanceKm: number,
  km: number,
): Date | null;

export function mealsDuringTrip(
  departureAt: Date,
  durationMin: number,
): { id: string; label: string; at: Date }[];

export type PlannedStop = {
  station: { id: string; distanceKm: number; [key: string]: unknown };
  arrivalAt: Date | null;
  openStatus: 'ouvert' | 'ferme' | 'inconnu';
  /** Repas satisfait par cet arrêt, ou null. */
  meal: string | null;
  reasons: string[];
  /** Plus bas = meilleur. */
  score: number;
  necessity: 'carburant' | 'repas' | 'confort';
};

export type StopPlan = {
  meals: { id: string; label: string; at: Date }[];
  fuelLimitKm: number | null;
  fuelStopNeeded: boolean;
  stops: PlannedStop[];
};

export function rankStops(input: {
  stations?: unknown[];
  departureAt?: Date;
  durationMin?: number;
  distanceKm?: number;
  currentKm?: number;
  energyPlan?: unknown;
  context?: { passengers?: number; meal?: string };
}): StopPlan;

export const MIN_STOP_SPACING_KM: number;
export const MAX_DRIVING_STRETCH_MIN: number;

export type JourneyStep = {
  station: { id: string; distanceKm: number; [key: string]: unknown };
  kind: 'carburant' | 'repas' | 'confort';
  label: string;
  arrivalAt: Date | null;
  reasons: string[];
  openStatus: 'ouvert' | 'ferme' | 'inconnu';
};

export function buildJourney(input: {
  plan: StopPlan | null;
  distanceKm?: number;
  durationMin?: number;
  currentKm?: number;
  /** Station retenue pour faire le plein avant de partir. */
  departureStation?: { id: string; detourKm?: number; [key: string]: unknown } | null;
  maxStops?: number;
}): { steps: JourneyStep[]; notes: string[] };
