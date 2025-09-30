#!/usr/bin/env python3
"""
Test script to send sample location data to FindMyCat backend
"""

import requests
import json
import time
from datetime import datetime, timedelta
import random

# Configuration
SERVER_URL = "http://localhost:3001"
DEVICE_ID = "Whiskers-AirTag"

def send_location(lat, lon, timestamp=None):
    """Send a location update to the server"""
    if timestamp is None:
        timestamp = datetime.now().isoformat()
    
    payload = {
        "deviceId": DEVICE_ID,
        "latitude": lat,
        "longitude": lon,
        "timestamp": timestamp
    }
    
    try:
        response = requests.post(
            f"{SERVER_URL}/api/locations/update",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get("isNew"):
                print(f"✅ Sent new location: {lat:.6f}, {lon:.6f}")
            else:
                print(f"📍 Location already exists: {lat:.6f}, {lon:.6f}")
            return True
        else:
            print(f"❌ Error {response.status_code}: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Failed to send location: {e}")
        return False

def simulate_cat_movement():
    """Simulate a cat moving around a neighborhood"""
    # Starting location (San Francisco)
    base_lat = 37.7749
    base_lon = -122.4194
    
    # Simulate movement over the last few hours
    current_time = datetime.now() - timedelta(hours=2)
    
    print(f"🐱 Simulating {DEVICE_ID} movement...")
    print(f"📡 Server: {SERVER_URL}")
    
    for i in range(10):
        # Small random movements (within a few blocks)
        lat_offset = random.uniform(-0.002, 0.002)  # ~200m
        lon_offset = random.uniform(-0.002, 0.002)  # ~200m
        
        lat = base_lat + lat_offset
        lon = base_lon + lon_offset
        
        # Send location with timestamp from the past
        timestamp = (current_time + timedelta(minutes=i*15)).isoformat()
        
        send_location(lat, lon, timestamp)
        time.sleep(0.5)  # Brief pause between sends
    
    # Send current location
    final_lat = base_lat + random.uniform(-0.001, 0.001)
    final_lon = base_lon + random.uniform(-0.001, 0.001)
    send_location(final_lat, final_lon)
    
    print("✅ Simulation complete! Check the web app at http://localhost:3000")

def test_connection():
    """Test connection to the server"""
    try:
        response = requests.get(f"{SERVER_URL}/health")
        if response.status_code == 200:
            health = response.json()
            print(f"✅ Server is healthy: {health}")
            return True
        else:
            print(f"❌ Server health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Cannot connect to server: {e}")
        return False

if __name__ == "__main__":
    print("🧪 FindMyCat Test Client")
    print("=" * 40)
    
    if test_connection():
        simulate_cat_movement()
    else:
        print("\n💡 Make sure the backend server is running:")
        print("   cd backend && npm run dev")