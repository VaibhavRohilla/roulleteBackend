
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { CONFIG } from '../config/config';
import { Logger } from '../utils/Logger';

export interface AuditLog {
  id?: string;
  timestamp?: string;
  user_id: number;
  username: string;
  action: string;
  details: string;
  old_value?: any;
  new_value?: any;
  success: boolean;
}

export class SupabaseService {
  private static instance: SupabaseService;
  private client: SupabaseClient;

  private constructor() {
    if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY || 
        CONFIG.SUPABASE_URL === 'your_supabase_url_here' || 
        CONFIG.SUPABASE_ANON_KEY === 'your_supabase_anon_key_here') {
      Logger.warn('⚠️ Supabase credentials not configured. Audit logging will be disabled.');
      this.client = null as any;
      return;
    }

    try {
      this.client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
      console.log('📊 Supabase service initialized');
    } catch (error) {
      Logger.warn(`⚠️ Failed to initialize Supabase: ${error}. Audit logging will be disabled.`);
      this.client = null as any;
    }
  }

  public static getInstance(): SupabaseService {
    if (!SupabaseService.instance) {
      SupabaseService.instance = new SupabaseService();
    }
    return SupabaseService.instance;
  }

  /**
   * Log bot action to audit table
   */
  public async logAction(auditData: AuditLog): Promise<void> {
    if (!this.client) {
      Logger.warn('📊 Supabase not configured, skipping audit log');
      return;
    }

    try {
      const { error } = await this.client
        .from('bot_audit_logs')
        .insert([{
          user_id: auditData.user_id,
          username: auditData.username,
          action: auditData.action,
          details: auditData.details,
          old_value: auditData.old_value,
          new_value: auditData.new_value,
          success: auditData.success,
          timestamp: new Date().toISOString()
        }]);

      if (error) {
        Logger.error(`❌ Failed to log audit action: ${error.message}`);
      } else {
        console.log(`📊 Audit logged: ${auditData.action} by ${auditData.username}`);
      }
    } catch (error) {
      Logger.error(`❌ Supabase error: ${error}`);
    }
  }

  /**
   * Get recent audit logs (for debugging/monitoring)
   */
  public async getRecentLogs(limit: number = 10): Promise<AuditLog[]> {
    if (!this.client) {
      return [];
    }

    try {
      const { data, error } = await this.client
        .from('bot_audit_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) {
        Logger.error(`❌ Failed to fetch audit logs: ${error.message}`);
        return [];
      }

      return data || [];
    } catch (error) {
      Logger.error(`❌ Supabase error: ${error}`);
      return [];
    }
  }

  /**
   * Check if Supabase is properly configured
   */
  public isConfigured(): boolean {
    return this.client !== null;
  }
} 