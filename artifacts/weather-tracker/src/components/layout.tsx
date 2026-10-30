import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { BellOff, BellRing, Map as MapIcon, Server, SlidersHorizontal } from "lucide-react";
import { useAlertSettings } from "@/lib/alert-settings";
import "@/styles/weather-dashboard.css";
import "@/styles/weather-map.css";

interface LayoutProps {
  children: ReactNode;
  hasSevereAlerts: boolean;
}

const LOGO_SRC = `${import.meta.env.BASE_URL}cocox-weather-logo.png`;

export function Layout({ children, hasSevereAlerts }: LayoutProps) {
  const [location] = useLocation();
  const isMap = location === "/";
  const isSettings = location === "/settings";
  const { preferences, setSoundEnabled, soundArmed, error, monitorError, permission } = useAlertSettings();
  const attention = error || monitorError ||
    (preferences.notificationsEnabled && permission !== "granted" ? "Browser notifications are not permitted." : null);
  const on = preferences.soundEnabled;
  const label = on ? (soundArmed ? "Alert sound on" : "Alert sound on, needs tap to arm") : "Alert sound off";

  const shellClass = isMap
    ? "wx-shell"
    : isSettings
      ? "wx-shell wx-shell--page"
      : "min-h-[100dvh] flex flex-col bg-background font-sans weather-app-shell";

  return (
    <div className={shellClass}>
      <header className="wx-topbar">
        <Link href="/" className="wx-brand" aria-label="CocoX Weather, go to map" data-testid="link-home">
          <span className="wx-logo-frame">
            <img src={LOGO_SRC} alt="CocoX Weather logo: orange cat beside the CocoX Weather wordmark" className="wx-logo-img" />
          </span>
          <span className="wx-brand-sub">{preferences.scope === "CT" ? "Connecticut" : "United States"}</span>
        </Link>
        {hasSevereAlerts && (
          <span className="wx-severe-flag" role="status" data-testid="status-severe">
            CT severe alert
          </span>
        )}
        <nav className="wx-nav" aria-label="Main navigation">
          <Link href="/" className={`wx-nav-link ${isMap ? "is-active" : ""}`} aria-label="Map" data-testid="link-map">
            <MapIcon size={15} aria-hidden="true" />
            <span>Map</span>
          </Link>
          <Link href="/status" className={`wx-nav-link ${location === "/status" ? "is-active" : ""}`} aria-label="Status" data-testid="link-status">
            <Server size={15} aria-hidden="true" />
            <span>Status</span>
          </Link>
          <Link href="/settings" className={`wx-nav-link ${isSettings ? "is-active" : ""}`} aria-label="Settings" data-testid="link-settings">
            <SlidersHorizontal size={15} aria-hidden="true" />
            <span>Settings</span>
          </Link>
          <button
            type="button"
            className={`wx-sound ${on ? "is-on" : ""} ${on && !soundArmed ? "is-unarmed" : ""}`}
            onClick={() => void setSoundEnabled(!on)}
            aria-pressed={on}
            aria-label={label}
            title={label}
            data-testid="button-sound"
          >
            {on ? <BellRing size={15} aria-hidden="true" /> : <BellOff size={15} aria-hidden="true" />}
            <span>{on ? (soundArmed ? "Sound armed" : "Sound on") : "Sound off"}</span>
          </button>
        </nav>
      </header>
      {attention && !isSettings && (
        <Link href="/settings" className="wx-attention" role="status">
          Alert settings need attention: {attention}
        </Link>
      )}
      <main className={isMap ? "wx-main" : isSettings ? "wx-main wx-main--scroll" : "weather-main flex-1"}>{children}</main>
    </div>
  );
}
