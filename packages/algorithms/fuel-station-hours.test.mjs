import test from 'node:test';
import assert from 'node:assert/strict';
import { stationOpeningHours } from './fuel-station-hours.mjs';
import { openingStatus } from './opening-hours.mjs';

const jour = (id, nom, horaire, ferme = '') => ({ '@id': String(id), '@nom': nom, '@ferme': ferme, ...(horaire ? { horaire } : {}) });
const plage = (o, f) => ({ '@ouverture': o, '@fermeture': f });

test("l'automate 24/24 prime : le carburant reste accessible", () => {
  assert.equal(stationOpeningHours(null, 'Oui'), '24/7');
  assert.equal(stationOpeningHours('{"jour":[]}', 'Oui'), '24/7');
});

test('cas réel : semaine 07.00-19.00, samedi écourté, dimanche sans horaire', () => {
  // Enregistrement observé sur la station 69700002 (Loire-sur-Rhône).
  const payload = JSON.stringify({
    '@automate-24-24': '',
    jour: [
      jour(1, 'Lundi', plage('07.00', '19.00')),
      jour(2, 'Mardi', plage('07.00', '19.00')),
      jour(6, 'Samedi', plage('07.30', '12.00')),
      jour(7, 'Dimanche', null),
    ],
  });
  const spec = stationOpeningHours(payload, 'Non');
  assert.equal(spec, 'Mo 07:00-19:00; Tu 07:00-19:00; Sa 07:30-12:00');

  // Et la chaîne complète répond juste.
  assert.equal(openingStatus(spec, new Date('2026-08-17T08:00:00')), 'ouvert'); // lundi
  assert.equal(openingStatus(spec, new Date('2026-08-22T13:00:00')), 'ferme'); // samedi apres-midi
  assert.equal(openingStatus(spec, new Date('2026-08-23T10:00:00')), 'ferme'); // dimanche non liste
});

test('coupure méridienne : horaire est un tableau', () => {
  const payload = JSON.stringify({
    jour: [jour(1, 'Lundi', [plage('08.00', '12.00'), plage('14.00', '19.00')])],
  });
  const spec = stationOpeningHours(payload, 'Non');
  assert.equal(spec, 'Mo 08:00-12:00,14:00-19:00');
  assert.equal(openingStatus(spec, new Date('2026-08-17T13:00:00')), 'ferme');
  assert.equal(openingStatus(spec, new Date('2026-08-17T15:00:00')), 'ouvert');
});

test('jour explicitement fermé', () => {
  const payload = JSON.stringify({
    jour: [jour(1, 'Lundi', plage('08.00', '19.00')), jour(7, 'Dimanche', null, '1')],
  });
  const spec = stationOpeningHours(payload, 'Non');
  assert.equal(spec, 'Mo 08:00-19:00; Su off');
  assert.equal(openingStatus(spec, new Date('2026-08-23T10:00:00')), 'ferme');
});

test('plage nulle 01.00-01.00 : ignorée plutôt qu’interprétée', () => {
  const payload = JSON.stringify({ jour: [jour(1, 'Lundi', plage('01.00', '01.00'))] });
  assert.equal(stationOpeningHours(payload, 'Non'), null);
});

test('champ absent ou illisible : null, jamais une supposition', () => {
  assert.equal(stationOpeningHours(null, 'Non'), null);
  assert.equal(stationOpeningHours(undefined, undefined), null);
  assert.equal(stationOpeningHours('pas du json', 'Non'), null);
  assert.equal(stationOpeningHours('{"jour":[{"@id":"1","@nom":"Lundi","@ferme":""}]}', 'Non'), null);
  // Et l'inconnu se propage jusqu'au statut.
  assert.equal(openingStatus(stationOpeningHours(null, 'Non'), new Date('2026-08-17T10:00:00')), 'inconnu');
});

test('objet déjà désérialisé accepté tel quel', () => {
  const spec = stationOpeningHours({ jour: [jour(3, 'Mercredi', plage('06.00', '22.00'))] }, 'Non');
  assert.equal(spec, 'We 06:00-22:00');
});

test('repli sur le nom du jour quand l’identifiant manque', () => {
  const spec = stationOpeningHours({ jour: [{ '@nom': 'Vendredi', horaire: plage('09.00', '18.00') }] }, 'Non');
  assert.equal(spec, 'Fr 09:00-18:00');
});
