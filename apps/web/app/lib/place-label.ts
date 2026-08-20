/**
 * Libellé court d'un lieu, pour les bandeaux de trajet.
 *
 * Le géocodage inverse de la Géoplateforme renvoie l'adresse complète
 * (« 18bis Rue Carnot 77164 Ferrières-en-Brie »). Sur un long trajet, la rue
 * n'apporte rien et casse la mise en page : sur mobile, ce libellé se répartit
 * sur six lignes dans l'en-tête. On n'affiche donc que la commune, en gardant
 * le libellé complet pour les appels API et l'attribut `title`.
 */

/** Coordonnées décimales brutes, quand le géocodage inverse a échoué. */
const COORDINATES = /^-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+$/;

/** Code postal français suivi de la commune, en fin de libellé. */
const POSTCODE_THEN_CITY = /\b\d{5}\s+(.+)$/;

export function placeLabel(raw: string | undefined | null): string {
  const value = (raw || '').trim();
  if (!value) return '';

  // Sans géocodage inverse, le libellé est une paire de coordonnées : la
  // découper sur la virgule afficherait « 48.85660 », ce qui ne veut rien dire.
  if (COORDINATES.test(value)) return 'Position GPS';

  const withoutCountry = value.replace(/,\s*France\s*$/i, '').trim();

  const city = withoutCountry.match(POSTCODE_THEN_CITY)?.[1];
  if (city) return city.trim();

  return withoutCountry.split(',')[0].trim() || value;
}
