import test from 'node:test';
import assert from 'node:assert/strict';
import { CLOSED, OPEN, UNKNOWN, openingStatus } from './opening-hours.mjs';

/** Aide : construit une date locale sur un jour de semaine donné. */
const at = (isoDate, time) => new Date(`${isoDate}T${time}:00`);

// 2026-08-17 est un lundi, 2026-08-23 un dimanche, 2026-08-22 un samedi.
const LUNDI = '2026-08-17';
const SAMEDI = '2026-08-22';
const DIMANCHE = '2026-08-23';

test('le bug historique : un Mo-Fr consulté un dimanche est fermé', () => {
  // L'ancien parseur ignorait les jours et répondait « probablement ouvert ».
  assert.equal(openingStatus('Mo-Fr 08:00-18:00', at(DIMANCHE, '10:00')), CLOSED);
  assert.equal(openingStatus('Mo-Fr 08:00-18:00', at(LUNDI, '10:00')), OPEN);
});

test('bornes de la plage horaire', () => {
  assert.equal(openingStatus('Mo-Fr 08:00-18:00', at(LUNDI, '07:59')), CLOSED);
  assert.equal(openingStatus('Mo-Fr 08:00-18:00', at(LUNDI, '08:00')), OPEN);
  assert.equal(openingStatus('Mo-Fr 08:00-18:00', at(LUNDI, '17:59')), OPEN);
  assert.equal(openingStatus('Mo-Fr 08:00-18:00', at(LUNDI, '18:00')), CLOSED);
});

test('24/7', () => {
  assert.equal(openingStatus('24/7', at(DIMANCHE, '03:00')), OPEN);
});

test('coupure de midi', () => {
  const spec = 'Mo-Fr 08:00-12:00,14:00-18:00';
  assert.equal(openingStatus(spec, at(LUNDI, '11:00')), OPEN);
  assert.equal(openingStatus(spec, at(LUNDI, '13:00')), CLOSED);
  assert.equal(openingStatus(spec, at(LUNDI, '15:00')), OPEN);
});

test('règles multiples séparées par un point-virgule', () => {
  const spec = 'Mo-Sa 09:00-19:00; Su 10:00-13:00';
  assert.equal(openingStatus(spec, at(SAMEDI, '18:00')), OPEN);
  assert.equal(openingStatus(spec, at(DIMANCHE, '11:00')), OPEN);
  assert.equal(openingStatus(spec, at(DIMANCHE, '15:00')), CLOSED);
});

test('fermeture explicite', () => {
  const spec = 'Mo-Sa 09:00-19:00; Su off';
  assert.equal(openingStatus(spec, at(DIMANCHE, '11:00')), CLOSED);
  assert.equal(openingStatus(spec, at(SAMEDI, '11:00')), OPEN);
});

test('jours isolés', () => {
  const spec = 'Mo,We,Fr 08:00-18:00';
  assert.equal(openingStatus(spec, at(LUNDI, '09:00')), OPEN);
  assert.equal(openingStatus(spec, at('2026-08-18', '09:00')), CLOSED); // mardi
  assert.equal(openingStatus(spec, at('2026-08-19', '09:00')), OPEN); // mercredi
});

test('intervalle passant par-dessus dimanche', () => {
  const spec = 'Fr-Mo 10:00-20:00';
  assert.equal(openingStatus(spec, at(DIMANCHE, '12:00')), OPEN);
  assert.equal(openingStatus(spec, at(LUNDI, '12:00')), OPEN);
  assert.equal(openingStatus(spec, at('2026-08-19', '12:00')), CLOSED); // mercredi
});

test('plage franchissant minuit', () => {
  const spec = 'Mo-Su 22:00-02:00';
  assert.equal(openingStatus(spec, at(LUNDI, '23:30')), OPEN);
  assert.equal(openingStatus(spec, at(LUNDI, '01:00')), OPEN);
  assert.equal(openingStatus(spec, at(LUNDI, '12:00')), CLOSED);
});

test('plage sans jour mentionné : vaut pour toute la semaine', () => {
  assert.equal(openingStatus('07:00-22:00', at(DIMANCHE, '10:00')), OPEN);
  assert.equal(openingStatus('07:00-22:00', at(DIMANCHE, '23:00')), CLOSED);
});

test("l'inconnu reste inconnu, jamais transformé en affirmation", () => {
  assert.equal(openingStatus(undefined, at(LUNDI, '10:00')), UNKNOWN);
  assert.equal(openingStatus('', at(LUNDI, '10:00')), UNKNOWN);
  assert.equal(openingStatus('sunrise-sunset', at(LUNDI, '10:00')), UNKNOWN);
  assert.equal(openingStatus('on appointment', at(LUNDI, '10:00')), UNKNOWN);
  assert.equal(openingStatus('Mo-Fr 08:00-18:00', new Date('invalide')), UNKNOWN);
});
