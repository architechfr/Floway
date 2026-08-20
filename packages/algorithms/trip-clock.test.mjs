import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRIP_TIME_ZONE,
  formatTimeInZone,
  instantFromLocalInput,
  minutesOfDayInZone,
  zonedParts,
} from './trip-clock.mjs';

test('une saisie locale désigne le même instant quel que soit le fuseau machine', () => {
  // C'est exactement le bug : le navigateur est a Paris, la fonction
  // serverless en UTC, et « 19:00 » designait deux instants differents.
  const instant = instantFromLocalInput('2026-08-20T19:00');
  // 20 aout : heure d'ete, Paris = UTC+2 → 19 h locales = 17 h UTC.
  assert.equal(instant.toISOString(), '2026-08-20T17:00:00.000Z');
});

test('heure d’hiver : le décalage passe à UTC+1', () => {
  const instant = instantFromLocalInput('2026-01-15T19:00');
  assert.equal(instant.toISOString(), '2026-01-15T18:00:00.000Z');
});

test('le passage à l’heure d’été est franchi correctement', () => {
  // Nuit du 28 au 29 mars 2026 : 02:00 devient 03:00.
  const avant = instantFromLocalInput('2026-03-29T01:30');
  assert.equal(avant.toISOString(), '2026-03-29T00:30:00.000Z');
  const apres = instantFromLocalInput('2026-03-29T04:00');
  assert.equal(apres.toISOString(), '2026-03-29T02:00:00.000Z');
});

test('formatage dans le fuseau du trajet, pas celui de la machine', () => {
  const instant = new Date('2026-08-20T17:00:00.000Z');
  assert.equal(formatTimeInZone(instant), '19:00');
  assert.equal(formatTimeInZone(instant, 'UTC'), '17:00');
});

test('un trajet de 1 h 53 depuis 19 h arrive à 20 h 53', () => {
  const depart = instantFromLocalInput('2026-08-20T19:00');
  const arrivee = new Date(depart.getTime() + 113 * 60000);
  assert.equal(formatTimeInZone(arrivee), '20:53');
});

test('jour de la semaine lu dans le fuseau du trajet', () => {
  // 23 h 30 UTC un samedi = 01 h 30 le dimanche a Paris.
  const instant = new Date('2026-08-22T23:30:00.000Z');
  assert.equal(zonedParts(instant).weekday, 0);
  assert.equal(zonedParts(instant, 'UTC').weekday, 6);
  assert.equal(formatTimeInZone(instant), '01:30');
});

test('minutes depuis minuit', () => {
  assert.equal(minutesOfDayInZone(new Date('2026-08-20T17:00:00.000Z')), 19 * 60);
});

test('entrées invalides : null plutôt qu’une date inventée', () => {
  assert.equal(instantFromLocalInput(''), null);
  assert.equal(instantFromLocalInput('pas une date'), null);
  assert.equal(instantFromLocalInput(undefined), null);
  assert.equal(zonedParts(new Date('invalide')), null);
  assert.equal(formatTimeInZone(new Date('invalide')), '--:--');
});

test('le format avec espace est accepté', () => {
  assert.equal(
    instantFromLocalInput('2026-08-20 19:00').toISOString(),
    '2026-08-20T17:00:00.000Z',
  );
});

test('le fuseau par défaut est celui du trajet', () => {
  assert.equal(TRIP_TIME_ZONE, 'Europe/Paris');
});
