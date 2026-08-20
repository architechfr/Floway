/**
 * Moteur de calcul d'autonomie et de ravitaillement.
 *
 * Volontairement pur : aucune dépendance réseau, aucune connaissance des
 * sources de données. Il reçoit un profil véhicule, une distance et des prix,
 * et rend un résultat. Les prix carburants data.gouv.fr, le calcul
 * d'itinéraire, les stations-service, les bornes de recharge et les
 * consommations réelles observées viendront alimenter ses ENTRÉES sans
 * modifier une ligne de ce fichier.
 *
 * Principe de traitement des données manquantes : rien n'est inventé. Une
 * entrée absente ou invalide produit un résultat dont les champs concernés
 * valent `null`, et la raison est listée dans `missing`. L'appelant décide
 * quoi afficher.
 */

/** Énergies gérées. */
export const ENERGY_KINDS = /** @type {const} */ ([
  'essence',
  'gazole',
  'superethanol',
  'gpl',
  'hybride', // hybride non rechargeable : se ravitaille uniquement en carburant
  'hybride-rechargeable',
  'electrique',
]);

/** Vrai si l'énergie implique un réservoir de carburant. */
export function usesFuel(kind) {
  return kind !== 'electrique';
}

/** Vrai si l'énergie implique une batterie que l'on recharge sur une borne. */
export function usesBattery(kind) {
  return kind === 'electrique' || kind === 'hybride-rechargeable';
}

/**
 * Consommation réelle corrigée par rapport au cycle WLTP.
 *
 * Le WLTP sous-estime la consommation observée sur route. Le facteur est une
 * entrée de l'appelant, jamais une constante cachée : quand des consommations
 * réellement observées seront disponibles, elles remplaceront ce facteur sans
 * changer le calcul.
 *
 * @param {number} wltp consommation homologuée (L/100 km ou kWh/100 km)
 * @param {number} factor multiplicateur, 1 = pas de correction
 * @returns {number|null}
 */
export function correctedConsumption(wltp, factor = 1) {
  if (!isPositive(wltp)) return null;
  const f = Number.isFinite(factor) && factor > 0 ? factor : 1;
  return round(wltp * f, 3);
}

/**
 * Autonomie théorique, réservoir ou batterie plein(e).
 *
 *   autonomie (km) = (capacité / consommation) × 100
 *
 * @param {number} capacity litres, ou kWh utiles
 * @param {number} consumption L/100 km, ou kWh/100 km
 * @returns {number|null} km, ou null si une entrée manque
 */
export function theoreticalRange(capacity, consumption) {
  if (!isPositive(capacity) || !isPositive(consumption)) return null;
  return round((capacity / consumption) * 100, 1);
}

/**
 * Quantité nécessaire pour parcourir une distance.
 *
 *   quantité = (distance × consommation) / 100
 *
 * @param {number} distanceKm
 * @param {number} consumption L/100 km, ou kWh/100 km
 * @returns {number|null} litres, ou kWh
 */
export function requiredQuantity(distanceKm, consumption) {
  if (!isFiniteNonNegative(distanceKm) || !isPositive(consumption)) return null;
  return round((distanceKm * consumption) / 100, 2);
}

/**
 * Plan d'énergie pour une seule source (carburant OU électricité).
 *
 * @param {object} input
 * @param {number} input.capacity capacité totale utile (L ou kWh)
 * @param {number} input.consumption consommation corrigée (L/100 km ou kWh/100 km)
 * @param {number} input.levelPct niveau actuel, 0 à 100
 * @param {number} input.distanceKm distance à parcourir
 * @param {number} [input.reservePct] réserve de sécurité, 0 à 90. Défaut 10.
 * @param {number} [input.unitPrice] prix par litre ou par kWh
 */
export function planEnergy({ capacity, consumption, levelPct, distanceKm, reservePct = 10, unitPrice }) {
  const missing = [];
  if (!isPositive(capacity)) missing.push('capacite');
  if (!isPositive(consumption)) missing.push('consommation');
  if (!isPercent(levelPct)) missing.push('niveau');
  if (!isFiniteNonNegative(distanceKm)) missing.push('distance');

  if (missing.length) {
    return {
      missing,
      fullRangeKm: null,
      usableFullRangeKm: null,
      remainingRangeKm: null,
      usableRemainingRangeKm: null,
      requiredQuantity: null,
      reachesDestination: null,
      refuelStops: null,
      totalQuantityToBuy: null,
      tripCost: null,
      purchaseCost: null,
      firstStopAtKm: null,
    };
  }

  const reserve = clamp(isFiniteNonNegative(reservePct) ? reservePct : 10, 0, 90) / 100;

  // Autonomie réservoir plein, puis part réellement exploitable une fois la
  // réserve de sécurité mise de côté.
  const fullRangeKm = (capacity / consumption) * 100;
  const usableFullRangeKm = fullRangeKm * (1 - reserve);

  // Autonomie avec le niveau actuel.
  const remainingRangeKm = fullRangeKm * (levelPct / 100);
  const usableRemainingRangeKm = Math.max(0, remainingRangeKm - fullRangeKm * reserve);

  const needed = (distanceKm * consumption) / 100;
  const reachesDestination = usableRemainingRangeKm >= distanceKm;

  // Nombre d'arrêts : ce que le niveau actuel ne couvre pas est découpé en
  // pleins exploitables. usableFullRangeKm est > 0 puisque reserve <= 0.9.
  const uncovered = Math.max(0, distanceKm - usableRemainingRangeKm);
  const refuelStops = uncovered === 0 ? 0 : Math.ceil(uncovered / usableFullRangeKm);

  // Quantité à acheter : le besoin total moins ce qui est déjà à bord et
  // réellement utilisable, borné par ce que les arrêts permettent d'embarquer.
  const onBoardUsable = (usableRemainingRangeKm * consumption) / 100;
  const totalQuantityToBuy = Math.min(
    Math.max(0, needed - onBoardUsable),
    refuelStops * capacity,
  );

  return {
    missing,
    fullRangeKm: round(fullRangeKm, 1),
    usableFullRangeKm: round(usableFullRangeKm, 1),
    remainingRangeKm: round(remainingRangeKm, 1),
    usableRemainingRangeKm: round(usableRemainingRangeKm, 1),
    requiredQuantity: round(needed, 2),
    reachesDestination,
    refuelStops,
    totalQuantityToBuy: round(totalQuantityToBuy, 2),
    // Deux couts distincts, souvent confondus : ce que le trajet consomme au
    // total, et ce qu'il faut effectivement acheter en route. Sur un plein de
    // depart suffisant, le second vaut zero alors que le premier ne l'est pas.
    tripCost: isPositive(unitPrice) ? round(needed * unitPrice, 2) : null,
    purchaseCost: isPositive(unitPrice) ? round(totalQuantityToBuy * unitPrice, 2) : null,
    firstStopAtKm: refuelStops === 0 ? null : round(usableRemainingRangeKm, 1),
  };
}

/**
 * Plan complet pour un trajet, toutes énergies confondues.
 *
 * Pour un hybride rechargeable, la part électrique est consommée en premier
 * dans la limite de son autonomie exploitable, le reste passe au carburant.
 * C'est un modèle simplifié et il est assumé comme tel : il ne simule ni la
 * stratégie de gestion du constructeur, ni la recharge par récupération.
 *
 * @param {object} input
 * @param {string} input.energyKind
 * @param {number} input.distanceKm
 * @param {object} [input.fuel] { capacityL, consumptionL100, levelPct, pricePerL }
 * @param {object} [input.battery] { capacityKwh, consumptionKwh100, levelPct, pricePerKwh }
 * @param {number} [input.reservePct]
 * @param {number} [input.realWorldFactor] correction appliquée aux consommations WLTP
 */
export function planTrip({
  energyKind,
  distanceKm,
  fuel,
  battery,
  reservePct = 10,
  realWorldFactor = 1,
}) {
  const missing = [];
  if (!ENERGY_KINDS.includes(energyKind)) missing.push('energie');
  if (!isFiniteNonNegative(distanceKm)) missing.push('distance');

  const needsFuel = usesFuel(energyKind);
  const needsBattery = usesBattery(energyKind);

  let electricPlan = null;
  let electricCoveredKm = 0;

  if (needsBattery) {
    const consumption = correctedConsumption(battery?.consumptionKwh100, realWorldFactor);
    electricPlan = planEnergy({
      capacity: battery?.capacityKwh,
      consumption,
      levelPct: battery?.levelPct,
      distanceKm,
      reservePct,
      unitPrice: battery?.pricePerKwh,
    });
    electricPlan.missing.forEach((m) => missing.push(`batterie:${m}`));

    // Sur un hybride rechargeable, l'électrique ne couvre que le début du
    // trajet : au-delà, c'est le thermique qui prend le relais.
    if (energyKind === 'hybride-rechargeable' && electricPlan.usableRemainingRangeKm !== null) {
      electricCoveredKm = Math.min(distanceKm, electricPlan.usableRemainingRangeKm);
    }
  }

  let fuelPlan = null;

  if (needsFuel) {
    const consumption = correctedConsumption(fuel?.consumptionL100, realWorldFactor);
    const fuelDistance = Math.max(0, distanceKm - electricCoveredKm);
    fuelPlan = planEnergy({
      capacity: fuel?.capacityL,
      consumption,
      levelPct: fuel?.levelPct,
      distanceKm: fuelDistance,
      reservePct,
      unitPrice: fuel?.pricePerL,
    });
    fuelPlan.missing.forEach((m) => missing.push(`carburant:${m}`));
  }

  const tripCosts = [fuelPlan?.tripCost, electricPlan?.tripCost].filter((c) => typeof c === 'number');
  const purchaseCosts = [fuelPlan?.purchaseCost, electricPlan?.purchaseCost].filter(
    (c) => typeof c === 'number',
  );

  // Sur un hybride rechargeable la part electrique est deja deduite de la
  // distance thermique : seuls les arrets carburant comptent comme ravitaillement.
  const stops =
    energyKind === 'hybride-rechargeable'
      ? fuelPlan?.refuelStops ?? null
      : (fuelPlan ?? electricPlan)?.refuelStops ?? null;

  return {
    energyKind,
    distanceKm: isFiniteNonNegative(distanceKm) ? round(distanceKm, 1) : null,
    reservePct,
    realWorldFactor,
    electricCoveredKm: round(electricCoveredKm, 1),
    fuel: fuelPlan,
    battery: electricPlan,
    stops,
    /** Cout de l'energie consommee sur tout le trajet. */
    totalTripCost: tripCosts.length ? round(tripCosts.reduce((a, b) => a + b, 0), 2) : null,
    /** Cout de ce qu'il faut acheter en route, hors energie deja a bord. */
    totalPurchaseCost: purchaseCosts.length
      ? round(purchaseCosts.reduce((a, b) => a + b, 0), 2)
      : null,
    missing,
    /** Vrai quand tout ce qui est nécessaire au calcul est présent. */
    complete: missing.length === 0,
  };
}

// --- utilitaires ------------------------------------------------------------

function isPositive(n) {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

function isFiniteNonNegative(n) {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

function isPercent(n) {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function round(n, decimals) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}
