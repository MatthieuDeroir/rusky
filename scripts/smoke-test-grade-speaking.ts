// Smoke test ponctuel (pas dans package.json) : appelle réellement gradeSpeaking sur un
// transcript fabriqué, pour prouver la chaîne de notation avant de la brancher en passation.
import "dotenv/config";
import { gradeSpeaking } from "../src/lib/mistral";

async function main() {
  const payload = {
    instructions:
      "Кратко перескажи текст своими словами и выскажи своё мнение. Не менее 10-12 предложений.",
    supportText:
      "Многие люди любят путешествовать, потому что это помогает узнавать новые места и культуры.",
  };
  // Transcript volontairement imparfait (fautes + artefacts ASR plausibles) pour vérifier que le
  // rater reste utilisable sur une entrée réaliste, pas un texte parfait.
  const transcript =
    "я думаю что путешествие это очень хорошо потому что человек узнает новые вещи и новые культуры " +
    "но иногда это дорого и сложно найти дешевый билет я лично люблю путешествовать в другой страна " +
    "потому что интересно видеть как живут другие люди";

  const feedback = await gradeSpeaking(payload, transcript, { durationSec: 45, wordCount: 40 });
  console.log(JSON.stringify(feedback, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
