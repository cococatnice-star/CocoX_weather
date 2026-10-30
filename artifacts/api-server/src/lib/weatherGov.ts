import { logger } from "./logger";

// All of Connecticut
export const ALERT_SOURCE_URL =
  "https://api.weather.gov/alerts/active?area=CT";

export const CHECK_INTERVAL_SECONDS = 1;

export interface RawAlert {
  id: string;
  properties: {
    event: string;
    headline: string | null;
    description: string | null;
    instruction: string | null;
    severity: string;
    urgency: string;
    certainty: string;
    areaDesc: string;
    onset: string | null;
    expires: string | null;
    effective: string | null;
    status: string;
    messageType: string;
    senderName: string | null;
  };
}

export interface ParsedAlert {
  id: string;
  event: string;
  headline: string | null;
  description: string | null;
  instruction: string | null;
  severity: string;
  urgency: string;
  certainty: string;
  areaDesc: string;
  onset: string | null;
  expires: string | null;
  effective: string | null;
  status: string;
  messageType: string;
  senderName: string | null;
  isNew: boolean;
}

export function isWarningOrWatch(alert: ParsedAlert): boolean {
  const event = alert.event.toLowerCase();
  return event.includes("warning") || event.includes("watch");
}

export function parseAlertFeature(feature: RawAlert): ParsedAlert {
  return {
    id: feature.id,
    event: feature.properties.event,
    headline: feature.properties.headline ?? null,
    description: feature.properties.description ?? null,
    instruction: feature.properties.instruction ?? null,
    severity: feature.properties.severity,
    urgency: feature.properties.urgency,
    certainty: feature.properties.certainty,
    areaDesc: feature.properties.areaDesc,
    onset: feature.properties.onset ?? null,
    expires: feature.properties.expires ?? null,
    effective: feature.properties.effective ?? null,
    status: feature.properties.status,
    messageType: feature.properties.messageType,
    senderName: feature.properties.senderName ?? null,
    isNew: false,
  };
}

export async function fetchAlerts(): Promise<ParsedAlert[]> {
  const response = await fetch(ALERT_SOURCE_URL, {
    headers: {
      "User-Agent": "CocoX-WeatherAlertTracker/1.0",
      Accept: "application/geo+json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `weather.gov API returned ${response.status}: ${response.statusText}`,
    );
  }

  const data = (await response.json()) as
    | { features: RawAlert[] }
    | (RawAlert & { type: "Feature" });

  let features: RawAlert[];

  if ("type" in data && data.type === "Feature") {
    features = [data as RawAlert];
  } else if (Array.isArray((data as { features: RawAlert[] }).features)) {
    features = (data as { features: RawAlert[] }).features;
  } else {
    logger.warn("Unexpected response shape from weather.gov");
    return [];
  }

  const allAlerts = features.map(parseAlertFeature);

  // Only return Warnings and Watches
  return allAlerts.filter(isWarningOrWatch);
}

// All returned alerts are already warnings/watches — send Discord for all new ones
export function isHighPriority(_alert: ParsedAlert): boolean {
  return true;
}
