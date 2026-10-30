import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ReactNode,
} from "react";
import { useGetWarnings, getGetWarningsQueryKey } from "@workspace/api-client-react";
import { readLocalSound, validateMp3, writeLocalSound } from "./local-sound";
import {
  getPermission, loadPreferences, loadSeenWarnings, showWarningNotification,
  SETTINGS_KEY, SEEN_KEY, type AlertPreferences, type AlertScope,
} from "./warning-notifications";

interface AlertSettingsValue {
  preferences: AlertPreferences;
  setScope: (scope: AlertScope) => void;
  setVolume: (volume: number) => void;
  setSoundEnabled: (enabled: boolean) => Promise<void>;
  enableNotifications: () => Promise<void>;
  disableNotifications: () => void;
  selectMp3: (file: File) => Promise<void>;
  resetSound: () => Promise<void>;
  testSound: () => Promise<void>;
  clearError: () => void;
  permission: NotificationPermission | "unsupported";
  soundArmed: boolean;
  error: string | null;
  monitorError: string | null;
  loading: boolean;
  checkedAt: string | null;
  warningCount: number;
}
const Context = createContext<AlertSettingsValue | null>(null);

export function AlertSettingsProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(loadPreferences);
  const [preferences, setPreferences] = useState(initial.value);
  const [error, setError] = useState<string | null>(initial.error);
  const [permission, setPermission] = useState(getPermission);
  const [customBlob, setCustomBlob] = useState<Blob | null>(null);
  const [soundLoading, setSoundLoading] = useState(true);
  const [soundArmed, setSoundArmed] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const stopTimer = useRef<number | undefined>(undefined);
  const seen = useRef(loadSeenWarnings());
  const pendingIds = useRef(new Set<string>());
  const update = useCallback((patch: Partial<AlertPreferences>) => {
    setPreferences((current) => ({ ...current, ...patch }));
  }, []);

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(preferences)); }
    catch { setError("Could not save settings in this browser. Check storage permissions."); }
  }, [preferences]);
  useEffect(() => {
    let active = true;
    readLocalSound().then((sound) => {
      if (!active) return;
      setCustomBlob(sound?.blob ?? null);
      update({ customSoundName: sound?.name ?? null });
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "Could not restore the local MP3.");
    }).finally(() => { if (active) setSoundLoading(false); });
    return () => { active = false; };
  }, [update]);
  useEffect(() => {
    const refresh = () => setPermission(getPermission());
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  useEffect(() => {
    const soundUrl = customBlob ? URL.createObjectURL(customBlob) : `${import.meta.env.BASE_URL}warning-siren.mp3`;
    audio.current = new Audio(soundUrl);
    setSoundArmed(false);
    return () => {
      window.clearTimeout(stopTimer.current);
      audio.current?.pause();
      audio.current = null;
      if (customBlob) URL.revokeObjectURL(soundUrl);
    };
  }, [customBlob]);
  useEffect(() => {
    if (audio.current) audio.current.volume = preferences.volume;
    if (!preferences.soundEnabled) {
      audio.current?.pause();
      window.clearTimeout(stopTimer.current);
    }
  }, [preferences.volume, preferences.soundEnabled]);

  const playSound = useCallback(async (seconds: number) => {
    const player = audio.current;
    if (!player) throw new Error("The sound is still loading. Try again in a moment.");
    window.clearTimeout(stopTimer.current);
    player.volume = preferences.volume;
    player.currentTime = 0;
    try {
      await player.play();
      setSoundArmed(true);
      stopTimer.current = window.setTimeout(() => {
        player.pause();
        player.currentTime = 0;
      }, seconds * 1000);
    } catch {
      setSoundArmed(false);
      throw new Error("The browser blocked sound. Open Settings and click Test sound to arm it for this session.");
    }
  }, [preferences.volume, customBlob]);
  const testSound = useCallback(async () => {
    setError(null);
    try { await playSound(8); }
    catch (reason) { setError((reason as Error).message); }
  }, [playSound]);
  const setSoundEnabled = useCallback(async (enabled: boolean) => {
    update({ soundEnabled: enabled });
    if (enabled) {
      setError(null);
      try { await playSound(8); }
      catch (reason) { setError((reason as Error).message); }
    } else {
      audio.current?.pause();
      window.clearTimeout(stopTimer.current);
    }
  }, [update, playSound]);
  const enableNotifications = useCallback(async () => {
    setError(null);
    if (getPermission() === "unsupported") {
      setError("Notifications need a supported browser on HTTPS or localhost. Try opening CocoX in its own tab.");
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      update({ notificationsEnabled: result === "granted" });
      if (result !== "granted") {
        setError("Notifications were not allowed. Open CocoX in its own tab and allow notifications in the browser's site settings.");
      }
    } catch {
      setError("The browser could not request permission here. Open CocoX in its own tab and enable notifications there.");
    }
  }, [update]);
  const selectMp3 = useCallback(async (file: File) => {
    setError(null);
    try {
      await validateMp3(file);
      await writeLocalSound({ blob: file, name: file.name });
      setCustomBlob(file);
      update({ customSoundName: file.name });
    } catch (reason) { setError((reason as Error).message); }
  }, [update]);
  const resetSound = useCallback(async () => {
    setError(null);
    try {
      await writeLocalSound(null);
      setCustomBlob(null);
      update({ customSoundName: null });
    } catch (reason) { setError((reason as Error).message); }
  }, [update]);

  const params = { scope: preferences.scope };
  const feed = useGetWarnings(params, {
    query: {
      queryKey: getGetWarningsQueryKey(params),
      refetchInterval: 10000,
      refetchIntervalInBackground: true,
      retry: 2,
      staleTime: 5000,
    },
  });
  useEffect(() => {
    if (!feed.data || feed.data.scope !== preferences.scope || soundLoading) return;
    const notify = preferences.notificationsEnabled && permission === "granted";
    if (!notify && !preferences.soundEnabled) return;
    const fresh = feed.data.warnings.filter((warning) => {
      const key = `${preferences.scope}:${warning.id}`;
      return (!seen.current[key] || seen.current[key] < Date.now()) &&
        !pendingIds.current.has(key);
    });
    if (!fresh.length) return;
    const keys = fresh.map((warning) => `${preferences.scope}:${warning.id}`);
    keys.forEach((key) => pendingIds.current.add(key));
    let cancelled = false;
    void (async () => {
      let delivered = false;
      try {
        if (notify) {
          try {
            await showWarningNotification(fresh, preferences.scope);
            delivered = true;
          } catch (reason) {
            setError(`Could not display a warning notification: ${(reason as Error).message}`);
          }
        }
        if (!cancelled && preferences.soundEnabled) {
          try { await playSound(30); delivered = true; }
          catch (reason) { setError((reason as Error).message); }
        }
        if (delivered) {
          fresh.forEach((warning, index) => {
            seen.current[keys[index]] = Math.max(
              Date.now() + 60 * 60 * 1000,
              warning.expires ? Date.parse(warning.expires) : Date.now() + 24 * 60 * 60 * 1000,
            );
          });
          seen.current = Object.fromEntries(Object.entries(seen.current).filter(([, until]) => until > Date.now()));
          try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen.current)); }
          catch { setError("Warning received, but this browser could not save notification history. It may repeat after a reload."); }
        }
      } catch (reason) {
        setError(`Could not display a warning notification: ${(reason as Error).message}`);
      } finally { keys.forEach((key) => pendingIds.current.delete(key)); }
    })();
    return () => { cancelled = true; };
  }, [
    feed.data, preferences.scope, preferences.notificationsEnabled,
    preferences.soundEnabled, permission, soundLoading, playSound,
  ]);

  return (
    <Context.Provider value={{
      preferences,
      setScope: (scope) => update({ scope }),
      setVolume: (volume) => update({ volume: Math.max(0, Math.min(1, volume)) }),
      setSoundEnabled, enableNotifications,
      disableNotifications: () => update({ notificationsEnabled: false }),
      selectMp3, resetSound, testSound,
      clearError: () => setError(null),
      permission, soundArmed, error,
      monitorError: feed.isError ? "NWS warning monitoring is unavailable. Retrying automatically; do not rely on CocoX for safety." : null,
      loading: soundLoading || feed.isLoading,
      checkedAt: feed.data?.checkedAt ?? null,
      warningCount: feed.data?.warnings.length ?? 0,
    }}>
      {children}
    </Context.Provider>
  );
}

export function useAlertSettings(): AlertSettingsValue {
  const value = useContext(Context);
  if (!value) throw new Error("Alert settings must be inside AlertSettingsProvider");
  return value;
}
