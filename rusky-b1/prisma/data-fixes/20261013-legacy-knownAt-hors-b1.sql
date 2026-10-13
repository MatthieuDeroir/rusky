-- Mots connus hors lexique B1 hérités de l'ancienne app : datés de leur première rencontre,
-- comme les mots B1 (20261013-legacy-knownAt.sql).
UPDATE Word SET knownAt = firstSeenAt
WHERE origin = 'legacy' AND status = 'KNOWN' AND firstSeenAt < knownAt
  AND entryId IN (SELECT id FROM DictionaryEntry WHERE b1Rank IS NULL);
