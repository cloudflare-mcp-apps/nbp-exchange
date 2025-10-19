/**
 * Cloudflare Workers environment bindings
 *
 * This interface defines all the bindings available to the NBP MCP server,
 * including WorkOS authentication credentials and Cloudflare resources.
 */
export interface Env {
    /** KV namespace for storing OAuth tokens and session data */
    OAUTH_KV: KVNamespace;

    /** Durable Object namespace for MCP server instances (required by McpAgent) */
    MCP_OBJECT: DurableObjectNamespace;

    /** D1 Database for token management (shared with mcp-token-system) */
    DB: D1Database;

    /** WorkOS Client ID (public, used to initiate OAuth flows) */
    WORKOS_CLIENT_ID: string;

    /** WorkOS API Key (sensitive, starts with sk_, used to initialize WorkOS SDK) */
    WORKOS_API_KEY: string;

    /** KV namespace for custom login session storage (optional, required for custom branded login) */
    USER_SESSIONS?: KVNamespace;
}

// NBP API response types
export interface NbpCurrencyRateResponse {
    table: string;
    currency: string;
    code: string;
    rates: Array<{
        no: string;
        effectiveDate: string;
        tradingDate?: string;  // Only present in Table C responses
        bid: number;
        ask: number;
    }>;
}

export interface NbpGoldPriceResponse {
    data: string;  // API returns 'data' not 'date'
    cena: number;  // API returns 'cena' (Polish for 'price')
}

// Formatted responses for MCP tools
export interface CurrencyRateResult {
    table: string;
    currency: string;
    code: string;
    bid: number;
    ask: number;
    tradingDate: string;
    effectiveDate: string;
}

export interface GoldPriceResult {
    date: string;
    price: number;
}

export interface CurrencyHistoryResult {
    table: string;
    currency: string;
    code: string;
    rates: Array<{
        tradingDate: string;
        effectiveDate: string;
        bid: number;
        ask: number;
    }>;
}
