import { logger } from "./logger";
import type { ParsedAlert } from "./weatherGov";

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = "1506735214943142069";

function severityColor(severity: string): number {
  switch (severity.toLowerCase()) {
    case "extreme":
      return 0xff2200;
    case "severe":
      return 0xff6600;
    case "moderate":
      return 0xffaa00;
    case "minor":
      return 0xffcc44;
    default:
      return 0xff8800;
  }
}

export function isDiscordConfigured(): boolean {
  return !!BOT_TOKEN;
}

export async function sendDiscordAlert(alert: ParsedAlert): Promise<boolean> {
  if (!BOT_TOKEN) {
    logger.warn("DISCORD_BOT_TOKEN not set, skipping notification");
    return false;
  }

  const embed = {
    title: alert.event,
    description: alert.headline ?? alert.description ?? "No details available.",
    color: severityColor(alert.severity),
    fields: [
      { name: "Area", value: alert.areaDesc, inline: false },
      { name: "Severity", value: alert.severity, inline: true },
      { name: "Urgency", value: alert.urgency, inline: true },
      { name: "Certainty", value: alert.certainty, inline: true },
      ...(alert.onset
        ? [
            {
              name: "Onset",
              value: new Date(alert.onset).toLocaleString(),
              inline: true,
            },
          ]
        : []),
      ...(alert.expires
        ? [
            {
              name: "Expires",
              value: new Date(alert.expires).toLocaleString(),
              inline: true,
            },
          ]
        : []),
    ],
    footer: {
      text: `Sender: ${alert.senderName ?? "NWS"} • CocoX Weather Alert Tracker`,
    },
    timestamp: new Date().toISOString(),
  };

  try {
    const res = await fetch(
      `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ embeds: [embed] }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      logger.error(
        { status: res.status, body },
        "Failed to send Discord notification",
      );
      return false;
    }

    logger.info(
      { alertId: alert.id, event: alert.event, channelId: CHANNEL_ID },
      "Discord notification sent",
    );
    return true;
  } catch (err) {
    logger.error({ err }, "Error sending Discord notification");
    return false;
  }
}
