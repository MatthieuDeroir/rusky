-- Mots marqués connus (depuis la liste, ou « je le connais » au tri) : appris en septembre, hors
-- de l'app. Datés du 15 septembre plutôt que du jour où ils ont été marqués.
UPDATE Word SET knownAt = '2026-09-15T10:00:00.000Z'
WHERE origin IN ('manual', 'triage') AND status = 'KNOWN' AND knownAt >= '2026-10-01';
