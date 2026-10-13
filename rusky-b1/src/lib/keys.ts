// Touches de réponse des cartes (tri rapide, révisions) : « oui » = je connais / je savais,
// « non » = je ne connais pas / à revoir. Flèches droite/haut et gauche/bas, D et Q (disposition
// ZQSD), 6 et 4 du pavé numérique (verrou numérique allumé ou éteint : nom, position et ancien
// code numérique de la touche).
export function answerKey(e: KeyboardEvent): "yes" | "no" | null {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return null;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return null;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const k = e.keyCode;
  if (["ArrowRight", "Right", "ArrowUp", "Up", "d", "6"].includes(key) || ["Numpad6", "Numpad8", "KeyD"].includes(e.code) || [39, 38, 102].includes(k))
    return "yes";
  if (["ArrowLeft", "Left", "ArrowDown", "Down", "q", "4"].includes(key) || ["Numpad4", "Numpad2", "KeyQ"].includes(e.code) || [37, 40, 100].includes(k))
    return "no";
  return null;
}
