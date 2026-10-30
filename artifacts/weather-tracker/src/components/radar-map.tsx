import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import type { Map as LeafletMap } from "leaflet";
type FeatureCollection = GeoJSON.FeatureCollection;
import "leaflet/dist/leaflet.css";
import { SmoothRadarFrames, type RadarLayer } from "./smooth-radar-frames";

export interface RadarFrame {
  time: number;
  path: string;
}

interface RadarMetadata {
  host: string;
  generated: number;
  radar: { past: RadarFrame[] };
}

const METADATA_URL = "https://api.rainviewer.com/public/weather-maps.json";
export const CONNECTICUT_CENTER: [number, number] = [41.51, -72.83];
export const CONNECTICUT_ZOOM = 7;

/** Loads real RainViewer frames and drives animation state. */
export function useRadarFrames() {
  const [metadata, setMetadata] = useState<RadarMetadata | null>(null);
  const [frameIndex, setFrameIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tileError, setTileError] = useState<string | null>(null);
  const [buffering, setBuffering] = useState(true);
  const metadataRef = useRef<RadarMetadata | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(METADATA_URL, { cache: "no-store" });
        if (!response.ok) throw new Error(`Radar feed returned ${response.status}`);
        const result = (await response.json()) as RadarMetadata;
        if (!result.host || !Array.isArray(result.radar?.past)) {
          throw new Error("Radar feed returned an unexpected response");
        }
        if (!cancelled) {
          const previous = metadataRef.current;
          setFrameIndex((index) => {
            if (index < 0) return -1;
            const oldTime = previous?.radar.past[index]?.time;
            const sameFrame = result.radar.past.findIndex((frame) => frame.time === oldTime);
            return sameFrame >= 0 ? sameFrame : 0;
          });
          metadataRef.current = result;
          setMetadata(result);
          setError(null);
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Radar feed unavailable");
      }
    };
    void load();
    const refresh = window.setInterval(() => void load(), 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(refresh);
    };
  }, []);

  const frames = metadata?.radar.past ?? [];
  const selectedIndex = frameIndex < 0 ? Math.max(0, frames.length - 1) : Math.min(frameIndex, frames.length - 1);
  const selectedFrame = frames[selectedIndex];
  const tileUrl = useMemo(() => {
    if (!metadata || !selectedFrame) return null;
    return `${metadata.host}${selectedFrame.path}/512/{z}/{x}/{y}/2/1_1.png`;
  }, [metadata, selectedFrame]);
  const layers = useMemo(() => (metadata?.radar.past ?? []).map((frame) => ({
    path: frame.path,
    url: `${metadata!.host}${frame.path}/512/{z}/{x}/{y}/2/1_1.png`,
  })), [metadata]);

  useEffect(() => {
    if (!playing || frames.length < 2 || buffering) return;
    const timer = window.setInterval(() => {
      setFrameIndex((current) => {
        const index = current < 0 ? frames.length - 1 : current;
        return (index + 1) % frames.length;
      });
    }, 600);
    return () => window.clearInterval(timer);
  }, [playing, frames.length, buffering]);

  return {
    frames,
    selectedIndex,
    selectedFrame,
    tileUrl,
    layers,
    buffering,
    setBuffering,
    setTileError,
    playing,
    setPlaying,
    setFrameIndex,
    error: error || tileError,
    loading: !metadata && !error,
  };
}

function MapBridge({ onReady }: { onReady: (map: LeafletMap) => void }) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
  }, [map, onReady]);
  return null;
}

interface WorkspaceMapProps {
  radarLayers: RadarLayer[];
  onRadarBufferingChange: (buffering: boolean) => void;
  onRadarErrorChange: (error: string | null) => void;
  radarUrl: string | null;
  radarKey?: string;
  radarVisible: boolean;
  radarOpacity: number;
  outline: FeatureCollection | null;
  outlookKey: string;
  onReady: (map: LeafletMap) => void;
  children?: ReactNode;
}

export function WorkspaceMap({
  radarLayers,
  onRadarBufferingChange,
  onRadarErrorChange,
  radarUrl,
  radarKey,
  radarVisible,
  radarOpacity,
  outline,
  outlookKey,
  onReady,
  children,
}: WorkspaceMapProps) {
  return (
    <MapContainer
      className="wx-map"
      center={CONNECTICUT_CENTER}
      zoom={CONNECTICUT_ZOOM}
      zoomControl={false}
      scrollWheelZoom
      aria-label="Interactive weather map centered on Connecticut"
    >
      <MapBridge onReady={onReady} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      {outline && (
        <GeoJSON
          key={outlookKey}
          data={outline}
          style={(feature) => {
            const p = (feature?.properties ?? {}) as Record<string, string>;
            return {
              color: p.stroke || "#c2410c",
              weight: 1.6,
              fillColor: p.fill || "#fdba74",
              fillOpacity: 0.32,
            };
          }}
          onEachFeature={(feature, layer) => {
            const label = (feature.properties as Record<string, string> | null)?.LABEL;
            if (label) layer.bindTooltip(`SPC: ${label}`, { sticky: true });
          }}
        />
      )}
      {radarVisible && radarUrl && (
        <SmoothRadarFrames
          layers={radarLayers}
          activePath={radarKey}
          opacity={radarOpacity}
          onBufferingChange={onRadarBufferingChange}
          onErrorChange={onRadarErrorChange}
        />
      )}
      {children}
    </MapContainer>
  );
}
