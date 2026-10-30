import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TileLayer } from "react-leaflet";
import "@/styles/smooth-radar.css";

export interface RadarLayer { path: string; url: string }
interface Props {
  layers: RadarLayer[];
  activePath?: string;
  opacity: number;
  onBufferingChange: (buffering: boolean) => void;
  onErrorChange: (error: string | null) => void;
}

/** Keep frames mounted and preloaded; changing time only cross-fades opacity. */
export function SmoothRadarFrames({
  layers, activePath, opacity, onBufferingChange, onErrorChange,
}: Props) {
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  // Load the current frame first, then one frame at a time. Mounting the whole
  // loop at once creates a large tile burst and can trigger provider throttling.
  const firstPath = useRef(activePath);
  const [preloadCount, setPreloadCount] = useState(1);
  const mounted = useMemo(() => {
    const ordered = [
      ...layers.filter((layer) => layer.path === firstPath.current),
      ...layers.filter((layer) => layer.path !== firstPath.current),
    ];
    const allowed = new Set(ordered.slice(0, preloadCount).map((layer) => layer.path));
    return layers.filter((layer) => allowed.has(layer.path) || layer.path === activePath);
  }, [preloadCount, layers, activePath]);
  const mountedReady = mounted.length > 0 && mounted.every((layer) => ready[layer.path]);
  useEffect(() => {
    if (!mountedReady || preloadCount >= layers.length) return;
    const timer = window.setTimeout(() => setPreloadCount((count) => count + 1), 250);
    return () => window.clearTimeout(timer);
  }, [mountedReady, preloadCount, layers.length]);
  const buffering = !layers.length || layers.some((layer) => !ready[layer.path]);
  const hasErrors = layers.some((layer) => failed[layer.path]);
  useEffect(() => onBufferingChange(buffering), [buffering, onBufferingChange]);
  useEffect(() => {
    onErrorChange(hasErrors ? "Some radar tiles could not load. The provider may be busy; wait before reloading." : null);
  }, [hasErrors, onErrorChange]);
  const loading = useCallback((path: string) => {
    setReady((current) => current[path] === false ? current : { ...current, [path]: false });
    setFailed((current) => current[path] ? { ...current, [path]: false } : current);
  }, []);
  const loaded = useCallback((path: string) => {
    setReady((current) => current[path] ? current : { ...current, [path]: true });
  }, []);

  return (
    <>
      {mounted.map((frame) => (
        <TileLayer
          key={frame.path}
          url={frame.url}
          className="wx-radar-frame"
          opacity={frame.path === activePath ? opacity : 0}
          maxNativeZoom={8}
          maxZoom={19}
          tileSize={512}
          zoomOffset={-1}
          keepBuffer={1}
          updateWhenIdle
          zIndex={20}
          attribution='Radar &copy; <a href="https://www.rainviewer.com/api.html">RainViewer</a>'
          eventHandlers={{
            loading: () => loading(frame.path),
            load: () => loaded(frame.path),
            tileerror: () => setFailed((current) => ({ ...current, [frame.path]: true })),
          }}
        />
      ))}
    </>
  );
}
