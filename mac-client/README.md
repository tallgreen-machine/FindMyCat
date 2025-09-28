# FindMyCat Mac Client

This Python script runs on your Mac to monitor Apple's Find My cache and send location updates to the FindMyCat web server.

## Requirements

- macOS with Find My enabled
- Python 3.7+
- `requests` library

## Installation

1. Install Python dependencies:
```bash
pip install requests
```

2. Make the script executable:
```bash
chmod +x findmycat_client.py
```

## Usage

### Basic usage (connects to localhost:3001):
```bash
python3 findmycat_client.py
```

### Connect to remote server:
```bash
python3 findmycat_client.py --server http://your-server.com:3001
```

### Test connection and run once:
```bash
python3 findmycat_client.py --test
```

### Custom polling interval:
```bash
python3 findmycat_client.py --interval 5  # Check every 5 seconds
```

### Verbose logging:
```bash
python3 findmycat_client.py --verbose
```

## Command Line Options

- `--server URL`: Web server URL (default: http://localhost:3001)
- `--test`: Test connection and run once, then exit
- `--interval N`: Polling interval in seconds (default: 10)
- `--verbose`: Enable verbose logging

## How It Works

1. The script monitors Apple's Find My cache file at `~/Library/Caches/com.apple.findmy.fmipcore/Items.data`
2. When the cache is updated, it extracts AirTag location data
3. New locations are sent to the web server via HTTP API
4. The web server broadcasts updates to connected browsers via WebSocket

## Logs

The script creates a log file `findmycat_client.log` in the same directory, and also outputs to the console.

## Troubleshooting

### "Find My cache file not found"
- Make sure Find My is enabled in System Preferences
- Ensure you're logged into iCloud
- Check that you have AirTags set up and they've reported at least once

### "Cannot connect to server"
- Verify the server URL is correct
- Make sure the FindMyCat backend server is running
- Check firewall settings if connecting to remote server

### Permission errors
- The script needs read access to the Find My cache file
- Run with appropriate permissions or grant Terminal/script full disk access in System Preferences > Security & Privacy

## Security Notes

- The script only reads location data locally from Apple's cache
- Data is sent to your specified server only
- No data is sent to third parties
- Consider using HTTPS for remote server connections