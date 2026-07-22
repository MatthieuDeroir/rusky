// Russian cardinal numbers for the "Chiffres" reference rubric. Stress is written with the
// dataset's "vowel + '" convention so displayAccent() renders the accent and stripStress()
// cleans it for speech synthesis. Framework-agnostic (no deps) → usable from a server page.

const UNITS = [
  "",
  "оди'н",
  "два",
  "три",
  "четы'ре",
  "пять",
  "шесть",
  "семь",
  "во'семь",
  "де'вять",
];

const TEENS = [
  "де'сять",
  "оди'ннадцать",
  "двена'дцать",
  "трина'дцать",
  "четы'рнадцать",
  "пятна'дцать",
  "шестна'дцать",
  "семна'дцать",
  "восемна'дцать",
  "девятна'дцать",
];

const TENS: Record<number, string> = {
  20: "два'дцать",
  30: "три'дцать",
  40: "со'рок",
  50: "пятьдеся'т",
  60: "шестьдеся'т",
  70: "се'мьдесят",
  80: "во'семьдесят",
  90: "девяно'сто",
};

/** Russian cardinal for 1..100 (with stress marks). */
export function numberToRussian(n: number): string {
  if (n === 100) return "сто";
  if (n >= 1 && n <= 9) return UNITS[n];
  if (n >= 10 && n <= 19) return TEENS[n - 10];
  const tens = Math.floor(n / 10) * 10;
  const unit = n % 10;
  return unit ? `${TENS[tens]} ${UNITS[unit]}` : TENS[tens];
}

export interface NumberEntry {
  n: number;
  ru: string;
}

/** 1 → 100, every integer. */
export const ONES_TO_HUNDRED: NumberEntry[] = Array.from({ length: 100 }, (_, i) => ({
  n: i + 1,
  ru: numberToRussian(i + 1),
}));

/** Hundreds: 100, 200, … 1000. */
export const HUNDREDS: NumberEntry[] = [
  { n: 100, ru: "сто" },
  { n: 200, ru: "две'сти" },
  { n: 300, ru: "три'ста" },
  { n: 400, ru: "четы'реста" },
  { n: 500, ru: "пятьсо'т" },
  { n: 600, ru: "шестьсо'т" },
  { n: 700, ru: "семьсо'т" },
  { n: 800, ru: "восемьсо'т" },
  { n: 900, ru: "девятьсо'т" },
  { n: 1000, ru: "ты'сяча" },
];

/** Thousands: 2000 … 10000 (1000 lives in HUNDREDS). */
export const THOUSANDS: NumberEntry[] = [
  { n: 2000, ru: "две ты'сячи" },
  { n: 3000, ru: "три ты'сячи" },
  { n: 4000, ru: "четы'ре ты'сячи" },
  { n: 5000, ru: "пять ты'сяч" },
  { n: 6000, ru: "шесть ты'сяч" },
  { n: 7000, ru: "семь ты'сяч" },
  { n: 8000, ru: "во'семь ты'сяч" },
  { n: 9000, ru: "де'вять ты'сяч" },
  { n: 10000, ru: "де'сять ты'сяч" },
];
