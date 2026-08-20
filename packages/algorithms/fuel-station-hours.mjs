/**
 * Conversion des horaires du flux officiel des prix carburants
 * (`prix-des-carburants-en-france-flux-instantane-v2`, ministère de l'Économie)
 * vers la notation OpenStreetMap comprise par `opening-hours.mjs`.
 *
 * Le champ `horaires` du flux est du JSON **sérialisé dans une chaîne**,
 * transposé mécaniquement depuis le XML source — d'où les clés préfixées `@` :
 *
 *   {"@automate-24-24":"", "jour":[
 *     {"@id":"1","@nom":"Lundi","@ferme":"","horaire":{"@ouverture":"07.00","@fermeture":"19.00"}},
 *     …]}
 *
 * Trois pièges vérifiés sur des enregistrements réels :
 *  - `horaire` est tantôt un objet, tantôt un tableau (coupure méridienne) ;
 *  - la clé `horaire` peut être absente ;
 *  - le séparateur est un point, « 07.30 », pas « 07:30 ».
 *
 * Le champ est absent pour environ 14 % des stations : la fonction rend alors
 * `null`, et le reste de la chaîne traite l'horaire comme inconnu plutôt que
 * de supposer une ouverture.
 */

/** `@id` du flux vers les abréviations OSM. 1 = lundi. */
const DAY_BY_ID = { 1: 'Mo', 2: 'Tu', 3: 'We', 4: 'Th', 5: 'Fr', 6: 'Sa', 7: 'Su' };

const DAY_BY_NAME = {
  lundi: 'Mo',
  mardi: 'Tu',
  mercredi: 'We',
  jeudi: 'Th',
  vendredi: 'Fr',
  samedi: 'Sa',
  dimanche: 'Su',
};

/**
 * @param {unknown} horaires valeur brute du champ `horaires`
 * @param {unknown} automate24 valeur du champ `horaires_automate_24_24` (« Oui » / « Non »)
 * @returns {string|null} spécification OSM, ou null si l'information manque
 */
export function stationOpeningHours(horaires, automate24) {
  // L'automate en libre-service prime : le carburant reste accessible même
  // boutique fermée. C'est le seul champ horaire couvrant 100 % des stations.
  if (typeof automate24 === 'string' && automate24.trim().toLowerCase() === 'oui') return '24/7';

  const parsed = parsePayload(horaires);
  if (!parsed) return null;

  if (String(parsed['@automate-24-24'] || '').trim() === '1') return '24/7';

  const days = Array.isArray(parsed.jour) ? parsed.jour : parsed.jour ? [parsed.jour] : [];
  if (!days.length) return null;

  const rules = [];
  for (const day of days) {
    const code = dayCode(day);
    if (!code) continue;

    if (String(day['@ferme'] || '').trim() === '1') {
      rules.push(`${code} off`);
      continue;
    }

    const ranges = readRanges(day.horaire);
    if (!ranges.length) continue;
    rules.push(`${code} ${ranges.join(',')}`);
  }

  return rules.length ? rules.join('; ') : null;
}

function parsePayload(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function dayCode(day) {
  if (!day || typeof day !== 'object') return null;
  const byId = DAY_BY_ID[Number(day['@id'])];
  if (byId) return byId;
  const name = String(day['@nom'] || '').trim().toLowerCase();
  return DAY_BY_NAME[name] || null;
}

/** `horaire` peut être un objet unique ou un tableau de plages. */
function readRanges(horaire) {
  const list = Array.isArray(horaire) ? horaire : horaire ? [horaire] : [];
  const ranges = [];
  for (const slot of list) {
    const from = normalizeTime(slot?.['@ouverture']);
    const to = normalizeTime(slot?.['@fermeture']);
    if (!from || !to) continue;
    // Une plage nulle (01.00-01.00) ne dit rien d'exploitable.
    if (from === to) continue;
    ranges.push(`${from}-${to}`);
  }
  return ranges;
}

/** « 07.30 » ou « 7:5 » vers « 07:30 ». */
function normalizeTime(raw) {
  const text = String(raw ?? '').trim();
  const match = text.match(/^(\d{1,2})[.:h](\d{1,2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours > 24 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
