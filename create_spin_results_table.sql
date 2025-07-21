-- Create table for storing roulette spin results
CREATE TABLE IF NOT EXISTS roulette_spin_results (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    spin_number INTEGER NOT NULL CHECK (spin_number >= 0 AND spin_number <= 36),
    color TEXT NOT NULL CHECK (color IN ('Red', 'Black', 'Green')),
    parity TEXT NOT NULL CHECK (parity IN ('Odd', 'Even', 'None')),
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on timestamp for efficient querying of recent results
CREATE INDEX IF NOT EXISTS idx_roulette_spin_results_timestamp 
ON roulette_spin_results (timestamp DESC);

-- Add RLS (Row Level Security) if needed
ALTER TABLE roulette_spin_results ENABLE ROW LEVEL SECURITY;

-- Create policy to allow read access (adjust as needed for your security requirements)
CREATE POLICY "Allow read access to spin results" ON roulette_spin_results
FOR SELECT USING (true);

-- Create policy to allow insert access (adjust as needed for your security requirements)
CREATE POLICY "Allow insert of spin results" ON roulette_spin_results
FOR INSERT WITH CHECK (true);

-- Add comments for documentation
COMMENT ON TABLE roulette_spin_results IS 'Stores the results of roulette spins including number, color, and parity';
COMMENT ON COLUMN roulette_spin_results.spin_number IS 'The winning number (0-36)';
COMMENT ON COLUMN roulette_spin_results.color IS 'The color of the winning number (Red, Black, Green)';
COMMENT ON COLUMN roulette_spin_results.parity IS 'Whether the number is Odd, Even, or None (for zero)';
COMMENT ON COLUMN roulette_spin_results.timestamp IS 'When the spin occurred (IST/Indian timezone)'; 