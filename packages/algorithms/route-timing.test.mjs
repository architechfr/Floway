import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRouteTimeline, passageTime } from './route-timing.mjs';
import { formatTimeInZone, instantFromLocalInput } from './trip-clock.mjs';

test('les durées réelles par segment sont cumulées', () => {
  const { secondsAt, source } = buildRouteTimeline({
    durations: [60, 120, 30],
    cumulativeKm: [0, 1, 3, 4],
    totalDurationMin: 3.5,
  });
  assert.equal(source, 'osrm');
  assert.deepEqual(secondsAt, [0, 60, 180, 210]);
});

test("le grief : un début urbain lent n'est plus compté à la vitesse d'autoroute", () => {
  // 3 segments : 30 km de peripherie en 40 min, puis 300 km d'autoroute en 3 h,
  // puis 30 km d'arrivee en 30 min. Total 360 km en 4 h 10.
  const cumulativeKm = [0, 30, 330, 360];
  const durations = [40 * 60, 180 * 60, 30 * 60];
  const depart = instantFromLocalInput('2026-08-20T09:00');

  const reel = buildRouteTimeline({ durations, cumulativeKm, totalDurationMin: 250 });
  const approx = buildRouteTimeline({ durations: null, cumulativeKm, totalDurationMin: 250 });

  // Au point a 30 km : 40 min reelles contre 21 min par regle de trois.
  assert.equal(formatTimeInZone(passageTime(depart, reel.secondsAt, 1)), '09:40');
  assert.equal(formatTimeInZone(passageTime(depart, approx.secondsAt, 1)), '09:20');

  // Au point a 330 km : 3 h 40 reelles contre 3 h 49 estimees.
  assert.equal(formatTimeInZone(passageTime(depart, reel.secondsAt, 2)), '12:40');
  assert.equal(formatTimeInZone(passageTime(depart, approx.secondsAt, 2)), '12:49');

  // L'arrivee, elle, coincide : c'est bien la repartition qui etait fausse.
  assert.equal(formatTimeInZone(passageTime(depart, reel.secondsAt, 3)), '13:10');
  assert.equal(formatTimeInZone(passageTime(depart, approx.secondsAt, 3)), '13:10');
});

test('annotation de longueur incohérente : repli signalé, pas de calcul faux', () => {
  const r = buildRouteTimeline({
    durations: [60, 120], // 2 valeurs pour 4 points, il en faudrait 3
    cumulativeKm: [0, 1, 3, 4],
    totalDurationMin: 4,
  });
  assert.equal(r.source, 'interpolation');
  assert.equal(r.secondsAt[3], 240);
});

test('annotation contenant une valeur invalide : repli', () => {
  const r = buildRouteTimeline({
    durations: [60, Number.NaN, 30],
    cumulativeKm: [0, 1, 3, 4],
    totalDurationMin: 4,
  });
  assert.equal(r.source, 'interpolation');
});

test('géométrie vide : rien plutôt qu’une valeur inventée', () => {
  const r = buildRouteTimeline({ durations: null, cumulativeKm: [], totalDurationMin: 60 });
  assert.deepEqual(r.secondsAt, []);
  assert.equal(passageTime(new Date(), r.secondsAt, 0), null);
});

test('index hors bornes ramené dans la géométrie', () => {
  const depart = instantFromLocalInput('2026-08-20T09:00');
  const { secondsAt } = buildRouteTimeline({
    durations: [600, 600],
    cumulativeKm: [0, 10, 20],
    totalDurationMin: 20,
  });
  assert.equal(formatTimeInZone(passageTime(depart, secondsAt, 99)), '09:20');
  assert.equal(formatTimeInZone(passageTime(depart, secondsAt, -5)), '09:00');
});

test('départ invalide : null', () => {
  assert.equal(passageTime(new Date('invalide'), [0, 10], 1), null);
});
