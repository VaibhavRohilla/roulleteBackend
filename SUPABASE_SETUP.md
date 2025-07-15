# Supabase Setup for Roulette Bot

## 🏗️ Database Schema

Create the following table in your Supabase database:

### 📊 Bot Audit Logs Table

```sql
-- Create the bot_audit_logs table
CREATE TABLE bot_audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id BIGINT NOT NULL,
    username TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    success BOOLEAN NOT NULL DEFAULT TRUE
);

-- Create indexes for better performance
CREATE INDEX idx_bot_audit_logs_timestamp ON bot_audit_logs(timestamp DESC);
CREATE INDEX idx_bot_audit_logs_user_id ON bot_audit_logs(user_id);
CREATE INDEX idx_bot_audit_logs_action ON bot_audit_logs(action);
CREATE INDEX idx_bot_audit_logs_success ON bot_audit_logs(success);

-- Enable RLS (Row Level Security)
ALTER TABLE bot_audit_logs ENABLE ROW LEVEL SECURITY;

-- Create policy to allow service role to read/write
CREATE POLICY "Enable all operations for service role" ON bot_audit_logs
    FOR ALL USING (true);
```

## 🔧 Environment Setup

1. **Create Supabase Project:**
   - Go to [supabase.com](https://supabase.com)
   - Create a new project
   - Note down your Project URL and anon key

2. **Update .env file:**
   ```env
   SUPABASE_URL=https://your-project-ref.supabase.co
   SUPABASE_ANON_KEY=your-anon-key-here
   ```

3. **Run the SQL:**
   - Go to your Supabase project dashboard
   - Navigate to SQL Editor
   - Paste and run the SQL schema above

## 📋 Audit Log Actions

The system tracks these actions:

### 🎯 Spin Management
- `add_spin` - Added number to queue
- `add_spin_unauthorized` - Unauthorized spin attempt
- `add_spin_invalid` - Invalid spin number

### 🗑️ Queue Management
- `clear_queue` - Cleared entire queue
- `delete_value` - Deleted specific value from queue
- `delete_value_not_found` - Attempted to delete non-existent value

### 🎮 Game Control
- `resume_game` - Game resumed
- `pause_game` - Game paused
- `reset_game` - Full game reset
- `resume_game_failed` - Resume attempt when already running
- `pause_game_failed` - Pause attempt when already paused

### ℹ️ Information
- `check_status` - Status check
- `help_requested` - Help command used
- `bot_start` - Bot service started

## 📊 Data Examples

```json
{
  "user_id": 123456789,
  "username": "admin_user",
  "action": "add_spin",
  "details": "Added spin: 17",
  "old_value": [1, 5, 23],
  "new_value": [1, 5, 23, 17],
  "success": true
}
```

```json
{
  "user_id": 123456789,
  "username": "admin_user", 
  "action": "reset_game",
  "details": "Full game reset",
  "old_value": {
    "queue": [1, 5, 23],
    "state": "paused"
  },
  "new_value": {
    "queue": [],
    "state": "running"
  },
  "success": true
}
```

## 🔍 Querying Audit Logs

### Recent Activity
```sql
SELECT * FROM bot_audit_logs 
ORDER BY timestamp DESC 
LIMIT 20;
```

### Failed Actions
```sql
SELECT * FROM bot_audit_logs 
WHERE success = false 
ORDER BY timestamp DESC;
```

### User Activity
```sql
SELECT * FROM bot_audit_logs 
WHERE user_id = 123456789 
ORDER BY timestamp DESC;
```

### Action Breakdown
```sql
SELECT action, COUNT(*) as count 
FROM bot_audit_logs 
GROUP BY action 
ORDER BY count DESC;
```

## 🛡️ Security Notes

- The service uses the anon key for operations
- RLS is enabled for additional security
- All bot actions are automatically logged
- Logs include both successful and failed operations
- Old and new values are stored for audit trail

## 🚀 Testing

After setup, test with:
```bash
npm run dev
```

Check logs in Supabase dashboard to confirm audit logging is working. 