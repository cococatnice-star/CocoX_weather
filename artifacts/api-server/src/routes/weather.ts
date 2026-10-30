import { Router, type IRouter } from "express";

const router: IRouter = Router();
const FORECAST_URL =
  "https://api.weather.gov/gridpoints/OKX/66,75/forecast/hourly";
const CACHE_MS = 10 * 60 * 1000;

interface NwsHourlyPeriod {
  startTime: string;
  endTime: string;
  temperature: number;
  temperatureUnit: string;
  shortForecast: string;
  windSpeed: string;
  windDirection: string;
  probabilityOfPrecipitation?: { value: number | null };
}

interface NwsHourlyResponse {
  properties?: {
    updated?: string;
    generatedAt?: string;
    periods?: NwsHourlyPeriod[];
  };
}

interface ForecastPayload {
  location: string;
  source: string;
  updatedAt: string | null;
  periods: Array<{
    startTime: string;
    endTime: string;
    temperature: number;
    temperatureUnit: string;
    shortForecast: string;
    windSpeed: string;
    windDirection: string;
    precipitationProbability: number | null;
  }>;
}

let cachedForecast: ForecastPayload | null = null;
let cacheExpiresAt = 0;
const outlookCache = new Map<
  number,
  { data: Record<string, unknown>; expiresAt: number }
>();

router.get("/weather/outlook/:day", async (req, res): Promise<void> => {
  const day = Number(req.params.day);
  if (day !== 1 && day !== 2) {
    res.status(400).json({ error: "Outlook day must be 1 or 2" });
    return;
  }

  const cached = outlookCache.get(day);
  if (cached && Date.now() < cached.expiresAt) {
    res.json(cached.data);
    return;
  }

  try {
    const response = await fetch(
      `https://www.spc.noaa.gov/products/outlook/day${day}otlk_cat.lyr.geojson`,
      {
        headers: { "User-Agent": "CocoX-WeatherAlertTracker/1.0" },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) {
      throw new Error(`SPC outlook API returned ${response.status}`);
    }
    const collection = (await response.json()) as Record<string, unknown>;
    if (
      collection.type !== "FeatureCollection" ||
      !Array.isArray(collection.features)
    ) {
      throw new Error("SPC returned an invalid outlook FeatureCollection");
    }
    outlookCache.set(day, {
      data: collection,
      expiresAt: Date.now() + CACHE_MS,
    });
    res.json(collection);
  } catch (error) {
    req.log.error({ err: error, day }, "Failed to fetch SPC outlook");
    res.status(502).json({ error: `Unable to fetch the SPC Day ${day} outlook` });
  }
});

router.get("/weather/forecast", async (req, res): Promise<void> => {
  if (cachedForecast && Date.now() < cacheExpiresAt) {
    res.json(cachedForecast);
    return;
  }

  try {
    const response = await fetch(FORECAST_URL, {
      signal: AbortSignal.timeout(15000),
      headers: {
        "User-Agent": "CocoX-WeatherAlertTracker/1.0",
        Accept: "application/geo+json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `weather.gov forecast API returned ${response.status}: ${response.statusText}`,
      );
    }

    const data = (await response.json()) as NwsHourlyResponse;
    const properties = data.properties;
    if (!properties || !Array.isArray(properties.periods)) {
      throw new Error("weather.gov returned an unexpected hourly forecast");
    }

    const now = Date.now();
    const periods = properties.periods
      .filter((period) => new Date(period.endTime).getTime() > now)
      .slice(0, 48)
      .map((period) => ({
        startTime: period.startTime,
        endTime: period.endTime,
        temperature: period.temperature,
        temperatureUnit: period.temperatureUnit,
        shortForecast: period.shortForecast,
        windSpeed: period.windSpeed,
        windDirection: period.windDirection,
        precipitationProbability:
          period.probabilityOfPrecipitation?.value ?? null,
      }));

    if (periods.length < 48) {
      throw new Error(
        `weather.gov returned only ${periods.length} future hourly periods`,
      );
    }

    const payload: ForecastPayload = {
      location: "Connecticut · New Haven reference point",
      source: "National Weather Service",
      updatedAt: properties.updated ?? properties.generatedAt ?? null,
      periods,
    };
    cachedForecast = payload;
    cacheExpiresAt = Date.now() + CACHE_MS;
    res.json(payload);
  } catch (error) {
    req.log.error({ err: error }, "Failed to fetch hourly forecast");
    res.status(502).json({ error: "Unable to fetch the Connecticut forecast" });
  }
});

export default router;
