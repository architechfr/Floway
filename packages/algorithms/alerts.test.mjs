import test from 'node:test';
import assert from 'node:assert/strict';
import { acquittementsUtiles, cleIncident, nonAcquittes } from './alerts.mjs';

const bouchon = (extra = {}) => ({ category: 6, roads: ['A6'], from: 'Auxerre', to: 'Beaune', lat: 47.5, lon: 3.9, ...extra });

test('la clé décrit l’incident, pas son rang dans la liste', () => {
  const a = cleIncident(bouchon());
  const b = cleIncident(bouchon());
  assert.equal(a, b, 'deux relevés du même incident doivent donner la même clé');
});

test('deux incidents différents ont des clés différentes', () => {
  assert.notEqual(cleIncident(bouchon()), cleIncident(bouchon({ lat: 48.9 })));
  assert.notEqual(cleIncident(bouchon()), cleIncident(bouchon({ roads: ['A7'] })));
  assert.notEqual(cleIncident(bouchon()), cleIncident(bouchon({ category: 9 })));
});

test('un incident dont on ignore tout n’est pas identifiable', () => {
  assert.equal(cleIncident(null), null);
  assert.equal(cleIncident({}), null);
  assert.equal(cleIncident({ category: 6 }), null);
});

test('un incident acquitté disparaît, les autres restent', () => {
  const a = bouchon();
  const b = bouchon({ lat: 48.9, roads: ['A31'] });
  const restants = nonAcquittes([a, b], [cleIncident(a)]);
  assert.deepEqual(restants, [b]);
});

test('un incident non identifiable reste affiché', () => {
  const flou = { category: 6 };
  assert.deepEqual(nonAcquittes([flou], ['i:nimporte']), [flou]);
});

test('acquitter n’affecte pas un incident réapparu ailleurs', () => {
  const a = bouchon();
  const deplace = bouchon({ lat: 47.9 });
  assert.deepEqual(nonAcquittes([deplace], [cleIncident(a)]), [deplace]);
});

test('les acquittements d’incidents disparus sont oubliés', () => {
  const a = bouchon();
  const b = bouchon({ lat: 48.9 });
  const gardees = acquittementsUtiles([cleIncident(a), cleIncident(b)], [a]);
  assert.deepEqual(gardees, [cleIncident(a)]);
});

test('acquitter puis relever à nouveau ne fait pas reparaître l’incident', () => {
  const a = bouchon();
  const acquittees = [cleIncident(a)];
  // Un second relevé rend le même incident, dans un ordre different.
  const releve = [bouchon({ lat: 48.9, roads: ['A31'] }), bouchon()];
  assert.equal(nonAcquittes(releve, acquittees).length, 1);
  assert.equal(nonAcquittes(releve, acquittees)[0].lat, 48.9);
});
