import test from 'node:test';
import assert from 'node:assert/strict';
import { arrivalAtKm, mealsDuringTrip, rankStops } from './stop-planner.mjs';
import { planEnergy } from './energy-model.mjs';
import { formatTimeInZone, instantFromLocalInput } from './trip-clock.mjs';

/** Départ à l'heure indiquée dans le fuseau du trajet. 2026-08-17 est un lundi. */
const dep = (time) => instantFromLocalInput(`2026-08-17T${time}`);

const station = (id, km, extra = {}) => ({
  id,
  distanceKm: km,
  waitMin: 4,
  detourMin: 2,
  price: 1.8,
  services: ['Carburant'],
  ...extra,
});

test("heure de passage : progression réguliere sur le trajet", () => {
  const at = arrivalAtKm(dep('19:00'), 472, 749, 180);
  // 180/749 de 7 h 52 ≈ 1 h 53 → 20 h 53, heure de la station.
  assert.equal(formatTimeInZone(at), '20:53');
});

test('un départ à 19 h sur 7 h de route traverse le dîner', () => {
  const meals = mealsDuringTrip(dep('19:00'), 472);
  assert.deepEqual(meals.map((m) => m.id), ['diner']);
});

test('un départ à 9 h sur 3 h de route ne traverse aucun repas', () => {
  assert.deepEqual(mealsDuringTrip(dep('09:00'), 180), []);
});

test('un départ à 10 h sur 5 h de route traverse le déjeuner', () => {
  assert.deepEqual(mealsDuringTrip(dep('10:00'), 300).map((m) => m.id), ['dejeuner']);
});

test('un trajet de nuit très long traverse les repas du lendemain', () => {
  const ids = mealsDuringTrip(dep('22:00'), 20 * 60).map((m) => m.id);
  assert.ok(ids.includes('dejeuner'));
});

test("le grief central : reservoir plein, aucun arret carburant privilegie", () => {
  // 60 L à 6 L/100 corriges, plein a 100 % : bien au-dela des 749 km.
  const energyPlan = planEnergy({ capacity: 60, consumption: 6, levelPct: 100, distanceKm: 749 });
  assert.equal(energyPlan.refuelStops, 0);
  assert.equal(energyPlan.firstStopAtKm, null);

  const { fuelStopNeeded, stops } = rankStops({
    stations: [station('a', 180), station('b', 416), station('c', 659)],
    departureAt: dep('09:00'),
    durationMin: 472,
    distanceKm: 749,
    energyPlan,
    context: { passengers: 1, meal: 'non' },
  });

  assert.equal(fuelStopNeeded, false);
  // Aucun arret n'est motive par le carburant.
  assert.ok(stops.every((s) => s.necessity !== 'carburant'));
  assert.ok(stops.every((s) => !s.reasons.some((r) => /ravitaillement/.test(r))));
});

test('reservoir insuffisant : le meilleur arret est proche de la limite', () => {
  // 50 L a 7 L/100, niveau 40 % : ~257 km exploitables sur 749 km.
  const energyPlan = planEnergy({ capacity: 50, consumption: 7, levelPct: 40, distanceKm: 749 });
  assert.ok(energyPlan.refuelStops >= 1);

  const { fuelStopNeeded, stops, fuelLimitKm } = rankStops({
    stations: [station('proche', 40), station('juste-avant', 200), station('trop-loin', 600)],
    departureAt: dep('09:00'),
    durationMin: 472,
    distanceKm: 749,
    energyPlan,
    context: { passengers: 1, meal: 'non' },
  });

  assert.equal(fuelStopNeeded, true);
  assert.ok(fuelLimitKm > 200 && fuelLimitKm < 300);
  // Celle qui est juste avant la limite passe devant celle du debut de trajet.
  assert.equal(stops[0].station.id, 'juste-avant');
  assert.equal(stops[0].necessity, 'carburant');
  // La station hors de portee n'est pas presentee comme un ravitaillement.
  assert.equal(stops.find((s) => s.station.id === 'trop-loin').necessity, 'confort');
});

test("l'heure du diner fait remonter une station qui sert a manger", () => {
  const restau = station('restau', 180, { services: ['Carburant', 'Restauration'], waitMin: 8 });
  const pompe = station('pompe', 200, { services: ['Carburant'], waitMin: 2 });

  const { stops } = rankStops({
    stations: [pompe, restau],
    departureAt: dep('19:00'),
    durationMin: 472,
    distanceKm: 749,
    energyPlan: null,
    context: { passengers: 2, meal: 'auto' },
  });

  // Malgre une attente quatre fois superieure, le restaurant passe devant.
  assert.equal(stops[0].station.id, 'restau');
  assert.equal(stops[0].meal, 'dîner');
});

test("si l'utilisateur ne veut pas manger, l'heure n'intervient plus", () => {
  const restau = station('restau', 180, { services: ['Carburant', 'Restauration'], waitMin: 8 });
  const pompe = station('pompe', 200, { services: ['Carburant'], waitMin: 2 });
  const { stops, meals } = rankStops({
    stations: [pompe, restau],
    departureAt: dep('19:00'),
    durationMin: 472,
    distanceKm: 749,
    context: { passengers: 2, meal: 'non' },
  });
  assert.deepEqual(meals, []);
  assert.equal(stops[0].station.id, 'pompe');
});

test('un lieu fermé à l’heure de passage est relégué', () => {
  const ferme = station('ferme', 180, {
    services: ['Restauration'],
    openingHours: 'Mo-Fr 08:00-14:00',
    waitMin: 1,
    detourMin: 0,
    price: 1.6,
  });
  const ouvert = station('ouvert', 200, {
    services: ['Restauration'],
    openingHours: '24/7',
    waitMin: 9,
    detourMin: 4,
    price: 1.95,
  });
  const { stops } = rankStops({
    stations: [ferme, ouvert],
    departureAt: dep('19:00'),
    durationMin: 472,
    distanceKm: 749,
    context: { passengers: 2, meal: 'oui' },
  });
  assert.equal(stops[0].station.id, 'ouvert');
  assert.equal(stops[0].openStatus, 'ouvert');
  assert.equal(stops.find((s) => s.station.id === 'ferme').openStatus, 'ferme');
});

test("sans horaires connus, le statut reste inconnu et n'influence pas le classement", () => {
  const { stops } = rankStops({
    stations: [station('a', 100), station('b', 200)],
    departureAt: dep('09:00'),
    durationMin: 300,
    distanceKm: 749,
    context: {},
  });
  assert.ok(stops.every((s) => s.openStatus === 'inconnu'));
  assert.ok(stops.every((s) => !s.reasons.some((r) => /ouvert|fermé/.test(r))));
});

test('le prix pèse réellement dans le classement', () => {
  const chere = station('chere', 100, { price: 2.1, waitMin: 3, detourMin: 2 });
  const eco = station('eco', 120, { price: 1.55, waitMin: 4, detourMin: 2 });
  const { stops } = rankStops({
    stations: [chere, eco],
    departureAt: dep('09:00'),
    durationMin: 300,
    distanceKm: 749,
    context: { meal: 'non' },
  });
  // Une minute d'attente en plus ne compense pas 55 centimes d'ecart.
  assert.equal(stops[0].station.id, 'eco');
});

test('les stations déjà dépassées sont écartées', () => {
  const { stops } = rankStops({
    stations: [station('derriere', 50), station('devant', 300)],
    departureAt: dep('09:00'),
    durationMin: 300,
    distanceKm: 749,
    currentKm: 120,
    context: {},
  });
  assert.deepEqual(stops.map((s) => s.station.id), ['devant']);
});

test('plus de deux passagers : les services de confort comptent', () => {
  const complete = station('complete', 200, { services: ['Carburant', 'Restauration', 'Toilettes'] });
  const nue = station('nue', 210, { services: ['Carburant'] });
  const { stops } = rankStops({
    stations: [nue, complete],
    departureAt: dep('09:00'),
    durationMin: 300,
    distanceKm: 749,
    context: { passengers: 4, meal: 'non' },
  });
  assert.equal(stops[0].station.id, 'complete');
  assert.ok(stops[0].reasons.some((r) => /4 personnes/.test(r)));
});

test('aucune station devant : le planificateur ne casse pas', () => {
  const r = rankStops({ stations: [], departureAt: dep('09:00'), durationMin: 100, distanceKm: 200 });
  assert.deepEqual(r.stops, []);
});
