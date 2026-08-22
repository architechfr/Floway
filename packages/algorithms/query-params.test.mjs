import test from 'node:test';
import assert from 'node:assert/strict';
import { nombreDeRequete, positionDeRequete } from './query-params.mjs';

test('un paramètre absent rend le défaut, pas zéro', () => {
  // Le defaut du bug : Number(null) === 0, et 0 est fini.
  assert.equal(Number(null), 0);
  assert.equal(Number.isFinite(Number(null)), true);
  assert.equal(nombreDeRequete(null, { defaut: 8 }), 8);
  assert.equal(nombreDeRequete(undefined, { defaut: 8 }), 8);
});

test('une chaîne vide n’est pas une demande de zéro', () => {
  assert.equal(nombreDeRequete('', { defaut: 8 }), 8);
  assert.equal(nombreDeRequete('   ', { defaut: 8 }), 8);
});

test('une valeur illisible rend le défaut', () => {
  assert.equal(nombreDeRequete('huit', { defaut: 8 }), 8);
  assert.equal(nombreDeRequete('NaN', { defaut: 8 }), 8);
  assert.equal(nombreDeRequete('Infinity', { defaut: 8 }), 8);
  assert.equal(nombreDeRequete('-Infinity', { defaut: 8 }), 8);
});

test('sans défaut, l’absence rend null et non zéro', () => {
  assert.equal(nombreDeRequete(null), null);
  assert.equal(nombreDeRequete('abc'), null);
});

test('un zéro explicitement demandé est bien un zéro', () => {
  assert.equal(nombreDeRequete('0', { defaut: 8 }), 0);
});

test('les bornes s’appliquent à la valeur lue, pas au défaut', () => {
  assert.equal(nombreDeRequete('50', { min: 1, max: 20, defaut: 8 }), 20);
  assert.equal(nombreDeRequete('0', { min: 1, max: 20, defaut: 8 }), 1);
  // Le defaut passe tel quel : c'est une valeur choisie, pas une saisie.
  assert.equal(nombreDeRequete(null, { min: 1, max: 20, defaut: 8 }), 8);
});

test('les décimales et les signes sont lus', () => {
  assert.equal(nombreDeRequete('2.5'), 2.5);
  assert.equal(nombreDeRequete('-3.25'), -3.25);
  assert.equal(nombreDeRequete(' 4 '), 4);
});

test('une position incomplète n’est pas le point 0°/0°', () => {
  assert.equal(positionDeRequete(null, null), null);
  assert.equal(positionDeRequete('48.827', null), null);
  assert.equal(positionDeRequete(null, '2.708'), null);
  assert.equal(positionDeRequete('', ''), null);
});

test('une position valide est lue telle quelle', () => {
  assert.deepEqual(positionDeRequete('48.827', '2.708'), { lat: 48.827, lon: 2.708 });
  // Le point 0°/0° reste une position licite quand il est demandé.
  assert.deepEqual(positionDeRequete('0', '0'), { lat: 0, lon: 0 });
});

test('une coordonnée hors du monde est refusée, pas ramenée à la borne', () => {
  assert.equal(positionDeRequete('91', '2.7'), null);
  assert.equal(positionDeRequete('48.8', '200'), null);
  assert.equal(positionDeRequete('-90.1', '0'), null);
});
