
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

    try {
      const { error } = await this.client
        .from('roulette_spin_results')
        .insert([{
          spin_number: spinNumber,
          color: color,
          parity: parity,
          timestamp: TimeUtils.getIndianISOForDB()
        }]);

      if (error) {
        Logger.error(`❌ Failed to store spin result: ${error.message}`);
        return false;
      } else {
        console.log(`🎰 Spin result stored: ${spinNumber} ${color} ${parity}`);
        return true;
      }
    } catch (error) {
      Logger.error(`❌ Supabase error storing spin result: ${error}`);
      return false;
    }
  }

  /**
   * Get the last N spin results (default 5)
   */
  public async getLastSpinResults(limit: number = 5, includeDeleted: boolean = false): Promise<SpinResult[]> {
    console.log(`🔍 DEBUG: SupabaseService.getLastSpinResults called - limit: ${limit}, includeDeleted: ${includeDeleted}`);
    console.log(`🔍 DEBUG: Supabase client configured: ${this.client ? 'YES' : 'NO'}`);
    
    if (!this.client) {
      Logger.warn('📊 Supabase not configured, returning mock spin results for testing');
      console.log('🔍 DEBUG: Supabase client is null - check environment variables');
      console.log('🔍 DEBUG: SUPABASE_URL exists:', !!CONFIG.SUPABASE_URL);
      console.log('🔍 DEBUG: SUPABASE_ANON_KEY exists:', !!CONFIG.SUPABASE_ANON_KEY);
      return this.getMockSpinResults(limit, includeDeleted);
    }

    try {
      console.log('🔍 DEBUG: Building Supabase query...');
      
      let query = this.client
        .from('roulette_spin_results')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);

      // Filter out deleted results unless explicitly requested
      if (!includeDeleted) {
        query = query.eq('is_deleted', false);
        console.log('🔍 DEBUG: Added filter for non-deleted results');
      }

      console.log('🔍 DEBUG: Executing Supabase query...');
      const { data, error } = await query;

      if (error) {
        Logger.error(`❌ Failed to fetch spin results: ${error.message}`);
        console.error('🔍 DEBUG: Supabase error details:', error);
        
        // Check if it's a table doesn't exist error
        if (error.message.includes('does not exist') || error.message.includes('relation')) {
          console.warn('📊 Database table does not exist, returning mock data for testing');
          return this.getMockSpinResults(limit, includeDeleted);
        }
        
        return [];
      }

      const resultText = includeDeleted ? 'spin results (including deleted)' : 'active spin results';
      console.log(`🎰 Retrieved ${data?.length || 0} ${resultText}`);
      console.log('🔍 DEBUG: Raw data from Supabase:', data);
      
      // If no data in database, return mock data for testing
      if (!data || data.length === 0) {
        console.warn('📊 No data in database, returning mock spin results for testing');
        return this.getMockSpinResults(limit, includeDeleted);
      }
      
      return data || [];
    } catch (error) {
      Logger.error(`❌ Supabase error fetching spin results: ${error}`);
      console.error('🔍 DEBUG: Exception in getLastSpinResults:', error);
      console.warn('📊 Database error, returning mock data for testing');
      return this.getMockSpinResults(limit, includeDeleted);
    }
  }

  /**
   * Get mock spin results for testing when database is not available
   */
  private getMockSpinResults(limit: number = 5, includeDeleted: boolean = false): SpinResult[] {
    const mockResults: SpinResult[] = [
      {
        id: 'mock-1',
        spin_number: 32,
        color: 'Red',
        parity: 'Even',
        is_deleted: false,
        timestamp: new Date().toISOString(),
        created_at: new Date().toISOString()
      },
      {
        id: 'mock-2',
        spin_number: 0,
        color: 'Green',
        parity: 'None',
        is_deleted: false,
        timestamp: new Date(Date.now() - 60000).toISOString(),
        created_at: new Date(Date.now() - 60000).toISOString()
      },
      {
        id: 'mock-3',
        spin_number: 15,
        color: 'Black',
        parity: 'Odd',
        is_deleted: false,
        timestamp: new Date(Date.now() - 120000).toISOString(),
        created_at: new Date(Date.now() - 120000).toISOString()
      },
      {
        id: 'mock-4',
        spin_number: 7,
        color: 'Red',
        parity: 'Odd',
        is_deleted: true,
        deleted_at: new Date(Date.now() - 30000).toISOString(),
        timestamp: new Date(Date.now() - 180000).toISOString(),
        created_at: new Date(Date.now() - 180000).toISOString()
      },
      {
        id: 'mock-5',
        spin_number: 22,
        color: 'Black',
        parity: 'Even',
        is_deleted: false,
        timestamp: new Date(Date.now() - 240000).toISOString(),
        created_at: new Date(Date.now() - 240000).toISOString()
      },
      {
        id: 'mock-6',
        spin_number: 35,
        color: 'Black',
        parity: 'Odd',
        is_deleted: false,
        timestamp: new Date(Date.now() - 300000).toISOString(),
        created_at: new Date(Date.now() - 300000).toISOString()
      },
      {
        id: 'mock-7',
        spin_number: 12,
        color: 'Red',
        parity: 'Even',
        is_deleted: true,
        deleted_at: new Date(Date.now() - 60000).toISOString(),
        timestamp: new Date(Date.now() - 360000).toISOString(),
        created_at: new Date(Date.now() - 360000).toISOString()
      }
    ];

    // Filter based on includeDeleted parameter
    let filteredResults = includeDeleted 
      ? mockResults 
      : mockResults.filter(result => !result.is_deleted);

    // Apply limit
    const limitedResults = filteredResults.slice(0, limit);
    
    console.log(`🧪 Returning ${limitedResults.length} mock spin results (includeDeleted: ${includeDeleted})`);
    return limitedResults;
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