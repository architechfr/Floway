import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE_SIZE,
  fitView,
  panView,
  project,
  simplifyForDisplay,
  tilesFor,
  toScreen,
  unproject,
  worldSize,
  zoomView,
} from './slippy-map.mjs';

test('projection Web Mercator : repères connus', () => {
  // Au zoom 0, le monde tient dans une tuile de 256 px, centre en (128,128).
  const zero = project(0, 0, 0);
  assert.ok(Math.abs(zero.x - 128) < 1e-6);
  assert.ok(Math.abs(zero.y - 128) < 1e-6);

  // Greenwich reste au milieu horizontalement, quel que soit le zoom.
  assert.ok(Math.abs(project(0, 45, 10).x - worldSize(10) / 2) < 1e-6);
});

test('projection puis reprojection : aller-retour fidèle', () => {
  const lon = 2.3522;
  const lat = 48.8566; // Paris
  const p = project(lon, lat, 12);
  const back = unproject(p.x, p.y, 12);
  assert.ok(Math.abs(back.lon - lon) < 1e-9);
  assert.ok(Math.abs(back.lat - lat) < 1e-9);
});

test('les latitudes extrêmes sont bornées plutôt que de produire l’infini', () => {
  const p = project(0, 89.9, 5);
  assert.ok(Number.isFinite(p.y));
  assert.ok(p.y >= 0);
});

test('le cadrage contient le tracé dans la surface disponible', () => {
  // Ferrieres-en-Brie → Campagnan, les deux extremites.
  const coords = [
    [2.7086, 48.8103],
    [3.4501, 43.5501],
  ];
  const width = 380;
  const height = 260;
  const view = fitView(coords, width, height, { padding: 20 });
  assert.ok(view);

  for (const [lon, lat] of coords) {
    const s = toScreen(lon, lat, view, width, height);
    assert.ok(s.x >= 0 && s.x <= width, `x hors cadre : ${s.x}`);
    assert.ok(s.y >= 0 && s.y <= height, `y hors cadre : ${s.y}`);
  }
});

test('un tracé plus court obtient un zoom plus élevé', () => {
  const large = fitView([[2.35, 48.85], [3.45, 43.55]], 380, 260);
  const petit = fitView([[2.35, 48.85], [2.40, 48.87]], 380, 260);
  assert.ok(petit.zoom > large.zoom);
});

test('un point unique ne fait pas échouer le cadrage', () => {
  const view = fitView([[2.35, 48.85]], 300, 200, { maxZoom: 14 });
  assert.equal(view.zoom, 14);
  const s = toScreen(2.35, 48.85, view, 300, 200);
  assert.ok(Math.abs(s.x - 150) < 1e-6);
  assert.ok(Math.abs(s.y - 100) < 1e-6);
});

test('entrées vides ou invalides : null plutôt qu’une vue absurde', () => {
  assert.equal(fitView([], 300, 200), null);
  assert.equal(fitView(null, 300, 200), null);
  assert.equal(fitView([[NaN, 48]], 300, 200), null);
  assert.equal(fitView([[2, 48]], 0, 200), null);
  assert.deepEqual(tilesFor(null, 300, 200), []);
  assert.equal(toScreen(2, 48, null, 300, 200), null);
});

test('les tuiles couvrent toute la surface', () => {
  // Au zoom 6 le monde fait 256 x 2^6 = 16384 px : le centre doit y tenir.
  const view = { zoom: 6, centerX: 8000, centerY: 5600 };
  const width = 400;
  const height = 300;
  const tiles = tilesFor(view, width, height);
  assert.ok(tiles.length > 0);

  // Chaque tuile est bien positionnee, et l'ensemble deborde de la vue.
  const minLeft = Math.min(...tiles.map((t) => t.left));
  const maxRight = Math.max(...tiles.map((t) => t.left + TILE_SIZE));
  const minTop = Math.min(...tiles.map((t) => t.top));
  const maxBottom = Math.max(...tiles.map((t) => t.top + TILE_SIZE));
  assert.ok(minLeft <= 0 && maxRight >= width);
  assert.ok(minTop <= 0 && maxBottom >= height);
});

test('aucune tuile hors des bornes verticales du monde', () => {
  const view = { zoom: 2, centerX: 100, centerY: 0 };
  const tiles = tilesFor(view, 500, 500);
  assert.ok(tiles.every((t) => t.y >= 0 && t.y < 2 ** 2));
});

test('les colonnes s’enroulent autour du méridien 180', () => {
  const size = worldSize(2);
  const tiles = tilesFor({ zoom: 2, centerX: size - 10, centerY: 200 }, 400, 200);
  assert.ok(tiles.every((t) => t.x >= 0 && t.x < 4));
  // On doit retrouver a la fois la derniere et la premiere colonne.
  const cols = new Set(tiles.map((t) => t.x));
  assert.ok(cols.has(3) && cols.has(0));
});

test('déplacement : la vue suit le doigt', () => {
  const view = { zoom: 8, centerX: 5000, centerY: 4000 };
  const moved = panView(view, 100, -50);
  assert.equal(moved.centerX, 4900);
  assert.equal(moved.centerY, 4050);
});

test('zoom : le centre géographique est conservé', () => {
  const view = fitView([[2.35, 48.85], [3.45, 43.55]], 380, 260);
  const avant = unproject(view.centerX, view.centerY, view.zoom);
  const apres = zoomView(view, 2);
  const centre = unproject(apres.centerX, apres.centerY, apres.zoom);
  assert.equal(apres.zoom, view.zoom + 2);
  assert.ok(Math.abs(centre.lon - avant.lon) < 1e-9);
  assert.ok(Math.abs(centre.lat - avant.lat) < 1e-9);
});

test('le zoom reste dans ses bornes', () => {
  const view = { zoom: 17, centerX: 100, centerY: 100 };
  assert.equal(zoomView(view, 5, { maxZoom: 17 }), view);
  assert.equal(zoomView({ zoom: 2, centerX: 1, centerY: 1 }, -5, { minZoom: 2 }).zoom, 2);
});

test('simplification : les extrémités sont préservées', () => {
  const coords = Array.from({ length: 5000 }, (_, i) => [i / 1000, 45 + i / 10000]);
  const simple = simplifyForDisplay(coords, 400);
  assert.ok(simple.length <= 401);
  assert.deepEqual(simple[0], coords[0]);
  assert.deepEqual(simple[simple.length - 1], coords[coords.length - 1]);
  // Un trace deja court n'est pas touche.
  assert.equal(simplifyForDisplay(coords.slice(0, 10), 400).length, 10);
});
