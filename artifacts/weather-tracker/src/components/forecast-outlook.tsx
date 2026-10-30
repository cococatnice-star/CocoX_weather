import { useQuery } from "@tanstack/react-query";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Droplets,
  Sun,
  Thermometer,
  Wind,
} from "lucide-react";

interface ForecastPeriod {
  startTime: string;
  endTime: string;
  temperature: number;
  temperatureUnit: string;
  shortForecast: string;
  windSpeed: string;
  windDirection: string;
  precipitationProbability: number | null;
}

interface ForecastResponse {
  location: string;
  source: string;
  updatedAt: string | null;
  periods: ForecastPeriod[];
}

function chooseWeatherIcon(forecast: string) {
  const phrase = forecast.toLowerCase();
  if (/thunder|storm/.test(phrase)) return CloudLightning;
  if (/snow|sleet|ice/.test(phrase)) return CloudSnow;
  if (/rain|shower|drizzle/.test(phrase)) return CloudRain;
  if (/fog|haze/.test(phrase)) return CloudFog;
  if (/cloud|overcast/.test(phrase)) return Cloud;
  if (/sun|clear/.test(phrase)) return Sun;
  return CloudDrizzle;
}

function summarize(periods: ForecastPeriod[]) {
  const temperatures = periods
    .map((period) => period.temperature)
    .filter(Number.isFinite);
  const rainChances = periods
    .map((period) => period.precipitationProbability)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const phrases = new Map<string, number>();
  for (const period of periods) {
    phrases.set(
      period.shortForecast,
      (phrases.get(period.shortForecast) ?? 0) + 1,
    );
  }
  const summary =
    [...phrases.entries()].sort((first, second) => second[1] - first[1])[0]?.[0] ??
    "Forecast unavailable";
  const winds = periods.flatMap((period) =>
    (period.windSpeed.match(/\d+/g) ?? []).map(Number),
  );
  const mainWindDirection =
    periods.find((period) => period.windDirection)?.windDirection ?? "";

  return {
    summary,
    low: temperatures.length ? Math.min(...temperatures) : null,
    high: temperatures.length ? Math.max(...temperatures) : null,
    precipitationChance: rainChances.length ? Math.max(...rainChances) : null,
    wind:
      winds.length > 0
        ? `${mainWindDirection} up to ${Math.max(...winds)} mph`
        : "Wind unavailable",
    start: periods[0]?.startTime,
    end: periods.at(-1)?.endTime,
  };
}

function rangeLabel(start?: string, end?: string) {
  if (!start || !end) return "Forecast window unavailable";
  const formatTime = (value: string) =>
    new Date(value).toLocaleString([], {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  return `${formatTime(start)} – ${formatTime(end)}`;
}

function OutlookCard({
  title,
  periods,
}: {
  title: string;
  periods: ForecastPeriod[];
}) {
  const outlook = summarize(periods);
  const Icon = chooseWeatherIcon(outlook.summary);

  return (
    <article className="outlook-card">
      <div className="outlook-card-top">
        <div>
          <span className="outlook-period">{title}</span>
          <span className="outlook-window">
            {rangeLabel(outlook.start, outlook.end)}
          </span>
        </div>
        <Icon size={29} strokeWidth={1.7} aria-hidden="true" />
      </div>
      <p className="outlook-summary">{outlook.summary}</p>
      <div className="outlook-temperature">
        <Thermometer size={15} aria-hidden="true" />
        <span>
          {outlook.low === null || outlook.high === null
            ? "Temperature unavailable"
            : `${outlook.low}° – ${outlook.high}°F`}
        </span>
      </div>
      <div className="outlook-metrics">
        <span>
          <Droplets size={14} aria-hidden="true" />
          {outlook.precipitationChance === null
            ? "Precip. unavailable"
            : `${outlook.precipitationChance}% precip. chance`}
        </span>
        <span>
          <Wind size={14} aria-hidden="true" />
          {outlook.wind}
        </span>
      </div>
    </article>
  );
}

async function getForecast(): Promise<ForecastResponse> {
  const response = await fetch("/api/weather/forecast", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Forecast service returned ${response.status}`);
  }
  return (await response.json()) as ForecastResponse;
}

export function ForecastOutlook() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["weather", "outlook", "connecticut"],
    queryFn: getForecast,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    retry: 2,
  });

  const firstDay = data?.periods.slice(0, 24) ?? [];
  const secondDay = data?.periods.slice(24, 48) ?? [];
  const updatedAt = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <section className="glass-panel outlook-panel" aria-label="Two-day weather outlook">
      <div className="section-heading">
        <div>
          <p className="section-kicker">PLAN AHEAD</p>
          <h2>Next 48 hours</h2>
          <p className="section-description">
            {data?.location ?? "Connecticut · New Haven reference point"}
          </p>
        </div>
        <span className="feed-status">
          <span className="status-dot" />
          NWS
        </span>
      </div>

      {isPending && (
        <div className="outlook-state" role="status">
          Loading the National Weather Service outlook…
        </div>
      )}
      {isError && (
        <div className="outlook-state outlook-state--error" role="alert">
          <strong>Forecast temporarily unavailable</strong>
          <span>
            {error instanceof Error
              ? error.message
              : "The National Weather Service feed could not be reached."}
          </span>
        </div>
      )}
      {data && (
        <>
          {data.periods.length < 48 ? (
            <div className="outlook-state outlook-state--error" role="status">
              The NWS feed returned fewer than 48 future hours. The outlook will
              refresh automatically.
            </div>
          ) : (
            <div className="outlook-grid">
              <OutlookCard title="Next 24 hours" periods={firstDay} />
              <OutlookCard title="24–48 hours" periods={secondDay} />
            </div>
          )}
          <p className="outlook-source">
            National Weather Service
            {updatedAt ? ` · forecast updated ${updatedAt}` : ""}
          </p>
        </>
      )}
    </section>
  );
}
