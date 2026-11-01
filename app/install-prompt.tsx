"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "installDismissedAt";
const DISMISS_DAYS = 14;

// iOS has no install prompt API, so there we explain the Share → "Zet op beginscherm" steps.
// Chrome/Android/desktop get a real "Installeren" button via beforeinstallprompt.
export function InstallPrompt() {
  const [mode, setMode] = useState<"ios" | "prompt" | null>(null);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    if (standalone || Date.now() - dismissedAt < DISMISS_DAYS * 864e5) return;

    const ios =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (ios) setMode("ios");

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("prompt");
    };
    const onInstalled = () => setMode(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!mode) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setMode(null);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === "accepted") setMode(null);
  }

  return (
    <div className="install">
      <img src="/icons/icon-192.png" alt="" className="install-icon" />
      <div className="install-text">
        <strong>Installeer Uitgaven</strong>
        {mode === "ios" ? (
          <span>
            Tik op{" "}
            <svg className="share-icon" viewBox="0 0 24 24" aria-label="Deel">
              <path
                d="M12 3v12M12 3l-4 4M12 3l4 4M6 10H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-1"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>{" "}
            <b>Deel</b> en kies <b>Zet op beginscherm</b>.
          </span>
        ) : (
          <span>Zet de app op je beginscherm voor snelle toegang.</span>
        )}
      </div>
      <div className="install-actions">
        {mode === "prompt" && (
          <button className="primary small" onClick={install}>
            Installeren
          </button>
        )}
        <button className="install-close" onClick={dismiss} aria-label="Later">
          ✕
        </button>
      </div>
    </div>
  );
}
