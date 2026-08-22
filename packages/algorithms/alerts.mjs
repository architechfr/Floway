/**
 * Alertes routières : identité stable et acquittement.
 *
 * La pastille du bandeau affichait un nombre d'incidents que rien ne
 * permettait de faire disparaître, et le panneau qu'elle ouvrait ne disait pas
 * de quoi il s'agissait. Deux manques distincts :
 *
 *  - les incidents étaient identifiés par leur **rang** dans la réponse
 *    (`incident-0`, `incident-1`…). Ce rang change à chaque interrogation dès
 *    qu'un incident apparaît ou disparaît : un acquittement enregistré sur
 *    `incident-2` aurait masqué un autre incident au relevé suivant. Un
 *    identifiant utilisable doit décrire l'incident, pas sa position dans une
 *    liste ;
 *  - rien ne distinguait un incident déjà vu d'un incident nouveau.
 *
 * Module pur : il ne connaît ni API ni composant.
 */

/** Précision de l'arrondi des coordonnées, en degrés (~100 m). */
const PRECISION = 3;

/**
 * Identifiant stable d'un incident, dérivé de ce qu'il est.
 *
 * Deux relevés successifs du même bouchon, au même endroit et de même nature,
 * donnent la même clé. Un incident dont on ignore tout rend `null` : mieux
 * vaut ne pas pouvoir l'acquitter que d'acquitter le mauvais.
 */
export function cleIncident(incident) {
  if (!incident) return null;
  const parts = [
    incident.category ?? '',
    (incident.roads || []).join('+'),
    incident.from || '',
    incident.to || '',
    Number.isFinite(incident.lat) ? incident.lat.toFixed(PRECISION) : '',
    Number.isFinite(incident.lon) ? incident.lon.toFixed(PRECISION) : '',
  ];
  const utile = parts.filter((p) => p !== '' && p !== 0).length;
  // Une clé faite uniquement d'une catégorie ne distingue rien : deux bouchons
  // sans position ni route partageraient la même, et acquitter l'un masquerait
  // l'autre.
  if (utile < 2) return null;
  return `i:${parts.join('|')}`;
}

/**
 * Incidents que l'utilisateur n'a pas encore acquittés.
 *
 * Un incident sans clé exploitable reste affiché : on ne le fait pas
 * disparaître au motif qu'on ne sait pas l'identifier.
 */
export function nonAcquittes(incidents = [], acquittees = []) {
  const vues = new Set(acquittees);
  return incidents.filter((i) => {
    const cle = cleIncident(i);
    return cle === null || !vues.has(cle);
  });
}

/**
 * Clés à conserver après acquittement.
 *
 * On ne garde que les clés encore présentes sur la route, plus celles qu'on
 * vient d'acquitter : sans cela, la liste enflerait indéfiniment avec des
 * incidents résolus depuis longtemps.
 */
export function acquittementsUtiles(acquittees = [], incidentsPresents = []) {
  const presentes = new Set(incidentsPresents.map(cleIncident).filter(Boolean));
  return acquittees.filter((c) => presentes.has(c));
}
