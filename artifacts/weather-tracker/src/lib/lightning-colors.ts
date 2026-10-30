export type LightningLevel = "normal" | "watch" | "warning";
type Point = [number, number];
type Ring = Point[];
interface AlertFeature {
  geometry: { type: string; coordinates: unknown };
  properties: { event: string; expires?: string | null; onset?: string | null };
}
interface StormArea {
  level: "watch" | "warning";
  event: string;
  rings: Ring[];
  bounds: [number, number, number, number];
}

export const lightningColors = {
  normal: "#ffffff",
  watch: "#ffd60a",
  warning: "#ff3030",
} as const;

/** Alert association, not a measurement of lightning strength or storm intensity. */
export function prepareStormAreas(features: AlertFeature[], now: number): StormArea[] {
  const areas: StormArea[] = [];
  for (const { geometry, properties: p } of features) {
    const event = p.event.toLowerCase();
    if (!/^(severe thunderstorm|tornado) (watch|warning)$/.test(event)) continue;
    if (p.expires && Date.parse(p.expires) <= now) continue;
    if (p.onset && Date.parse(p.onset) > now) continue;
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates]
      : geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
    for (const polygon of polygons) {
      if (!Array.isArray(polygon) || !polygon.length) continue;
      if (!polygon.every((ring: unknown) => Array.isArray(ring) && ring.length >= 4 &&
        ring.every((point: unknown) => Array.isArray(point) && point.length >= 2 &&
          Number.isFinite(point[0]) && Number.isFinite(point[1])))) continue;
      const rings = polygon as Ring[];
      let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
      for (const [x, y] of rings[0]) {
        west = Math.min(west, x); east = Math.max(east, x);
        south = Math.min(south, y); north = Math.max(north, y);
      }
      areas.push({
        level: event.endsWith("warning") ? "warning" : "watch",
        event: p.event, rings, bounds: [west, south, east, north],
      });
    }
  }
  return areas;
}

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    // Include the boundary, including horizontal/vertical segments.
    const cross = (x - xi) * (yj - yi) - (y - yi) * (xj - xi);
    if (Math.abs(cross) < 1e-10 && x >= Math.min(xi, xj) && x <= Math.max(xi, xj) &&
      y >= Math.min(yi, yj) && y <= Math.max(yi, yj)) return true;
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function classifyLightning(longitude: number, latitude: number, areas: StormArea[]) {
  let match: StormArea | undefined;
  for (const area of areas) {
    const [west, south, east, north] = area.bounds;
    if (longitude < west || longitude > east || latitude < south || latitude > north) continue;
    if (!inRing(longitude, latitude, area.rings[0]) ||
      area.rings.slice(1).some((hole) => inRing(longitude, latitude, hole))) continue;
    match = area;
    if (area.level === "warning") break; // Red wins when watches and warnings overlap.
  }
  return { level: match?.level ?? "normal" as LightningLevel, event: match?.event ?? null };
}
