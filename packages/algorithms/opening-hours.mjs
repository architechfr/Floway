/**
 * Lecture des horaires d'ouverture au format OpenStreetMap `opening_hours`.
 *
 * Remplace le parseur de `/api/poi`, qui extrayait les plages `HH:MM-HH:MM`
 * par expression régulière en **ignorant les jours** : un « Mo-Fr 08:00-18:00 »
 * était annoncé « probablement ouvert » un dimanche.
 *
 * La grammaire OSM complète est vaste (jours fériés, semaines paires, périodes
 * scolaires…). Ce module en couvre le sous-ensemble courant et répond
 * `'inconnu'` pour tout le reste, plutôt que de deviner. Un horaire mal compris
 * ne doit jamais devenir un horaire affirmé.
 */

const DAYS = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];

/** Statut d'un lieu à un instant donné. */
export const OPEN = 'ouvert';
export const CLOSED = 'ferme';
export const UNKNOWN = 'inconnu';

/**
 * @param {string|null|undefined} spec valeur du tag `opening_hours`
 * @param {Date} at instant à tester
 * @returns {'ouvert'|'ferme'|'inconnu'}
 */
export function openingStatus(spec, at) {
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) return UNKNOWN;
  const raw = typeof spec === 'string' ? spec.trim() : '';
  if (!raw) return UNKNOWN;

  const normalized = raw.toLowerCase();
  if (normalized === '24/7') return OPEN;

  const dayIndex = at.getDay();
  const minutes = at.getHours() * 60 + at.getMinutes();

  let matchedDay = false;
  let understoodAny = false;

  // Les règles sont séparées par `;` et s'appliquent dans l'ordre : la
  // dernière règle qui concerne le jour testé l'emporte.
  let verdict = null;

  for (const rule of normalized.split(';')) {
    const parsed = parseRule(rule);
    if (!parsed) continue;
    understoodAny = true;
    if (!parsed.days.includes(dayIndex)) continue;

    matchedDay = true;
    if (parsed.closed) {
      verdict = CLOSED;
      continue;
    }
    verdict = parsed.ranges.some(([from, to]) => inRange(minutes, from, to)) ? OPEN : CLOSED;
  }

  if (!understoodAny) return UNKNOWN;
  // Un jour non mentionné par une spécification par ailleurs comprise est
  // fermé : c'est la convention OSM.
  if (!matchedDay) return CLOSED;
  return verdict ?? UNKNOWN;
}

/** Vrai si le lieu est ouvert, en traitant `'inconnu'` comme non garanti. */
export function isConfirmedOpen(spec, at) {
  return openingStatus(spec, at) === OPEN;
}

function parseRule(rule) {
  const text = rule.trim();
  if (!text) return null;

  const closed = /\b(off|closed|ferm[ée])\b/.test(text);

  const days = parseDays(text);
  if (!days.length) return null;

  if (closed) return { days, closed: true, ranges: [] };

  const ranges = parseRanges(text);
  if (!ranges.length) return null;

  return { days, closed: false, ranges };
}

/** Jours concernés. Sans mention explicite, la règle vaut pour toute la semaine. */
function parseDays(text) {
  const found = new Set();
  let sawDayToken = false;

  // Intervalles : mo-fr, sa-su…
  for (const [, from, to] of text.matchAll(/\b(su|mo|tu|we|th|fr|sa)\s*-\s*(su|mo|tu|we|th|fr|sa)\b/g)) {
    sawDayToken = true;
    let i = DAYS.indexOf(from);
    const end = DAYS.indexOf(to);
    // L'intervalle peut passer par-dessus dimanche (fr-mo).
    for (let guard = 0; guard < 7; guard += 1) {
      found.add(i);
      if (i === end) break;
      i = (i + 1) % 7;
    }
  }

  // Jours isolés, en retirant d'abord les intervalles déjà traités.
  const withoutRanges = text.replace(/\b(su|mo|tu|we|th|fr|sa)\s*-\s*(su|mo|tu|we|th|fr|sa)\b/g, ' ');
  for (const [, day] of withoutRanges.matchAll(/\b(su|mo|tu|we|th|fr|sa)\b/g)) {
    sawDayToken = true;
    found.add(DAYS.indexOf(day));
  }

  if (!sawDayToken) return [0, 1, 2, 3, 4, 5, 6];
  return [...found];
}

/** Plages horaires en minutes depuis minuit. */
function parseRanges(text) {
  const ranges = [];
  for (const [, h1, m1, h2, m2] of text.matchAll(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g)) {
    const from = Number(h1) * 60 + Number(m1);
    const to = Number(h2) * 60 + Number(m2);
    if (Number.isFinite(from) && Number.isFinite(to)) ranges.push([from, to]);
  }
  return ranges;
}

/** Gère les plages qui franchissent minuit (22:00-02:00). */
function inRange(minutes, from, to) {
  if (to === from) return false;
  if (to > from) return minutes >= from && minutes < to;
  return minutes >= from || minutes < to;
}
