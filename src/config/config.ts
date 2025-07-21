import dotenv from 'dotenv';
dotenv.config();

/**
 * 🔧 Production-Ready Configuration with Validation
 */

class ConfigValidator {
  static validateRequired(value: string | undefined, name: string): string {
    if (!value || value.trim() === '') {
      throw new Error(`❌ CRITICAL: Missing required environment variable: ${name}`);
    }
    return value.trim();
  }

  static validateOptional(value: string | undefined, defaultValue: string): string {
    return value?.trim() || defaultValue;
  }

  static validateNumber(value: string | undefined, defaultValue: number, name: string): number {
    if (!value) return defaultValue;
    const parsed = parseInt(value);
    if (isNaN(parsed) || parsed <= 0) {
      throw new Error(`❌ CRITICAL: Invalid number for ${name}: ${value}`);
    }
    return parsed;
  }

  static validateAdmins(adminsStr: string | undefined): number[] {
    if (!adminsStr?.trim()) {
      console.warn('⚠️ WARNING: No ADMINS configured. Bot will be inaccessible!');
      return [];
    }
    
    const adminIds = adminsStr.split(',').map(id => {
      const parsed = parseInt(id.trim());
      if (isNaN(parsed)) {
        throw new Error(`❌ CRITICAL: Invalid admin ID: ${id}`);
      }
      return parsed;
    });

    console.log(`✅ Configured ${adminIds.length} admin(s): ${adminIds.join(', ')}`);
    return adminIds;
  }

  static validateSupabase(): { url: string; key: string } | null {
    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_ANON_KEY?.trim();
    
    if (!url && !key) {
      console.warn('⚠️ WARNING: Supabase not configured. Database features disabled.');
      return null;
    }
    
    if (!url || !key) {
      throw new Error('❌ CRITICAL: Partial Supabase config. Both SUPABASE_URL and SUPABASE_ANON_KEY required.');
    }

    if (!url.startsWith('https://')) {
      throw new Error('❌ CRITICAL: Invalid SUPABASE_URL format. Must start with https://');
    }

    console.log('✅ Supabase configuration validated');
    return { url, key };
  }
}

// Validate all configuration at startup
console.log('🔧 Validating configuration...');

const supabaseConfig = ConfigValidator.validateSupabase();

export const CONFIG = {
  // Core Services
  TELEGRAM_BOT_TOKEN: ConfigValidator.validateRequired(
    process.env.TELEGRAM_BOT_TOKEN, 
    'TELEGRAM_BOT_TOKEN'
  ),
  
  PORT: ConfigValidator.validateNumber(
    process.env.PORT, 
    3001, 
    'PORT'
  ),
  
  ADMINS: ConfigValidator.validateAdmins(process.env.ADMINS),
  
  // Game Timing
  ROUND_DURATION: ConfigValidator.validateNumber(
    process.env.ROUND_DURATION, 
    30000, 
    'ROUND_DURATION'
  ),
  
  FRONTEND_SPIN_DURATION: 15000, // Frontend animation takes 15 seconds
  SPIN_BUFFER_TIME: 3000,        // Extra buffer time for safety
  WAITING_PERIOD: 3000,          // Time between rounds
  
  // Activity Monitoring
  FRONTEND_ACTIVITY_TIMEOUT: ConfigValidator.validateNumber(
    process.env.FRONTEND_ACTIVITY_TIMEOUT, 
    60000, 
    'FRONTEND_ACTIVITY_TIMEOUT'
  ),
  
  ACTIVITY_CHECK_INTERVAL: ConfigValidator.validateNumber(
    process.env.ACTIVITY_CHECK_INTERVAL, 
    10000, 
    'ACTIVITY_CHECK_INTERVAL'
  ),
  
  // Timezone
  TIMEZONE: 'Asia/Kolkata',
  LOCALE: 'en-IN',
  
  // Supabase (Optional)
  SUPABASE_URL: supabaseConfig?.url,
  SUPABASE_ANON_KEY: supabaseConfig?.key,
  
  // Environment
  NODE_ENV: ConfigValidator.validateOptional(process.env.NODE_ENV, 'development'),
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  
  // Server Limits
  MAX_SPIN_QUEUE_SIZE: 100,
  API_RATE_LIMIT: 60, // requests per minute
};

// Final validation summary
console.log('✅ Configuration validation completed');
console.log(`🎮 Environment: ${CONFIG.NODE_ENV}`);
console.log(`🤖 Bot Token: ${CONFIG.TELEGRAM_BOT_TOKEN ? 'CONFIGURED' : 'MISSING'}`);
console.log(`📊 Database: ${supabaseConfig ? 'ENABLED' : 'DISABLED'}`);
console.log(`👥 Admins: ${CONFIG.ADMINS.length} configured`);
console.log(`⚙️ Ready for ${CONFIG.IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT'}`);
