//
//  MainViewModel.swift
//  FindMyCatClient
//
//  Handles logic for FindMyCat macOS client
//

import Foundation
import SwiftUI
import CoreLocation

class MainViewModel: ObservableObject {
    // --- Config ---
    private let dbPath = (NSHomeDirectory() + "/Library/Caches/com.apple.findmy.fmipcore/Items.data")
    private var serverURL = URL(string: "https://findmycat.goldmansoap.com")!
    @Published var pollInterval: TimeInterval = 10
    private let batchSize = 10
    private var authToken: String? = nil // Loaded from config if available
    
    // Available polling intervals (in seconds)
    let availableIntervals: [(String, TimeInterval)] = [
        ("10 seconds", 10),
        ("30 seconds", 30),
        ("1 minute", 60),
        ("2 minutes", 120),
        ("5 minutes", 300),
        ("10 minutes", 600)
    ]
    
    // --- Location Upload Filter ---
    private let uploadFilter = LocationUploadFilter()
    
    @Published var connectionStatus: ConnectionStatus = .unknown
    @Published var lastUpdate: Date? = nil
    @Published var lastError: String? = nil
    @Published var devices: [DeviceLocation] = []
    @Published var log: String = ""
    @Published var isPaired: Bool = false
    @Published var pairedCode: String? = nil
    private var timer: Timer?
    private var lastLogTime: Date?
    
    var lastUpdateString: String {
        if let date = lastUpdate {
            let formatter = DateFormatter()
            formatter.dateStyle = .short
            formatter.timeStyle = .medium
            return formatter.string(from: date)
        }
        return "Never"
    }
    
    func start() {
        // Load saved config (token/server) if present
        loadConfigFromDisk()
        // Determine paired state from token
        self.isPaired = (authToken?.isEmpty == false)
        if !isPaired {
            appendLog("ℹ️ Not paired. Enter your pairing code above to pair with the server.")
        }
        // Debug: surface whether the Find My cache path exists when starting
        let exists = FileManager.default.fileExists(atPath: dbPath)
        print("FindMyCatClient: start() - dbPath: \(dbPath) exists: \(exists)")
        appendLog("DEBUG: start() - dbPath: \(dbPath) exists: \(exists)")

        if isPaired {
            startPolling()
        }
    }
    
    func poll() {
        guard isPaired else {
            appendLog("ℹ️ Not paired yet. Skipping network calls.")
            return
        }
        testConnection()
        fetchLocationsAndSend()
    }

    private func startPolling() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: pollInterval, repeats: true) { [weak self] _ in
            self?.poll()
        }
        appendLog("🔄 Polling started (every \(formatInterval(pollInterval)))")
        poll()
    }
    
    func updatePollingInterval(_ newInterval: TimeInterval) {
        pollInterval = newInterval
        if isPaired {
            appendLog("⏱️ Polling interval changed to \(formatInterval(newInterval))")
            startPolling() // Restart with new interval
        }
    }
    
    private func formatInterval(_ interval: TimeInterval) -> String {
        if interval < 60 {
            return "\(Int(interval))s"
        } else {
            let minutes = Int(interval / 60)
            return "\(minutes)m"
        }
    }

    func pair(with code: String) {
        appendLog("🔗 Pairing with server using code…")
        var request = URLRequest(url: serverURL.appendingPathComponent("api/pairing/claim"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let body: [String: Any] = ["code": code]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    self.appendLog("❌ Pairing error: \(error.localizedDescription)")
                    return
                }
                guard let http = response as? HTTPURLResponse else {
                    self.appendLog("❌ Pairing failed: no HTTP response")
                    return
                }
                let status = http.statusCode
                let bodyStr = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                if status != 200 {
                    self.appendLog("❌ Pairing failed (HTTP \(status)) \(bodyStr)")
                    return
                }
                // Parse JSON and extract token
                guard let data = data,
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let token = json["token"] as? String,
                      !token.isEmpty else {
                    self.appendLog("❌ Pairing response missing token: \(bodyStr)")
                    return
                }
                self.authToken = token
                self.isPaired = true
                self.pairedCode = code
                self.saveConfigToDisk(token: token, server: self.serverURL.absoluteString, pairCode: code)
                self.appendLog("✅ Paired successfully. Token saved to ~/.findmycat/config.json")
                self.startPolling()
            }
        }
        task.resume()
    }
    
    func testConnection() {
        guard isPaired else {
            appendLog("ℹ️ Not paired yet. Skipping health check.")
            return
        }
        var request = URLRequest(url: serverURL.appendingPathComponent("health"))
        if let token = authToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    self.connectionStatus = .error
                    self.lastError = error.localizedDescription
                    self.appendLog("❌ Cannot connect: \(error.localizedDescription)")
                } else if let http = response as? HTTPURLResponse {
                    let status = http.statusCode
                    let body = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                    if (200...299).contains(status) {
                        self.connectionStatus = .connected
                        self.appendLog("✅ Health OK (HTTP \(status)) \(body.isEmpty ? "" : "- \(body.prefix(200))")")
                    } else {
                        self.connectionStatus = .error
                        self.lastError = "Server error (HTTP \(status))"
                        self.appendLog("❌ Health failed (HTTP \(status)) \(body.isEmpty ? "" : "- \(body.prefix(300))")")
                    }
                }
            }
        }
        task.resume()
    }
    
    func fetchLocationsAndSend() {
        guard isPaired else { return }
        let locations = fetchLocations()
        DispatchQueue.main.async {
            self.devices = locations
        }
        sendLocations(locations)
    }
    
    func fetchLocations() -> [DeviceLocation] {
        // Debug: check if file exists and log size when reading
        let exists = FileManager.default.fileExists(atPath: dbPath)
        print("FindMyCatClient: fetchLocations() - dbPath: \(dbPath) exists: \(exists)")
        appendLog("DEBUG: fetchLocations() - dbPath: \(dbPath) exists: \(exists)")

        guard let data = try? Data(contentsOf: URL(fileURLWithPath: dbPath)) else {
            appendLog("Error reading Find My cache. Grant Full Disk Access to this app in System Settings > Privacy & Security.")
            return []
        }
        print("FindMyCatClient: fetchLocations() - read data length: \(data.count)")
        guard let json = try? JSONSerialization.jsonObject(with: data) else {
            appendLog("Error parsing Find My cache JSON.")
            return []
        }
        let items: [[String: Any]]
        if let arr = json as? [[String: Any]] {
            items = arr
        } else if let dict = json as? [String: Any], let arr = dict["items"] as? [[String: Any]] {
            items = arr
        } else {
            appendLog("Cache format not recognized.")
            return []
        }
        var rows: [DeviceLocation] = []
        for item in items {
            let deviceId = (item["id"] as? String) ?? (item["identifier"] as? String) ?? "unknown"
            guard let location = item["location"] as? [String: Any] else { continue }
            if location["positionType"] as? String == "safeLocation" { continue }
            if location["isOld"] as? Bool == true { continue }
            guard let timestamp = location["timeStamp"] as? Double,
                  let latitude = location["latitude"] as? Double,
                  let longitude = location["longitude"] as? Double else { continue }
            let isoTime = Date(timeIntervalSince1970: timestamp/1000).iso8601String
            rows.append(DeviceLocation(id: deviceId, latitude: latitude, longitude: longitude, timestamp: timestamp, isoTime: isoTime))
        }
        return rows
    }
    
    func sendLocations(_ locations: [DeviceLocation]) {
        guard isPaired else { return }
        
        var uploadCount = 0
        var skipCount = 0
        
        let batches = locations.chunked(into: batchSize)
        for batch in batches {
            for device in batch {
                // Convert timestamp from milliseconds to Date
                let timestamp = Date(timeIntervalSince1970: device.timestamp / 1000)
                
                // Check if we should upload this location
                if uploadFilter.shouldUpload(
                    deviceId: device.id,
                    latitude: device.latitude,
                    longitude: device.longitude,
                    timestamp: timestamp,
                    accuracy: 15.0 // Default accuracy for Find My data
                ) {
                    sendLocationUpdate(device)
                    uploadCount += 1
                } else {
                    skipCount += 1
                    let debugReason = uploadFilter.getDebugString(for: device.id)
                    appendLog("⏭️ Skip \(device.id) @ \(device.latitude),\(device.longitude) - \(debugReason)")
                }
            }
        }
        
        DispatchQueue.main.async {
            self.lastUpdate = Date()
            if uploadCount > 0 || skipCount > 0 {
                self.appendLog("📊 Upload filter results: \(uploadCount) uploaded, \(skipCount) skipped")
            }
        }
    }
    
    func sendLocationUpdate(_ device: DeviceLocation) {
        guard isPaired else { return }
        let payload: [String: Any] = [
            "deviceId": device.id,
            "latitude": device.latitude,
            "longitude": device.longitude,
            "timestamp": device.isoTime
        ]
        // Debug log for location being sent
        appendLog("📤 Sending \(device.id) @ \(device.latitude),\(device.longitude) \(device.isoTime)")
        // Build request for single-update endpoint
        var request = URLRequest(url: serverURL.appendingPathComponent("api/locations/update"))
        request.httpMethod = "POST"
        if let token = authToken { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    self.appendLog("❌ Send error: \(error.localizedDescription)")
                    return
                }
                guard let http = response as? HTTPURLResponse else {
                    self.appendLog("❌ No HTTP response for \(device.id) at /api/locations/update")
                    return
                }
                let status = http.statusCode
                let body = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                if (200...299).contains(status) {
                    // Mark as uploaded on successful response using current time (not device timestamp)
                    // This prevents issues with identical timestamps from Find My cache
                    self.uploadFilter.markAsUploaded(
                        deviceId: device.id,
                        latitude: device.latitude,
                        longitude: device.longitude,
                        timestamp: Date(), // Use current time instead of device timestamp
                        accuracy: 15.0
                    )
                    
                    // Parse response to check if it was a new location
                    var isNewInfo = ""
                    if let data = data,
                       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                       let isNew = json["isNew"] as? Bool {
                        isNewInfo = isNew ? " (NEW)" : " (DUPLICATE)"
                    }
                    
                    self.appendLog("✅ \(device.id) @ \(device.latitude),\(device.longitude)\(isNewInfo) (\(status))")
                } else {
                    self.appendLog("❌ Server rejected location for \(device.id) (HTTP \(status)) \(body.isEmpty ? "" : "- \(body.prefix(500))")")
                }
            }
        }
        task.resume()
    }

    // Load saved token/server to mimic Python client behavior
    private func loadConfigFromDisk() {
        let configPath = (NSHomeDirectory() as NSString).appendingPathComponent(".findmycat/config.json")
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: configPath)) else { return }
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        if let token = json["token"] as? String, !token.isEmpty {
            self.authToken = token
            self.isPaired = true
            appendLog("🔐 Loaded auth token from ~/.findmycat/config.json")
        }
        if let code = json["pairCode"] as? String, !code.isEmpty {
            self.pairedCode = code
            appendLog("🔗 Loaded paired code from config: \(code)")
        }
        if let server = json["server"] as? String, let url = URL(string: server), server.isEmpty == false {
            self.serverURL = url
            appendLog("🌐 Server overridden from config: \(server)")
        }
    }

    private func saveConfigToDisk(token: String, server: String, pairCode: String?) {
        let dir = (NSHomeDirectory() as NSString).appendingPathComponent(".findmycat")
        let path = (dir as NSString).appendingPathComponent("config.json")
        do {
            try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
            var obj: [String: Any] = ["token": token, "server": server]
            if let code = pairCode, !code.isEmpty { obj["pairCode"] = code }
            let data = try JSONSerialization.data(withJSONObject: obj, options: [.prettyPrinted])
            try data.write(to: URL(fileURLWithPath: path), options: [.atomic])
        } catch {
            appendLog("⚠️ Failed to save config: \(error.localizedDescription)")
        }
    }
    
    func sendNow() {
        poll()
    }
    
    func sendHeartbeat() {
        guard isPaired else {
            appendLog("ℹ️ Not paired yet. Cannot send heartbeat.")
            return
        }
        
        let locations = fetchLocations()
        if locations.isEmpty {
            appendLog("💓 Heartbeat test: No devices found")
            return
        }
        
        // Send first device location as heartbeat (bypass filtering)
        let device = locations.first!
        appendLog("💓 Heartbeat \(device.id) @ \(device.latitude),\(device.longitude) (bypass filters)")
        
        let payload: [String: Any] = [
            "deviceId": device.id,
            "latitude": device.latitude,
            "longitude": device.longitude,
            "timestamp": device.isoTime
        ]
        
        var request = URLRequest(url: serverURL.appendingPathComponent("api/locations/update"))
        request.httpMethod = "POST"
        if let token = authToken { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        
        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    self.appendLog("💓❌ Heartbeat failed: \(error.localizedDescription)")
                    return
                }
                guard let http = response as? HTTPURLResponse else {
                    self.appendLog("💓❌ Heartbeat: No HTTP response")
                    return
                }
                let status = http.statusCode
                let body = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                if (200...299).contains(status) {
                    // Parse response to show if it was new or duplicate
                    var isNewInfo = ""
                    if let data = data,
                       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                       let isNew = json["isNew"] as? Bool {
                        isNewInfo = isNew ? " (NEW)" : " (DUPLICATE)"
                    }
                    self.appendLog("💓✅ Heartbeat success\(isNewInfo) (\(status))")
                } else {
                    self.appendLog("💓❌ Heartbeat rejected (\(status)) \(body.isEmpty ? "" : "- \(body.prefix(200))")")
                }
            }
        }
        task.resume()
    }
    
    private func appendLog(_ message: String) {
        let now = Date()
        let timestamp = now.iso8601String
        let newEntry = "[\(timestamp)] \(message)\n"
        
        if let lastTime = lastLogTime, now.timeIntervalSince(lastTime) > 5 {
            log = "\n" + String(repeating: "—", count: 80) + "\n\n" + newEntry + log
        } else {
            log = newEntry + log
        }
        
        lastLogTime = now

        if log.count > 20000 { // Increased log size
            log = String(log.prefix(20000))
        }
    }
}

extension Date {
    var iso8601String: String {
        let formatter = ISO8601DateFormatter()
        return formatter.string(from: self)
    }
}

extension Array {
    func chunked(into size: Int) -> [[Element]] {
        stride(from: 0, to: count, by: size).map {
            Array(self[$0..<Swift.min($0 + size, count)])
        }
    }
}

struct DeviceLocation: Identifiable {
    let id: String
    let latitude: Double
    let longitude: Double
    let timestamp: Double
    let isoTime: String
    var displayName: String { id }
}

enum ConnectionStatus {
    case unknown, connected, error
    var description: String {
        switch self {
        case .unknown: return "Unknown"
        case .connected: return "Connected"
        case .error: return "Error"
        }
    }
    var color: Color {
        switch self {
        case .unknown: return .gray
        case .connected: return .green
        case .error: return .red
        }
    }
}