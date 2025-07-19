/**
 * Time utilities for Indian Standard Time (IST / Asia/Kolkata)
 * Provides consistent timezone handling across the entire backend
 */

export class TimeUtils {
  private static readonly INDIAN_TIMEZONE = 'Asia/Kolkata';
  private static readonly INDIAN_LOCALE = 'en-IN';

  /**
   * Get current date/time formatted for Indian timezone
   */
  public static getIndianTimeString(): string {
    return new Intl.DateTimeFormat(this.INDIAN_LOCALE, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: this.INDIAN_TIMEZONE
    }).format(new Date());
  }

  /**
   * Get current date formatted for Indian timezone  
   */
  public static getIndianDateString(): string {
    return new Intl.DateTimeFormat(this.INDIAN_LOCALE, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: this.INDIAN_TIMEZONE
    }).format(new Date());
  }

  /**
   * Get full date and time formatted for Indian timezone
   */
  public static getIndianDateTimeString(): string {
    return new Intl.DateTimeFormat(this.INDIAN_LOCALE, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: this.INDIAN_TIMEZONE
    }).format(new Date());
  }

  /**
   * Convert a Date object to Indian timezone ISO string
   */
  public static toIndianISO(date: Date = new Date()): string {
    // Get the date in Indian timezone
    const indianTime = new Intl.DateTimeFormat('sv-SE', {
      timeZone: this.INDIAN_TIMEZONE,
      year: 'numeric',
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
    
    return `${indianTime.replace(' ', 'T')}.000+05:30`;
  }

  /**
   * Format a specific date for Indian timezone
   */
  public static formatDateForIndian(date: Date): string {
    return new Intl.DateTimeFormat(this.INDIAN_LOCALE, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: this.INDIAN_TIMEZONE
    }).format(date);
  }

  /**
   * Get current timestamp in IST for logging purposes
   */
  public static getIndianTimestamp(): string {
    const now = new Date();
    return new Intl.DateTimeFormat(this.INDIAN_LOCALE, {
      day: '2-digit',
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: this.INDIAN_TIMEZONE
    }).format(now);
  }

  /**
   * Get timezone offset for IST
   */
  public static getIndianTimezoneOffset(): string {
    return '+05:30';
  }

  /**
   * Get current date in IST for database storage (ISO format with IST offset)
   */
  public static getIndianISOForDB(): string {
    return this.toIndianISO();
  }
} 