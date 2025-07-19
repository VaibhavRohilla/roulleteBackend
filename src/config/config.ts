import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN!,
  PORT: parseInt(process.env.PORT || '3001'),
  ROUND_DURATION: parseInt(process.env.ROUND_DURATION || '30000'),
  ADMINS: process.env.ADMINS?.split(',').map(id => parseInt(id)) || [],
  
  // Frontend synchronization timing
  FRONTEND_SPIN_DURATION: 15000, // Frontend animation takes 15 seconds
  SPIN_BUFFER_TIME: 3000,        // Extra buffer time for safety
  WAITING_PERIOD: 3000,          // Time between rounds
  
  // Frontend activity tracking
  FRONTEND_ACTIVITY_TIMEOUT: parseInt(process.env.FRONTEND_ACTIVITY_TIMEOUT || '60000'), // 60 seconds
  ACTIVITY_CHECK_INTERVAL: parseInt(process.env.ACTIVITY_CHECK_INTERVAL || '10000'), // Check every 10 seconds
  
  // Timezone Configuration
  TIMEZONE: 'Asia/Kolkata',      // Indian Standard Time (IST)
  LOCALE: 'en-IN',               // Indian locale for formatting
  
  // Supabase Configuration
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
};
