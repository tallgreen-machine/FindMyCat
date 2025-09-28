#!/usr/bin/env python3
"""
Import historical locations from a CSV into the FindMyCat backend.

CSV format (header required):
DeviceID,Latitude,Longitude,Timestamp

Usage:
  python3 import_csv.py --server https://findmycat.goldmansoap.com/findmy --file sample_history.csv --batch 100
"""

import argparse
import csv
import logging
import os
from typing import List, Dict, Tuple, Set
import requests


DEFAULT_SERVER_URL = "https://findmycat.goldmansoap.com/findmy"
DEFAULT_BATCH_SIZE = 100

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def read_csv(file_path: str) -> List[Tuple[str, float, float, str]]:
    rows: List[Tuple[str, float, float, str]] = []
    with open(file_path, newline='') as csvfile:
        reader = csv.DictReader(csvfile)
        required = {"DeviceID", "Latitude", "Longitude", "Timestamp"}
        if set(reader.fieldnames or []) != required:
            # Allow any superset as long as required columns exist
            missing = required - set(reader.fieldnames or [])
            if missing:
                raise ValueError(f"Missing required CSV columns: {', '.join(missing)}")

        for row in reader:
            try:
                device_id = (row["DeviceID"] or "").strip()
                lat = float(row["Latitude"])
                lon = float(row["Longitude"])
                ts = (row["Timestamp"] or "").strip()
                if not device_id or not ts:
                    continue
                rows.append((device_id, lat, lon, ts))
            except Exception as e:
                logger.warning(f"Skipping bad row {row}: {e}")
    return rows


def dedupe_preserve_order(rows: List[Tuple[str, float, float, str]]) -> List[Tuple[str, float, float, str]]:
    seen: Set[Tuple[str, float, float, str]] = set()
    out: List[Tuple[str, float, float, str]] = []
    for r in rows:
        if r in seen:
            continue
        seen.add(r)
        out.append(r)
    return out


def to_payload(rows: List[Tuple[str, float, float, str]]) -> List[Dict]:
    return [
        {
            "deviceId": d,
            "latitude": lat,
            "longitude": lon,
            "timestamp": ts,
        }
        for (d, lat, lon, ts) in rows
    ]


def post_batch(server_url: str, batch: List[Dict]) -> Dict:
    url = server_url.rstrip('/') + "/api/locations/batch-update"
    resp = requests.post(url, json=batch, headers={"Content-Type": "application/json"}, timeout=60)
    if resp.status_code != 200:
        raise RuntimeError(f"Server error {resp.status_code}: {resp.text[:300]}")
    return resp.json()


def main():
    parser = argparse.ArgumentParser(description="Import CSV history into FindMyCat backend")
    parser.add_argument("--server", default=DEFAULT_SERVER_URL, help="Backend base URL (e.g., https://host/findmy)")
    parser.add_argument("--file", required=True, help="Path to CSV file")
    parser.add_argument("--batch", type=int, default=DEFAULT_BATCH_SIZE, help="Batch size (default 100)")

    args = parser.parse_args()

    if not os.path.exists(args.file):
        logger.error(f"CSV not found: {args.file}")
        raise SystemExit(1)

    logger.info(f"Reading CSV: {args.file}")
    rows = read_csv(args.file)
    logger.info(f"Read {len(rows)} rows")

    rows = dedupe_preserve_order(rows)
    logger.info(f"After dedupe: {len(rows)} unique rows")

    payload = to_payload(rows)

    total = 0
    new_total = 0
    for i in range(0, len(payload), args.batch):
        batch = payload[i:i+args.batch]
        try:
            res = post_batch(args.server, batch)
            total += res.get("processed", 0)
            new_total += res.get("newLocations", 0)
            logger.info(f"Batch {i//args.batch + 1}: processed={res.get('processed')} new={res.get('newLocations')}")
        except Exception as e:
            logger.error(f"Batch {i//args.batch + 1} failed: {e}")

    logger.info(f"Done. Processed={total}, New locations stored={new_total}")


if __name__ == "__main__":
    main()
