# 🎰 Roulette Backend Setup Guide

## 🚨 **Current Issues You're Experiencing:**

Based on your logs, you have these problems:
1. ❌ `relation "public.roulette_spin_results" does not exist` - Database table missing
2. ❌ `Failed to store spin result: undefined` - Supabase not configured
3. ❌ No environment variables set

## 🔧 **Quick Fix Steps:**

### **Step 1: Create Environment File**
Create `.env` file in `roulleteBackend/` with:

```env
# 🤖 TELEGRAM BOT CONFIGURATION
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
ADMINS=your_user_id_here

# 🌐 SERVER CONFIGURATION  
PORT=3001
ROUND_DURATION=60000
FRONTEND_ACTIVITY_TIMEOUT=60000
ACTIVITY_CHECK_INTERVAL=10000

# 📊 SUPABASE CONFIGURATION (REQUIRED!)
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

### **Step 2: Set Up Supabase Database**

1. **Go to [Supabase](https://supabase.com)**
2. **Create new project**
3. **Go to SQL Editor**
4. **Run this SQL:**

```sql
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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_roulette_spin_results_timestamp 
ON roulette_spin_results (timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_bot_audit_logs_timestamp 
ON bot_audit_logs (timestamp DESC);

-- Enable RLS
ALTER TABLE roulette_spin_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_audit_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (adjust as needed)
CREATE POLICY "Allow all operations on spin results" ON roulette_spin_results
FOR ALL USING (true);

CREATE POLICY "Allow all operations on audit logs" ON bot_audit_logs
FOR ALL USING (true);
```

5. **Get your credentials:**
   - Project URL: Settings → API → Project URL
   - Anon Key: Settings → API → Project API keys → anon/public

### **Step 3: Configure Render Environment**

In your Render dashboard:
1. **Go to your service**
2. **Environment tab**
3. **Add these variables:**

```
TELEGRAM_BOT_TOKEN=your_actual_token
ADMINS=your_actual_user_id
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_actual_anon_key
PORT=3001
ROUND_DURATION=60000
```

### **Step 4: Get Telegram Credentials**

1. **Create Bot:**
   - Message [@BotFather](https://t.me/BotFather)
   - Send `/newbot`
   - Follow instructions
   - Copy token

2. **Get Your User ID:**
   - Message [@userinfobot](https://t.me/userinfobot)
   - Copy your user ID

## 🧪 **Test the Fix:**

After setting up:

1. **Redeploy on Render**
2. **Check logs should show:**
   ```
   📊 Supabase service initialized
   🤖 Telegram Bot Service started
   ```

3. **Test with Telegram:**
   ```
   spin: 17
   /status
   /results
   ```

4. **Check database:**
   - Go to Supabase → Table Editor
   - Should see `roulette_spin_results` and `bot_audit_logs` tables

## 🔍 **Debugging:**

If still having issues:

1. **Check environment variables are set in Render**
2. **Verify Supabase credentials are correct**
3. **Check Render logs for new error messages**
4. **Test Supabase connection in SQL editor**

## 📞 **Need Help?**

Common issues:
- **Wrong Supabase URL format** - Should start with `https://`
- **Wrong API key** - Use `anon/public` key, not service role
- **RLS policies** - Make sure policies allow access
- **Case sensitivity** - Table names are case sensitive

Once configured correctly, you should see:
```
🎰 Spin result stored successfully: 17 Red Odd
📊 Audit logged: add_spin by YourUsername
``` 