//
//  LocationUploadFilter.swift
//  FindMyCatClient
//
//  Manages client-side filtering of location updates to reduce server load
//  Only uploads locations that meaningfully differ from the previous upload
//

import Foundation
import CoreLocation

/// Manages client-side filtering of location updates to reduce server load
/// Only uploads locations that meaningfully differ from the previous upload
class LocationUploadFilter {
    
    // MARK: - Configuration Constants
    
    /// Minimum distance in meters before uploading a new location
    static let minDistanceThreshold: CLLocationDistance = 20.0
    
    /// Minimum time interval in seconds between uploads
    static let minTimeInterval: TimeInterval = 5.0
    
    /// Maximum acceptable horizontal accuracy in meters (filter out poor readings)
    static let maxAccuracyThreshold: CLLocationAccuracy = 150.0
    
    /// Heartbeat interval in seconds - upload even if stationary after this time
    static let heartbeatInterval: TimeInterval = 600.0 // 10 minutes
    
    /// Accuracy improvement threshold (percent) - upload if accuracy improves significantly
    static let accuracyImprovementThreshold: Double = 0.4 // 40% improvement
    
    // MARK: - Persistent Storage Keys
    
    private static let lastUploadedLocationPrefix = "LastUploadedLocation_"
    private static let lastUploadedTimestampPrefix = "LastUploadedTimestamp_"
    
    // MARK: - Cached State (per device)
    
    private var lastUploadedLocations: [String: CLLocation] = [:]
    private var lastUploadedTimestamps: [String: Date] = [:]
    
    // MARK: - Initialization
    
    init() {
        // Load persisted state for all devices will happen on-demand
    }
    
    // MARK: - Public Interface
    
    /// Determines if a location should be uploaded for a specific device
    /// - Parameters:
    ///   - deviceId: The device identifier
    ///   - latitude: Location latitude
    ///   - longitude: Location longitude
    ///   - timestamp: Location timestamp
    ///   - accuracy: Optional accuracy in meters (defaults to good accuracy)
    /// - Returns: true if the location should be uploaded, false otherwise
    func shouldUpload(deviceId: String, latitude: Double, longitude: Double, timestamp: Date, accuracy: Double = 10.0) -> Bool {
        
        let newLocation = CLLocation(
            coordinate: CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
            altitude: 0,
            horizontalAccuracy: accuracy,
            verticalAccuracy: -1,
            timestamp: timestamp
        )
        
        return shouldUpload(deviceId: deviceId, location: newLocation)
    }
    
    /// Determines if a location should be uploaded for a specific device
    /// - Parameters:
    ///   - deviceId: The device identifier  
    ///   - location: The CLLocation to evaluate
    /// - Returns: true if the location should be uploaded, false otherwise
    func shouldUpload(deviceId: String, location: CLLocation) -> Bool {
        
        // Load persisted state for this device if not already cached
        loadPersistedStateIfNeeded(for: deviceId)
        
        // Filter out very poor accuracy (unless we have no previous location)
        if location.horizontalAccuracy > Self.maxAccuracyThreshold {
            guard let lastLocation = lastUploadedLocations[deviceId] else {
                return true // First location for device, even if poor accuracy
            }
            
            // Only upload poor accuracy if we've moved significantly
            let distance = location.distance(from: lastLocation)
            return distance > Self.minDistanceThreshold * 2 // Higher threshold for poor accuracy
        }
        
        // Always upload first location for this device
        guard let lastLocation = lastUploadedLocations[deviceId],
              let lastTimestamp = lastUploadedTimestamps[deviceId] else {
            return true
        }
        
        let currentTime = Date()
        let timeSinceLastUpload = currentTime.timeIntervalSince(lastTimestamp)
        
        // Check time-based constraints
        if timeSinceLastUpload < Self.minTimeInterval {
            return false // Too soon since last upload for this device
        }
        
        // Calculate distance from last uploaded location for this device
        let distance = location.distance(from: lastLocation)
        
        // Check distance threshold
        if distance >= Self.minDistanceThreshold {
            return true // Significant movement
        }
        
        // Check for significant accuracy improvement
        if location.horizontalAccuracy > 0 && lastLocation.horizontalAccuracy > 0 {
            let accuracyImprovement = (lastLocation.horizontalAccuracy - location.horizontalAccuracy) / lastLocation.horizontalAccuracy
            if accuracyImprovement > Self.accuracyImprovementThreshold {
                return true // Much better accuracy
            }
        }
        
        // Check heartbeat - upload if we haven't uploaded for a while (keep device "alive")
        if timeSinceLastUpload >= Self.heartbeatInterval {
            return true // Heartbeat upload
        }
        
        return false // No significant change
    }
    
    /// Call this after successfully uploading a location to update the filter state
    /// - Parameters:
    ///   - deviceId: The device identifier
    ///   - location: The CLLocation that was uploaded
    ///   - timestamp: Optional custom timestamp (defaults to current time)
    func markAsUploaded(deviceId: String, location: CLLocation, at timestamp: Date = Date()) {
        lastUploadedLocations[deviceId] = location
        lastUploadedTimestamps[deviceId] = timestamp
        persistState(for: deviceId)
    }
    
    /// Call this after successfully uploading a location using coordinates
    /// - Parameters:
    ///   - deviceId: The device identifier
    ///   - latitude: Location latitude
    ///   - longitude: Location longitude
    ///   - timestamp: Location timestamp
    ///   - accuracy: Optional accuracy in meters
    func markAsUploaded(deviceId: String, latitude: Double, longitude: Double, timestamp: Date, accuracy: Double = 10.0) {
        let location = CLLocation(
            coordinate: CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
            altitude: 0,
            horizontalAccuracy: accuracy,
            verticalAccuracy: -1,
            timestamp: timestamp
        )
        markAsUploaded(deviceId: deviceId, location: location, at: timestamp)
    }
    
    /// Get debug information about the filter state for a specific device
    /// - Parameters:
    ///   - deviceId: The device identifier
    ///   - candidateLocation: Location to evaluate (optional)
    /// - Returns: Dictionary with debug information
    func getDebugInfo(for deviceId: String, candidateLocation: CLLocation? = nil) -> [String: Any] {
        loadPersistedStateIfNeeded(for: deviceId)
        
        var info: [String: Any] = [
            "deviceId": deviceId,
            "hasLastLocation": lastUploadedLocations[deviceId] != nil,
            "hasLastTimestamp": lastUploadedTimestamps[deviceId] != nil
        ]
        
        if let lastLocation = lastUploadedLocations[deviceId] {
            info["lastLocation"] = [
                "latitude": lastLocation.coordinate.latitude,
                "longitude": lastLocation.coordinate.longitude,
                "accuracy": lastLocation.horizontalAccuracy,
                "timestamp": lastLocation.timestamp
            ]
        }
        
        if let lastTimestamp = lastUploadedTimestamps[deviceId] {
            info["lastUploadTimestamp"] = lastTimestamp
            info["timeSinceLastUpload"] = Date().timeIntervalSince(lastTimestamp)
        }
        
        if let candidate = candidateLocation, let lastLocation = lastUploadedLocations[deviceId] {
            info["candidate"] = [
                "distance": candidate.distance(from: lastLocation),
                "accuracy": candidate.horizontalAccuracy,
                "shouldUpload": shouldUpload(deviceId: deviceId, location: candidate)
            ]
        }
        
        return info
    }
    
    /// Get a simple debug string for logging
    /// - Parameter deviceId: The device identifier
    /// - Returns: A concise debug string
    func getDebugString(for deviceId: String) -> String {
        loadPersistedStateIfNeeded(for: deviceId)
        
        guard let lastLocation = lastUploadedLocations[deviceId],
              let lastTimestamp = lastUploadedTimestamps[deviceId] else {
            return "first upload"
        }
        
        let currentTime = Date()
        let timeSinceLastUpload = currentTime.timeIntervalSince(lastTimestamp)
        
        if timeSinceLastUpload < Self.minTimeInterval {
            return "too soon (\(String(format: "%.1f", timeSinceLastUpload))s)"
        }
        
        return "\(String(format: "%.1f", timeSinceLastUpload))s ago"
    }
    
    // MARK: - Persistence (per device)
    
    private func loadPersistedStateIfNeeded(for deviceId: String) {
        // Skip if already loaded for this device
        if lastUploadedLocations[deviceId] != nil && lastUploadedTimestamps[deviceId] != nil {
            return
        }
        
        let defaults = UserDefaults.standard
        
        // Load last uploaded timestamp for this device
        let timestampKey = Self.lastUploadedTimestampPrefix + deviceId
        if let timestampData = defaults.object(forKey: timestampKey) as? Date {
            lastUploadedTimestamps[deviceId] = timestampData
        }
        
        // Load last uploaded location for this device
        let locationKey = Self.lastUploadedLocationPrefix + deviceId
        if let locationData = defaults.data(forKey: locationKey) {
            if let location = try? NSKeyedUnarchiver.unarchivedObject(ofClass: CLLocation.self, from: locationData) {
                lastUploadedLocations[deviceId] = location
            }
        }
    }
    
    private func persistState(for deviceId: String) {
        let defaults = UserDefaults.standard
        
        // Persist timestamp for this device
        let timestampKey = Self.lastUploadedTimestampPrefix + deviceId
        if let timestamp = lastUploadedTimestamps[deviceId] {
            defaults.set(timestamp, forKey: timestampKey)
        }
        
        // Persist location for this device
        let locationKey = Self.lastUploadedLocationPrefix + deviceId
        if let location = lastUploadedLocations[deviceId] {
            if let locationData = try? NSKeyedArchiver.archivedData(withRootObject: location, requiringSecureCoding: true) {
                defaults.set(locationData, forKey: locationKey)
            }
        }
    }
    
    /// Clear all persisted state for all devices (useful for testing or reset)
    func clearPersistedState() {
        let defaults = UserDefaults.standard
        
        // Clear in-memory state
        lastUploadedLocations.removeAll()
        lastUploadedTimestamps.removeAll()
        
        // Clear persisted state for all known devices
        // Note: This is a simple approach - in a production app you might want to track device IDs
        let allKeys = defaults.dictionaryRepresentation().keys
        let locationKeys = allKeys.filter { $0.hasPrefix(Self.lastUploadedLocationPrefix) }
        let timestampKeys = allKeys.filter { $0.hasPrefix(Self.lastUploadedTimestampPrefix) }
        
        for key in locationKeys + timestampKeys {
            defaults.removeObject(forKey: key)
        }
    }
    
    /// Clear persisted state for a specific device
    /// - Parameter deviceId: The device identifier
    func clearPersistedState(for deviceId: String) {
        let defaults = UserDefaults.standard
        
        // Clear in-memory state
        lastUploadedLocations.removeValue(forKey: deviceId)
        lastUploadedTimestamps.removeValue(forKey: deviceId)
        
        // Clear persisted state
        let locationKey = Self.lastUploadedLocationPrefix + deviceId
        let timestampKey = Self.lastUploadedTimestampPrefix + deviceId
        defaults.removeObject(forKey: locationKey)
        defaults.removeObject(forKey: timestampKey)
    }
}