/** Jour "YYYY-MM-DD" en Europe/Paris (Vercel tourne en UTC). */
export function parisDay(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function parisYesterday(date: Date = new Date()): string {
  return parisDay(new Date(date.getTime() - 24 * 60 * 60 * 1000));
}
