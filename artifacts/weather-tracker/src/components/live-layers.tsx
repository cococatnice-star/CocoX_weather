import { useEffect, useMemo, useRef } from "react";
import { GeoJSON, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { AlertMap, LightningFlash } from "@workspace/api-client-react";
import { classifyLightning, lightningColors, prepareStormAreas, type LightningLevel } from "@/lib/lightning-colors";

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

const r = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

/** Reports map bounds on load and debounced moveend (never on every mouse move). */
export function BoundsWatcher({ onBounds }: { onBounds: (b: Bounds) => void }) {
  const map = useMap();
  const cb = useRef(onBounds);
  cb.current = onBounds;
  useEffect(() => {
    let t: number | undefined;
    const emit = () => {
      const b = map.getBounds();
      cb.current({
        west: r(clamp(b.getWest(), -180, 180)),
        south: r(clamp(b.getSouth(), -90, 90)),
        east: r(clamp(b.getEast(), -180, 180)),
        north: r(clamp(b.getNorth(), -90, 90)),
      });
    };
    const onMove = () => {
      window.clearTimeout(t);
      t = window.setTimeout(emit, 400);
    };
    emit();
    map.on("moveend", onMove);
    return () => {
      window.clearTimeout(t);
      map.off("moveend", onMove);
    };
  }, [map]);
  return null;
}

export function MapClick({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(r4(e.latlng.lat), r4(wrap(e.latlng.lng))) });
  return null;
}
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const wrap = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180;

export function HazardLayer({ data, dataKey }: { data: AlertMap; dataKey: string }) {
  return (
    <GeoJSON
      key={dataKey}
      data={data as unknown as GeoJSON.FeatureCollection}
      style={(f) => {
        const c = (f?.properties as { color?: string })?.color || "#f26a1b";
        return { color: c, weight: 2.2, opacity: 0.95, fillColor: c, fillOpacity: 0.14 };
      }}
      onEachFeature={(f, layer) => {
        const p = f.properties as { event?: string; office?: string | null };
        layer.bindTooltip(`${p.event ?? "NWS alert"}${p.office ? ` · ${p.office}` : ""} — click for details`, { sticky: true });
        layer.on("mouseover", () => (layer as L.Path).setStyle({ weight: 3.6 }));
        layer.on("mouseout", () => (layer as L.Path).setStyle({ weight: 2.2 }));
      }}
    />
  );
}

const boltIcon = (level: LightningLevel) => L.divIcon({
  className: "wx-bolt",
  html: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6z" fill="${lightningColors[level]}" stroke="#382a24" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});
const boltIcons = { normal: boltIcon("normal"), watch: boltIcon("watch"), warning: boltIcon("warning") };

const fmt = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short" });

export function LightningLayer({ flashes, now, alerts, alertsUnavailable }: {
  flashes: LightningFlash[]; now: number; alerts?: AlertMap; alertsUnavailable: boolean;
}) {
  const areas = useMemo(() => prepareStormAreas(alerts?.features ?? [], now), [alerts, now]);
  const items = useMemo(() => flashes.map((flash) => ({
    ...flash, ...classifyLightning(flash.longitude, flash.latitude, areas),
  })), [flashes, areas]);
  return (
    <>
      {items.map((f) => (
        <Marker key={f.id} position={[f.latitude, f.longitude]} icon={boltIcons[f.level]} keyboard={false}>
          <Popup>
            <strong>Observed lightning flash</strong>
            <br />
            {f.event ?? (alertsUnavailable ? "Alert classification unavailable" : "Normal · no matching storm watch or warning")}
            {f.event && alertsUnavailable ? " · alert data may be incomplete or stale" : ""}
            <br />
            {fmt(f.time)} · {Math.max(0, Math.round((now - Date.parse(f.time)) / 60000))} min ago
            <br />
            <small>GOES-19 GLM satellite centroid (may be in-cloud, not exact strike point)</small>
          </Popup>
        </Marker>
      ))}
    </>
  );
}
