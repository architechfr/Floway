/**
 * Planification des arrêts d'un trajet.
 *
 * Répond à trois griefs constatés sur l'application :
 *  - une pause carburant était proposée à 180 km alors que le réservoir plein
 *    donnait 985 km d'autonomie : le classement des stations ignorait
 *    totalement l'énergie disponible ;
 *  - le prix pesait environ 2 % dans le score, noyé par l'attente et le détour ;
 *  - l'heure de passage n'entrait nulle part, alors qu'un départ à 19 h sur
 *    7 h de route impose de dîner en chemin.
 *
 * Module pur : il reçoit des stations, un plan d'énergie et un contexte, et
 * rend un classement motivé. Il ne connaît ni API ni composant.
 */

import { UNKNOWN, openingStatus } from './opening-hours.mjs';

/** Créneaux de repas, en minutes depuis minuit, usages français. */
export const MEAL_WINDOWS = [
  { id: 'dejeuner', label: 'déjeuner', from: 11 * 60 + 45, to: 14 * 60 + 15 },
  { id: 'diner', label: 'dîner', from: 18 * 60 + 45, to: 21 * 60 + 30 },
];

/**
 * Chevauchement minimal pour considérer qu'un repas tombe pendant le trajet.
 *
 * Arriver à 12 h après un départ à 9 h effleure le créneau du déjeuner de
 * quinze minutes : ce n'est pas un repas à prévoir en route.
 */
export const MIN_MEAL_OVERLAP_MIN = 30;

/**
 * Poids du classement. Exposés pour être lisibles et discutables plutôt
 * qu'enfouis dans une formule.
 */
export const WEIGHTS = {
  /** Pénalités, sur des valeurs normalisées entre 0 et 1. */
  wait: 1.0,
  detour: 1.2,
  price: 1.4,
  /** Bonus, retranchés au coût. */
  fuelNeeded: 4,
  mealMatch: 3,
  openConfirmed: 0.6,
  closedConfirmed: -2.5,
  services: 0.5,
};

/**
 * Heure de passage estimée à un point kilométrique.
 *
 * Hypothèse assumée : progression régulière sur le trajet. Sans profil de
 * vitesse par tronçon, c'est la seule estimation défendable.
 */
export function arrivalAtKm(departureAt, durationMin, distanceKm, km) {
  if (!(departureAt instanceof Date) || Number.isNaN(departureAt.getTime())) return null;
  if (!(distanceKm > 0) || !(durationMin >= 0)) return null;
  const ratio = Math.min(1, Math.max(0, km / distanceKm));
  return new Date(departureAt.getTime() + ratio * durationMin * 60000);
}

/**
 * Repas qui tombent pendant le trajet.
 *
 * @returns {{id:string,label:string,at:Date}[]} un élément par repas traversé
 */
export function mealsDuringTrip(departureAt, durationMin) {
  if (!(departureAt instanceof Date) || Number.isNaN(departureAt.getTime())) return [];
  if (!(durationMin > 0)) return [];

  const arrival = new Date(departureAt.getTime() + durationMin * 60000);
  const meals = [];

  // On balaie chaque journée couverte par le trajet : un départ tardif peut
  // faire franchir le déjeuner du lendemain.
  const cursor = new Date(departureAt);
  cursor.setHours(0, 0, 0, 0);

  for (let day = 0; day < 4 && cursor <= arrival; day += 1) {
    for (const window of MEAL_WINDOWS) {
      const start = new Date(cursor);
      start.setMinutes(window.from);
      const end = new Date(cursor);
      end.setMinutes(window.to);
      // Le repas compte si le trajet en couvre une part significative.
      const overlapStart = Math.max(start.getTime(), departureAt.getTime());
      const overlapEnd = Math.min(end.getTime(), arrival.getTime());
      const overlapMin = (overlapEnd - overlapStart) / 60000;
      if (overlapMin >= MIN_MEAL_OVERLAP_MIN) {
        meals.push({ id: window.id, label: window.label, at: new Date(overlapStart) });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return meals;
}

/**
 * Classe les stations à venir selon le besoin réel.
 *
 * @param {object} input
 * @param {Array} input.stations stations candidates, avec au minimum
 *   `{ id, distanceKm, waitMin, detourMin, price, services, openingHours }`
 * @param {Date} input.departureAt
 * @param {number} input.durationMin durée de conduite estimée
 * @param {number} input.distanceKm distance totale
 * @param {number} input.currentKm point kilométrique actuel
 * @param {object|null} input.energyPlan résultat de `planEnergy`, ou null
 * @param {object} input.context `{ passengers, meal }`
 */
export function rankStops({
  stations = [],
  departureAt,
  durationMin = 0,
  distanceKm = 0,
  currentKm = 0,
  energyPlan = null,
  context = {},
}) {
  const meals = context.meal === 'non' ? [] : mealsDuringTrip(departureAt, durationMin);

  // Point au-delà duquel il n'est plus possible d'avancer sans ravitailler.
  const fuelLimitKm =
    energyPlan && typeof energyPlan.firstStopAtKm === 'number' ? energyPlan.firstStopAtKm : null;

  const ahead = stations.filter((s) => Number.isFinite(s?.distanceKm) && s.distanceKm >= currentKm);
  if (!ahead.length) {
    return { meals, fuelLimitKm, stops: [], fuelStopNeeded: fuelLimitKm !== null };
  }

  const span = (values) => {
    const finite = values.filter((v) => Number.isFinite(v));
    if (!finite.length) return null;
    return { min: Math.min(...finite), max: Math.max(...finite) };
  };
  const waits = span(ahead.map((s) => s.waitMin));
  const detours = span(ahead.map((s) => s.detourMin));
  const prices = span(ahead.map((s) => s.price));

  /** Ramène une valeur entre 0 (le meilleur du lot) et 1 (le pire). */
  const norm = (value, range) => {
    if (!range || !Number.isFinite(value)) return 0.5;
    if (range.max === range.min) return 0;
    return (value - range.min) / (range.max - range.min);
  };

  const stops = ahead.map((station) => {
    const at = arrivalAtKm(departureAt, durationMin, distanceKm, station.distanceKm);
    const reasons = [];

    // --- besoin de carburant -------------------------------------------------
    // Une station n'est utile pour ravitailler que si elle est atteignable et
    // proche de la limite : s'arrêter à 180 km quand on peut rouler 900 km
    // n'a aucun intérêt.
    let fuelBonus = 0;
    if (fuelLimitKm !== null && station.distanceKm <= fuelLimitKm) {
      // Plus on est proche de la limite, plus l'arrêt est pertinent.
      const proximity = fuelLimitKm > 0 ? station.distanceKm / fuelLimitKm : 0;
      fuelBonus = WEIGHTS.fuelNeeded * proximity;
      if (proximity >= 0.7) reasons.push('dernier ravitaillement confortable avant la réserve');
    }

    // --- horaires ------------------------------------------------------------
    // Sans donnée d'horaires, le statut reste inconnu et n'influence rien :
    // on ne récompense ni ne pénalise une supposition.
    const status = at ? openingStatus(station.openingHours, at) : UNKNOWN;
    let openBonus = 0;
    if (status === 'ouvert') {
      openBonus = WEIGHTS.openConfirmed;
      reasons.push('ouvert à votre heure de passage');
    } else if (status === 'ferme') {
      openBonus = WEIGHTS.closedConfirmed;
      reasons.push('fermé à votre heure de passage');
    }

    // --- besoin de repas -----------------------------------------------------
    // Un établissement dont on sait qu'il sera fermé ne satisfait aucun repas :
    // il ne touche donc pas le bonus, en plus d'être pénalisé.
    let mealBonus = 0;
    let mealAtThisStop = null;
    if (at && status !== 'ferme') {
      const minutes = at.getHours() * 60 + at.getMinutes();
      const window = MEAL_WINDOWS.find((w) => minutes >= w.from && minutes < w.to);
      const wanted = context.meal === 'oui' || (context.meal !== 'non' && meals.length > 0);
      const servesFood = Array.isArray(station.services)
        ? station.services.some((s) => /restauration|caf|food/i.test(s))
        : false;
      if (window && wanted && servesFood) {
        mealBonus = WEIGHTS.mealMatch;
        mealAtThisStop = window.label;
        reasons.push(`passage à l'heure du ${window.label}`);
      }
    }

    // --- confort selon le nombre de personnes --------------------------------
    let servicesBonus = 0;
    const passengers = Number.isFinite(context.passengers) ? context.passengers : 1;
    if (passengers >= 3 && Array.isArray(station.services)) {
      const comfort = station.services.filter((s) => /toilettes|restauration|boutique/i.test(s));
      if (comfort.length >= 2) {
        servicesBonus = WEIGHTS.services;
        reasons.push(`services adaptés à ${passengers} personnes`);
      }
    }

    const penalty =
      WEIGHTS.wait * norm(station.waitMin, waits) +
      WEIGHTS.detour * norm(station.detourMin, detours) +
      WEIGHTS.price * norm(station.price, prices);

    const score = penalty - fuelBonus - mealBonus - openBonus - servicesBonus;

    return {
      station,
      arrivalAt: at,
      openStatus: status,
      meal: mealAtThisStop,
      /** Pourquoi cet arrêt vaut le coup, en clair. */
      reasons,
      /** Plus bas = meilleur. */
      score: Math.round(score * 1000) / 1000,
      necessity: fuelBonus > 0 ? 'carburant' : mealAtThisStop ? 'repas' : 'confort',
    };
  });

  stops.sort((a, b) => a.score - b.score);

  return {
    meals,
    fuelLimitKm,
    /** Vrai si le trajet ne peut pas être fait sans ravitailler. */
    fuelStopNeeded: fuelLimitKm !== null,
    stops,
  };
}
