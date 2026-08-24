// Vérification de la règle de réussite ТРКИ-1 (docs/adr/0006-bareme-officiel-trki1.md, §7 du
// correctif). Pas un framework de test — même esprit que scripts/verify-*.ts existants : assertions
// manuelles, sortie lisible, exit code non-nul si un cas échoue.
import { isPassed, TRKI1_CONFIG, type SubtestOutcome } from "../src/lib/exam/config";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "OK  " : "FAIL"} ${name} — attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`);
  if (!ok) failures++;
}

const S = TRKI1_CONFIG.subtests;
const all: SubtestOutcome["subtest"][] = ["lexgram", "reading", "listening", "writing", "speaking"];
const atPass66 = (s: (typeof all)[number]) => S[s].pass66;
const atPass60 = (s: (typeof all)[number]) => S[s].pass60;

// Cas 1 — tous exactement au seuil 66 %.
{
  const outcomes: SubtestOutcome[] = all.map((s) => ({ subtest: s, score: atPass66(s) }));
  const sum = outcomes.reduce((a, o) => a + o.score, 0);
  const r = isPassed(outcomes);
  console.log(`\n[Cas 1] Tous à pass66 exactement — somme = ${sum} (seuil total = ${TRKI1_CONFIG.total.pass})`);
  check("Cas 1 — perSubtestOk", r.perSubtestOk, true);
  check("Cas 1 — totalOk (avec CES valeurs de pass66, la somme est en dessous du seuil)", r.totalOk, sum >= TRKI1_CONFIG.total.pass);
  check("Cas 1 — passed", r.passed, r.perSubtestOk && r.totalOk);
}

// Cas 2 — un sous-test à 60 %, les autres à 66 % → réussite (tolérance consommée) *dans l'énoncé
// utilisateur*. Avec les valeurs officielles fournies, "lexgram à pass60 + les 4 autres à
// exactement pass66" ne suffit PAS pour le seuil total (435 < 446 — encore moins que le Cas 1,
// puisqu'on a en plus retiré le déficit de lexgram). Ce cas est donc construit avec un peu de
// marge au-delà de pass66 sur listening, pour isoler "la tolérance marche-t-elle" de "le total
// est-il atteint" — sans cette marge, aucune valeur ne fait passer ce scénario (voir le message
// à l'utilisateur : la même incohérence que le Cas 5 touche aussi ce Cas 2 tel que décrit).
{
  const outcomes: SubtestOutcome[] = all.map((s) => ({ subtest: s, score: atPass66(s) }));
  outcomes[0] = { subtest: all[0], score: atPass60(all[0]) }; // lexgram tombe à pass60 (-10)
  outcomes[2] = { subtest: all[2], score: atPass66(all[2]) + 15 }; // listening au-dessus de pass66
  const sum = outcomes.reduce((a, o) => a + o.score, 0);
  const r = isPassed(outcomes);
  console.log(`\n[Cas 2] lexgram à pass60, listening +15 au-dessus de pass66 pour atteindre le seuil — somme = ${sum}`);
  check("Cas 2 — perSubtestOk (tolérance consommée par 1 seul sous-test)", r.perSubtestOk, true);
  check("Cas 2 — toleranceUsedBy", r.toleranceUsedBy, "lexgram");
  check("Cas 2 — totalOk", r.totalOk, sum >= TRKI1_CONFIG.total.pass);
  check("Cas 2 — passed", r.passed, true);
}

// Cas 3 — deux sous-tests entre 60 % et 66 % → échec (un seul slot de tolérance).
{
  const outcomes: SubtestOutcome[] = all.map((s) => ({ subtest: s, score: atPass66(s) }));
  outcomes[0] = { subtest: all[0], score: atPass60(all[0]) };
  outcomes[2] = { subtest: all[2], score: atPass60(all[2]) };
  const r = isPassed(outcomes);
  console.log(`\n[Cas 3] lexgram ET listening à pass60`);
  check("Cas 3 — perSubtestOk", r.perSubtestOk, false);
  check("Cas 3 — passed", r.passed, false);
}

// Cas 4 — un sous-test à pass60 - 1 (juste sous le plancher) → échec quel que soit le total.
{
  const outcomes: SubtestOutcome[] = all.map((s) => ({ subtest: s, score: S[s].maxPoints })); // sans-faute partout
  outcomes[4] = { subtest: all[4], score: atPass60(all[4]) - 1 }; // speaking sous le plancher
  const r = isPassed(outcomes);
  console.log(`\n[Cas 4] Sans-faute partout SAUF speaking à pass60-1 (${atPass60(all[4]) - 1} pts)`);
  check("Cas 4 — failedBelow60 contient speaking", r.failedBelow60, ["speaking"]);
  check("Cas 4 — passed (aucune compensation possible)", r.passed, false);
}

// Cas 5 — tous les sous-tests ≥ pass66 mais total < 446 : avec les valeurs officielles fournies,
// c'est EXACTEMENT le Cas 1 (somme des pass66 = 445). Documenté ici comme incohérence de barème
// plutôt que "normalement impossible" — voir docs/adr/0006 et le message envoyé à l'utilisateur.
{
  const sumOfPass66 = all.reduce((a, s) => a + atPass66(s), 0);
  console.log(`\n[Cas 5] Somme des pass66 officiels = ${sumOfPass66} vs seuil total = ${TRKI1_CONFIG.total.pass}`);
  check(
    "Cas 5 — incohérence confirmée : pass66 partout ne garantit PAS le seuil total",
    sumOfPass66 < TRKI1_CONFIG.total.pass,
    true,
  );
}

// Sanity §7 : maxScore par sous-test, somme = 675, sans-faute → 675 et réussite, seuil = 66,07%.
{
  check("maxPoints lexgram", S.lexgram.maxPoints, 165);
  check("maxPoints reading", S.reading.maxPoints, 140);
  check("maxPoints listening", S.listening.maxPoints, 120);
  check("maxPoints writing", S.writing.maxPoints, 80);
  check("maxPoints speaking", S.speaking.maxPoints, 170);
  const sumMax = all.reduce((a, s) => a + S[s].maxPoints, 0);
  check("Somme des 5 maxScore = 675", sumMax, 675);

  const perfect: SubtestOutcome[] = all.map((s) => ({ subtest: s, score: S[s].maxPoints }));
  const r = isPassed(perfect);
  check("Sans-faute → totalScore = 675", r.totalScore, 675);
  check("Sans-faute → passed", r.passed, true);

  const thresholdRatio = TRKI1_CONFIG.total.pass / TRKI1_CONFIG.total.maxPoints;
  console.log(`\n[Sanity] Seuil ${TRKI1_CONFIG.total.pass}/${TRKI1_CONFIG.total.maxPoints} = ${(thresholdRatio * 100).toFixed(2)}%`);
  check("Seuil total ≈ 66,07 %", Math.round(thresholdRatio * 10000) / 10000, 0.6607);
}

console.log(failures === 0 ? "\nTous les cas passent." : `\n${failures} cas en échec.`);
process.exitCode = failures === 0 ? 0 : 1;
