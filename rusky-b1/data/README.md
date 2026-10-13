# Data sources

## OpenRussian dictionary (`nouns.csv`, `verbs.csv`, `adjectives.csv`, `others.csv`)

From [Badestrand/russian-dictionary](https://github.com/Badestrand/russian-dictionary),
the data dump behind [OpenRussian.org](https://en.openrussian.org).

**Licence: Creative Commons Attribution-ShareAlike 4.0 (CC-BY-SA 4.0).**

Notes:

- Files are **tab-separated** despite the `.csv` extension.
- Stress is marked with `'` placed **after** the stressed vowel (e.g. `челове'к`).
- Some cells contain comma-separated variants (e.g. animate/inanimate accusative).

## Curated supplement (`supplement/*.json`)

Hand-authored full paradigms for the closed inflecting classes that OpenRussian stores
without declension (personal/interrogative pronouns and numerals). Authored from standard
Russian grammar so that v1 is grammatically complete.
