/** Déclarations de types pour l'horloge du trajet. */

export const TRIP_TIME_ZONE: string;

/** Convertit une saisie `datetime-local` en instant absolu, dans le fuseau du trajet. */
export function instantFromLocalInput(value: unknown, timeZone?: string): Date | null;

/** Composantes de date lues dans le fuseau du trajet. `weekday` : 0 = dimanche. */
export function zonedParts(
  date: Date,
  timeZone?: string,
): { year: number; month: number; day: number; hours: number; minutes: number; weekday: number } | null;

/** « HH:MM » dans le fuseau du trajet, ou « --:-- ». */
export function formatTimeInZone(date: Date, timeZone?: string): string;

/** Minutes écoulées depuis minuit dans le fuseau du trajet. */
export function minutesOfDayInZone(date: Date, timeZone?: string): number | null;

/** « AAAA-MM-JJ » dans le fuseau du trajet, décalé de `dayOffset` jours. */
export function zonedDateKey(date: Date, dayOffset?: number, timeZone?: string): string | null;
