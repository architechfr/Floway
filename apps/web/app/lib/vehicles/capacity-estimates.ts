/**
 * Ordres de grandeur de capacité et de consommation, par gabarit et énergie.
 *
 * ⚠️ Ce ne sont PAS des données constructeur. Aucune source publique française
 * ouverte ne publie la capacité de réservoir par version : ni ADEME Car
 * Labelling (52 champs, aucun litre), ni data.gouv.fr, ni NHTSA vPIC dont les
 * champs existent mais sont vides. Ces valeurs sont des fourchettes de marché
 * destinées à proposer un point de départ modifiable.
 *
 * Elles sont donc systématiquement marquées `provenance: 'estimee'` et
 * affichées comme telles, avec leur fourchette. Dès que l'utilisateur saisit
 * sa vraie valeur, elle passe en `'saisie'` et l'estimation disparaît.
 */

import type { EnergyKind, VehicleSize } from './types';

export type Estimate = {
  /** Valeur proposée par défaut. */
  suggested: number;
  /** Fourchette réaliste, affichée pour que l'utilisateur situe sa voiture. */
  min: number;
  max: number;
  unit: string;
};

/** Réservoir, en litres. */
const TANK: Record<VehicleSize, Estimate> = {
  citadine: { suggested: 42, min: 35, max: 50, unit: 'L' },
  compacte: { suggested: 50, min: 45, max: 60, unit: 'L' },
  berline: { suggested: 62, min: 55, max: 75, unit: 'L' },
  suv: { suggested: 60, min: 50, max: 90, unit: 'L' },
  monospace: { suggested: 60, min: 55, max: 80, unit: 'L' },
  utilitaire: { suggested: 65, min: 55, max: 80, unit: 'L' },
};

/** Batterie utile, en kWh. Pour un hybride rechargeable, bien plus petite. */
const BATTERY_BEV: Record<VehicleSize, Estimate> = {
  citadine: { suggested: 42, min: 22, max: 55, unit: 'kWh' },
  compacte: { suggested: 58, min: 45, max: 70, unit: 'kWh' },
  berline: { suggested: 77, min: 60, max: 100, unit: 'kWh' },
  suv: { suggested: 77, min: 58, max: 110, unit: 'kWh' },
  monospace: { suggested: 75, min: 60, max: 90, unit: 'kWh' },
  utilitaire: { suggested: 70, min: 45, max: 90, unit: 'kWh' },
};

const BATTERY_PHEV: Estimate = { suggested: 14, min: 8, max: 25, unit: 'kWh' };

/** Consommation carburant, L/100 km, cycle homologué. */
const FUEL_CONSUMPTION: Record<VehicleSize, number> = {
  citadine: 5.4,
  compacte: 5.9,
  berline: 6.4,
  suv: 7.2,
  monospace: 6.8,
  utilitaire: 7.0,
};

/** Correctifs par énergie appliqués à la consommation carburant. */
const ENERGY_ADJUSTMENT: Partial<Record<EnergyKind, number>> = {
  gazole: -0.8,
  hybride: -1.4,
  'hybride-rechargeable': -1.2,
  superethanol: +1.6,
  gpl: +1.3,
};

/** Consommation électrique, kWh/100 km. */
const ELECTRIC_CONSUMPTION: Record<VehicleSize, number> = {
  citadine: 15,
  compacte: 16.5,
  berline: 18.5,
  suv: 20.5,
  monospace: 20,
  utilitaire: 22,
};

/** Réservoir estimé, ou `null` si l'énergie n'en comporte pas. */
export function estimateTank(size: VehicleSize, energyKind: EnergyKind): Estimate | null {
  if (energyKind === 'electrique') return null;
  return TANK[size];
}

/** Batterie estimée, ou `null` si l'énergie n'en comporte pas. */
export function estimateBattery(size: VehicleSize, energyKind: EnergyKind): Estimate | null {
  if (energyKind === 'electrique') return BATTERY_BEV[size];
  if (energyKind === 'hybride-rechargeable') return BATTERY_PHEV;
  return null;
}

/** Consommation carburant estimée, en L/100 km. */
export function estimateFuelConsumption(size: VehicleSize, energyKind: EnergyKind): number | null {
  if (energyKind === 'electrique') return null;
  const base = FUEL_CONSUMPTION[size] + (ENERGY_ADJUSTMENT[energyKind] ?? 0);
  return Math.round(Math.max(2, base) * 10) / 10;
}

/** Consommation électrique estimée, en kWh/100 km. */
export function estimateElectricConsumption(
  size: VehicleSize,
  energyKind: EnergyKind,
): number | null {
  if (energyKind !== 'electrique' && energyKind !== 'hybride-rechargeable') return null;
  return ELECTRIC_CONSUMPTION[size];
}

/**
 * Écart typique entre consommation homologuée et consommation observée.
 *
 * Valeur de départ modifiable par l'utilisateur, et destinée à être remplacée
 * par ses consommations réellement constatées quand on saura les collecter.
 */
export const DEFAULT_REAL_WORLD_FACTOR = 1.15;
