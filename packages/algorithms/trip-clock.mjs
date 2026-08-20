/**
 * Horloge du trajet : conversion entre saisie locale et instant absolu.
 *
 * Le bug corrigé : `<input type="datetime-local">` produit une chaîne sans
 * fuseau, « 2026-08-20T19:00 ». `new Date()` l'interprète dans le fuseau de
 * la machine qui exécute le code. Le navigateur est à Paris, la fonction
 * serverless est en UTC : le même texte désignait deux instants distants de
 * deux heures. Les heures d'arrivée calculées côté serveur et côté client
 * décrivaient donc des moments différents.
 *
 * Le contournement qui masquait le problème : le serveur reformattait avec
 * `getHours()`, lui aussi en UTC. Les deux erreurs se compensaient à
 * l'affichage, mais `arrivalIso` restait faux de deux heures, et tout ce qui
 * s'appuyait dessus — créneaux de repas, horaires d'ouverture — raisonnait sur
 * le mauvais moment.
 *
 * Règle retenue : **un instant absolu circule, le formatage se fait toujours
 * dans le fuseau du trajet**. Pour un trajet en France, c'est Europe/Paris,
 * y compris si l'utilisateur consulte l'app depuis un autre fuseau : ce qui
 * compte est l'heure qu'il sera à la station.
 */

/** Fuseau dans lequel le trajet se déroule. */
export const TRIP_TIME_ZONE = 'Europe/Paris';

/** Décalage du fuseau, en minutes, à un instant donné. Gère l'heure d'été. */
function zoneOffsetMinutes(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - date.getTime()) / 60000;
}

/**
 * Convertit une saisie `datetime-local` en instant absolu, dans le fuseau du
 * trajet et non dans celui de la machine.
 *
 * @param {string} value « 2026-08-20T19:00 »
 * @returns {Date|null}
 */
export function instantFromLocalInput(value, timeZone = TRIP_TIME_ZONE) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);

  const naive = Date.UTC(year, month - 1, day, hour, minute);
  // Deux passes : la première approximation peut tomber du mauvais côté d'un
  // changement d'heure, la seconde corrige.
  let timestamp = naive - zoneOffsetMinutes(new Date(naive), timeZone) * 60000;
  timestamp = naive - zoneOffsetMinutes(new Date(timestamp), timeZone) * 60000;
  const result = new Date(timestamp);
  return Number.isNaN(result.getTime()) ? null : result;
}

/**
 * Composantes de date lues dans le fuseau du trajet.
 *
 * À utiliser partout où le code faisait `date.getHours()` / `date.getDay()` :
 * ces méthodes renvoient l'heure de la machine, pas celle de la station.
 *
 * @returns {{hours:number,minutes:number,weekday:number}|null} weekday : 0 = dimanche
 */
export function zonedParts(date, timeZone = TRIP_TIME_ZONE) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hours: Number(parts.hour) % 24,
    minutes: Number(parts.minute),
    weekday: weekdays[parts.weekday] ?? 0,
  };
}

/** « HH:MM » dans le fuseau du trajet. */
export function formatTimeInZone(date, timeZone = TRIP_TIME_ZONE) {
  const parts = zonedParts(date, timeZone);
  if (!parts) return '--:--';
  return `${String(parts.hours).padStart(2, '0')}:${String(parts.minutes).padStart(2, '0')}`;
}

/** Minutes écoulées depuis minuit, dans le fuseau du trajet. */
export function minutesOfDayInZone(date, timeZone = TRIP_TIME_ZONE) {
  const parts = zonedParts(date, timeZone);
  return parts ? parts.hours * 60 + parts.minutes : null;
}

/** « AAAA-MM-JJ » dans le fuseau du trajet, décalé de `dayOffset` jours. */
export function zonedDateKey(date, dayOffset = 0, timeZone = TRIP_TIME_ZONE) {
  const parts = zonedParts(date, timeZone);
  if (!parts) return null;
  // On passe par UTC pour l'arithmétique de calendrier : elle est exacte,
  // et la conversion vers l'instant réel se fera par instantFromLocalInput.
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + dayOffset));
  return shifted.toISOString().slice(0, 10);
}
