# CocoX Weather Alert Tracker — local setup

This is the editable React + TypeScript website and Express API, not a .NET
solution or a compiled Windows executable. Open the extracted folder in VS Code
or use **Open a local folder** in Visual Studio.

## Requirements

- Node.js 22.15 or newer
- pnpm 10 (`npm install -g pnpm@10`)
- A PostgreSQL database you control
- Internet access for NOAA/NWS alerts, lightning observations, map tiles, and radar

## Start on Windows, macOS, or Linux

1. Open a terminal in this folder and run:

   ```text
   pnpm install --filter @workspace/weather-tracker... --filter @workspace/api-server...
   ```
2. Create a local `.env` file in this folder with your own database connection:

   ```text
   DATABASE_URL=postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/weather_tracker
   ```

   Create that empty database in PostgreSQL first. No credentials or database
   contents are included in this archive. Do not commit your `.env` file.
3. Run `node scripts/start-weather-local.mjs --setup-db`.
   This creates the application's tables in the database you configured.
4. Run `node scripts/start-weather-local.mjs`.
5. Open **http://localhost:5173**. Press Ctrl+C to stop both services.

## Included features

- Connecticut NWS warnings/watches, checked every 10 seconds
- Original warning/watch sound assets included; warning sounds are configured
  under **Settings** (the default sound is the original warning siren)
- Interactive, animated RainViewer radar with frame slider and zoom
- NWS hourly forecast summaries for the next 24 hours and hours 24–48,
  using New Haven as the Connecticut reference point
- Responsive liquid-glass interface and existing system-status screen
- Orange CocoX map-first workspace with floating weather panels
- Your supplied CocoX Weather cat logo in the app header and settings
- Smooth radar playback with buffered frames and cross-fades instead of
  destroying/reloading the map layer at every time step
- Browser warning notifications and sound settings: Connecticut only or all
  United States NWS warnings, a custom MP3 (up to 10 MB), volume, preview,
  and reset to the default sound
- Official SPC Day 1 and Day 2 categorical severe-weather outlook map overlays
- Official NWS warning/watch/advisory outlines following the visible map,
  refreshed every 30 seconds
- Click any outlined area or city on the map to read all active NWS alerts
  at that location, including the affected area and safety instructions
- Actual NOAA GOES-19 satellite lightning flash observations, refreshed every
  20 seconds, with observation times and a rolling five-minute display

Alert outlines follow official storm, county, and forecast-zone boundaries,
not necessarily city limits. State/city borders and labels come from the basemap.
The map's original Connecticut alert list stays Connecticut-only. The separate
warning notification/sound monitor follows your selected area in Settings;
“Everywhere” means the United States covered by the NWS, not worldwide.

Enable notifications explicitly in Settings and accept the browser permission
prompt. If an embedded preview blocks permission, use **Open in new tab**.
Notifications work while the app is open, including a background tab; closing
the app stops checks. Browser power-saving can delay background checks. This is
not a push notification subscription for closed tabs. Active warnings are
delivered once, then newly issued warning IDs are checked every 10 seconds.
Watches and advisories are not notification triggers.

Settings and the chosen MP3 stay in this browser on this device, using local
browser storage. They are not uploaded or shared with other visitors and are
not included in this ZIP. Browser storage clearing removes them. Test sound
once each session to allow audio playback; previews last up to 8 seconds and
warning playback is limited to 30 seconds. Notification display is silent
unless you enable the configured warning sound.

Lightning markers are satellite-observed flash centroids, including in-cloud
lightning. They are not precise ground-strike locations. The display shows data
age and reports stale/unavailable feeds. The NOAA GLM products are decoded by
the API using WebAssembly; no Python installation or paid lightning key is needed.

Radar frames typically arrive every 10 minutes. They are near-real-time images,
not second-by-second measurements. Forecasts refresh every 10 minutes. The
tracker is supplementary, not a lightning safety alarm; use official NWS/local
emergency channels for safety.

Discord is optional and disabled without a bot token. The original repository's
Discord channel setting is retained in the API source. Review it before enabling
Discord notifications.

## Checks

```text
pnpm --filter @workspace/weather-tracker typecheck
pnpm --filter @workspace/api-server typecheck
pnpm --filter @workspace/weather-tracker build
```

The downloadable archive uses portable pnpm settings instead of Replit's
Linux-only native-package exclusions. A lockfile is intentionally omitted so
pnpm can resolve the correct native packages for your operating system.
