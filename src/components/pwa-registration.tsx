"use client";

import { useEffect, useRef, useState } from "react";

const INSTALL_PROMOTION_DELAY = 10_000;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function PwaRegistration() {
  const promptTimer = useRef<number | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const openedAt = Date.now();
    if (standalone) return;

    const clearPromptTimer = () => {
      if (promptTimer.current !== null) window.clearTimeout(promptTimer.current);
      promptTimer.current = null;
    };
    const handleInstallAvailable = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      clearPromptTimer();
      const elapsed = Date.now() - openedAt;
      promptTimer.current = window.setTimeout(() => setVisible(true), Math.max(0, INSTALL_PROMOTION_DELAY - elapsed));
    };
    const handleInstalled = () => {
      clearPromptTimer();
      setVisible(false);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleInstallAvailable);
    window.addEventListener("appinstalled", handleInstalled);
    document.documentElement.dataset.pwaInstallReady = "true";
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);

    return () => {
      clearPromptTimer();
      delete document.documentElement.dataset.pwaInstallReady;
      window.removeEventListener("beforeinstallprompt", handleInstallAvailable);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    setInstallPrompt(null);
  };

  const install = async () => {
    if (!installPrompt) return;
    setVisible(false);
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
    } finally {
      setInstallPrompt(null);
    }
  };

  if (!visible || !installPrompt) return null;

  return <aside className="install-promotion" role="dialog" aria-labelledby="install-promotion-title" aria-describedby="install-promotion-description">
    <button type="button" className="install-promotion-close" onClick={dismiss} aria-label="Close install prompt">×</button>
    <span className="install-promotion-icon" aria-hidden="true">V</span>
    <div className="install-promotion-copy"><span className="eyebrow">Install the app</span><h2 id="install-promotion-title">Keep BeatMyVendor close.</h2><p id="install-promotion-description">Add BeatMyVendor to your home screen for a focused, app-like experience.</p></div>
    <button type="button" className="button button-primary" onClick={install}>Install BeatMyVendor</button>
  </aside>;
}
