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
import {
  TRIP_TIME_ZONE,
  instantFromLocalInput,
  minutesOfDayInZone,
  zonedDateKey,
} from './trip-clock.mjs';

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
export function mealsDuringTrip(departureAt, durationMin, timeZone = TRIP_TIME_ZONE) {
  if (!(departureAt instanceof Date) || Number.isNaN(departureAt.getTime())) return [];
  if (!(durationMin > 0)) return [];

  const arrival = new Date(departureAt.getTime() + durationMin * 60000);
  const meals = [];

  // On balaie chaque journée couverte par le trajet, dans le fuseau du trajet :
  // un départ tardif peut faire franchir le déjeuner du lendemain, et les
  // bornes de journée ne sont pas celles de la machine.
  for (let day = 0; day < 4; day += 1) {
    const dateKey = zonedDateKey(departureAt, day, timeZone);
    if (!dateKey) break;
    for (const window of MEAL_WINDOWS) {
      const start = instantFromLocalInput(
        `${dateKey}T${pad(Math.floor(window.from / 60))}:${pad(window.from % 60)}`,
        timeZone,
      );
      const end = instantFromLocalInput(
        `${dateKey}T${pad(Math.floor(window.to / 60))}:${pad(window.to % 60)}`,
        timeZone,
      );
      if (!start || !end) continue;
      // Le repas compte si le trajet en couvre une part significative.
      const overlapStart = Math.max(start.getTime(), departureAt.getTime());
      const overlapEnd = Math.min(end.getTime(), arrival.getTime());
      const overlapMin = (overlapEnd - overlapStart) / 60000;
      if (overlapMin >= MIN_MEAL_OVERLAP_MIN) {
        meals.push({ id: window.id, label: window.label, at: new Date(overlapStart) });
      }
    }
  }

  return meals;
}

const pad = (n) => String(n).padStart(2, '0');

/**
 * Seuils d'affluence, en minutes d'attente estimées par le modèle Floway.
 *
 * Ils vivent ici et non dans l'interface : le classement et l'affichage
 * doivent parler de la même chose. Le modèle produit un ordre de grandeur,
 * pas une file d'attente mesurée — d'où trois niveaux et non un chiffre au
 * dixième de minute.
 */
export const WAIT_LEVELS = [
  { id: 'faible', label: 'Faible', icon: '🟢', upTo: 4 },
  { id: 'moderee', label: 'Modérée', icon: '🟠', upTo: 7 },
  { id: 'forte', label: 'Forte', icon: '🔴', upTo: Infinity },
];

/**
 * Niveau d'affluence d'une station, ou `null` si le modèle n'a rien produit.
 *
 * L'absence d'estimation reste explicite : aucun niveau n'est inventé pour
 * une station dont l'attente est inconnue.
 */
export function waitLevel(waitMin) {
  if (!Number.isFinite(waitMin)) return null;
  const level = WAIT_LEVELS.find((l) => waitMin <= l.upTo) || WAIT_LEVELS.at(-1);
  return { id: level.id, label: level.label, icon: level.icon, waitMin };
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
  timeZone = TRIP_TIME_ZONE,
}) {
  const meals = context.meal === 'non' ? [] : mealsDuringTrip(departureAt, durationMin, timeZone);

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
    const status = at ? openingStatus(station.openingHours, at, timeZone) : UNKNOWN;
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
      const minutes = minutesOfDayInZone(at, timeZone) ?? -1;
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

    // --- affluence -----------------------------------------------------------
    // Le modèle d'attente pesait déjà dans le score, mais sans jamais le dire :
    // un arrêt pouvait être écarté pour son affluence sans que rien à l'écran
    // ne l'explique. Le niveau est donc rendu avec le classement.
    const crowd = waitLevel(station.waitMin);
    if (crowd && ahead.length > 1 && waits && waits.max !== waits.min) {
      // Ne se prononcer que si la station se détache du lot : dire « affluence
      // modérée » de toutes les stations n'apprend rien.
      const relatif = norm(station.waitMin, waits);
      if (relatif <= 0.25 || relatif >= 0.75) {
        reasons.push(`affluence prévue ${crowd.label.toLowerCase()} à votre heure de passage`);
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
      /** Niveau d'affluence estimé, ou null si le modèle n'a rien produit. */
      waitLevel: crowd,
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

/**
 * Espacement minimal entre deux arrêts proposés.
 *
 * Trois arrêts à 40, 120 et 160 km ne forment pas un voyage : on ferait le
 * plein, puis l'appoint. En deçà de cette distance, le second arrêt n'apporte
 * rien que le premier ne couvre déjà.
 */
export const MIN_STOP_SPACING_KM = 90;

/**
 * Durée de conduite au-delà de laquelle une pause s'impose, même sans repas
 * ni ravitaillement. La sécurité routière recommande une pause toutes les
 * deux heures ; on laisse une marge avant de la proposer.
 */
export const MAX_DRIVING_STRETCH_MIN = 150;

/**
 * Construit le fil du voyage à partir d'un classement.
 *
 * `rankStops` dit quelles stations valent le détour ; cette fonction décide
 * lesquelles retenir et pourquoi. Elle applique la logique que l'utilisateur
 * attend, dans cet ordre :
 *
 *  1. réservoir insuffisant → un ravitaillement, placé au plus tard possible
 *     avant la réserve ;
 *  2. repas traversés par le trajet → un arrêt par repas, à l'heure ;
 *  3. longue route sans autre motif → une pause de confort.
 *
 * Quand le réservoir suffit, aucun arrêt carburant n'est propose : c'est le
 * cas qui posait probleme, une pause a 131 km avec le plein fait.
 *
 * `notes` porte ce qui n'est délibérément pas proposé, pour que l'absence
 * d'arrêt soit lisible au lieu de passer pour un oubli.
 *
 * @param {object} input
 * @param {StopPlanLike} input.plan résultat de `rankStops`
 * @param {number} input.distanceKm distance totale
 * @param {number} input.durationMin durée de conduite
 * @param {number} input.currentKm point kilométrique actuel
 * @param {object|null} [input.departureStation] station retenue pour faire le
 *   plein avant de partir, ou null
 * @param {number} [input.maxStops] nombre maximum d'arrêts retenus
 */
export function buildJourney({
  plan,
  distanceKm = 0,
  durationMin = 0,
  currentKm = 0,
  departureStation = null,
  maxStops = 4,
}) {
  const steps = [];
  const notes = [];
  if (!plan || !Array.isArray(plan.stops) || !plan.stops.length) {
    return { steps, notes };
  }

  const restant = Math.max(0, distanceKm - currentKm);
  const pris = new Set();

  /** Un arrêt trop proche d'un autre déjà retenu n'apporte rien. */
  // La station de départ n'est pas sur l'itinéraire : elle n'entre pas dans
  // le calcul d'espacement, sinon elle interdirait tout arrêt du premier tiers.
  const assezLoin = (candidat, espacement = MIN_STOP_SPACING_KM) =>
    steps
      .filter((s) => Number.isFinite(s.station.distanceKm))
      .every((s) => Math.abs(s.station.distanceKm - candidat.station.distanceKm) >= espacement);

  const retenir = (candidat, kind, label, espacement) => {
    if (!candidat || pris.has(candidat.station.id)) return false;
    if (!assezLoin(candidat, espacement)) return false;
    pris.add(candidat.station.id);
    steps.push({
      station: candidat.station,
      kind,
      label,
      arrivalAt: candidat.arrivalAt,
      reasons: candidat.reasons,
      openStatus: candidat.openStatus,
    });
    return true;
  };

  // 1. Faire le plein avant de partir, quand une station proche du départ a
  // été trouvée : c'est ce que fait un conducteur qui sait son réservoir bas,
  // plutôt que de rouler jusqu'à la première station de l'itinéraire.
  //
  // L'appelant ne fournit cette station que si le plein est nécessaire ; le
  // `plan` reçu décrit alors la suite du trajet *une fois le plein fait*.
  {
    if (departureStation) {
      steps.push({
        station: departureStation,
        kind: 'carburant',
        label: 'Plein avant de partir',
        arrivalAt: null,
        reasons: [
          departureStation.detourKm != null
            ? `à ${departureStation.detourKm} km du départ`
            : 'proche du départ',
        ],
        openStatus: 'inconnu',
      });
      pris.add(departureStation.id);
    }
  }

  // 2. Ravitaillement en route, si la suite du trajet le demande encore.
  if (plan.fuelStopNeeded) {
    // `rankStops` favorise déjà les stations proches de la limite d'autonomie ;
    // le premier candidat carburant du classement est donc le bon.
    const carburant = plan.stops.find((s) => s.necessity === 'carburant');
    if (carburant) retenir(carburant, 'carburant', 'Ravitaillement', 0);
    else if (!departureStation) {
      notes.push('Aucune station atteignable avant la réserve sur cet itinéraire.');
    }
  } else if (departureStation) {
    // Tout l'intérêt de s'être arrêté avant de partir.
    notes.push('Le plein au départ couvre tout le trajet : aucun autre arrêt carburant.');
  } else if (plan.fuelLimitKm === null) {
    notes.push('Autonomie suffisante : aucun ravitaillement nécessaire sur ce trajet.');
  }

  // 3. Un arrêt par repas traversé, dans l'ordre du voyage.
  for (const repas of plan.meals) {
    const candidat = plan.stops.find((s) => s.meal === repas.label && !pris.has(s.station.id));
    if (candidat) {
      const majuscule = repas.label.charAt(0).toUpperCase() + repas.label.slice(1);
      if (!retenir(candidat, 'repas', majuscule)) {
        notes.push(`${majuscule} : l'arrêt le mieux placé est déjà retenu juste avant.`);
      }
    } else {
      notes.push(`Aucune station avec restauration à l'heure du ${repas.label} sur cet itinéraire.`);
    }
  }

  // 4. Longue route sans autre motif : une pause de confort à mi-parcours.
  if (!steps.length && durationMin > MAX_DRIVING_STRETCH_MIN && restant > MIN_STOP_SPACING_KM) {
    const cible = currentKm + restant / 2;
    const proche = [...plan.stops]
      .filter((s) => !pris.has(s.station.id))
      .sort(
        (a, b) =>
          Math.abs(a.station.distanceKm - cible) - Math.abs(b.station.distanceKm - cible),
      )[0];
    if (proche) retenir(proche, 'confort', 'Pause');
  }

  const km = (s) => (Number.isFinite(s.station.distanceKm) ? s.station.distanceKm : -1);
  steps.sort((a, b) => km(a) - km(b));
  return { steps: steps.slice(0, maxStops), notes };
}
