import type { WeatherAlert } from "@workspace/api-client-react";

export type AlertScope = "CT" | "US";
export const SETTINGS_KEY = "cocox-alert-settings-v1";
export const SEEN_KEY = "cocox-notified-warnings-v1";
export interface AlertPreferences {
  scope: AlertScope;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  volume: number;
  customSoundName: string | null;
}
export const DEFAULT_PREFERENCES: AlertPreferences = {
  scope: "CT", notificationsEnabled: false, soundEnabled: false,
  volume: 0.8, customSoundName: null,
};

export function loadPreferences(): { value: AlertPreferences; error: string | null } {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return {
      value: {
        scope: raw.scope === "US" ? "US" : "CT",
        notificationsEnabled: raw.notificationsEnabled === true,
        soundEnabled: raw.soundEnabled === true,
        volume: typeof raw.volume === "number" && Number.isFinite(raw.volume)
          ? Math.max(0, Math.min(1, raw.volume)) : 0.8,
        customSoundName: typeof raw.customSoundName === "string" ? raw.customSoundName : null,
      },
      error: null,
    };
  } catch {
    return { value: DEFAULT_PREFERENCES, error: "Browser storage is unavailable. Settings may not survive a reload." };
  }
}

export function getPermission(): NotificationPermission | "unsupported" {
  return typeof Notification === "undefined" || !window.isSecureContext
    ? "unsupported" : Notification.permission;
}

function waitForActive(registration: ServiceWorkerRegistration): Promise<void> {
  if (registration.active) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const worker = registration.installing || registration.waiting;
    if (!worker) { reject(new Error("Notification worker is not available.")); return; }
    const timeout = window.setTimeout(() => {
      worker.removeEventListener("statechange", check);
      reject(new Error("Notification worker did not become ready."));
    }, 8000);
    function check() {
      if (worker?.state === "activated") {
        window.clearTimeout(timeout);
        worker.removeEventListener("statechange", check);
        resolve();
      }
    }
    worker.addEventListener("statechange", check);
    check();
  });
}

export async function showWarningNotification(
  warnings: WeatherAlert[],
  scope: AlertScope,
): Promise<void> {
  if (getPermission() !== "granted") throw new Error("Allow browser notifications in Settings first.");
  const area = scope === "CT" ? "Connecticut" : "United States";
  const title = warnings.length === 1
    ? `CocoX · ${warnings[0].event}`
    : `CocoX · ${warnings.length} warnings · ${area}`;
  const options: NotificationOptions = {
    body: warnings.length === 1
      ? `${area}: ${warnings[0].areaDesc}`.slice(0, 250)
      : warnings.slice(0, 3).map((warning) => `${warning.event}: ${warning.areaDesc}`).join("\n").slice(0, 300),
    icon: `${import.meta.env.BASE_URL}cocox-weather-logo.png`,
    tag: `cocox-${scope}-${warnings[0].id}`,
    silent: true,
    data: { url: new URL(import.meta.env.BASE_URL, window.location.origin).href },
  };
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}notification-worker.js`,
      { scope: import.meta.env.BASE_URL },
    );
    await waitForActive(registration);
    await registration.showNotification(title, options);
    return;
  }
  const notification = new Notification(title, options);
  notification.onclick = () => { window.focus(); notification.close(); };
}

export function loadSeenWarnings(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}");
    return Object.fromEntries(Object.entries(raw).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > Date.now(),
    ));
  } catch { return {}; }
}
