import test from 'node:test';
import assert from 'node:assert/strict';
import { arrivalAtKm, buildJourney, mealsDuringTrip, rankStops, waitLevel, MAX_DRIVING_STRETCH_MIN, MIN_STOP_SPACING_KM } from './stop-planner.mjs';
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

// --- fil du voyage ---------------------------------------------------------

const trajet = (stations, { depart = '09:00', duree = 300, distance = 500, energie = null, contexte = {} } = {}) =>
  rankStops({
    stations,
    departureAt: dep(depart),
    durationMin: duree,
    distanceKm: distance,
    energyPlan: energie,
    context: contexte,
  });

test('le plein fait : aucun arrêt carburant proposé, et l’absence est expliquée', () => {
  // 60 L à 5 L/100 = 1200 km d'autonomie pour 500 km de trajet.
  const energie = planEnergy({ capacity: 60, consumption: 5, levelPct: 100, distanceKm: 500 });
  assert.equal(energie.firstStopAtKm, null, 'le plein couvre le trajet');
  const plan = trajet([station('a', 131), station('b', 300)], { energie });
  const { steps, notes } = buildJourney({ plan, distanceKm: 500, durationMin: 300 });
  assert.equal(steps.filter((s) => s.kind === 'carburant').length, 0);
  assert.ok(notes.some((n) => /Autonomie suffisante/.test(n)), notes.join(' | '));
});

test('réservoir insuffisant : un seul ravitaillement, au plus tard avant la réserve', () => {
  // 40 L à 8 L/100 à 50 % = 250 km, réserve 10 % → environ 210 km exploitables.
  const energie = planEnergy({ capacity: 40, consumption: 8, levelPct: 50, distanceKm: 500 });
  assert.ok(energie.firstStopAtKm > 0, 'un ravitaillement est bien nécessaire');
  const plan = trajet([station('proche', 60), station('juste', 200), station('trop-loin', 480)], { energie });
  const { steps } = buildJourney({ plan, distanceKm: 500, durationMin: 300 });
  const carburant = steps.filter((s) => s.kind === 'carburant');
  assert.equal(carburant.length, 1);
  assert.equal(carburant[0].station.id, 'juste', 'le plus proche de la limite, pas le premier venu');
});

test('un départ à 11 h fait proposer un déjeuner, servi par une station qui restaure', () => {
  const stations = [
    station('sans-resto', 120),
    station('resto', 150, { services: ['Carburant', 'Restauration'] }),
  ];
  const plan = trajet(stations, { depart: '11:00', duree: 300, distance: 500 });
  const { steps } = buildJourney({ plan, distanceKm: 500, durationMin: 300 });
  const repas = steps.filter((s) => s.kind === 'repas');
  assert.equal(repas.length, 1);
  assert.equal(repas[0].station.id, 'resto');
  assert.equal(repas[0].label, 'Déjeuner');
});

test('aucun repas traversé : rien n’est inventé', () => {
  // Départ 15 h, 2 h de route : ni déjeuner ni dîner.
  const plan = trajet([station('a', 60, { services: ['Carburant', 'Restauration'] })], {
    depart: '15:00', duree: 120, distance: 200,
  });
  const { steps } = buildJourney({ plan, distanceKm: 200, durationMin: 120 });
  assert.equal(steps.filter((s) => s.kind === 'repas').length, 0);
});

test('les arrêts retenus ne se suivent pas de trop près', () => {
  const energie = planEnergy({ capacity: 40, consumption: 8, levelPct: 50, distanceKm: 500 });
  const stations = [
    station('a', 190, { services: ['Carburant', 'Restauration'] }),
    station('b', 200, { services: ['Carburant', 'Restauration'] }),
  ];
  const plan = trajet(stations, { depart: '11:00', duree: 300, distance: 500, energie });
  const { steps } = buildJourney({ plan, distanceKm: 500, durationMin: 300 });
  const ecarts = steps.slice(1).map((s, i) => s.station.distanceKm - steps[i].station.distanceKm);
  assert.ok(ecarts.every((e) => e >= MIN_STOP_SPACING_KM), `écarts : ${ecarts.join(', ')}`);
});

/** Durée de conduite du plus long tronçon sans arrêt, en minutes. */
const plusLongTroncon = (steps, distanceKm, durationMin, currentKm = 0) => {
  const bornes = [currentKm, ...steps.map((s) => s.station.distanceKm).filter(Number.isFinite), distanceKm]
    .sort((a, b) => a - b);
  let pire = 0;
  for (let i = 0; i < bornes.length - 1; i += 1) {
    pire = Math.max(pire, ((bornes[i + 1] - bornes[i]) / distanceKm) * durationMin);
  }
  return pire;
};

test('longue route sans repas ni carburant : une pause de confort à mi-parcours', () => {
  const plan = trajet([station('debut', 40), station('milieu', 240), station('fin', 460)], {
    depart: '15:00', duree: 300, distance: 500,
  });
  const { steps } = buildJourney({ plan, distanceKm: 500, durationMin: 300 });
  assert.ok(steps.length >= 1, 'au moins une pause');
  assert.ok(steps.every((s) => s.kind === 'confort'), steps.map((s) => s.kind).join(','));
  assert.equal(steps[0].station.id, 'milieu');
  assert.ok(
    plusLongTroncon(steps, 500, 300) <= MAX_DRIVING_STRETCH_MIN,
    `tronçon le plus long : ${plusLongTroncon(steps, 500, 300).toFixed(0)} min`,
  );
});

test('un ravitaillement ne supprime plus les pauses du reste du trajet', () => {
  // Le cas constate : 750 km, 6 h 32, reservoir a 10 %. Le fil n'affichait
  // qu'une seule etape — le plein — et laissait 742 km sans rien.
  const stations = [];
  for (let km = 20; km < 750; km += 40) stations.push(station(`s${km}`, km, { services: ['Carburant', 'Restauration'] }));
  // 40 % de 1000 km d'autonomie : un ravitaillement est necessaire, mais on
  // peut encore rouler — ce n'est pas le cas d'urgence, teste juste apres.
  const energie = planEnergy({ capacity: 60, consumption: 6, levelPct: 40, distanceKm: 750 });
  const plan = trajet(stations, { depart: '20:52', duree: 392, distance: 750, energie });
  const { steps } = buildJourney({ plan, distanceKm: 750, durationMin: 392 });
  assert.ok(steps.length > 1, `un seul arret sur 750 km : ${steps.map((s) => s.label).join(' | ')}`);
  assert.ok(steps.some((s) => s.kind === 'carburant'), 'le ravitaillement reste propose');
  assert.ok(
    plusLongTroncon(steps, 750, 392) <= MAX_DRIVING_STRETCH_MIN,
    `tronçon le plus long : ${plusLongTroncon(steps, 750, 392).toFixed(0)} min`,
  );
});

test('carburant urgent : le plein ouvre le fil, il ne le remplace pas', () => {
  const stations = [];
  for (let km = 8; km < 750; km += 45) stations.push(station(`s${km}`, km, { services: ['Carburant', 'Restauration'] }));
  const plan = trajet(stations, { depart: '20:52', duree: 392, distance: 750 });
  const urgente = { id: 'urgente', distanceKm: 8, name: 'Émerainville' };
  const { steps } = buildJourney({ plan, distanceKm: 750, durationMin: 392, urgentStation: urgente });
  assert.equal(steps[0].station.id, 'urgente');
  assert.equal(steps[0].label, 'Carburant urgent');
  assert.ok(steps.length > 1, `le fil s'arrete au plein : ${steps.map((s) => s.label).join(' | ')}`);
  // Un depart a 20 h 52 traverse le diner : il doit rester propose.
  assert.ok(steps.some((s) => s.kind === 'repas'), steps.map((s) => `${s.kind}:${s.label}`).join(' | '));
  assert.ok(
    plusLongTroncon(steps, 750, 392) <= MAX_DRIVING_STRETCH_MIN,
    `tronçon le plus long : ${plusLongTroncon(steps, 750, 392).toFixed(0)} min`,
  );
});

test('trajet court : aucune pause imposée', () => {
  const plan = trajet([station('a', 30)], { depart: '15:00', duree: 60, distance: 80 });
  const { steps } = buildJourney({ plan, distanceKm: 80, durationMin: 60 });
  assert.equal(steps.length, 0);
});

// --- plein avant de partir -------------------------------------------------

const stationDepart = { id: 'depart', detourKm: 2.4, name: 'Station du coin', price: 1.71 };

test('réservoir bas : le plein se fait avant de partir, pas 200 km plus loin', () => {
  const energie = planEnergy({ capacity: 40, consumption: 8, levelPct: 50, distanceKm: 500 });
  const plan = trajet([station('sur-la-route', 200)], { energie });
  const { steps } = buildJourney({
    plan, distanceKm: 500, durationMin: 300,
    departureStation: stationDepart,
  });
  assert.equal(steps[0].label, 'Plein avant de partir');
  assert.equal(steps[0].station.id, 'depart');
  assert.ok(steps[0].reasons.some((r) => /2\.4 km du départ/.test(r)), steps[0].reasons.join(' | '));
});

test('si le plein au départ couvre le trajet, aucun autre arrêt carburant', () => {
  // A 20 % il faut ravitailler ; c'est ce qui declenche la recherche au depart.
  const bas = planEnergy({ capacity: 60, consumption: 5, levelPct: 20, distanceKm: 500 });
  assert.ok(bas.firstStopAtKm > 0, 'à 20 % il faut bien ravitailler');
  // Une fois le plein fait, la suite du trajet se planifie reservoir plein :
  // 60 L a 5 L/100 = 1200 km, les 500 km passent sans autre arret.
  const apresPlein = planEnergy({ capacity: 60, consumption: 5, levelPct: 100, distanceKm: 500 });
  assert.equal(apresPlein.firstStopAtKm, null);
  const plan = trajet([station('sur-la-route', 150)], { energie: apresPlein });
  const { steps, notes } = buildJourney({
    plan, distanceKm: 500, durationMin: 300, departureStation: stationDepart,
  });
  assert.equal(steps.filter((s) => s.kind === 'carburant').length, 1);
  assert.equal(steps[0].label, 'Plein avant de partir');
  assert.ok(notes.some((n) => /couvre tout le trajet/.test(n)), notes.join(' | '));
});

test('la station de départ n’empêche pas un arrêt proche sur la route', () => {
  const apresPlein = planEnergy({ capacity: 60, consumption: 5, levelPct: 100, distanceKm: 500 });
  const plan = trajet([station('tot', 80, { services: ['Carburant', 'Restauration'] })], {
    depart: '11:00', duree: 300, distance: 500, energie: apresPlein,
  });
  const { steps } = buildJourney({
    plan, distanceKm: 500, durationMin: 300, departureStation: stationDepart,
  });
  // Un déjeuner à 80 km reste proposé, alors que 80 < MIN_STOP_SPACING_KM :
  // la station de départ n'est pas sur l'itinéraire, elle ne compte pas dans
  // l'espacement.
  assert.ok(80 < MIN_STOP_SPACING_KM && steps.some((s) => s.kind === 'repas' && s.station.id === 'tot'), steps.map((s) => s.label).join(' | '));
});

test('sans station trouvée près du départ, on retombe sur l’arrêt en route', () => {
  const energie = planEnergy({ capacity: 40, consumption: 8, levelPct: 50, distanceKm: 500 });
  const plan = trajet([station('sur-la-route', 200)], { energie });
  const { steps } = buildJourney({ plan, distanceKm: 500, durationMin: 300, departureStation: null });
  assert.equal(steps.filter((s) => s.kind === 'carburant').length, 1);
  assert.equal(steps[0].label, 'Ravitaillement');
});

// --- affluence dans le classement -------------------------------------------

test('affluence : trois niveaux, et rien d’inventé sans estimation', () => {
  assert.equal(waitLevel(2).id, 'faible');
  assert.equal(waitLevel(4).id, 'faible');
  assert.equal(waitLevel(5).id, 'moderee');
  assert.equal(waitLevel(7).id, 'moderee');
  assert.equal(waitLevel(8).id, 'forte');
  assert.equal(waitLevel(undefined), null);
  assert.equal(waitLevel(null), null);
  assert.equal(waitLevel(Number.NaN), null);
});

test('à égalité par ailleurs, la station la moins fréquentée passe devant', () => {
  const calme = station('calme', 200, { waitMin: 2 });
  const bondee = station('bondee', 210, { waitMin: 12 });
  const plan = trajet([bondee, calme]);
  assert.equal(plan.stops[0].station.id, 'calme');
  // Le classement doit pouvoir se justifier : le niveau est rendu avec lui.
  assert.equal(plan.stops[0].waitLevel.id, 'faible');
  assert.equal(plan.stops.find((s) => s.station.id === 'bondee').waitLevel.id, 'forte');
});

test('l’affluence n’est citée que si la station se détache du lot', () => {
  const plan = trajet([
    station('calme', 200, { waitMin: 2 }),
    station('moyenne', 260, { waitMin: 7 }),
    station('bondee', 320, { waitMin: 12 }),
  ]);
  const raisons = (id) => plan.stops.find((s) => s.station.id === id).reasons.join(' | ');
  assert.match(raisons('calme'), /affluence prévue faible/);
  assert.match(raisons('bondee'), /affluence prévue forte/);
  assert.doesNotMatch(raisons('moyenne'), /affluence/);
});

test('une seule station : aucune comparaison d’affluence n’est affirmée', () => {
  const plan = trajet([station('seule', 200, { waitMin: 12 })]);
  assert.doesNotMatch(plan.stops[0].reasons.join(' | '), /affluence/);
  // Le niveau reste disponible, il n'est simplement pas présenté comme un argument.
  assert.equal(plan.stops[0].waitLevel.id, 'forte');
});

test('le carburant nécessaire pèse plus lourd qu’une affluence faible', () => {
  // 40 L a 8 L/100 avec 60 % : 250 km avant la reserve.
  const energie = planEnergy({ capacity: 40, consumption: 8, levelPct: 60, distanceKm: 500 });
  const utile = station('utile', 240, { waitMin: 12 });
  const calmeInutile = station('trop-loin', 460, { waitMin: 2 });
  const plan = trajet([calmeInutile, utile], { energie });
  assert.equal(plan.fuelLimitKm, 250);
  assert.equal(plan.stops[0].station.id, 'utile');
});
