/**
 * Compare deux empreintes produites par `css-snapshot.mjs`.
 *
 *   node tools/css-diff.mjs avant.json apres.json
 *
 * Le port du serveur de test change a chaque execution : il est normalise.
 * Les elements en cours d'animation ou de transition (orbe `.v3orb i`,
 * banniere d'installation PWA) ont une opacite, un `transform` et un
 * rectangle qui dependent de l'instant de la capture : ces proprietes-la
 * sont ignorees pour eux, et le nombre d'ecarts ecartes est affiche.
 */
import { readFileSync } from 'node:fs';

const [, , A_PATH, B_PATH] = process.argv;
if (!A_PATH || !B_PATH) { console.error('usage: node css-diff.mjs <avant.json> <apres.json>'); process.exit(1); }

const a = JSON.parse(readFileSync(A_PATH, 'utf8'));
const b = JSON.parse(readFileSync(B_PATH, 'utf8'));
const norm = v => (typeof v === 'string' ? v.replace(/localhost:\d+/g, 'localhost:PORT') : v);
const INSTABLE = new Set(['opacity', 'transform', '_r', 'width', 'height', 'top', 'left', 'right', 'bottom']);

const diffs = [];
let ignores = 0, elements = 0;
for (const etat of Object.keys(a)) {
  const A = a[etat], B = b[etat] || {};
  // Un element anime entraine ses descendants : ils se deplacent avec lui.
  const racinesAnimees = Object.keys(A).filter(p => (A[p]['animation-name'] || 'none') !== 'none' || /install/.test(A[p]._c || ''));
  const sousAnimation = path => racinesAnimees.some(r => path === r || path.startsWith(r + '/'));
  for (const path of Object.keys(A)) {
    elements++;
    const ra = A[path], rb = B[path];
    if (!rb) { diffs.push({ etat, path, prop: 'ELEMENT ABSENT', va: '', vb: '', cls: ra._c || ra._t }); continue; }
    const anime = sousAnimation(path);
    for (const [prop, va] of Object.entries(ra)) {
      const vb = rb[prop];
      if (norm(JSON.stringify(va)) === norm(JSON.stringify(vb))) continue;
      if (anime && INSTABLE.has(prop)) { ignores++; continue; }
      diffs.push({ etat, path, prop, va, vb, cls: ra._c || ra._t });
    }
  }
  for (const path of Object.keys(B)) if (!A[path]) diffs.push({ etat, path, prop: 'ELEMENT EN TROP', va: '', vb: '', cls: B[path]._c || B[path]._t });
}

console.log(`${elements} elements compares sur ${Object.keys(a).length} etats`);
console.log(`${ignores} ecart(s) ignore(s) : elements animes et leurs descendants`);
console.log(`${diffs.length} difference(s) reelle(s)\n`);
for (const d of diffs.slice(0, 40)) {
  console.log(`[${d.etat}] ${String(d.cls).slice(0, 30)}  ${d.prop}: ${JSON.stringify(d.va).slice(0, 60)} -> ${JSON.stringify(d.vb).slice(0, 60)}`);
}
if (diffs.length > 40) console.log(`… et ${diffs.length - 40} de plus`);
process.exit(diffs.length ? 1 : 0);
