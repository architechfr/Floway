import test from 'node:test';
import assert from 'node:assert/strict';
import { corridorRadiusKm } from './route-corridor.mjs';

const rayon = (routeLengthKm, sampleCount = 34, couloirKm = 6) =>
  corridorRadiusKm({ routeLengthKm, sampleCount, couloirKm });

test('le rayon couvre la moitié de l’espacement plus le couloir', () => {
  // 500 km sur 34 points : 15,15 km d'espacement, donc 7,58 + 6 = 13,58 → 14.
  assert.equal(rayon(500), 14);
});

test('un trajet court n’interroge pas 28 km autour de chaque point', () => {
  // 30 km sur 34 points : 0,9 km d'espacement. Le plancher s'applique.
  assert.equal(rayon(30), 8);
});

test('un trajet très long reste plafonné', () => {
  // 2000 km : 60,6 km d'espacement, 36,3 km demandés — plafonnés à 28.
  assert.equal(rayon(2000), 28);
});

test('toute station du couloir est atteinte depuis un point d’échantillonnage', () => {
  // Le pire cas : à couloirKm du tracé et à mi-chemin de deux points.
  for (const longueur of [30, 120, 500, 900, 1500]) {
    const points = 34;
    const couloir = 6;
    const espacement = longueur / (points - 1);
    const pire = Math.hypot(espacement / 2, couloir);
    const r = corridorRadiusKm({ routeLengthKm: longueur, sampleCount: points, couloirKm: couloir });
    assert.ok(r >= pire, `${longueur} km : rayon ${r} < pire cas ${pire.toFixed(2)}`);
  }
});

test('les entrées absurdes retombent sur le plancher plutôt que sur NaN', () => {
  assert.equal(corridorRadiusKm({ routeLengthKm: 0, sampleCount: 0, couloirKm: 0 }), 8);
  assert.equal(corridorRadiusKm({ routeLengthKm: Number.NaN, sampleCount: 34, couloirKm: 6 }), 8);
  assert.equal(corridorRadiusKm({ routeLengthKm: -10, sampleCount: 34, couloirKm: 6 }), 8);
});

test('un seul point d’échantillonnage ne divise pas par zéro', () => {
  assert.ok(Number.isFinite(corridorRadiusKm({ routeLengthKm: 500, sampleCount: 1, couloirKm: 6 })));
});
