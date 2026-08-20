import test from 'node:test';
import assert from 'node:assert/strict';
import {
  correctedConsumption,
  planEnergy,
  planTrip,
  requiredQuantity,
  theoreticalRange,
  usesBattery,
  usesFuel,
} from './energy-model.mjs';

test('autonomie théorique : (capacité / consommation) × 100', () => {
  // 60 L à 6 L/100 km = 1000 km
  assert.equal(theoreticalRange(60, 6), 1000);
  // 75 kWh à 18 kWh/100 km = 416,7 km
  assert.equal(theoreticalRange(75, 18), 416.7);
});

test('quantité nécessaire : (distance × consommation) / 100', () => {
  assert.equal(requiredQuantity(500, 6.4), 32);
  assert.equal(requiredQuantity(0, 6.4), 0);
});

test('correction de la consommation WLTP', () => {
  assert.equal(correctedConsumption(6, 1.15), 6.9);
  // Un facteur absent ou absurde ne corrige rien plutôt que de fausser le calcul.
  assert.equal(correctedConsumption(6), 6);
  assert.equal(correctedConsumption(6, 0), 6);
  assert.equal(correctedConsumption(6, -2), 6);
});

test('les données manquantes sont signalées, jamais inventées', () => {
  const r = planEnergy({ capacity: undefined, consumption: 6, levelPct: 80, distanceKm: 400 });
  assert.deepEqual(r.missing, ['capacite']);
  assert.equal(r.fullRangeKm, null);
  assert.equal(r.refuelStops, null);
  assert.equal(r.estimatedCost, null);

  const vide = planEnergy({});
  assert.deepEqual(vide.missing, ['capacite', 'consommation', 'niveau', 'distance']);
});

test('une consommation nulle ou négative ne provoque pas de division par zéro', () => {
  assert.equal(theoreticalRange(60, 0), null);
  assert.ok(planEnergy({ capacity: 60, consumption: 0, levelPct: 50, distanceKm: 100 }).missing.includes('consommation'));
});

test('trajet court : aucun ravitaillement, la réserve est respectée', () => {
  // 60 L, 6 L/100 -> 1000 km pleins. Niveau 50 % -> 500 km. Réserve 10 % -> 100 km mis de côté.
  const r = planEnergy({ capacity: 60, consumption: 6, levelPct: 50, distanceKm: 300, reservePct: 10 });
  assert.equal(r.fullRangeKm, 1000);
  assert.equal(r.usableFullRangeKm, 900);
  assert.equal(r.remainingRangeKm, 500);
  assert.equal(r.usableRemainingRangeKm, 400);
  assert.equal(r.reachesDestination, true);
  assert.equal(r.refuelStops, 0);
  assert.equal(r.firstStopAtKm, null);
  assert.equal(r.requiredQuantity, 18);
});

test("la réserve fait basculer un trajet tout juste à portée", () => {
  // 400 km exploitables : 420 km ne passent pas.
  const r = planEnergy({ capacity: 60, consumption: 6, levelPct: 50, distanceKm: 420, reservePct: 10 });
  assert.equal(r.reachesDestination, false);
  assert.equal(r.refuelStops, 1);
  assert.equal(r.firstStopAtKm, 400);

  // Sans réserve, les mêmes 420 km passent.
  const sansReserve = planEnergy({ capacity: 60, consumption: 6, levelPct: 50, distanceKm: 420, reservePct: 0 });
  assert.equal(sansReserve.reachesDestination, true);
  assert.equal(sansReserve.refuelStops, 0);
});

test('long trajet : plusieurs arrêts et coût estimé', () => {
  // 50 L, 7 L/100 -> 714,3 km pleins ; 90 % exploitables -> 642,9 km.
  // Niveau 20 % -> 142,9 km, moins la réserve 71,4 -> 71,4 km exploitables.
  // Restent 1928,6 km à couvrir -> 3 arrêts.
  const r = planEnergy({ capacity: 50, consumption: 7, levelPct: 20, distanceKm: 2000, reservePct: 10, unitPrice: 1.75 });
  assert.equal(r.refuelStops, 3);
  assert.equal(r.requiredQuantity, 140);
  assert.ok(r.totalQuantityToBuy > 0 && r.totalQuantityToBuy <= 150);
  assert.equal(r.estimatedCost, Math.round(r.totalQuantityToBuy * 1.75 * 100) / 100);
});

test('le coût reste nul tant que le prix unitaire est inconnu', () => {
  const r = planEnergy({ capacity: 50, consumption: 7, levelPct: 20, distanceKm: 2000 });
  assert.equal(r.estimatedCost, null);
  assert.ok(r.totalQuantityToBuy > 0);
});

test('classification des énergies', () => {
  assert.equal(usesFuel('electrique'), false);
  assert.equal(usesFuel('hybride'), true);
  assert.equal(usesBattery('hybride'), false);
  assert.equal(usesBattery('hybride-rechargeable'), true);
  assert.equal(usesBattery('electrique'), true);
});

test('véhicule thermique : plan complet', () => {
  const r = planTrip({
    energyKind: 'gazole',
    distanceKm: 749,
    fuel: { capacityL: 60, consumptionL100: 6, levelPct: 75, pricePerL: 1.72 },
    reservePct: 10,
    realWorldFactor: 1.15,
  });
  assert.equal(r.complete, true);
  assert.equal(r.battery, null);
  // 6 L/100 corrigés à 1,15 -> 6,9 L/100 -> 869,6 km réservoir plein.
  assert.equal(r.fuel.fullRangeKm, 869.6);
  // Niveau 75 % -> 652,2 km, moins la réserve de 87 km -> 565,2 km exploitables.
  // Les 749 km du trajet ne passent donc pas d'une traite : un arrêt.
  assert.equal(r.fuel.usableRemainingRangeKm, 565.2);
  assert.equal(r.fuel.reachesDestination, false);
  assert.equal(r.stops, 1);
  assert.equal(r.fuel.firstStopAtKm, 565.2);
  assert.ok(r.totalCost > 0);
});

test('véhicule électrique : aucun plan carburant', () => {
  const r = planTrip({
    energyKind: 'electrique',
    distanceKm: 400,
    battery: { capacityKwh: 75, consumptionKwh100: 18, levelPct: 90, pricePerKwh: 0.25 },
    reservePct: 15,
  });
  assert.equal(r.complete, true);
  assert.equal(r.fuel, null);
  assert.equal(r.battery.fullRangeKm, 416.7);
  assert.equal(r.stops, 1);
});

test('hybride rechargeable : la part électrique réduit la distance thermique', () => {
  const r = planTrip({
    energyKind: 'hybride-rechargeable',
    distanceKm: 300,
    battery: { capacityKwh: 17, consumptionKwh100: 17, levelPct: 100 },
    fuel: { capacityL: 60, consumptionL100: 6, levelPct: 100 },
    reservePct: 10,
  });
  // 17 kWh à 17 kWh/100 -> 100 km pleins, 90 km exploitables.
  assert.equal(r.electricCoveredKm, 90);
  // Le thermique ne traite plus que 210 km.
  assert.equal(r.fuel.requiredQuantity, 12.6);
  assert.equal(r.stops, 0);
});

test('hybride non rechargeable : pas de recharge, uniquement du carburant', () => {
  const r = planTrip({
    energyKind: 'hybride',
    distanceKm: 500,
    fuel: { capacityL: 55, consumptionL100: 4.8, levelPct: 60 },
  });
  assert.equal(r.battery, null);
  assert.equal(r.electricCoveredKm, 0);
  assert.equal(r.complete, true);
});

test('planTrip signale précisément ce qui manque', () => {
  const r = planTrip({ energyKind: 'essence', distanceKm: 500, fuel: { consumptionL100: 6, levelPct: 50 } });
  assert.equal(r.complete, false);
  assert.deepEqual(r.missing, ['carburant:capacite']);

  const inconnue = planTrip({ energyKind: 'diesel', distanceKm: 100 });
  assert.ok(inconnue.missing.includes('energie'));
});

test('distance nulle : rien à acheter', () => {
  const r = planEnergy({ capacity: 60, consumption: 6, levelPct: 100, distanceKm: 0 });
  assert.equal(r.refuelStops, 0);
  assert.equal(r.requiredQuantity, 0);
  assert.equal(r.totalQuantityToBuy, 0);
});

test('réservoir vide : le premier arrêt est immédiat', () => {
  const r = planEnergy({ capacity: 60, consumption: 6, levelPct: 0, distanceKm: 500 });
  assert.equal(r.usableRemainingRangeKm, 0);
  assert.equal(r.firstStopAtKm, 0);
  assert.equal(r.refuelStops, 1);
  assert.equal(r.reachesDestination, false);
});

test('une réserve absurde est ramenée dans les bornes plutôt que de casser le calcul', () => {
  const r = planEnergy({ capacity: 60, consumption: 6, levelPct: 100, distanceKm: 100, reservePct: 500 });
  assert.equal(r.usableFullRangeKm, 100); // plafonnée à 90 %
  assert.ok(Number.isFinite(r.refuelStops));
});
