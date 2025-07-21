-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 🎰 ROULETTE BACKEND DATABASE SETUP
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Run this SQL in your Supabase SQL Editor to create all required tables
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Create table for storing roulette spin results
CREATE TABLE IF NOT EXISTS roulette_spin_results (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    spin_number INTEGER NOT NULL CHECK (spin_number >= 0 AND spin_number <= 36),
    color TEXT NOT NULL CHECK (color IN ('Red', 'Black', 'Green')),
    parity TEXT NOT NULL CHECK (parity IN ('Odd', 'Even', 'None')),
    doneby TEXT NOT NULL,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add doneby column to existing table (for database upgrades)
DO $$
BEGIN
    -- Add column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'roulette_spin_results' 
                   AND column_name = 'doneby') THEN
        ALTER TABLE roulette_spin_results ADD COLUMN doneby TEXT;
    END IF;
    
    -- Update any NULL values to 'System' for existing records
    UPDATE roulette_spin_results SET doneby = 'System' WHERE doneby IS NULL;
    
    -- Make column NOT NULL if it isn't already
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'roulette_spin_results' 
               AND column_name = 'doneby' 
               AND is_nullable = 'YES') THEN
        ALTER TABLE roulette_spin_results ALTER COLUMN doneby SET NOT NULL;
    END IF;
END $$;

-- Create table for bot audit logs
CREATE TABLE IF NOT EXISTS bot_audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id BIGINT NOT NULL,
    username TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    old_value JSONB,
    new_value JSONB,
    success BOOLEAN NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_roulette_spin_results_timestamp 
ON roulette_spin_results (timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_roulette_spin_results_deleted 
ON roulette_spin_results (is_deleted, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_bot_audit_logs_timestamp 
ON bot_audit_logs (timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_bot_audit_logs_user_id 
ON bot_audit_logs (user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_bot_audit_logs_action 
ON bot_audit_logs (action, timestamp DESC);

-- Enable Row Level Security
ALTER TABLE roulette_spin_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_audit_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (adjust as needed for your security requirements)
CREATE POLICY "Allow all operations on spin results" ON roulette_spin_results
FOR ALL USING (true);

CREATE POLICY "Allow all operations on audit logs" ON bot_audit_logs
FOR ALL USING (true);

-- Add comments for documentation
COMMENT ON TABLE roulette_spin_results IS 'Stores the results of roulette spins including number, color, and parity';
COMMENT ON COLUMN roulette_spin_results.spin_number IS 'The winning number (0-36)';
COMMENT ON COLUMN roulette_spin_results.color IS 'The color of the winning number (Red, Black, Green)';
COMMENT ON COLUMN roulette_spin_results.parity IS 'Whether the number is Odd, Even, or None (for zero)';
COMMENT ON COLUMN roulette_spin_results.doneby IS 'Telegram username of the user who added this spin';
COMMENT ON COLUMN roulette_spin_results.timestamp IS 'When the spin occurred (IST/Indian timezone)';

COMMENT ON TABLE bot_audit_logs IS 'Stores audit logs of all bot actions and game operations';
COMMENT ON COLUMN bot_audit_logs.user_id IS 'Telegram user ID who performed the action';
COMMENT ON COLUMN bot_audit_logs.username IS 'Telegram username of the user';
COMMENT ON COLUMN bot_audit_logs.action IS 'Type of action performed';
COMMENT ON COLUMN bot_audit_logs.old_value IS 'State before the action (JSON)';
COMMENT ON COLUMN bot_audit_logs.new_value IS 'State after the action (JSON)';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ✅ SETUP COMPLETE!
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Your database is now ready for the roulette backend!
-- 
-- Next steps:
-- 1. Configure environment variables in Render
-- 2. Deploy your backend
-- 3. Test with Telegram bot commands
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 