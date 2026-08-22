import test from 'node:test';
import assert from 'node:assert/strict';
import { distinguerTitres, regrouperParLieu } from './station-list.mjs';

test('un titre unique reste nu', () => {
  const t = distinguerTitres([
    { id: 'a', titre: 'Vierzon', adresse: '18 avenue du 19 mars 1962' },
    { id: 'b', titre: 'Theillay', adresse: 'Autoroute A71' },
  ]);
  assert.equal(t.get('a'), 'Vierzon');
  assert.equal(t.get('b'), 'Theillay');
});

test('trois « Vierzon » deviennent distinguables', () => {
  const t = distinguerTitres([
    { id: 'a', titre: 'Vierzon', adresse: '18 avenue du 19 mars 1962' },
    { id: 'b', titre: 'Vierzon', adresse: '1 Rue du Mouton' },
    { id: 'c', titre: 'Vierzon', adresse: '7 rue Etienne Dolet' },
  ]);
  assert.equal(t.get('a'), 'Vierzon · avenue du 19 mars 1962');
  assert.equal(t.get('b'), 'Vierzon · Rue du Mouton');
  assert.equal(t.get('c'), 'Vierzon · rue Etienne Dolet');
  assert.equal(new Set(t.values()).size, 3, 'les trois titres doivent differer');
});

test('sans adresse exploitable, le titre reste nu plutôt que bricolé', () => {
  const t = distinguerTitres([
    { id: 'a', titre: 'Vierzon' },
    { id: 'b', titre: 'Vierzon', adresse: '   ' },
  ]);
  assert.equal(t.get('a'), 'Vierzon');
  assert.equal(t.get('b'), 'Vierzon');
});

test('une adresse identique au titre ne le répète pas', () => {
  const t = distinguerTitres([
    { id: 'a', titre: 'Vierzon', adresse: 'Vierzon' },
    { id: 'b', titre: 'Vierzon', adresse: '1 Rue du Mouton' },
  ]);
  assert.equal(t.get('a'), 'Vierzon');
  assert.equal(t.get('b'), 'Vierzon · Rue du Mouton');
});

test('le regroupement rassemble une commune dispersée', () => {
  // L'ordre constate a l'ecran : Vierzon, Vierzon, Theillay, Salbris,
  // Farges, Bourges, Vierzon — la troisieme Vierzon revenait en septieme.
  const classe = [
    { id: '1', ville: 'Vierzon' },
    { id: '2', ville: 'Vierzon' },
    { id: '3', ville: 'Theillay' },
    { id: '4', ville: 'Salbris' },
    { id: '5', ville: 'Farges-Allichamps' },
    { id: '6', ville: 'Marmagne' },
    { id: '7', ville: 'Vierzon' },
  ];
  const groupe = regrouperParLieu(classe, (e) => e.ville);
  assert.deepEqual(groupe.map((e) => e.id), ['1', '2', '7', '3', '4', '5', '6']);
});

test('le regroupement ne perd ni ne duplique aucune entrée', () => {
  const classe = Array.from({ length: 24 }, (_, i) => ({ id: String(i), ville: `V${i % 5}` }));
  const groupe = regrouperParLieu(classe, (e) => e.ville);
  assert.equal(groupe.length, classe.length);
  assert.equal(new Set(groupe.map((e) => e.id)).size, classe.length);
});

test('un lieu prend le rang de sa meilleure entrée', () => {
  const classe = [
    { id: 'a', ville: 'Bourges' },
    { id: 'b', ville: 'Vierzon' },
    { id: 'c', ville: 'Bourges' },
  ];
  // Bourges est premier, il reste premier ; Vierzon suit.
  assert.deepEqual(regrouperParLieu(classe, (e) => e.ville).map((e) => e.id), ['a', 'c', 'b']);
});

test('les entrées sans lieu ne sont pas fondues en un faux ensemble', () => {
  const classe = [
    { id: 'a', ville: '' },
    { id: 'b', ville: 'Vierzon' },
    { id: 'c', ville: '' },
  ];
  assert.deepEqual(regrouperParLieu(classe, (e) => e.ville).map((e) => e.id), ['a', 'b', 'c']);
});

test('la casse et les espaces ne créent pas deux lieux', () => {
  const classe = [
    { id: 'a', ville: 'Vierzon' },
    { id: 'b', ville: 'Theillay' },
    { id: 'c', ville: ' VIERZON ' },
  ];
  assert.deepEqual(regrouperParLieu(classe, (e) => e.ville).map((e) => e.id), ['a', 'c', 'b']);
});
