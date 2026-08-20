/**
 * Modèle de domaine du véhicule de l'utilisateur.
 *
 * Chaque valeur chiffrée porte sa provenance. C'est délibéré : l'application
 * doit pouvoir dire à l'écran « 60 L, estimé » plutôt que d'afficher 60 L
 * comme un fait. Aucune valeur n'est présentée comme certaine si elle ne
 * vient pas de l'utilisateur.
 */

import type { EnergyKind } from '../energy/model';

export type { EnergyKind };

/** D'où vient une valeur numérique du profil. */
export type Provenance =
  /** L'utilisateur l'a saisie. Fiable. */
  | 'saisie'
  /** Déduite du gabarit et de l'énergie. Ordre de grandeur, à confirmer. */
  | 'estimee';

export type MeasuredValue = {
  value: number;
  provenance: Provenance;
};

/**
 * Gabarit du véhicule.
 *
 * Sert uniquement à proposer un ordre de grandeur de capacité et de
 * consommation quand l'utilisateur ne les connaît pas. Il n'entre dans aucun
 * calcul : seules les valeurs retenues comptent.
 */
export type VehicleSize =
  | 'citadine'
  | 'compacte'
  | 'berline'
  | 'suv'
  | 'monospace'
  | 'utilitaire';

export const VEHICLE_SIZES: { id: VehicleSize; label: string; hint: string }[] = [
  { id: 'citadine', label: 'Citadine', hint: 'Clio, 208, Twingo' },
  { id: 'compacte', label: 'Compacte', hint: 'Mégane, 308, Golf' },
  { id: 'berline', label: 'Berline / break', hint: 'Passat, Talisman' },
  { id: 'suv', label: 'SUV / 4x4', hint: 'Tiguan, 3008, Velar' },
  { id: 'monospace', label: 'Monospace', hint: 'Scénic, Espace' },
  { id: 'utilitaire', label: 'Utilitaire', hint: 'Kangoo, Trafic' },
];

export const ENERGY_LABELS: { id: EnergyKind; label: string; short: string }[] = [
  { id: 'essence', label: 'Essence', short: 'SP95-E10' },
  { id: 'gazole', label: 'Gazole', short: 'Diesel' },
  { id: 'hybride', label: 'Hybride', short: 'non rechargeable' },
  { id: 'hybride-rechargeable', label: 'Hybride rechargeable', short: 'PHEV' },
  { id: 'electrique', label: 'Électrique', short: '100 % batterie' },
  { id: 'superethanol', label: 'Superéthanol', short: 'E85' },
  { id: 'gpl', label: 'GPL', short: 'ESS+GPL' },
];

/** Profil complet, tel que mémorisé pour l'utilisateur. */
export type VehicleProfile = {
  /** Libellé libre : « Range Rover Velar », « la voiture de Marie »… */
  name: string;
  energyKind: EnergyKind;
  size: VehicleSize;
  /** Capacité du réservoir en litres. Absente pour un véhicule électrique. */
  tank: MeasuredValue | null;
  /** Capacité utile de la batterie en kWh. Absente pour un thermique pur. */
  battery: MeasuredValue | null;
  /** Consommation carburant en L/100 km. */
  fuelConsumption: MeasuredValue | null;
  /** Consommation électrique en kWh/100 km. */
  electricConsumption: MeasuredValue | null;
};

/** Ce que l'utilisateur renseigne pour un trajet donné. */
export type TripContext = {
  /** Niveau de carburant au départ, 0 à 100. */
  fuelLevelPct: number;
  /** Niveau de batterie au départ, 0 à 100. */
  batteryLevelPct: number;
  /** Réserve de sécurité conservée, 0 à 40. */
  reservePct: number;
  /** Nombre de personnes à bord, conducteur compris. */
  passengers: number;
  /** L'utilisateur compte-t-il manger pendant le trajet ? */
  meal: 'auto' | 'oui' | 'non';
};
