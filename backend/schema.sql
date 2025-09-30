-- FindMyCat Multi-User Database Schema
-- PostgreSQL 12+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Account pairing codes (persistent, reusable to link Mac clients)
CREATE TABLE IF NOT EXISTS pairing_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(20) UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- User devices (AirTags/trackers linked to users)
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id VARCHAR(255) NOT NULL, -- Apple's device identifier
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100), -- User-friendly name like "Fluffy's AirTag"
    color VARCHAR(7) DEFAULT '#FF6B6B', -- Hex color for map markers
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}', -- Additional device info (battery, model, etc)
    first_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(device_id, user_id)
);

-- Location history (multi-tenant)
CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id VARCHAR(255) NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    accuracy DECIMAL(8, 3), -- GPS accuracy in meters
    altitude DECIMAL(8, 3), -- Altitude in meters (optional)
    speed DECIMAL(6, 3), -- Speed in m/s (optional)
    heading DECIMAL(5, 1), -- Compass heading in degrees (optional)
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(device_id, user_id, timestamp) -- Prevent duplicate locations
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_pairing_codes_code ON pairing_codes(code);

CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_devices_user_device ON devices(user_id, device_id);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen DESC);

CREATE INDEX IF NOT EXISTS idx_locations_user_device ON locations(user_id, device_id);
CREATE INDEX IF NOT EXISTS idx_locations_user_timestamp ON locations(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_locations_device_timestamp ON locations(device_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_locations_timestamp ON locations(timestamp DESC);

-- Spatial index for geo queries (optional, requires PostGIS)
-- CREATE INDEX idx_locations_coordinates ON locations USING GIST(point(longitude, latitude));

-- Update trigger for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at') THEN
        CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END;
$$;

-- Long-lived client tokens for Mac client authentication
CREATE TABLE IF NOT EXISTS client_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100),
    token_hash VARCHAR(128) NOT NULL, -- SHA-256 hex
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_client_tokens_user ON client_tokens(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_client_tokens_token_hash ON client_tokens(token_hash);

-- Demo/migration user for existing data
INSERT INTO users (id, email, password_hash, display_name, is_active) 
VALUES (
    '00000000-0000-0000-0000-000000000000',
    'demo@findmycat.local',
    '$2b$12$demo.hash.for.existing.data.migration.purposes',
    'Demo User (Legacy Data)',
    true
) ON CONFLICT (email) DO NOTHING;

-- Pairing code generation is handled in application code; no DB functions required.

-- Optional migration helpers (no-op if legacy tables don't exist)
-- Copy legacy device_codes into pairing_codes (keeping latest per user)
-- INSERT INTO pairing_codes (code, user_id, created_at)
-- SELECT dc.code, dc.user_id, COALESCE(dc.created_at, CURRENT_TIMESTAMP)
-- FROM device_codes dc
-- ON CONFLICT (user_id) DO NOTHING;

-- Copy legacy device_tokens into client_tokens
-- INSERT INTO client_tokens (user_id, name, token_hash, created_at, last_used, revoked_at)
-- SELECT user_id, name, token_hash, created_at, last_used, revoked_at FROM device_tokens
-- ON CONFLICT DO NOTHING;

-- Helpful views for queries
CREATE OR REPLACE VIEW user_device_summary AS
SELECT 
    u.id as user_id,
    u.email,
    u.display_name,
    COUNT(d.id) as device_count,
    COUNT(d.id) FILTER (WHERE d.is_active = true) as active_devices,
    MAX(d.last_seen) as last_device_activity
FROM users u
LEFT JOIN devices d ON u.id = d.user_id
WHERE u.is_active = true
GROUP BY u.id, u.email, u.display_name;

CREATE OR REPLACE VIEW device_location_summary AS
SELECT 
    d.id as device_id,
    d.device_id as apple_device_id,
    d.user_id,
    d.name as device_name,
    d.color,
    COUNT(l.id) as location_count,
    MAX(l.timestamp) as last_location_time,
    MAX(l.created_at) as last_received_time
FROM devices d
LEFT JOIN locations l ON d.device_id = l.device_id AND d.user_id = l.user_id
WHERE d.is_active = true
GROUP BY d.id, d.device_id, d.user_id, d.name, d.color;