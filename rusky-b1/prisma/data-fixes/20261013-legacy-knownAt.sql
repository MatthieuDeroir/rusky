-- Mots connus hérités de l'ancienne app : datés de leur première rencontre (juin–août), pas de
-- leur dernière révision (qui ramenait tout en août).
UPDATE Word SET knownAt = firstSeenAt
WHERE origin = 'legacy' AND status = 'KNOWN' AND firstSeenAt < knownAt
  AND entryId IN (SELECT id FROM DictionaryEntry WHERE b1Rank IS NOT NULL);
