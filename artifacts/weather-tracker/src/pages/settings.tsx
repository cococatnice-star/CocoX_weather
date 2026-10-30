import { useRef, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, Bell, ExternalLink, Globe2, Music, Play, RotateCcw, Upload, Radar } from "lucide-react";
import { useAlertSettings } from "@/lib/alert-settings";
import "@/styles/settings.css";

const LOGO_SRC = `${import.meta.env.BASE_URL}cocox-weather-logo.png`;

export function Settings() {
  const s = useAlertSettings();
  const { preferences: p } = s;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const inIframe = typeof window !== "undefined" && window.self !== window.top;

  const pick = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    try { await s.selectMp3(file); } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const reset = async () => {
    if (busy) return;
    setBusy(true);
    try { await s.resetSound(); } finally { setBusy(false); }
  };

  const perm = s.permission;
  const permPill =
    perm === "granted" ? <span className="st-pill st-pill--ok" data-testid="status-permission">Permission granted</span>
    : perm === "denied" ? <span className="st-pill st-pill--bad" data-testid="status-permission">Blocked by browser</span>
    : perm === "unsupported" ? <span className="st-pill st-pill--bad" data-testid="status-permission">Not supported here</span>
    : <span className="st-pill" data-testid="status-permission">Not yet asked</span>;

  return (
    <div className="st-wrap">
      <section className="st-hero">
        <div className="st-hero-logo">
          <img src={LOGO_SRC} alt="CocoX Weather logo: orange cat beside the CocoX Weather wordmark" />
        </div>
        <div>
          <h1>Alert settings</h1>
          <p>Choose when CocoX speaks up. Everything here is saved in this browser on this device only. Nothing is uploaded, and it will not follow you to another device.</p>
        </div>
      </section>

      {s.error && (
        <div className="st-alert st-alert--err" role="alert" data-testid="text-settings-error">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{s.error}</span>
          <button type="button" onClick={s.clearError} data-testid="button-dismiss-error">Dismiss</button>
        </div>
      )}

      <section className="st-card">
        <h2><Globe2 size={18} aria-hidden="true" /> Monitoring area</h2>
        <p className="st-help">Controls which National Weather Service warnings trigger sound and notifications. It does not filter the warning polygons drawn on the map.</p>
        <div className="st-scope" role="radiogroup" aria-label="Monitoring area">
          <label>
            <input type="radio" name="scope" checked={p.scope === "CT"} onChange={() => s.setScope("CT")} data-testid="radio-scope-ct" />
            <strong>Connecticut only</strong>
            <span>Warnings issued for Connecticut counties.</span>
          </label>
          <label>
            <input type="radio" name="scope" checked={p.scope === "US"} onChange={() => s.setScope("US")} data-testid="radio-scope-us" />
            <strong>Everywhere · United States</strong>
            <span>Any active NWS warning nationwide. Expect frequent alerts.</span>
          </label>
        </div>
      </section>

      <section className="st-card">
        <h2><Radar size={18} aria-hidden="true" /> Live monitor</h2>
        <p className="st-help">Counts active NWS warnings only. Watches and advisories are not included.</p>
        {s.monitorError && (
          <div className="st-alert st-alert--err" role="alert" style={{ marginBottom: 10 }} data-testid="text-monitor-error">
            <AlertTriangle size={16} aria-hidden="true" /><span>{s.monitorError}</span>
          </div>
        )}
        <dl className="st-stats">
          <div className="st-stat"><dt>Active warnings</dt><dd data-testid="text-warning-count">{s.loading && !s.checkedAt ? <span className="st-skel" /> : s.warningCount}</dd></div>
          <div className="st-stat"><dt>Area</dt><dd>{p.scope === "CT" ? "Connecticut" : "United States"}</dd></div>
          <div className="st-stat"><dt>Last checked</dt><dd data-testid="text-checked-at">{s.checkedAt ? format(new Date(s.checkedAt), "h:mm:ss a") : s.loading ? <span className="st-skel" /> : "Not yet"}</dd></div>
        </dl>
      </section>

      <section className="st-card">
        <h2><Bell size={18} aria-hidden="true" /> Browser notifications</h2>
        <p className="st-help">Shown while CocoX is open, including in a background tab. Once the tab is fully closed, no notifications arrive. Enabling alerts includes current warnings once; already-delivered warnings do not repeat on every check. Background checks can be delayed by your browser.</p>
        <div className="st-row">
          <div className="st-grow">
            Warning notifications {p.notificationsEnabled ? <span className="st-pill st-pill--ok">On</span> : <span className="st-pill">Off</span>}
            <small>Your browser asks for permission the first time.</small>
          </div>
          {permPill}
          {p.notificationsEnabled ? (
            <button type="button" className="st-btn" onClick={s.disableNotifications} data-testid="button-disable-notifications">Turn off</button>
          ) : (
            <button type="button" className="st-btn st-btn--solid" disabled={perm === "unsupported" || perm === "denied"} onClick={() => void s.enableNotifications()} data-testid="button-enable-notifications">Enable notifications</button>
          )}
        </div>
        {perm === "denied" && (
          <div className="st-alert st-alert--info">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>Notifications are blocked. Allow them in your browser's site settings for this page, then come back.</span>
          </div>
        )}
        {(inIframe || perm === "unsupported") && (
          <div className="st-alert st-alert--info" style={{ marginTop: 8 }}>
            <ExternalLink size={16} aria-hidden="true" />
            <span>Embedded previews often block permission prompts. Open CocoX in its own tab to enable notifications there.</span>
            <a className="st-btn" href={window.location.href} target="_blank" rel="noreferrer" data-testid="link-open-new-tab">Open in new tab</a>
          </div>
        )}
      </section>

      <section className="st-card">
        <h2><Music size={18} aria-hidden="true" /> Alert sound</h2>
        <p className="st-help">Browsers only allow audio after you interact with the page each session. Press Test sound once to arm it.</p>
        <div className="st-row">
          <div className="st-grow">
            Play sound for new warnings
            <small>{p.soundEnabled ? (s.soundArmed ? "Enabled and armed for this session" : "Enabled, not armed yet") : "Disabled"}</small>
          </div>
          {p.soundEnabled && (s.soundArmed ? <span className="st-pill st-pill--ok" data-testid="status-armed">Armed</span> : <span className="st-pill st-pill--warn" data-testid="status-armed">Needs tap</span>)}
          <button type="button" role="switch" aria-checked={p.soundEnabled} aria-label="Play sound for new warnings" className="st-switch" onClick={() => void s.setSoundEnabled(!p.soundEnabled)} data-testid="switch-sound" />
        </div>
        {p.soundEnabled && !s.soundArmed && (
          <div className="st-alert st-alert--info">
            <Play size={16} aria-hidden="true" /><span>Sound is on but not armed in this session. Press Test sound to arm it.</span>
          </div>
        )}
        <div className="st-row">
          <label className="st-grow" htmlFor="st-volume">
            Volume <span className="st-pill">{Math.round(p.volume * 100)}%</span>
            <input id="st-volume" className="st-range" type="range" min={0} max={1} step={0.05} value={p.volume} onChange={(e) => s.setVolume(Number(e.target.value))} data-testid="input-volume" />
          </label>
        </div>
        <div className="st-row">
          <div className="st-grow">
            Sound file
            <small data-testid="text-sound-name">{p.customSoundName ? `Custom: ${p.customSoundName}` : "Default CocoX warning siren"}</small>
            <small>MP3 only, up to 10 MB. Stored in this browser, never uploaded.</small>
          </div>
          <input ref={fileRef} type="file" accept="audio/mpeg,.mp3" hidden onChange={(e) => void pick(e.target.files?.[0])} data-testid="input-mp3" />
          <button type="button" className="st-btn" disabled={busy || s.loading} onClick={() => fileRef.current?.click()} data-testid="button-choose-mp3">
            <Upload size={14} aria-hidden="true" /> {busy ? "Saving..." : "Choose MP3"}
          </button>
          {p.customSoundName && (
            <button type="button" className="st-btn" disabled={busy} onClick={() => void reset()} data-testid="button-reset-sound">
              <RotateCcw size={14} aria-hidden="true" /> Use default
            </button>
          )}
          <button type="button" className="st-btn st-btn--solid" disabled={busy || s.loading} onClick={() => void s.testSound()} data-testid="button-test-sound">
            <Play size={14} aria-hidden="true" /> Test sound
          </button>
        </div>
      </section>
    </div>
  );
}

export default Settings;
