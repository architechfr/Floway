/**
 * Libellé d'une station dans les listes.
 *
 * Le flux « Prix des carburants en France » du ministère ne contient
 * **aucune marque ni enseigne**. Ses champs sont : id, latitude, longitude,
 * cp, pop, adresse, ville, horaires, services, prix, geom, les prix et dates
 * par carburant, departement et region. Vérifié sur le catalogue de l'API, pas
 * supposé.
 *
 * La carte station affichait donc `brand || city || name` — soit toujours la
 * commune, `name` valant lui-même `ville || adresse`. Deux stations d'une même
 * ville étaient indiscernables.
 *
 * L'adresse, elle, est renseignée et inutilisée. Sur autoroute elle porte le
 * nom de l'aire (« AIRE DE BEAUNE TAILLY »), c'est-à-dire exactement ce qu'on
 * cherche à lire. On la privilégie quand elle nomme un lieu, et on garde la
 * commune en complément.
 */

/** Reconnaît une adresse qui nomme un lieu plutôt qu'une voie. */
const NOMME_UN_LIEU = /\b(aire|relais|centre|station|zone|zac|za|zi|parc|port|gare|péage|peage)\b/i;

/** Une adresse tout en capitales se lit mal : on la ramène en casse de titre. */
function casseNaturelle(valeur: string): string {
  if (valeur !== valeur.toUpperCase()) return valeur;
  const petits = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'sur', 'sous', 'en', 'aux', 'au', 'd', 'l']);
  return valeur
    .toLowerCase()
    .split(/(\s+|-|')/)
    .map((mot, i) => {
      if (!/[a-zà-ÿ]/i.test(mot)) return mot;
      if (i > 0 && petits.has(mot)) return mot;
      return mot.charAt(0).toUpperCase() + mot.slice(1);
    })
    .join('');
}

/**
 * Titre de la station : le nom du lieu s'il est connu, sinon la commune.
 */
export function stationTitle(station: {
  brand?: string;
  address?: string;
  city?: string;
  name?: string;
}): string {
  // `brand` reste honoré : l'enrichissement TomTom de la fiche station en
  // fournit une, et une autre source pourrait en fournir demain.
  const marque = (station.brand || '').trim();
  if (marque) return marque;

  const adresse = (station.address || '').replace(/\s+/g, ' ').trim();
  if (adresse && NOMME_UN_LIEU.test(adresse)) return casseNaturelle(adresse);

  const ville = (station.city || '').replace(/\s+/g, ' ').trim();
  if (ville) return casseNaturelle(ville);

  return casseNaturelle(adresse) || (station.name || '').trim() || 'Station';
}

/**
 * Complément de localisation, sans répéter le titre.
 */
export function stationSubtitle(station: { address?: string; city?: string }, titre: string): string {
  const ville = casseNaturelle((station.city || '').replace(/\s+/g, ' ').trim());
  const adresse = casseNaturelle((station.address || '').replace(/\s+/g, ' ').trim());
  if (ville && ville !== titre) return ville;
  if (adresse && adresse !== titre) return adresse;
  return '';
}
