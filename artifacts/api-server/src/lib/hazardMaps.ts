import type {
  AlertMap,
  GetAlertMapParams,
  LocationAlerts,
  WeatherAlert,
} from "@workspace/api-zod";

const NWS_HEADERS = {
  "User-Agent": "CocoX-WeatherAlertTracker/1.0",
  Accept: "application/geo+json",
};
const mapCache = new Map<string, { data: AlertMap; expires: number }>();
const pointCache = new Map<string, { data: LocationAlerts; expires: number }>();
const mapRequests = new Map<string, Promise<AlertMap>>();
const pointRequests = new Map<string, Promise<LocationAlerts>>();
interface NwsHazardCollection {
  type?: string;
  exceededTransferLimit?: boolean;
  features?: {
    geometry: AlertMap["features"][number]["geometry"] | null;
    properties: {
      objectid: number;
      prod_type: string;
      cap_id?: string;
      onset?: string;
      expiration?: string;
      ends?: string;
      wfo?: string;
    };
  }[];
}

function colorFor(event: string): string {
  const name = event.toLowerCase();
  if (name.includes("tornado warning")) return "#ff0000";
  if (name.includes("severe thunderstorm warning")) return "#ffa500";
  if (name.includes("flash flood warning")) return "#00cc33";
  if (name.includes("tornado watch")) return "#ff6666";
  if (name.includes("severe thunderstorm watch")) return "#db7093";
  if (name.includes("freeze watch")) return "#00cccc";
  if (name.includes("freeze warning")) return "#483d8b";
  if (name.includes("flood")) return "#2e8b57";
  if (name.includes("winter") || name.includes("snow")) return "#7b68ee";
  if (name.includes("gale") || name.includes("craft")) return "#c78bbc";
  if (name.includes("warning")) return "#f26a1b";
  if (name.includes("watch")) return "#e4bd21";
  return "#798ba5";
}

function boundedSet<T>(
  cache: Map<string, T>,
  key: string,
  value: T,
): void {
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(key, value);
}

export async function getHazardMap(bounds: GetAlertMapParams): Promise<AlertMap> {
  // Round outwards: panning slightly reuses a cached area without losing edges.
  const box = [
    Math.floor(bounds.west * 5) / 5,
    Math.floor(bounds.south * 5) / 5,
    Math.ceil(bounds.east * 5) / 5,
    Math.ceil(bounds.north * 5) / 5,
  ].join(",");
  const cached = mapCache.get(box);
  if (cached && cached.expires > Date.now()) return cached.data;
  const existing = mapRequests.get(box);
  if (existing) return existing;

  const request = (async (): Promise<AlertMap> => {
    const url = new URL(
      "https://mapservices.weather.noaa.gov/eventdriven/rest/services/WWA/watch_warn_adv/MapServer/1/query",
    );
    url.search = new URLSearchParams({
      where: "1=1",
      outFields: "objectid,prod_type,cap_id,onset,expiration,ends,wfo",
      geometry: box,
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outSR: "4326",
      resultRecordCount: "1000",
      f: "geojson",
    }).toString();
    const response = await fetch(url, {
      headers: NWS_HEADERS,
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`NWS map returned ${response.status}`);
    const raw = await response.json() as NwsHazardCollection;
    if (raw.type !== "FeatureCollection" || !Array.isArray(raw.features)) {
      throw new Error("NWS map returned an invalid FeatureCollection");
    }
    const features: AlertMap["features"] = [];
    for (const feature of raw.features) {
      const p = feature.properties;
      if (
        !p?.prod_type ||
        !feature.geometry ||
        !["Polygon", "MultiPolygon"].includes(feature.geometry.type)
      ) continue;
      const expires = p.ends || p.expiration || null;
      if (expires && Date.parse(expires) <= Date.now()) continue;
      const id = String(p.cap_id || p.objectid);
      features.push({
        type: "Feature",
        id: `${id}:${p.objectid}`,
        geometry: feature.geometry,
        properties: {
          id,
          event: p.prod_type,
          color: colorFor(p.prod_type),
          onset: p.onset || null,
          expires,
          office: p.wfo || null,
        },
      });
    }
    const result: AlertMap = {
      type: "FeatureCollection",
      features,
      checkedAt: new Date().toISOString(),
      source: "NOAA / National Weather Service active hazard areas",
      truncated: Boolean(raw.exceededTransferLimit) || raw.features.length >= 1000,
    };
    boundedSet(mapCache, box, { data: result, expires: Date.now() + 30000 });
    return result;
  })();
  mapRequests.set(box, request);
  try {
    return await request;
  } finally {
    mapRequests.delete(box);
  }
}

export async function getLocationAlerts(
  latitude: number,
  longitude: number,
): Promise<LocationAlerts> {
  const point = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  const cached = pointCache.get(point);
  if (cached && cached.expires > Date.now()) return cached.data;
  const existing = pointRequests.get(point);
  if (existing) return existing;
  const request = (async (): Promise<LocationAlerts> => {
    const url = new URL("https://api.weather.gov/alerts/active");
    url.search = new URLSearchParams({ point, status: "actual" }).toString();
    const response = await fetch(url, {
      headers: NWS_HEADERS,
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`NWS location alerts returned ${response.status}`);
    const raw = await response.json() as {
      features?: { id: string; properties: Record<string, unknown> }[];
    };
    if (!Array.isArray(raw.features)) throw new Error("Invalid NWS alert response");
    const alerts: WeatherAlert[] = raw.features.map(
      (feature: { id: string; properties: Record<string, unknown> }) => {
        const p = feature.properties;
        return {
          id: feature.id,
          event: String(p.event ?? "Weather alert"),
          headline: typeof p.headline === "string" ? p.headline : null,
          description: typeof p.description === "string" ? p.description : null,
          instruction: typeof p.instruction === "string" ? p.instruction : null,
          severity: String(p.severity ?? "Unknown"),
          urgency: String(p.urgency ?? "Unknown"),
          certainty: String(p.certainty ?? "Unknown"),
          areaDesc: String(p.areaDesc ?? ""),
          onset: typeof p.onset === "string" ? p.onset : null,
          expires: typeof p.expires === "string" ? p.expires : null,
          effective: typeof p.effective === "string" ? p.effective : null,
          status: String(p.status ?? "Actual"),
          messageType: String(p.messageType ?? "Alert"),
          senderName: typeof p.senderName === "string" ? p.senderName : null,
          isNew: false,
        };
      },
    );
    const result: LocationAlerts = {
      latitude,
      longitude,
      checkedAt: new Date().toISOString(),
      alerts,
    };
    boundedSet(pointCache, point, { data: result, expires: Date.now() + 30000 });
    return result;
  })();
  pointRequests.set(point, request);
  try {
    return await request;
  } finally {
    pointRequests.delete(point);
  }
}
