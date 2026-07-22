"use client";

import { toast } from "sonner";
import type { XpAward } from "@/lib/xp";

// Small "+X XP" feedback shared by the exercise cards. On the run that first reaches the daily
// goal, celebrate a bit more. A light confetti burst is drawn without any external library.
export function showXpToast(xp?: XpAward) {
  if (!xp) return;
  const justReachedGoal = xp.goalReached && xp.todayXp - xp.xpGained < xp.goal;
  if (justReachedGoal) {
    toast.success(`Objectif du jour atteint ✨ +${xp.xpGained} XP`, {
      description: `${xp.todayXp} XP aujourd’hui`,
    });
    confettiBurst();
  } else {
    toast(`+${xp.xpGained} XP`, { description: `${xp.todayXp}/${xp.goal} XP aujourd’hui` });
  }
}

// Dependency-free confetti: a handful of absolutely-positioned divs that fall and fade.
function confettiBurst() {
  if (typeof document === "undefined") return;
  const colors = ["#e8b84b", "#f0d089", "#c98a2b", "#ffffff"];
  const n = 28;
  const root = document.createElement("div");
  root.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:60;overflow:hidden";
  for (let i = 0; i < n; i++) {
    const p = document.createElement("div");
    const size = 6 + Math.random() * 6;
    p.style.cssText = `position:absolute;top:-12px;left:${Math.random() * 100}%;width:${size}px;height:${size * 0.5}px;background:${colors[i % colors.length]};opacity:0.9;border-radius:1px;transform:rotate(${Math.random() * 360}deg)`;
    const dur = 1400 + Math.random() * 1200;
    p.animate(
      [
        { transform: `translateY(0) rotate(0deg)`, opacity: 1 },
        { transform: `translateY(105vh) rotate(${360 + Math.random() * 360}deg)`, opacity: 0.9 },
      ],
      { duration: dur, easing: "cubic-bezier(.2,.6,.4,1)", delay: Math.random() * 200 },
    );
    root.appendChild(p);
  }
  document.body.appendChild(root);
  setTimeout(() => root.remove(), 2800);
}
