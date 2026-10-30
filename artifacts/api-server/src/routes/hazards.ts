import { Router, type IRouter } from "express";
import {
  GetAlertMapQueryParams,
  GetAlertMapResponse,
  GetLocationAlertsQueryParams,
  GetLocationAlertsResponse,
  GetLightningResponse,
  GetWarningsQueryParams,
  GetWarningsResponse,
} from "@workspace/api-zod";
import { getHazardMap, getLocationAlerts } from "../lib/hazardMaps";
import { getLightning } from "../lib/lightning";
import { getWarnings } from "../lib/warnings";

const router: IRouter = Router();

router.get("/weather/warnings", async (req, res): Promise<void> => {
  const params = GetWarningsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: "Warning scope must be CT or US" });
    return;
  }
  try {
    res.json(GetWarningsResponse.parse(await getWarnings(params.data.scope)));
  } catch (error) {
    req.log.error({ err: error }, "Failed to fetch warning notifications feed");
    res.status(502).json({ error: "The selected area's NWS warning feed is temporarily unavailable" });
  }
});

router.get("/weather/alert-map", async (req, res): Promise<void> => {
  const params = GetAlertMapQueryParams.safeParse(req.query);
  if (
    !params.success ||
    params.data.west >= params.data.east ||
    params.data.south >= params.data.north
  ) {
    res.status(400).json({ error: "Provide valid west, south, east and north map bounds" });
    return;
  }
  try {
    res.json(GetAlertMapResponse.parse(await getHazardMap(params.data)));
  } catch (error) {
    req.log.error({ err: error }, "Failed to fetch NWS hazard polygons");
    res.status(502).json({ error: "Official NWS alert boundaries are temporarily unavailable" });
  }
});

router.get("/weather/location-alerts", async (req, res): Promise<void> => {
  const params = GetLocationAlertsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: "Provide a valid latitude and longitude" });
    return;
  }
  try {
    const { latitude, longitude } = params.data;
    res.json(GetLocationAlertsResponse.parse(await getLocationAlerts(latitude, longitude)));
  } catch (error) {
    req.log.error({ err: error }, "Failed to fetch location alerts");
    res.status(502).json({ error: "Official NWS alerts for this location are temporarily unavailable" });
  }
});

router.get("/weather/lightning", async (req, res): Promise<void> => {
  try {
    res.json(GetLightningResponse.parse(await getLightning()));
  } catch (error) {
    req.log.error({ err: error }, "Failed to fetch observed lightning");
    res.status(502).json({ error: "NOAA satellite lightning observations are temporarily unavailable" });
  }
});

export default router;
