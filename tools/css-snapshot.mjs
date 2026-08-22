/**
 * Empreinte des styles calcules de l'application, pour prouver qu'un refactor
 * CSS ne change pas le rendu.
 *
 *   node tools/css-snapshot.mjs avant.json     # avant modification
 *   ... modifier le CSS, puis `next build` ...
 *   node tools/css-snapshot.mjs apres.json
 *   node tools/css-diff.mjs avant.json apres.json
 *
 * Parcourt 12 etats (3 largeurs x 4 ecrans) et releve 58 proprietes calculees
 * plus le rectangle de chaque element, soit ~260 000 valeurs. Une comparaison
 * de selecteurs ne suffit pas : `.v3track button` et `.journeyMarker` visent
 * les memes elements sous des noms differents, et seul le style calcule le
 * revele.
 *
 * Necessite `next build` a jour et playwright installe (globalement suffit).
 * Adapter PLAYWRIGHT et CHROMIUM ci-dessous a l'environnement.
 */
// Chemins de l'environnement d'execution, a adapter si besoin.
const PLAYWRIGHT = process.env.PLAYWRIGHT_MODULE || '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
const CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = (await import(PLAYWRIGHT)).default;
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const OUT = process.argv[2];
if (!OUT) { console.error('usage: node css-snapshot.mjs <sortie.json>'); process.exit(1); }

const PORT = 3300 + (process.pid % 900);
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], { cwd: new URL('../apps/web', import.meta.url).pathname, stdio: 'ignore' });
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(6000);

const stations = [0, 1, 2, 3, 4, 5].map(i => ({
  id: `s${i}`, name: `Aire de Test ${i}`, brand: ['TotalEnergies', 'Avia', 'Esso', 'Shell', 'BP', 'Intermarché'][i],
  city: 'Beaune', address: `A6 PK ${100 + i * 40}`, distanceKm: 40 * (i + 1), price: 1.699 + i * 0.03,
  waitMin: 2 + i, detourMin: 1 + i, lat: 47 - i * 0.3, lon: 4.8,
  serviceCategories: ['Restauration', 'Café', 'Carburant'].slice(0, 1 + (i % 3)), services: ['Toilettes', 'Wi-Fi'],
  arrivalHour: 10 + i, arrivalMinute: 15, highway: i % 2 === 0,
  smartContext: { message: 'Arrêt bien placé avant la traversée de Lyon.' },
}));
const route = {
  origin: { label: 'Paris, France', lat: 48.85, lon: 2.35 }, destination: { label: 'Lyon, France', lat: 45.76, lon: 4.83 },
  distanceKm: 465, durationMin: 280, fuel: 'Gazole', stations,
  geometry: { coordinates: [[2.35, 48.85], [3.5, 47.3], [4.83, 45.76]] },
  traffic: { live: true, label: 'Fluide', delayMin: 4, source: 'TomTom' },
};

const PROPS = [
  'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index', 'float', 'clear',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'width', 'height', 'max-width', 'min-width', 'max-height', 'min-height',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-color', 'border-bottom-color', 'border-radius',
  'background-color', 'background-image', 'background-position', 'background-size',
  'color', 'font-size', 'font-weight', 'font-family', 'line-height', 'letter-spacing',
  'text-align', 'text-transform', 'white-space', 'opacity', 'overflow-x', 'overflow-y',
  'grid-template-columns', 'grid-template-rows', 'grid-column', 'flex-direction', 'flex-wrap',
  'gap', 'justify-content', 'align-items', 'transform', 'box-shadow', 'backdrop-filter', 'animation-name',
];

const dump = (props) => `(() => {
  const PROPS = ${JSON.stringify(props)};
  const out = {};
  const walk = (node, path) => {
    if (node.nodeType !== 1) return;
    const el = node;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const rec = { _t: el.tagName, _c: el.className && typeof el.className === 'string' ? el.className : '',
      _r: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] };
    for (const p of PROPS) rec[p] = cs.getPropertyValue(p);
    out[path] = rec;
    let i = 0;
    for (const child of el.children) walk(child, path + '/' + (i++) + ':' + child.tagName);
  };
  walk(document.body, 'body');
  return out;
})()`;

const browser = await chromium.launch({ executablePath: CHROMIUM });
const snapshot = {};

try {
  for (const vp of [{ width: 1440, height: 1000 }, { width: 760, height: 900 }, { width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: vp });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('floway:vehicle-profile', JSON.stringify({ name: 'x', energyKind: 'gazole', size: 'compacte', tank: { value: 50, provenance: 'saisie' }, battery: null, fuelConsumption: { value: 5, provenance: 'saisie' }, electricConsumption: null }));
      localStorage.setItem('floway:trip-context', JSON.stringify({ fuelLevelPct: 40, batteryLevelPct: 80, reservePct: 10, passengers: 2, meal: 'auto' }));
      localStorage.setItem('floway:favorite-routes', JSON.stringify([{ id: 'a', origin: 'Paris', destination: 'Nice', savedAt: 1 }]));
    });
    await page.route(u => new URL(u).pathname === '/api/route', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(route) }));
    await page.route(u => new URL(u).pathname === '/api/station-fuels', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ source: 'M', official: true, fuels: [{ key: 'gazole', label: 'Gazole', price: 1.729, ageHours: 2, freshness: 'récente', updatedAt: null }] }) }));
    await page.route(u => new URL(u).pathname === '/api/station-details', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ provider: { name: 'TomTom', connected: true }, station: { name: 'S', brand: 'T', distanceM: 40 }, restaurants: [{ name: 'A', brand: null, distanceM: 120 }] }) }));

    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.v3cards button', { timeout: 12000 });
    await wait(1800);
    await page.evaluate(() => window.scrollTo(0, 0));
    await wait(300);
    const key = `${vp.width}`;
    snapshot[`${key}/accueil`] = await page.evaluate(dump(PROPS));

    await page.locator('.v3cards button').first().click({ force: true });
    await page.locator('.v3detail').waitFor({ timeout: 6000 });
    await wait(1500);
    snapshot[`${key}/fiche`] = await page.evaluate(dump(PROPS));
    await page.locator('.v3detail .v3close').click({ force: true });
    await wait(500);

    await page.locator('.v3routeTitle').click({ force: true });
    await page.locator('.v3modal').waitFor({ timeout: 6000 });
    await wait(600);
    snapshot[`${key}/itineraire`] = await page.evaluate(dump(PROPS));
    await page.keyboard.press('Escape').catch(() => {});
    await page.locator('.v3overlay').click({ position: { x: 5, y: 5 } }).catch(() => {});
    await wait(500);

    await page.locator('.v3icon').click({ force: true });
    await page.locator('[role="dialog"][aria-label="Navigation Floway"]').waitFor({ timeout: 6000 });
    await wait(600);
    snapshot[`${key}/menu`] = await page.evaluate(dump(PROPS));
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill('SIGKILL');
}

writeFileSync(OUT, JSON.stringify(snapshot));
const n = Object.values(snapshot).reduce((a, s) => a + Object.keys(s).length, 0);
console.log(`${Object.keys(snapshot).length} etats · ${n} elements · ${PROPS.length} proprietes -> ${OUT}`);
