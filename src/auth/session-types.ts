/**
 * Session Types for Centralized Authentication
 *
 * Defines the structure of sessions stored in USER_SESSIONS KV namespace.
 * These sessions are shared across all MCP servers for SSO functionality.
 */

/**
 * Enhanced session structure stored in USER_SESSIONS KV
 * Key format: workos_session:{sessionToken}
 */
export interface WorkOSSession {
  /** WorkOS user ID */
  user_id: string;
  /** User email address */
  email: string;
  /** Session expiration timestamp (milliseconds since epoch) */
  expires_at: number;
  /** WorkOS refresh token for session renewal */
  refresh_token: string;
  /** Session creation timestamp */
  created_at: number;
  /** Last access timestamp (updated on each validation) */
  last_accessed_at: number;
}

/**
 * Result of session validation
 */
export interface SessionValidationResult {
  /** Whether the session is valid */
  valid: boolean;
  /** Reason for invalid session */
  reason?: 'NO_SESSION' | 'EXPIRED' | 'REFRESH_FAILED';
  /** The validated (and possibly refreshed) session */
  session?: WorkOSSession;
}

/** Session duration: 30 days in milliseconds */
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

/** Session duration: 30 days in seconds (for KV TTL) */
export const SESSION_DURATION_SECONDS = 30 * 24 * 60 * 60;
