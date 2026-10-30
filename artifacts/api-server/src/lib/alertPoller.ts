import { db, seenAlertsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { logger } from "./logger";
import {
  fetchAlerts,
  isHighPriority,
  CHECK_INTERVAL_SECONDS,
  type ParsedAlert,
} from "./weatherGov";
import { sendDiscordAlert } from "./discord";

let lastCheckAt: string | null = null;
let totalAlertsSeen = 0;
let pollerInterval: ReturnType<typeof setInterval> | null = null;

export function getLastCheckAt(): string | null {
  return lastCheckAt;
}

export function getTotalAlertsSeen(): number {
  return totalAlertsSeen;
}

export async function runAlertCheck(): Promise<ParsedAlert[]> {
  try {
    const rawAlerts = await fetchAlerts();
    lastCheckAt = new Date().toISOString();

    if (rawAlerts.length === 0) {
      return [];
    }

    const alertIds = rawAlerts.map((a) => a.id);

    const existing = await db
      .select({ id: seenAlertsTable.id })
      .from(seenAlertsTable)
      .where(inArray(seenAlertsTable.id, alertIds));

    const existingIds = new Set(existing.map((r) => r.id));
    const newAlerts = rawAlerts.filter((a) => !existingIds.has(a.id));

    if (newAlerts.length > 0) {
      await db.insert(seenAlertsTable).values(
        newAlerts.map((a) => ({
          id: a.id,
          event: a.event,
          severity: a.severity,
          areaDesc: a.areaDesc,
          headline: a.headline,
          expires: a.expires,
          discordNotified: false,
        })),
      );

      totalAlertsSeen += newAlerts.length;
      logger.info({ count: newAlerts.length }, "New alerts detected");

      for (const alert of newAlerts) {
        if (isHighPriority(alert)) {
          const sent = await sendDiscordAlert(alert);
          if (sent) {
            await db
              .update(seenAlertsTable)
              .set({ discordNotified: true })
              .where(inArray(seenAlertsTable.id, [alert.id]));
          }
        }
      }
    }

    return rawAlerts.map((a) => ({
      ...a,
      isNew: !existingIds.has(a.id),
    }));
  } catch (err) {
    logger.error({ err }, "Alert check failed");
    return [];
  }
}

export async function startPoller(): Promise<void> {
  logger.info({ intervalSeconds: CHECK_INTERVAL_SECONDS }, "Starting alert poller");

  await runAlertCheck();

  pollerInterval = setInterval(
    () => {
      runAlertCheck().catch((err) =>
        logger.error({ err }, "Poller interval error"),
      );
    },
    CHECK_INTERVAL_SECONDS * 1000,
  );
}

export function stopPoller(): void {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
  }
}
