import type { WarningFeed } from "@workspace/api-zod";
import { parseAlertFeature, type RawAlert } from "./weatherGov";

const cache = new Map<string, { data: WarningFeed; expires: number }>();
const inflight = new Map<string, Promise<WarningFeed>>();

export async function getWarnings(scope: "CT" | "US"): Promise<WarningFeed> {
  const previous = cache.get(scope);
  if (previous && previous.expires > Date.now()) return previous.data;
  const existing = inflight.get(scope);
  if (existing) return existing;

  const request = (async (): Promise<WarningFeed> => {
    let url: URL | null = new URL("https://api.weather.gov/alerts/active");
    url.searchParams.set("status", "actual");
    if (scope === "CT") url.searchParams.set("area", "CT");
    const warnings = new Map<string, ReturnType<typeof parseAlertFeature>>();
    let pages = 0;
    while (url) {
      if (++pages > 20) throw new Error("NWS warning pagination exceeded its safe limit");
      const response = await fetch(url, {
        headers: {
          "User-Agent": "CocoX-WeatherAlertTracker/1.0",
          Accept: "application/geo+json",
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`NWS warnings returned ${response.status}`);
      const collection = await response.json() as {
        features?: RawAlert[];
        pagination?: { next?: string };
      };
      if (!Array.isArray(collection.features)) throw new Error("Invalid NWS warning feed");
      for (const raw of collection.features) {
        const alert = parseAlertFeature(raw);
        if (
          alert.event.toLowerCase().includes("warning") &&
          alert.status.toLowerCase() === "actual" &&
          alert.messageType.toLowerCase() !== "cancel" &&
          (!alert.expires || Date.parse(alert.expires) > Date.now())
        ) warnings.set(alert.id, alert);
      }
      const next: URL | null = collection.pagination?.next
        ? new URL(collection.pagination.next)
        : null;
      if (next && (
        next.protocol !== "https:" || next.hostname !== "api.weather.gov" ||
        !next.pathname.startsWith("/alerts")
      )) throw new Error("Unexpected NWS pagination URL");
      url = next;
    }
    const result: WarningFeed = {
      scope,
      checkedAt: new Date().toISOString(),
      warnings: [...warnings.values()],
    };
    cache.set(scope, { data: result, expires: Date.now() + 10000 });
    return result;
  })();
  inflight.set(scope, request);
  try {
    return await request;
  } finally {
    inflight.delete(scope);
  }
}
