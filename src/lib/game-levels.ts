// Playful XP levels for the Duolingo-style home. Purely cosmetic (a title + a progress bar),
// entirely separate from the grammatical milestones in levels.ts. Titles nod to a journey
// through Russian letters and literature.
export interface GameLevel {
  level: number; // 1-based
  title: string;
  floor: number; // total XP at which this level starts
  next: number | null; // total XP for the next level (null at the cap)
  progress: number; // 0..1 within the current level
}

// XP threshold to REACH each level (index 0 = level 1). Grows gently then steepens.
const THRESHOLDS = [
  0, 50, 120, 220, 360, 550, 800, 1120, 1520, 2010, 2600, 3300, 4120, 5070, 6160, 7400,
  8800, 10370, 12120, 14060,
];

const TITLES = [
  "Алфавит — l’alphabet", // 1
  "Первые слова — premiers mots", // 2
  "Слог — la syllabe", // 3
  "Читатель — lecteur débutant", // 4
  "Падежи — les cas", // 5
  "Собеседник — interlocuteur", // 6
  "Рассказчик — conteur", // 7
  "Грамотей — lettré", // 8
  "Книголюб — amoureux des livres", // 9
  "Полиглот — polyglotte", // 10
  "Знаток — connaisseur", // 11
  "Пушкинист — pouchkinien", // 12
  "Мастер — maître", // 13
  "Профессор — professeur", // 14
  "Академик — académicien", // 15
  "Толмач — grand interprète", // 16
  "Лингвист — linguiste", // 17
  "Словесник — homme de lettres", // 18
  "Эрудит — érudit", // 19
  "Легенда — légende", // 20
];

export function getLevel(totalXp: number): GameLevel {
  let i = 0;
  while (i + 1 < THRESHOLDS.length && totalXp >= THRESHOLDS[i + 1]) i++;
  const floor = THRESHOLDS[i];
  const next = i + 1 < THRESHOLDS.length ? THRESHOLDS[i + 1] : null;
  const progress = next ? (totalXp - floor) / (next - floor) : 1;
  return { level: i + 1, title: TITLES[i] ?? TITLES[TITLES.length - 1], floor, next, progress };
}
