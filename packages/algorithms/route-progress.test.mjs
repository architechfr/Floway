import test from 'node:test';
import assert from 'node:assert/strict';
import { cumulativeDistances, haversine, projectOnSegment, routeProgress } from './route-progress.mjs';

/** Ligne droite est-ouest à latitude constante, sommets espacés de 0,1°. */
const ligne = Array.from({ length: 11 }, (_, i) => [2 + i * 0.1, 48]);
const cumLigne = cumulativeDistances(ligne);

test('le cumul croît et démarre à zéro', () => {
  assert.equal(cumLigne[0], 0);
  assert.ok(cumLigne.every((v, i) => i === 0 || v > cumLigne[i - 1]));
  // 1° de longitude à 48° de latitude ≈ 74,4 km ; le total couvre 1°.
  assert.ok(Math.abs(cumLigne[10] - 74.4) < 1.5, `${cumLigne[10]} km`);
});

test('un point sur un sommet donne exactement sa distance cumulée', () => {
  const p = routeProgress(ligne, cumLigne, ligne[3]);
  assert.ok(Math.abs(p.km - cumLigne[3]) < 0.05, `${p.km} vs ${cumLigne[3]}`);
  assert.ok(p.offRouteKm < 0.05);
});

test('entre deux sommets, la progression est continue et non plus par saut', () => {
  // Exactement au milieu du segment 3→4.
  const milieu = [(ligne[3][0] + ligne[4][0]) / 2, 48];
  const p = routeProgress(ligne, cumLigne, milieu);
  const attendu = (cumLigne[3] + cumLigne[4]) / 2;
  assert.ok(Math.abs(p.km - attendu) < 0.05, `${p.km} vs ${attendu}`);
  // L'ancien comportement rendait cumLigne[3] ou cumLigne[4], jamais l'entre-deux.
  assert.ok(p.km > cumLigne[3] + 0.5 && p.km < cumLigne[4] - 0.5);
});

test('un point à côté de la route donne sa distance à la route', () => {
  // 0,05° de latitude au nord du segment ≈ 5,6 km.
  const p = routeProgress(ligne, cumLigne, [2.35, 48.05]);
  assert.ok(Math.abs(p.offRouteKm - 5.56) < 0.3, `${p.offRouteKm} km`);
});

test('la projection est bornée aux extrémités du segment', () => {
  const avant = projectOnSegment([1.5, 48], [2, 48], [2.1, 48]);
  const apres = projectOnSegment([9, 48], [2, 48], [2.1, 48]);
  assert.equal(avant.t, 0);
  assert.equal(apres.t, 1);
});

test('la longitude est corrigée par la latitude', () => {
  // Un degré de longitude à 60° de latitude vaut la moitié d'un degré à
  // l'équateur : sans correction, la projection choisirait le mauvais segment.
  const nord = [[0, 60], [1, 60], [1, 60.5]];
  const cum = cumulativeDistances(nord);
  const p = routeProgress(nord, cum, [1, 60.25]);
  assert.equal(p.index, 1, 'le point est sur le second segment');
});

test('la recherche part du dernier sommet connu', () => {
  const p = routeProgress(ligne, cumLigne, ligne[8], { fromIndex: 7, window: 3 });
  assert.equal(p.index, 7);
  assert.ok(Math.abs(p.km - cumLigne[8]) < 0.05);
});

test('un saut hors de la fenêtre fait rebalayer tout l’itinéraire', () => {
  // Le véhicule est au sommet 1 alors qu'on le croyait au 8 : sans reprise
  // complète, la fenêtre [8..9] rendrait une position fausse.
  const p = routeProgress(ligne, cumLigne, ligne[1], { fromIndex: 8, window: 2 });
  assert.equal(p.index, 0, `index ${p.index}`);
  assert.ok(Math.abs(p.km - cumLigne[1]) < 0.05, `${p.km} vs ${cumLigne[1]}`);
});

test('une géométrie inexploitable ne fait pas tomber le calcul', () => {
  assert.equal(routeProgress([], [], [2, 48]), null);
  assert.equal(routeProgress(ligne, cumLigne, [NaN, 48]), null);
  assert.equal(routeProgress([[2, 48]], [0], [2, 48]), null);
});

test('haversine reste cohérent avec une distance connue', () => {
  // Paris – Lyon à vol d'oiseau : environ 392 km.
  const d = haversine([2.3522, 48.8566], [4.8357, 45.764]);
  assert.ok(Math.abs(d - 392) < 6, `${d} km`);
});
