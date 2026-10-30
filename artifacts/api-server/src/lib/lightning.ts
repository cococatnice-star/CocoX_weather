import * as h5 from "h5wasm/node";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LightningFeed, LightningFlash } from "@workspace/api-zod";

const BUCKET = "https://noaa-goes19.s3.amazonaws.com";
const WINDOW_MS = 5 * 60 * 1000;
const files = new Map<string, { through: number; flashes: LightningFlash[] }>();
let cached: LightningFeed | null = null;
let cacheUntil = 0;
let pending: Promise<LightningFeed> | null = null;
let failureUntil = 0;

function hourPrefix(time: number): string {
  const date = new Date(time);
  const year = date.getUTCFullYear();
  const day = Math.floor(
    (time - Date.UTC(year, 0, 1)) / (24 * 60 * 60 * 1000),
  ) + 1;
  return `GLM-L2-LCFA/${year}/${String(day).padStart(3, "0")}/${String(date.getUTCHours()).padStart(2, "0")}/`;
}

async function listFiles(time: number): Promise<string[]> {
  const url = new URL(BUCKET);
  url.search = new URLSearchParams({
    "list-type": "2",
    prefix: hourPrefix(time),
    "max-keys": "1000",
  }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`NOAA GLM listing returned ${response.status}`);
  const xml = await response.text();
  return [...xml.matchAll(/<Key>([^<]+\.nc)<\/Key>/g)].map((match) => match[1]);
}

function attributeNumber(dataset: h5.Dataset, key: string, fallback: number): number {
  const value = dataset.attrs[key]?.value;
  if (value == null) return fallback;
  const number = typeof value === "number"
    ? value
    : Number((value as ArrayLike<number>)[0]);
  return Number.isFinite(number) ? number : fallback;
}

function numbers(dataset: h5.Dataset): number[] {
  const values = dataset.value as ArrayLike<number>;
  const scale = attributeNumber(dataset, "scale_factor", 1);
  const offset = attributeNumber(dataset, "add_offset", 0);
  const fill = attributeNumber(dataset, "_FillValue", NaN);
  const unsigned = dataset.attrs._Unsigned?.value === "true";
  return Array.from(values, (value) => {
    if (value === fill) return NaN;
    // NetCDF packs unsigned 16-bit offsets in a signed HDF5 dataset.
    const decoded = unsigned && value < 0 ? value + 65536 : value;
    return decoded * scale + offset;
  });
}

async function readProduct(key: string): Promise<void> {
  if (files.has(key)) return;
  const response = await fetch(`${BUCKET}/${key}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`NOAA GLM product returned ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 10 * 1024 * 1024) throw new Error("GLM product exceeds expected size");
  await h5.ready;
  const directory = await mkdtemp(join(tmpdir(), "cocox-glm-"));
  const path = join(directory, "observations.nc");
  let file: h5.File | undefined;
  try {
    await writeFile(path, bytes);
    file = new h5.File(path, "r");
    const start = Date.parse(String(file.attrs.time_coverage_start?.value));
    const through = Date.parse(String(file.attrs.time_coverage_end?.value));
    if (!Number.isFinite(start) || !Number.isFinite(through)) {
      throw new Error("GLM product has invalid observation times");
    }
    const latitudes = numbers(file.get("flash_lat") as h5.Dataset);
    const longitudes = numbers(file.get("flash_lon") as h5.Dataset);
    const ids = numbers(file.get("flash_id") as h5.Dataset);
    const times = numbers(file.get("flash_time_offset_of_first_event") as h5.Dataset);
    const quality = numbers(file.get("flash_quality_flag") as h5.Dataset);
    const flashes: LightningFlash[] = [];
    for (let i = 0; i < latitudes.length; i++) {
      const latitude = latitudes[i];
      const longitude = longitudes[i];
      const observed = start + times[i] * 1000;
      if (
        quality[i] !== 0 ||
        !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        !Number.isFinite(observed) ||
        latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
      ) continue;
      flashes.push({
        id: `${key.split("/").at(-1)}:${ids[i]}`,
        latitude,
        longitude,
        time: new Date(observed).toISOString(),
      });
    }
    files.set(key, { through, flashes });
  } finally {
    file?.close();
    await rm(directory, { recursive: true, force: true });
  }
}

async function refresh(): Promise<LightningFeed> {
  const now = Date.now();
  const keys = await listFiles(now);
  // Cover hour/day/year rollovers and delayed publication near the hour.
  if (keys.length < 16) keys.unshift(...await listFiles(now - 60 * 60 * 1000));
  const latest = [...new Set(keys)].sort().slice(-16);
  if (!latest.length) throw new Error("No current NOAA GLM products published");
  const missing = latest.filter((key) => !files.has(key));
  // Bound downloads; HDF5 parsing is synchronous and files are closed immediately.
  for (let i = 0; i < missing.length; i += 4) {
    await Promise.all(missing.slice(i, i + 4).map(readProduct));
  }
  for (const [key, value] of files) {
    if (value.through < now - WINDOW_MS - 60000) files.delete(key);
  }
  const products = [...files.values()];
  const through = Math.max(...products.map((product) => product.through));
  if (!Number.isFinite(through) || now - through > 3 * 60 * 1000) {
    throw new Error("NOAA GLM observations are more than three minutes old");
  }
  const windowStart = Date.now() - WINDOW_MS;
  const flashes = products
    .flatMap((product) => product.flashes)
    .filter((flash) => Date.parse(flash.time) >= windowStart)
    .sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  return {
    source: "NOAA GOES-19 GLM · satellite-observed lightning flash centroids",
    fetchedAt: new Date().toISOString(),
    dataThrough: new Date(through).toISOString(),
    windowStart: new Date(windowStart).toISOString(),
    latencySeconds: Math.max(0, Math.round((Date.now() - through) / 1000)),
    flashes,
  };
}

export async function getLightning(): Promise<LightningFeed> {
  if (cached && Date.now() < cacheUntil) {
    return {
      ...cached,
      latencySeconds: Math.max(0, Math.round(
        (Date.now() - Date.parse(cached.dataThrough)) / 1000,
      )),
    };
  }
  if (pending) return pending;
  if (Date.now() < failureUntil) throw new Error("NOAA lightning feed temporarily unavailable");
  pending = refresh();
  try {
    cached = await pending;
    cacheUntil = Date.now() + 15000;
    return cached;
  } catch (error) {
    failureUntil = Date.now() + 5000;
    throw error;
  } finally {
    pending = null;
  }
}
