import os
import json
import csv
import time
from datetime import datetime
import folium

# --- Config ---
DB_PATH = os.path.expanduser(
    "~/Library/Caches/com.apple.findmy.fmipcore/Items.data"
)
LOG_FILE = "airtag_history.csv"
MAP_FILE = "airtag_map.html"
POLL_INTERVAL = 10  # seconds

# ✅ Reliable PNGs (replace with your own local PNGs later)
CAT_HEAD_ICON = "https://cdn-icons-png.flaticon.com/512/616/616408.png"
CAT_PAW_ICON  = "https://cdn-icons-png.flaticon.com/512/616/616408.png"

# Track cache state
last_mtime = None
last_seen = {}

def fetch_locations():
    """Read JSON cache and return list of (device_id, lat, lon, ts, iso_time)."""
    with open(DB_PATH, "r") as f:
        data = json.load(f)

    items = data if isinstance(data, list) else data.get("items", [])
    rows = []

    for it in items:
        dev = it.get("id") or it.get("identifier") or "unknown"
        loc = it.get("location") or {}

        # Skip safeLocations & stale pings
        if loc.get("positionType") == "safeLocation":
            continue
        if loc.get("isOld", False):
            continue

        ts = loc.get("timeStamp")
        lat = loc.get("latitude")
        lon = loc.get("longitude")
        if ts is None or lat is None or lon is None:
            continue

        iso = datetime.fromtimestamp(ts/1000).isoformat()
        rows.append((dev, lat, lon, ts, iso))

    return rows

def log_locations(rows):
    """Print status every cycle, log to CSV only if new."""
    for dev, lat, lon, ts, iso in rows:
        prev = last_seen.get(dev, 0)
        if ts > prev:
            # new location → write + update state
            with open(LOG_FILE, "a", newline="") as f:
                writer = csv.writer(f)
                writer.writerow([dev, lat, lon, iso])
            last_seen[dev] = ts
            print(f"[NEW] {dev} @ {lat:.6f},{lon:.6f} {iso}")
            generate_map()
        else:
            # not new → just print status
            print(f"[OLD] {dev} still at {lat:.6f},{lon:.6f} {iso}")

def generate_map():
    """Map with cat head for latest, last 10 paws, older faded paws (smaller)."""
    if not os.path.exists(LOG_FILE):
        return
    with open(LOG_FILE, "r") as f:
        reader = csv.DictReader(f)
        points = list(reader)
    if not points:
        return

    # Sort oldest → newest
    points.sort(key=lambda r: r["Timestamp"])
    last = points[-1]
    n = len(points)

    m = folium.Map(location=[float(last["Latitude"]), float(last["Longitude"])],
                   zoom_start=14)

    for idx, row in enumerate(points):
        lat = float(row["Latitude"])
        lon = float(row["Longitude"])
        ts = row["Timestamp"]

        if idx == n - 1:
            # Most recent → cat head
            icon = folium.CustomIcon(CAT_HEAD_ICON, icon_size=(40, 40))
            popup = f"🐱 Latest @ {ts}"
        elif idx >= n - 10:
            # Last 10 → paw print (normal size)
            icon = folium.CustomIcon(CAT_PAW_ICON, icon_size=(28, 28))
            popup = f"🐾 Recent @ {ts}"
        else:
            # Older → small paw (simulate fading)
            icon = folium.CustomIcon(CAT_PAW_ICON, icon_size=(16, 16))
            popup = f"🐾 Old @ {ts}"

        folium.Marker(
            [lat, lon],
            popup=popup,
            tooltip=row["DeviceID"],
            icon=icon
        ).add_to(m)

    m.save(MAP_FILE)

def main():
    global last_mtime
    print(f"Logging AirTag live locations every {POLL_INTERVAL}s...")
    while True:
        try:
            mtime = os.path.getmtime(DB_PATH)
            if last_mtime is None or mtime > last_mtime:
                last_mtime = mtime
                rows = fetch_locations()
                log_locations(rows)
            else:
                print("[WAIT] No cache update yet.")
            time.sleep(POLL_INTERVAL)
        except KeyboardInterrupt:
            print("\nStopped by user.")
            break

if __name__ == "__main__":
    if not os.path.exists(LOG_FILE):
        with open(LOG_FILE, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["DeviceID", "Latitude", "Longitude", "Timestamp"])
    main()
