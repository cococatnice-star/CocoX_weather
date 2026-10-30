import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useGetAlerts,
  getGetAlertsQueryKey,
  useGetAlertSummary,
  getGetAlertSummaryQueryKey,
  useGetAlertMap,
  getGetAlertMapQueryKey,
  useGetLocationAlerts,
  getGetLocationAlertsQueryKey,
  useGetLightning,
  getGetLightningQueryKey,
} from "@workspace/api-client-react";
import { BoundsWatcher, HazardLayer, LightningLayer, MapClick, type Bounds } from "@/components/live-layers";
import { format } from "date-fns";
import type { Map as LeafletMap } from "leaflet";
type FeatureCollection = GeoJSON.FeatureCollection;
import {
  AlertTriangle,
  CloudSun,
  Crosshair,
  Layers,
  MapPin,
  Minus,
  Pause,
  Play,
  Plus,
  Radar,
  Wind,
  X,
  Zap,
  ShieldAlert,
} from "lucide-react";
import { ForecastOutlook } from "@/components/forecast-outlook";
import { CONNECTICUT_CENTER, CONNECTICUT_ZOOM, WorkspaceMap, useRadarFrames } from "@/components/radar-map";

type Panel = "alerts" | "forecast" | "outlook" | "layers" | null;
type OutlookDay = 0 | 1 | 2;

function severityTone(severity: string) {
  const s = severity.toLowerCase();
  if (s === "extreme") return "extreme";
  if (s === "severe") return "severe";
  if (s === "moderate") return "moderate";
  return "minor";
}

function spcTime(value?: string) {
  if (!value || !/^\d{12}$/.test(value)) return value ?? null;
  return `${value.slice(4, 6)}/${value.slice(6, 8)} ${value.slice(8, 10)}:${value.slice(10, 12)}Z`;
}

async function getOutlook(day: number): Promise<FeatureCollection> {
  const res = await fetch(`/api/weather/outlook/${day}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Outlook service returned ${res.status}`);
  return (await res.json()) as FeatureCollection;
}

interface DashboardProps {
  onSevereAlertsChange: (hasSevere: boolean) => void;
}

export function Dashboard({ onSevereAlertsChange }: DashboardProps) {
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [panel, setPanel] = useState<Panel>("alerts");
  const [radarVisible, setRadarVisible] = useState(true);
  const [radarOpacity, setRadarOpacity] = useState(0.65);
  const [outlookDay, setOutlookDay] = useState<OutlookDay>(0);
  const radar = useRadarFrames();
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [hazardsVisible, setHazardsVisible] = useState(true);
  const [lightningVisible, setLightningVisible] = useState(true);
  const [pick, setPick] = useState<{ latitude: number; longitude: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(t);
  }, []);

  const boundsParams = bounds ?? { west: -74, south: 40.8, east: -71.5, north: 42.2 };
  const hazards = useGetAlertMap(boundsParams, {
    query: { enabled: !!bounds && (hazardsVisible || lightningVisible), refetchInterval: 30000, placeholderData: (prev) => prev, queryKey: getGetAlertMapQueryKey(boundsParams) },
  });
  const pickParams = pick ?? { latitude: 0, longitude: 0 };
  const located = useGetLocationAlerts(pickParams, {
    query: { enabled: !!pick, refetchInterval: 60000, queryKey: getGetLocationAlertsQueryKey(pickParams) },
  });
  const lightning = useGetLightning({
    query: {
      enabled: lightningVisible,
      refetchInterval: 20000,
      retry: 3,
      retryDelay: (n) => Math.min(8000, 1000 * 2 ** n),
      queryKey: getGetLightningQueryKey(),
    },
  });
  const allFlashes = useMemo(
    () => (lightning.data?.flashes ?? []).filter(
      (flash) => Date.parse(flash.time) >= now - 5 * 60 * 1000,
    ),
    [lightning.data, now],
  );
  const visibleFlashes = useMemo(() => {
    if (!bounds) return [];
    const inView = allFlashes.filter(
      (f) => f.latitude >= bounds.south && f.latitude <= bounds.north && f.longitude >= bounds.west && f.longitude <= bounds.east,
    );
    return inView.sort((a, b) => Date.parse(b.time) - Date.parse(a.time)).slice(0, 2000);
  }, [allFlashes, bounds]);
  const lightningAgeSec = lightning.data ? Math.max(0, Math.round((now - Date.parse(lightning.data.dataThrough)) / 1000)) : null;
  const lightningStale = lightningAgeSec !== null && lightningAgeSec > 180;
  const ageText = (s: number | null) => (s === null ? "--" : s < 90 ? `${s}s old` : `${Math.round(s / 60)} min old`);
  const showRecentLightning = () => {
    if (!map || !allFlashes.length) return;
    const us = allFlashes.filter((f) => f.latitude > 24 && f.latitude < 50 && f.longitude > -125 && f.longitude < -66);
    const set = (us.length ? us : allFlashes).slice().sort((a, b) => Date.parse(b.time) - Date.parse(a.time)).slice(0, 300);
    const lats = set.map((f) => f.latitude);
    const lngs = set.map((f) => f.longitude);
    map.fitBounds([[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]], { padding: [60, 60], maxZoom: 8 });
  };

  const { data: alerts = [], isLoading: isLoadingAlerts, isError: isAlertsError } = useGetAlerts({
    query: { refetchInterval: 10000, queryKey: getGetAlertsQueryKey() },
  });
  const { data: summary } = useGetAlertSummary({
    query: { refetchInterval: 10000, queryKey: getGetAlertSummaryQueryKey() },
  });

  const outlook = useQuery({
    queryKey: ["weather", "spc-outlook", outlookDay],
    queryFn: () => getOutlook(outlookDay),
    enabled: outlookDay !== 0,
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });

  const hasSevereAlerts = useMemo(
    () => alerts.some((a) => ["extreme", "severe"].includes(a.severity.toLowerCase())),
    [alerts],
  );
  useEffect(() => {
    onSevereAlertsChange(hasSevereAlerts);
  }, [hasSevereAlerts, onSevereAlertsChange]);

  useEffect(() => {
    if (!radarVisible) radar.setPlaying(false);
  }, [radarVisible, radar.setPlaying]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (pick) setPick(null);
        else setPanel(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pick]);

  const onMapReady = useCallback((m: LeafletMap) => setMap(m), []);
  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p));
  const reduceMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const fmtFrame = (t?: number) =>
    t ? new Date(t * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "--";

  const outlookProps = (outlook.data?.features?.[0]?.properties ?? {}) as Record<string, string>;
  const outlookLabels = useMemo(() => {
    const labels = (outlook.data?.features ?? [])
      .map((f) => {
        const p = (f.properties ?? {}) as Record<string, string>;
        return p.LABEL ? { label: p.LABEL2 ? `${p.LABEL} · ${p.LABEL2}` : p.LABEL, fill: p.fill, stroke: p.stroke } : null;
      })
      .filter((x): x is { label: string; fill: string; stroke: string } => !!x);
    return labels.filter((x, i) => labels.findIndex((y) => y.label === x.label) === i);
  }, [outlook.data]);

  const total = summary?.total ?? alerts.length;

  const rail: { id: Exclude<Panel, null>; label: string; icon: typeof Radar; badge?: number }[] = [
    { id: "alerts", label: "Alerts", icon: AlertTriangle, badge: total },
    { id: "forecast", label: "Forecast", icon: CloudSun },
    { id: "outlook", label: "Outlooks", icon: Wind },
    { id: "layers", label: "Layers", icon: Layers },
  ];

  return (
    <div className="wx-workspace">
      <WorkspaceMap
        radarUrl={radar.tileUrl}
        radarKey={radar.selectedFrame?.path}
        radarLayers={radar.layers}
        onRadarBufferingChange={radar.setBuffering}
        onRadarErrorChange={radar.setTileError}
        radarVisible={radarVisible}
        radarOpacity={radarOpacity}
        outline={outlookDay !== 0 && outlook.data ? outlook.data : null}
        outlookKey={`d${outlookDay}-${outlook.dataUpdatedAt}`}
        onReady={onMapReady}
      >
        <BoundsWatcher onBounds={setBounds} />
        <MapClick onPick={(latitude, longitude) => setPick({ latitude, longitude })} />
        {hazardsVisible && hazards.data && hazards.data.features.length > 0 && (
          <HazardLayer data={hazards.data} dataKey={`${hazards.dataUpdatedAt}-${hazards.data.features.length}`} />
        )}
        {lightningVisible && <LightningLayer flashes={visibleFlashes} now={now} alerts={hazards.data}
          alertsUnavailable={!hazards.data || hazards.isError || hazards.isPlaceholderData || !!hazards.data.truncated} />}
      </WorkspaceMap>

      {/* Tool rail */}
      <nav className="wx-rail" aria-label="Map tools">
        {rail.map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            type="button"
            className={`wx-rail-btn ${panel === id ? "is-active" : ""}`}
            onClick={() => toggle(id)}
            aria-pressed={panel === id}
            aria-controls="wx-panel"
            data-testid={`button-tool-${id}`}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
            {badge ? <em className="wx-badge">{badge}</em> : null}
          </button>
        ))}
      </nav>

      {/* Active layer chips */}
      <div className="wx-chips" aria-label="Active layers">
        {radarVisible && (
          <span className="wx-chip" data-testid="chip-radar">
            <Radar size={13} aria-hidden="true" />
            Radar <b title={radar.error ?? undefined}>{radar.loading ? "loading" : radar.error ? (radar.selectedFrame ? "partial data" : "unavailable") : fmtFrame(radar.selectedFrame?.time)}</b>
            <button type="button" onClick={() => setRadarVisible(false)} aria-label="Hide radar layer">
              <X size={12} />
            </button>
          </span>
        )}
        {hazardsVisible && (
          <span className="wx-chip" data-testid="chip-hazards">
            <ShieldAlert size={13} aria-hidden="true" />
            NWS areas <b>{hazards.isError ? "unavailable" : !hazards.data ? "loading" : `${hazards.data.features.length}${hazards.data.truncated ? "+" : ""} in view`}</b>
            <button type="button" onClick={() => setHazardsVisible(false)} aria-label="Hide NWS hazard outlines">
              <X size={12} />
            </button>
          </span>
        )}
        {lightningVisible && (
          <span className={`wx-chip ${lightningStale || lightning.isError ? "wx-chip--warn" : ""}`} data-testid="chip-lightning">
            <Zap size={13} aria-hidden="true" className="wx-zap" />
            Lightning{" "}
            <b>
              {lightning.isLoading
                ? "loading"
                : lightning.isError && !lightning.data
                  ? "unavailable"
                  : `${visibleFlashes.length} in view · ${ageText(lightningAgeSec)}${lightning.isError || lightningStale ? " · stale" : ""}`}
            </b>
            {lightning.data && visibleFlashes.length === 0 && allFlashes.length > 0 && (
              <button type="button" className="wx-chip-act" onClick={showRecentLightning} data-testid="button-show-lightning" aria-label="Show recent lightning">
                Show
              </button>
            )}
            <button type="button" onClick={() => setLightningVisible(false)} aria-label="Hide lightning layer">
              <X size={12} />
            </button>
          </span>
        )}
        {outlookDay !== 0 && (
          <span className="wx-chip wx-chip--accent" data-testid="chip-outlook">
            <Wind size={13} aria-hidden="true" />
            SPC Day {outlookDay}{" "}
            <b>{outlook.isLoading ? "loading" : outlook.isError ? "unavailable" : "categorical"}</b>
            <button type="button" onClick={() => setOutlookDay(0)} aria-label="Turn off SPC outlook">
              <X size={12} />
            </button>
          </span>
        )}
      </div>

      {/* Alerts quick status */}
      <button
        type="button"
        className={`wx-status-pill ${hasSevereAlerts ? "is-severe" : ""}`}
        onClick={() => setPanel("alerts")}
        data-testid="button-alert-status"
      >
        <span className="wx-dot" />
        {isAlertsError ? "NWS feed unreachable" : isLoadingAlerts ? "Checking NWS" : total ? `${total} active NWS alert${total === 1 ? "" : "s"}` : "No active CT alerts"}
      </button>

      {/* Floating panel */}
      {panel && (
        <section id="wx-panel" className="wx-panel" aria-label={`${panel} panel`}>
          <header className="wx-panel-head">
            <h2>
              {panel === "alerts" && "NWS alerts · Connecticut"}
              {panel === "forecast" && "48-hour forecast"}
              {panel === "outlook" && "SPC convective outlook"}
              {panel === "layers" && "Map layers"}
            </h2>
            <button type="button" className="wx-icon-btn" onClick={() => setPanel(null)} aria-label="Close panel" data-testid="button-close-panel">
              <X size={15} />
            </button>
          </header>
          <div className="wx-panel-body">
            {panel === "alerts" && (
              <>
                {summary && (
                  <p className="wx-meta">
                    {summary.warnings} warnings · {summary.watches} watches · {summary.advisories} advisories · polls every 10s
                  </p>
                )}
                {isLoadingAlerts ? (
                  <div className="wx-skel-list" role="status" aria-label="Loading alerts">
                    <span /><span /><span />
                  </div>
                ) : isAlertsError ? (
                  <p className="wx-empty wx-empty--err" role="alert">The NWS alert feed could not be reached. Retrying automatically.</p>
                ) : alerts.length === 0 ? (
                  <p className="wx-empty">No active warnings or watches for Connecticut.</p>
                ) : (
                  <ul className="wx-alerts">
                    {alerts.map((a) => (
                      <li key={a.id} className={`wx-alert wx-alert--${severityTone(a.severity)}`} data-testid={`card-alert-${a.id}`}>
                        <details>
                          <summary>
                            <span className="wx-alert-bar" aria-hidden="true" />
                            <span className="wx-alert-main">
                              <strong>{a.event}{a.isNew && <em className="wx-new">New</em>}</strong>
                              <small>
                                {a.severity} · {a.urgency} · expires{" "}
                                {a.expires ? format(new Date(a.expires), "MMM d, h:mm a") : "not specified"}
                              </small>
                            </span>
                          </summary>
                          <div className="wx-alert-detail">
                            {a.headline && <p className="wx-alert-headline">{a.headline}</p>}
                            <p className="wx-area"><MapPin size={12} aria-hidden="true" />{a.areaDesc}</p>
                            <p className="wx-meta">
                              Onset {a.onset ? format(new Date(a.onset), "MMM d, h:mm a") : "immediate"} · Certainty {a.certainty}
                            </p>
                            {a.instruction && <p className="wx-instruction">{a.instruction}</p>}
                            {a.description && <p className="wx-desc">{a.description}</p>}
                          </div>
                        </details>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="wx-source">Source: National Weather Service API</p>
              </>
            )}

            {panel === "forecast" && <ForecastOutlook />}

            {panel === "outlook" && (
              <>
                <div className="wx-seg" role="radiogroup" aria-label="SPC outlook day">
                  {([0, 1, 2] as OutlookDay[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      role="radio"
                      aria-checked={outlookDay === d}
                      className={outlookDay === d ? "is-active" : ""}
                      onClick={() => setOutlookDay(d)}
                      data-testid={`button-outlook-${d}`}
                    >
                      {d === 0 ? "Off" : `Day ${d}`}
                    </button>
                  ))}
                </div>
                {outlookDay === 0 ? (
                  <p className="wx-empty">Outlook overlay is off. Choose Day 1 or Day 2 to draw the official categorical risk areas.</p>
                ) : outlook.isLoading ? (
                  <div className="wx-skel-list" role="status" aria-label="Loading outlook"><span /><span /></div>
                ) : outlook.isError ? (
                  <div className="wx-empty wx-empty--err" role="alert">
                    {outlook.error instanceof Error ? outlook.error.message : "Outlook unavailable"}
                    <button type="button" className="wx-link-btn" onClick={() => void outlook.refetch()}>Retry</button>
                  </div>
                ) : outlookLabels.length === 0 ? (
                  <p className="wx-empty">No categorical risk areas in this outlook.</p>
                ) : (
                  <ul className="wx-legend">
                    {outlookLabels.map((l) => (
                      <li key={l.label}>
                        <span style={{ background: l.fill || "#fdba74", borderColor: l.stroke || "#c2410c" }} />
                        {l.label}
                      </li>
                    ))}
                  </ul>
                )}
                {outlookDay !== 0 && outlook.data && (
                  <dl className="wx-validity">
                    {(outlookProps.ISSUE_ISO || outlookProps.ISSUE) && (<><dt>Issued</dt><dd>{outlookProps.ISSUE_ISO ? new Date(outlookProps.ISSUE_ISO).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }) : spcTime(outlookProps.ISSUE)}</dd></>)}
                    {(outlookProps.VALID_ISO || outlookProps.VALID) && (<><dt>Valid</dt><dd>{outlookProps.VALID_ISO ? new Date(outlookProps.VALID_ISO).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }) : spcTime(outlookProps.VALID)}</dd></>)}
                    {(outlookProps.EXPIRE_ISO || outlookProps.EXPIRE) && (<><dt>Expires</dt><dd>{outlookProps.EXPIRE_ISO ? new Date(outlookProps.EXPIRE_ISO).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }) : spcTime(outlookProps.EXPIRE)}</dd></>)}
                    {outlookProps.FORECASTER && (<><dt>Forecaster</dt><dd>{outlookProps.FORECASTER}</dd></>)}
                  </dl>
                )}
                <p className="wx-source">
                  Source: <a href="https://www.spc.noaa.gov/products/outlook/" target="_blank" rel="noreferrer">NOAA Storm Prediction Center</a>
                </p>
              </>
            )}

            {panel === "layers" && (
              <>
                <label className="wx-toggle">
                  <input type="checkbox" checked={radarVisible} onChange={(e) => setRadarVisible(e.target.checked)} data-testid="toggle-radar" />
                  <span>Composite radar</span>
                  <small>RainViewer</small>
                </label>
                <label className="wx-range">
                  <span>Radar opacity {Math.round(radarOpacity * 100)}%</span>
                  <input type="range" min={0.2} max={1} step={0.05} value={radarOpacity} disabled={!radarVisible} onChange={(e) => setRadarOpacity(Number(e.target.value))} data-testid="input-opacity" />
                </label>
                <label className="wx-toggle">
                  <input type="checkbox" checked={outlookDay !== 0} onChange={(e) => setOutlookDay(e.target.checked ? 1 : 0)} data-testid="toggle-outlook" />
                  <span>SPC categorical outlook</span>
                  <small>{outlookDay ? `Day ${outlookDay}` : "Off"}</small>
                </label>
                <label className="wx-toggle">
                  <input type="checkbox" checked={hazardsVisible} onChange={(e) => setHazardsVisible(e.target.checked)} data-testid="toggle-hazards" />
                  <span>NWS hazard outlines</span>
                  <small>{hazards.data ? `${hazards.data.features.length} in view` : "NWS"}</small>
                </label>
                <label className="wx-toggle">
                  <input type="checkbox" checked={lightningVisible} onChange={(e) => setLightningVisible(e.target.checked)} data-testid="toggle-lightning" />
                  <span>Observed lightning</span>
                  <small>GOES-19 GLM</small>
                </label>
                {lightningVisible && lightning.data && (
                  <p className="wx-meta" data-testid="text-lightning-meta">
                    Data through {new Date(lightning.data.dataThrough).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })} · {ageText(lightningAgeSec)} · {allFlashes.length} flashes in 5-min window
                  </p>
                )}
                {lightningVisible && lightning.isError && (
                  <p className="wx-empty wx-empty--err" role="alert">
                    Lightning feed unreachable{lightning.data ? " — showing last received data" : ""}.
                    <button type="button" className="wx-link-btn" onClick={() => void lightning.refetch()}>Retry</button>
                  </p>
                )}
                {lightningVisible && lightning.data && visibleFlashes.length === 0 && (
                  <p className="wx-empty">
                    No observed flashes in this view in the last 5 minutes.
                    {allFlashes.length > 0 && <button type="button" className="wx-link-btn" onClick={showRecentLightning}>Show recent lightning</button>}
                  </p>
                )}
                <p className="wx-source">
                  Colored outlines are official NWS county, forecast-zone, or storm-based warning polygons — not city borders. City and state lines come from the OpenStreetMap basemap. Click anywhere to list alerts there.
                </p>
                <p className="wx-source">
                  Lightning: satellite-observed flash centroids (incl. in-cloud), delayed ~1 min. Not a lightning safety alarm.
                </p>
                {lightningVisible && (
                  <div className="wx-lightning-legend" aria-label="Lightning color legend">
                    <span><i style={{ background: "#fff" }} /> White: normal</span>
                    <span><i style={{ background: "#ffd60a" }} /> Yellow: watch / almost severe</span>
                    <span><i style={{ background: "#ff3030" }} /> Red: warning / severe</span>
                    <p>Colors follow NWS severe thunderstorm and tornado alert areas, not lightning intensity. White does not mean safe.</p>
                    {(!hazards.data || hazards.isError || hazards.isPlaceholderData || hazards.data.truncated) &&
                      <p role="status">Alert-area data is unavailable, incomplete, or refreshing; colors may not reflect all current watches and warnings.</p>}
                  </div>
                )}
                <p className="wx-source">Basemap: OpenStreetMap contributors</p>
              </>
            )}
          </div>
        </section>
      )}

      {pick && (
        <section className="wx-point" aria-label="Alerts at selected location" data-testid="panel-point">
          <header className="wx-panel-head">
            <h2>Alerts here</h2>
            <button type="button" className="wx-icon-btn" onClick={() => setPick(null)} aria-label="Close location alerts" data-testid="button-close-point">
              <X size={15} />
            </button>
          </header>
          <div className="wx-panel-body">
            <p className="wx-meta" data-testid="text-point-coords">
              <MapPin size={11} aria-hidden="true" /> {pick.latitude.toFixed(4)}, {pick.longitude.toFixed(4)}
              {located.data && ` · checked ${new Date(located.data.checkedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
            </p>
            {located.isLoading ? (
              <div className="wx-skel-list" role="status" aria-label="Loading alerts for this location"><span /><span /></div>
            ) : located.isError ? (
              <div className="wx-empty wx-empty--err" role="alert">
                Could not reach NWS for this point.
                <button type="button" className="wx-link-btn" onClick={() => void located.refetch()} data-testid="button-retry-point">Retry</button>
              </div>
            ) : !located.data?.alerts.length ? (
              <p className="wx-empty wx-empty--ok" data-testid="text-point-none">No active NWS alerts cover this point.</p>
            ) : (
              <ul className="wx-alerts">
                {located.data.alerts.map((a, i) => (
                  <li key={a.id} className={`wx-alert wx-alert--${severityTone(a.severity)}`} data-testid={`card-point-alert-${a.id}`}>
                    <details open={i === 0}>
                      <summary>
                        <span className="wx-alert-bar" aria-hidden="true" />
                        <span className="wx-alert-main">
                          <strong>{a.event}</strong>
                          <small>
                            {a.severity} · {a.urgency} · expires {a.expires ? format(new Date(a.expires), "MMM d, h:mm a") : "not specified"}
                          </small>
                        </span>
                      </summary>
                      <div className="wx-alert-detail">
                        {a.headline && <p className="wx-alert-headline">{a.headline}</p>}
                        <p className="wx-area"><MapPin size={12} aria-hidden="true" />{a.areaDesc}</p>
                        <p className="wx-meta">
                          Onset {a.onset ? format(new Date(a.onset), "MMM d, h:mm a") : "immediate"} · {a.senderName ?? "NWS"}
                        </p>
                        {a.instruction && <p className="wx-instruction">{a.instruction}</p>}
                        {a.description && <p className="wx-desc">{a.description}</p>}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
            <p className="wx-source">Official NWS alerts whose zone, county, or storm polygon contains this point.</p>
          </div>
        </section>
      )}

      {/* Map controls */}
      <div className="wx-mapctl" role="group" aria-label="Map view controls">
        <button type="button" className="wx-icon-btn" onClick={() => map?.zoomIn()} aria-label="Zoom in" data-testid="button-zoom-in"><Plus size={16} /></button>
        <button type="button" className="wx-icon-btn" onClick={() => map?.zoomOut()} aria-label="Zoom out" data-testid="button-zoom-out"><Minus size={16} /></button>
        <button type="button" className="wx-icon-btn" onClick={() => map?.setView(CONNECTICUT_CENTER, CONNECTICUT_ZOOM, { animate: !reduceMotion })} aria-label="Recenter on Connecticut" data-testid="button-recenter"><Crosshair size={16} /></button>
      </div>

      {/* Timeline */}
      <div className="wx-timeline" role="group" aria-label="Radar animation">
        <button
          type="button"
          className="wx-play"
          onClick={() => radar.setPlaying(!radar.playing)}
          disabled={radar.frames.length < 2 || !radarVisible || radar.buffering}
          aria-label={radar.buffering ? "Buffering radar frames for smooth playback" : radar.playing ? "Pause radar animation" : "Play radar animation"}
          data-testid="button-play"
        >
          {radar.playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <span className="wx-tl-edge">{fmtFrame(radar.frames[0]?.time)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(0, radar.frames.length - 1)}
          value={radar.selectedIndex}
          disabled={radar.frames.length < 2 || !radarVisible}
          onChange={(e) => {
            radar.setPlaying(false);
            radar.setFrameIndex(Number(e.target.value));
          }}
          aria-label="Choose radar time frame"
          aria-valuetext={fmtFrame(radar.selectedFrame?.time)}
          data-testid="input-timeline"
        />
        <span className="wx-tl-edge">{fmtFrame(radar.frames.at(-1)?.time)}</span>
        <strong className="wx-tl-now" aria-live="polite">
          {radar.error ? (radar.selectedFrame ? "Partial radar" : "Radar unavailable") : radar.buffering && radarVisible ? "Buffering" : radar.frames.length ? `${radar.selectedIndex + 1}/${radar.frames.length}` : "Loading"}
        </strong>
      </div>
    </div>
  );
}
