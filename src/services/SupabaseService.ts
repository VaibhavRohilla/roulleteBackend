
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { CONFIG } from '../config/config';
import { Logger } from '../utils/Logger';
import { TimeUtils } from '../utils/TimeUtils';

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

export interface SpinResult {
  id?: string;
  spin_number: number;
  color: string;
  parity: string;
  is_deleted?: boolean;
  deleted_at?: string;
  timestamp?: string;
  created_at?: string;
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
          timestamp: TimeUtils.getIndianISOForDB()
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
   * Store a spin result in the database
   */
  public async storeSpinResult(spinNumber: number, color: string, parity: string): Promise<boolean> {
    if (!this.client) {
      Logger.warn('📊 Supabase not configured, skipping spin result storage');
      return false;
    }

    // Validate input data
    if (!Number.isInteger(spinNumber) || spinNumber < 0 || spinNumber > 36) {
      Logger.error(`❌ Invalid spin number: ${spinNumber}. Must be 0-36.`);
      return false;
    }

    if (!color || !parity) {
      Logger.error(`❌ Invalid color or parity: color='${color}', parity='${parity}'`);
      return false;
    }

    try {
      const timestamp = TimeUtils.getIndianISOForDB();
      console.log(`📊 Attempting to store spin result: ${spinNumber} ${color} ${parity} at ${timestamp}`);

      const { data, error } = await this.client
        .from('roulette_spin_results')
        .insert([{
          spin_number: spinNumber,
          color: color,
          parity: parity,
          timestamp: timestamp
        }])
        .select(); // Add select to get the inserted record

      if (error) {
        Logger.error(`❌ Failed to store spin result: ${error.message}`);
        Logger.error(`❌ Error details: ${JSON.stringify(error, null, 2)}`);
        return false;
      } else {
        console.log(`🎰 Spin result stored successfully: ${spinNumber} ${color} ${parity}`);
        console.log(`📊 Inserted record: ${data?.[0]?.id ? `ID: ${data[0].id}` : 'No ID returned'}`);
        return true;
      }
    } catch (error) {
      Logger.error(`❌ Supabase error storing spin result: ${error}`);
      Logger.error(`❌ Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
      return false;
    }
  }

  /**
   * Get the last N spin results (default 5)
   */
  public async getLastSpinResults(limit: number = 5, includeDeleted: boolean = false): Promise<SpinResult[]> {
    if (!this.client) {
      Logger.warn('📊 Supabase not configured, returning empty spin results');
      return [];
    }

    try {
      let query = this.client
        .from('roulette_spin_results')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);

      // Filter out deleted results unless explicitly requested
      if (!includeDeleted) {
        query = query.eq('is_deleted', false);
      }

      const { data, error } = await query;

      if (error) {
        Logger.error(`❌ Failed to fetch spin results: ${error.message}`);
        return [];
      }

      const resultText = includeDeleted ? 'spin results (including deleted)' : 'active spin results';
      console.log(`🎰 Retrieved ${data?.length || 0} ${resultText}`);
      return data || [];
    } catch (error) {
      Logger.error(`❌ Supabase error fetching spin results: ${error}`);
      return [];
    }
  }

  /**
   * Soft delete a spin result by ID
   */
  public async softDeleteSpinResult(id: string): Promise<boolean> {
    if (!this.client) {
      Logger.warn('📊 Supabase not configured, skipping spin result deletion');
      return false;
    }

    try {
      const { error } = await this.client
        .from('roulette_spin_results')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) {
        Logger.error(`❌ Failed to soft delete spin result: ${error.message}`);
        return false;
      } else {
        console.log(`🗑️ Spin result soft deleted: ${id}`);
        return true;
      }
    } catch (error) {
      Logger.error(`❌ Supabase error soft deleting spin result: ${error}`);
      return false;
    }
  }

  /**
   * Restore a soft deleted spin result by ID
   */
  public async restoreSpinResult(id: string): Promise<boolean> {
    if (!this.client) {
      Logger.warn('📊 Supabase not configured, skipping spin result restoration');
      return false;
    }

    try {
      const { error } = await this.client
        .from('roulette_spin_results')
        .update({
          is_deleted: false,
          deleted_at: null
        })
        .eq('id', id);

      if (error) {
        Logger.error(`❌ Failed to restore spin result: ${error.message}`);
        return false;
      } else {
        console.log(`♻️ Spin result restored: ${id}`);
        return true;
      }
    } catch (error) {
      Logger.error(`❌ Supabase error restoring spin result: ${error}`);
      return false;
    }
  }

  /**
   * Permanently delete a spin result by ID (hard delete)
   */
  public async permanentlyDeleteSpinResult(id: string): Promise<boolean> {
    if (!this.client) {
      Logger.warn('📊 Supabase not configured, skipping permanent deletion');
      return false;
    }

    try {
      const { error } = await this.client
        .from('roulette_spin_results')
        .delete()
        .eq('id', id);

      if (error) {
        Logger.error(`❌ Failed to permanently delete spin result: ${error.message}`);
        return false;
      } else {
        console.log(`💥 Spin result permanently deleted: ${id}`);
        return true;
      }
    } catch (error) {
      Logger.error(`❌ Supabase error permanently deleting spin result: ${error}`);
      return false;
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