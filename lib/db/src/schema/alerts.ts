import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const seenAlertsTable = pgTable("seen_alerts", {
  id: text("id").primaryKey(),
  event: text("event").notNull(),
  severity: text("severity").notNull(),
  areaDesc: text("area_desc").notNull(),
  headline: text("headline"),
  firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
  discordNotified: boolean("discord_notified").default(false).notNull(),
  expires: text("expires"),
});

export type SeenAlert = typeof seenAlertsTable.$inferSelect;
export type InsertSeenAlert = typeof seenAlertsTable.$inferInsert;
