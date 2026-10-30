import { Router, type IRouter } from "express";
import { db, seenAlertsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  GetAlertsResponse,
  GetAlertSummaryResponse,
  GetStatusResponse,
} from "@workspace/api-zod";
import {
  runAlertCheck,
  getLastCheckAt,
  getTotalAlertsSeen,
} from "../lib/alertPoller";
import { isDiscordConfigured } from "../lib/discord";
import {
  ALERT_SOURCE_URL,
  CHECK_INTERVAL_SECONDS,
} from "../lib/weatherGov";

const router: IRouter = Router();

router.get("/alerts", async (req, res): Promise<void> => {
  try {
    const alerts = await runAlertCheck();
    res.json(GetAlertsResponse.parse(alerts));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch alerts");
    res.status(500).json({ error: "Failed to fetch weather alerts" });
  }
});

router.get("/alerts/summary", async (req, res): Promise<void> => {
  try {
    const alerts = await runAlertCheck();

    const summary = {
      total: alerts.length,
      warnings: alerts.filter((a) =>
        a.event.toLowerCase().includes("warning"),
      ).length,
      watches: alerts.filter((a) => a.event.toLowerCase().includes("watch"))
        .length,
      advisories: alerts.filter((a) =>
        a.event.toLowerCase().includes("advisory"),
      ).length,
      emergencies: alerts.filter((a) =>
        a.event.toLowerCase().includes("emergency"),
      ).length,
      byEvent: alerts.reduce<Record<string, number>>((acc, a) => {
        acc[a.event] = (acc[a.event] ?? 0) + 1;
        return acc;
      }, {}),
    };

    res.json(GetAlertSummaryResponse.parse(summary));
  } catch (err) {
    req.log.error({ err }, "Failed to get alert summary");
    res.status(500).json({ error: "Failed to get alert summary" });
  }
});

router.get("/status", async (req, res): Promise<void> => {
  try {
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(seenAlertsTable);

    const dbTotal = countResult[0]?.count ?? 0;
    const memTotal = getTotalAlertsSeen();

    const status = {
      discordConfigured: isDiscordConfigured(),
      lastCheckAt: getLastCheckAt(),
      totalAlertsSeen: Math.max(dbTotal, memTotal),
      alertSourceUrl: ALERT_SOURCE_URL,
      checkIntervalSeconds: CHECK_INTERVAL_SECONDS,
    };

    res.json(GetStatusResponse.parse(status));
  } catch (err) {
    req.log.error({ err }, "Failed to get status");
    res.status(500).json({ error: "Failed to get status" });
  }
});

export default router;
