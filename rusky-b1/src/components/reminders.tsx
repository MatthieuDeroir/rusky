"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { subscribePushAction, testPushAction, unsubscribePushAction } from "@/app/actions";
import { Button } from "@/components/ui";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Rappels : 7 h, 14 h, 19 h (une leçon chacun, si elle n'est pas faite) et 23 h. */
export function Reminders() {
  const [state, setState] = useState<State>("loading");
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(ios && !standalone ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  const enable = () =>
    start(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
        const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
        await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
        });
        await subscribePushAction(sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } });
        setState("on");
        toast.success("Rappels activés sur cet appareil");
      } catch {
        toast.error("Les rappels n’ont pas pu être activés sur cet appareil.");
      }
    });

  const disable = () =>
    start(async () => {
      try {
        const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
        if (sub) {
          await unsubscribePushAction(sub.endpoint);
          await sub.unsubscribe();
        }
        setState("off");
        toast.success("Rappels désactivés sur cet appareil");
      } catch {
        toast.error("La désactivation a échoué. Réessaie.");
      }
    });

  const test = () =>
    start(async () => {
      const n = await testPushAction().catch(() => 0);
      if (n > 0) toast.success("Notification d’essai envoyée");
      else toast.error("Aucun appareil n’a reçu la notification d’essai.");
    });

  return (
    <div className="space-y-3">
      <p className="text-muted">
        À 7 h, 14 h et 19 h (à l’heure près) pour les leçons du matin, de l’après-midi et du soir, seulement si elle
        n’est pas faite ; à 23 h seulement si tu n’as rien fait de la journée.
      </p>
      {state === "loading" && <p className="text-muted">…</p>}
      {state === "unsupported" && <p>Ce navigateur ne permet pas les notifications.</p>}
      {state === "ios-install" && (
        <p>Sur iPhone, ajoute d’abord Rusky à l’écran d’accueil (Partager, puis « Sur l’écran d’accueil »), puis ouvre-le depuis l’icône pour activer les rappels.</p>
      )}
      {state === "denied" && <p>Les notifications sont bloquées pour ce site : autorise-les dans les réglages du navigateur.</p>}
      {state === "off" && (
        <Button onClick={enable} disabled={pending}>
          Activer les rappels sur cet appareil
        </Button>
      )}
      {state === "on" && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={test} disabled={pending}>
            Envoyer un essai
          </Button>
          <Button variant="ghost" onClick={disable} disabled={pending}>
            Désactiver sur cet appareil
          </Button>
        </div>
      )}
    </div>
  );
}
