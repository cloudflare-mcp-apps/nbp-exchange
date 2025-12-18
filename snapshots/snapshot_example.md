# NBP Exchange Rates MCP App - Infrastructure Snapshot

**Generated**: 2025-12-18
**Repository**: nbp-exchange
**Status**: Production
**Architecture**: MCP Apps (SEP-1865) - Resource Server with Shared D1 Database

---

## 1. Project Identity Metrics

- **Human-Readable Name**: NBP Exchange Rates
- **Server Slug**: nbp-exchange
- **Wrangler Name**: nbp-exchange
- **Server Description**: MCP server for Polish National Bank (NBP) currency exchange rates and gold prices. Access real-time and historical exchange rate data with interactive widgets.
- **Primary Domain**: https://nbp-rates.wtyczki.ai

### Visual Identity
- **Server Icon**: ✅ Implemented (using default)
- **Tool Icons**: ✅ Implemented (using tool metadata)
- **Display Name Resolution**: ✅ Title prioritization configured

### MCP Apps (SEP-1865) Configuration
- **Assets Binding**: ✅ ASSETS from ./web/dist/widgets
- **Widget Build System**: ✅ Vite + vite-plugin-singlefile
- **UI Resource URIs**: ui://nbp-exchange/currency-rate
- **Two-Part Registration**: ✅ Resource + Tool with _meta linkage

---

## 2. Required Functionalities Status

### 2.1 Dual Authentication (WorkOS + API Keys)
- **OAuth Path Status**: ✅ Implemented
  - Provider: WorkOS AuthKit
  - `/authorize` endpoint: ✅
  - `/callback` validation: ✅
  - USER_SESSIONS KV: ✅ Shared
  - Session expiration: 30 days (2,592,000 seconds)

- **API Key Path Status**: ✅ Implemented
  - `src/api-key-handler.ts`: ✅
  - Format validation (`wtyk_*`): ✅
  - DNS rebinding protection: ✅
  - Dual registration (registerTool + executor): ✅

- **Props Extraction**: ✅ { userId, email, user, permissions }
- **Shared Infrastructure**:
  - D1 Database (mcp-oauth): ✅ eac93639-d58e-4777-82e9-f1e28113d5b2
  - OAUTH_KV: ✅ b77ec4c7e96043fab0c466a978c2f186
  - USER_SESSIONS KV: ✅ e5ad189139cd44f38ba0224c3d596c73

### 2.2 Transport Protocol (McpAgent)
- **`/mcp` Endpoint (Streamable HTTP)**: ✅ Implemented
- **Durable Object Class**: NbpMCP extends McpAgent
- **WebSocket Hibernation**: ✅ Configured
- **McpAgent SDK**: agents v0.2.14

### 2.3 Tool Implementation (SDK 1.25+)
- **MCP SDK Version**: @modelcontextprotocol/sdk ^1.25.1
- **registerTool() API**: ✅ Used
- **outputSchema (Zod)**: ✅ Defined for all tools
- **structuredContent**: ✅ Returned
- **isError Flag**: ✅ Implemented
- **Tool Descriptions**: ✅ 4-part pattern (Purpose → Returns → Use Case → Constraints)

### 2.4 Tool Descriptions (4-Part Pattern)
- **Part 1 (Purpose)**: ✅ "Get [what]"
- **Part 2 (Returns)**: ✅ "Returns [fields]"
- **Part 3 (Use Case)**: ✅ "Use this when [scenario]"
- **Part 4 (Constraints)**: ✅ "Note: [limitations]"
- **Vendor names hidden**: ✅ NBP mentioned only in long descriptions for context
- **Dual-path consistency**: ✅ Identical

### 2.5 Centralized Login (panel.wtyczki.ai)
- **USER_SESSIONS KV Integration**: ✅ Implemented
- **Session cookie check**: ✅ Implemented
- **Database validation**: ✅ `is_deleted` check
- **Redirect flow**: ✅ Configured (redirects to panel.wtyczki.ai/auth/login-custom)

### 2.6 Prompts (SDK 1.20+ Server Primitive)
- **Prompts Capability**: ✅ Declared (capabilities.prompts: {})
- **Total Prompts Registered**: 2
- **registerPrompt() API**: ✅ Used
- **Zod Validation**: ✅ All parameters validated
- **Naming Convention**: ✅ snake_case

**Prompt List**:
1. **get_exchange_rate**: Get current exchange rate for a specific currency with BID/ASK explanation
2. **calculate_exchange_cost**: Calculate cost of exchanging PLN to foreign currency (or vice versa) with guided workflow

---

## 3. Optional Functionalities Status

### 3.1 Stateful Session
- **Status**: ❌ Not Needed
- **initialState**: N/A (stateless server)
- **State usage**: No Durable Object state management

### 3.2 Completions (OAuth only)
- **Status**: ❌ Not Implemented
- **completable() wrapper**: ❌
- **Use cases**: N/A

### 3.3 Workers AI (Pattern 3)
- **Status**: ⚠️ Configured but inactive
- **Binding**: AI
- **Model ID**: N/A (binding configured for future use)
- **Use cases**: Reserved for future AI-powered features
- **KV caching**: ❌

### 3.4 Workflows & Async Processing (Pattern 4)
- **Status**: ❌ Not configured
- **Binding**: N/A
- **Workflow Class**: N/A
- **Tool pair pattern**: ❌ N/A
- **R2 storage**: ❌ N/A

### 3.5 Rate Limiting (Pattern 5)
- **Status**: ⚠️ Planned
- **DO state tracking**: ❌
- **Multi-key rotation**: ❌
- **Backoff responses**: ❌

### 3.6 KV Caching Strategy
- **Status**: ❌ Not Implemented
- **Binding**: N/A (no caching - NBP API is fast and free)
- **Cache TTL**: N/A
- **Cache key pattern**: N/A

### 3.7 R2 Storage & Export
- **Status**: ❌ Not Implemented
- **Binding**: N/A
- **Bucket name**: N/A
- **Use cases**: N/A
- **Signed URLs**: ❌

### 3.8 ResourceLinks
- **Status**: ❌ Not Implemented
- **type: 'resource_link'**: ❌

### 3.9 Elicitation
- **Status**: ❌ Not Needed
- **Form mode**: ❌
- **URL mode**: ❌

### 3.10 Dynamic Tools
- **Status**: ❌ Not Implemented
- **Dynamic control methods**: N/A

### 3.11 Tasks Protocol (Experimental)
- **Status**: ❌ Not Needed
- **TaskManager DO**: ❌
- **tasks/get endpoint**: ❌
- **tasks/result endpoint**: ❌
- **tasks/cancel endpoint**: ❌

### 3.12 Resources (MCP Apps - SEP-1865)
- **Status**: ✅ Implemented
- **registerResource() API**: ✅ Used
- **Resource URIs**: ui://nbp-exchange/currency-rate
- **Resource Templates**: ✅ Predeclared
- **MIME Type**: text/html;profile=mcp-app (UI_MIME_TYPE constant)
- **Handler Pattern**: ✅ async handler with loadHtml()
- **_meta Field**: ✅ Includes title, icon, description, CSP

**Example Resource Registration**:
```typescript
this.server.registerResource(
    currencyRateResource.uri,    // "ui://nbp-exchange/currency-rate"
    currencyRateResource.uri,    // Same for predeclared resources
    {
        description: currencyRateResource.description,
        mimeType: UI_MIME_TYPE,
    },
    async () => {
        const html = await loadHtml(this.env.ASSETS, "/currency-rate.html");
        return {
            contents: [{
                uri: currencyRateResource.uri,
                mimeType: UI_MIME_TYPE,
                text: html,
                _meta: currencyRateResource._meta,
            }],
        };
    }
);
```

### 3.13 Sampling
- **Status**: ❌ Not Needed
- **createMessage() API**: ❌

---

## 4. Detailed Tool Audit (Tool Inventory)

### Tool Registry
**Total Tools**: 3

---

#### Tool 1: getCurrencyRate

**Technical Name**: `getCurrencyRate`

**Display Title**: Get Currency Exchange Rate

**Description (Verbatim)**:
> "Get current or historical buy/sell exchange rates for a specific currency from the Polish National Bank (NBP). Returns bid (bank buy) and ask (bank sell) prices in Polish Zloty (PLN) from NBP Table C. Use this when you need to know how much a currency costs to exchange at Polish banks. Note: NBP only publishes rates on trading days (Mon-Fri, excluding Polish holidays)."

**Input Schema**:
- `currencyCode` (string, required): Currency code - one of: USD, EUR, GBP, CHF, AUD, CAD, SEK, NOK, DKK, JPY, CZK, HUF
- `date` (string, optional): Date in YYYY-MM-DD format (defaults to latest available rate)

**Output Schema**:
- ✅ Defined
- **Fields**: table, currency (full name in Polish), code, bid (buy price), ask (sell price), tradingDate, effectiveDate

**Dual Auth Parity**: ✅ Confirmed
- OAuth Path: src/server.ts:120-153
- API Key Path (Registration): src/api-key-handler.ts:337-367
- API Key Path (Executor): src/api-key-handler.ts:825-854

**Implementation Details**:
- **External API**: Polish National Bank (NBP) Public API
- **Authentication**: None (public API)
- **Timeout**: 10 seconds (AbortController)
- **Cache TTL**: No caching
- **Pricing Model**: FREE (0 tokens)
- **Special patterns**: Two-part registration with UI widget linkage

**Output Format**:
- Returns currency rate object with bid/ask prices OR error message for weekends/holidays

**Tool Behavior Hints**:
- **readOnlyHint**: ✅ (read-only operation)
- **destructiveHint**: ❌
- **idempotentHint**: ✅ (repeated calls return same data for same input)
- **openWorldHint**: ✅ (external API data)

**MCP Prompt Integration**: ✅ Used in prompt get_exchange_rate

---

#### Tool 2: getGoldPrice

**Technical Name**: `getGoldPrice`

**Display Title**: Get Gold Price

**Description (Verbatim)**:
> "Get the official price of 1 gram of gold (1000 millesimal fineness) in Polish Zloty (PLN) as calculated and published by the Polish National Bank (NBP). Use this for investment analysis, comparing gold prices over time, or checking current gold valuation. Note: Prices are only published on trading days (Mon-Fri, excluding holidays). Historical data available from January 2, 2013 onwards."

**Input Schema**:
- `date` (string, optional): Date in YYYY-MM-DD format (defaults to latest available price)

**Output Schema**:
- ✅ Defined
- **Fields**: date (publication date), price (PLN per gram)

**Dual Auth Parity**: ✅ Confirmed
- OAuth Path: src/server.ts:156-184
- API Key Path (Registration): src/api-key-handler.ts:369-388
- API Key Path (Executor): src/api-key-handler.ts:856-877

**Implementation Details**:
- **External API**: Polish National Bank (NBP) Public API
- **Authentication**: None (public API)
- **Timeout**: 10 seconds
- **Cache TTL**: No caching
- **Pricing Model**: FREE (0 tokens)
- **Special patterns**: Simple async handler

**Output Format**:
- Returns gold price object OR error message for weekends/holidays

**Tool Behavior Hints**:
- **readOnlyHint**: ✅ (read-only operation)
- **destructiveHint**: ❌
- **idempotentHint**: ✅ (repeated calls return same data for same input)
- **openWorldHint**: ✅ (external API data)

**MCP Prompt Integration**: ❌ Not referenced in prompts

---

#### Tool 3: getCurrencyHistory

**Technical Name**: `getCurrencyHistory`

**Display Title**: Get Currency History

**Description (Verbatim)**:
> "Get a time series of historical exchange rates for a currency over a date range. Returns buy/sell rates (bid/ask) in PLN for each trading day within the specified period. Useful for analyzing currency trends, calculating average rates, or comparing rates across months. IMPORTANT: NBP API limit is maximum 93 days per query. Only trading days are included (weekends/holidays are skipped)."

**Input Schema**:
- `currencyCode` (string, required): Currency code - one of: USD, EUR, GBP, CHF, AUD, CAD, SEK, NOK, DKK, JPY, CZK, HUF
- `startDate` (string, required): Start date in YYYY-MM-DD format
- `endDate` (string, required): End date in YYYY-MM-DD format (max 93 days from startDate)

**Output Schema**:
- ✅ Defined
- **Fields**: table, currency, code, rates (array of daily bid/ask prices with effectiveDate)

**Dual Auth Parity**: ✅ Confirmed
- OAuth Path: src/server.ts:187-205
- API Key Path (Registration): src/api-key-handler.ts:390-409
- API Key Path (Executor): src/api-key-handler.ts:879-897

**Implementation Details**:
- **External API**: Polish National Bank (NBP) Public API
- **Authentication**: None (public API)
- **Timeout**: 10 seconds
- **Cache TTL**: No caching
- **Pricing Model**: FREE (0 tokens)
- **Special patterns**: Pre-validation (93-day limit, date ordering) before API call

**Output Format**:
- Returns time series object with array of daily rates OR validation error

**Tool Behavior Hints**:
- **readOnlyHint**: ✅ (read-only operation)
- **destructiveHint**: ❌
- **idempotentHint**: ✅ (repeated calls return same data for same input)
- **openWorldHint**: ✅ (external API data)

**MCP Prompt Integration**: ❌ Not referenced in prompts

---

## 5. UX & Frontend Quality Assessment (6 Pillars)

### Pillar I: Identity & First Impression
- **Unique server name**: ✅ "NBP Exchange Rates"
- **Server icons**: ✅ Configured in tool metadata
- **Tool icons**: ✅ Configured in tool metadata
- **Display name resolution**: ✅ Title prioritization implemented
- **4-part tool descriptions**: ✅ All tools follow pattern
- **Shared description constants**: ⚠️ Descriptions inline in server.ts (not centralized)

### Pillar II: Model Control & Quality
- **Server instructions (System Prompt)**: ❌ Not implemented (no server-instructions.ts file)
  - **Word count**: 0 words
  - **Coverage**: N/A
- **Input schema descriptions + examples**: ✅ All parameters documented
- **outputSchema**: ✅ All tools have Zod schemas
- **structuredContent**: ✅ All tools return structured data
- **Format examples**: ✅ Currency codes, date formats (YYYY-MM-DD)
- **Optional vs Required clarity**: ✅ Explicit in schemas
- **Cross-tool workflow patterns**: ⚠️ Documented in prompts but not system instructions

### Pillar III: Interactivity & Agency
- **Tool completions (autocomplete)**: ❌ Not implemented
- **Context-aware completions**: ❌ Not implemented
- **Elicitation (Forms/URLs)**: ❌ Not needed
- **Sampling capability**: ❌ Not needed
- **Prompt templates**: ✅ 2 prompts registered
- **Prompt arguments**: ✅ All prompts have validated arguments
- **Multi-modal prompts**: ❌ Text-only

### Pillar IV: Context & Data Management
- **Resource URIs & Templates**: ✅ Predeclared resource (ui://nbp-exchange/currency-rate)
- **Resource metadata & Icons**: ✅ _meta field with CSP, prefersBorder
- **ResourceLinks**: ❌ Not implemented
- **Embedded resources**: ✅ Widget HTML embedded in resource
- **Last modified & Priority**: ❌ Not applicable
- **Resource subscriptions**: ❌ Not implemented
- **Roots support**: ❌ Not applicable
- **Size hints & Truncation warnings**: ❌ Not needed

### Pillar V: Media & Content Handling
- **MIME type declaration**: ✅ text/html;profile=mcp-app
- **Audio & Image content (base64)**: ❌ Not applicable
- **Data URI support**: ❌ Not applicable
- **Content annotations (audience)**: ❌ Not implemented

### Pillar VI: Operations & Transparency
- **Tasks protocol support**: ❌ Not needed
- **Polling, Cancellation, TTL**: ❌ Not needed
- **Structured logs (RFC-5424)**: ✅ Structured logging via logger.ts
- **isError flag**: ✅ Implemented in all tool handlers

---

## 6. Deployment Status

### Consistency Tests
- **Script**: `../../scripts/verify-consistency.sh`
- **Result**: ✅ All checks passed

**Verified Components**:
- Durable Objects configuration: ✅
- KV namespace bindings: ✅
- D1 database binding: ✅
- R2 bucket binding: ❌ N/A
- Workers AI binding: ✅
- Workflows binding: ❌ N/A
- Custom domain configuration: ✅

### TypeScript Compilation
- **Command**: `npx tsc --noEmit`
- **Result**: ✅ No errors
- **Errors**: N/A

### Production URL
- **Primary Domain**: https://nbp-rates.wtyczki.ai
- **Workers.dev**: ✅ Disabled

**Custom Domain Configuration**:
- Pattern: nbp-rates.wtyczki.ai
- Custom Domain: ✅ Enabled
- Automatic DNS: ✅
- Automatic TLS: ✅

---

## 7. Infrastructure Components

### Cloudflare Assets (MCP Apps)
- **Binding**: ASSETS
- **Directory**: ./web/dist/widgets
- **Purpose**: Serving built widget HTML files for MCP Apps (SEP-1865)
- **Build Command**: npm run build:widgets
- **Widget Files**: currency-rate.html (470KB single-file bundle)

### Durable Objects
1. **NbpMCP extends McpAgent**: MCP protocol handling, stateless operation
   - Migration tag: v1
   - Purpose: Handle MCP protocol requests (no state management)

### KV Namespaces (Shared Across All MCP Apps)
1. **OAUTH_KV**: OAuth token storage for WorkOS AuthKit
   - ID: b77ec4c7e96043fab0c466a978c2f186
   - Preview ID: cf8ef9f38ab24ae583d20dd4e973810c
   - Purpose: McpAgent OAuth handling (required by agents SDK)

2. **USER_SESSIONS**: Centralized session management (shared with panel.wtyczki.ai)
   - ID: e5ad189139cd44f38ba0224c3d596c73
   - Preview ID: 49c43fb4d6e242db87fd885ba46b5a1d
   - Purpose: Cross-service session validation
   - TTL: 30 days (2,592,000 seconds)

### D1 Database (Shared Across All MCP Apps)
- **Binding**: TOKEN_DB
- **Database Name**: mcp-oauth
- **Database ID**: eac93639-d58e-4777-82e9-f1e28113d5b2
- **Tables**:
  - users (id, email, workos_user_id, created_at, is_deleted)
  - api_keys (id, user_id, key_hash, description, created_at, is_deleted)
- **Purpose**: Centralized authentication and authorization for all MCP servers
- **Note**: Database may contain additional tables; only authentication-related tables listed here

### R2 Storage
- **Binding**: N/A
- **Bucket Name**: N/A
- **Purpose**: N/A
- **Retention**: N/A
- **Public Access**: N/A

### Workers AI
- **Binding**: AI
- **Status**: ⚠️ Configured but inactive
- **Model(s)**: N/A (reserved for future use)
- **Use cases**: Future AI-powered features
- **Integration**: ❌ Not actively used

### AI Gateway (Shared)
- **Status**: ✅ Configured
- **Gateway ID**: mcp-production-gateway (shared across all MCP servers)
- **Environment Variable**: AI_GATEWAY_ID
- **Cache Policy**: 1-hour TTL for AI responses
- **Rate Limiting**: 60 requests/hour per user
- **Purpose**: Authentication, caching, and rate limiting for AI requests

### Workflows (Cloudflare)
- **Binding**: N/A
- **Workflow Name**: N/A
- **Class**: N/A
- **Status**: ❌ Not configured
- **Use cases**: N/A

### Secrets (Wrangler)
**Required (Shared)**:
1. **WORKOS_CLIENT_ID**: ✅ Set - WorkOS AuthKit client ID
2. **WORKOS_API_KEY**: ✅ Set - WorkOS API key for user validation

**Optional (Server-Specific)**:
3. None (NBP API is public and requires no authentication)

---

## 8. Architecture Patterns

### Authentication Architecture
- **Dual Transport**: ✅ OAuth + API Keys
  - OAuth Path: POST /mcp (McpAgent Durable Object)
  - API Key Path: POST /mcp (Direct HTTP handler with LRU cache)

### Caching Strategy
- **Pattern**: No Caching (Stateless Server)
- **Implementation**: All data fetched fresh from NBP API on each request

**Rationale**:
- NBP API is fast (responses in <1 second)
- NBP API is free (no rate limits or costs)
- Exchange rates change throughout the day
- Historical data doesn't benefit from caching

### Concurrency Control
- **Pattern**: None (stateless tool execution)
- **Implementation**: N/A

### Storage Architecture
- **Pattern**: Stateless External API Server
- **Workflow**: No state management, direct API calls to NBP

---

## 9. Code Quality

### Type Safety
- **TypeScript**: ✅ Strict mode
- **Zod Schemas**: ✅ All inputs validated
- **Custom Validation**: Currency code enum, date format (YYYY-MM-DD), 93-day limit for history

### Error Handling
- **Account deleted check**: ✅ Implemented (via shared D1 database)
- **External API failures**: ✅ Graceful handling with user-friendly messages
- **Invalid inputs**: ✅ Validated via Zod schemas
- **Empty/Zero results**: ✅ Handled (404 = weekend/holiday message)
- **Timeout handling**: ✅ 10-second AbortController
- **Date validation**: ✅ Pre-validation before API calls

### Observability
- **Cloudflare Observability**: ✅ Enabled

**Console Logging**:
- Authentication events (OAuth, API key validation)
- Tool execution (start, completion, failure)
- NBP API calls (success, errors, timeouts)
- UI resource registration
- Cache operations (hit, miss, eviction)

**Monitoring Points**:
- Tool execution duration
- API response times
- Error rates and types
- Session management

---

## 10. Technical Specifications

### Performance
- **Tool timeout**: 10 seconds per tool (AbortController)
- **Cache TTL**: N/A (no caching)
- **Max response size**: ~10KB (single currency rate) to ~100KB (93-day history)
- **Expected latency**:
  - getCurrencyRate: 0.5-2 seconds
  - getGoldPrice: 0.5-2 seconds
  - getCurrencyHistory: 1-3 seconds (depends on date range)

### Dependencies

**Production (Common Across MCP Apps)**:
```json
{
  "@cloudflare/workers-oauth-provider": "^0.1.0",
  "@modelcontextprotocol/ext-apps": "^0.2.0",
  "@modelcontextprotocol/sdk": "^1.25.1",
  "@workos-inc/node": "^7.70.0",
  "agents": "^0.2.14",
  "hono": "^4.10.4",
  "jose": "^6.1.0",
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "zod": "^4.1.13"
}
```

**Production (Widget-Specific)**:
```json
{
  "@radix-ui/react-slot": "^1.1.2",
  "class-variance-authority": "^0.7.1",
  "clsx": "^2.1.1",
  "tailwind-merge": "^3.4.0"
}
```

**Development**:
```json
{
  "@cloudflare/workers-types": "^4.20250101.0",
  "@types/react": "^18.3.0",
  "@types/react-dom": "^18.3.0",
  "@vitejs/plugin-react": "^4.3.4",
  "autoprefixer": "^10.4.20",
  "concurrently": "^9.2.1",
  "postcss": "^8.4.49",
  "tailwindcss": "^3.4.17",
  "tailwindcss-animate": "^1.0.7",
  "typescript": "^5.9.2",
  "vite": "^6.0.6",
  "vite-plugin-singlefile": "^2.0.3",
  "wrangler": "^4.40.1"
}
```

### SDK Versions
- **MCP SDK**: @modelcontextprotocol/sdk ^1.25.1
- **MCP Apps Extension**: @modelcontextprotocol/ext-apps ^0.2.0
- **Cloudflare Agents SDK**: agents ^0.2.14
- **WorkOS SDK**: @workos-inc/node ^7.70.0
- **Hono Framework**: hono ^4.10.4
- **Zod Validation**: zod ^4.1.13
- **JWT Handling**: jose ^6.1.0

---

## 11. Compliance Summary

| Check | Status | Notes |
|---|---|---|
| Vendor Hiding | ✅ | NBP mentioned in long descriptions for context only |
| Dual Auth Parity | ✅ | OAuth and API key paths identical |
| 4-Part Descriptions | ✅ | All tools follow pattern |
| Custom Domain | ✅ | nbp-rates.wtyczki.ai |
| Workers.dev Disabled | ✅ | Production security enforced |
| Consistency Tests | ✅ | All infrastructure checks passed |
| TypeScript Compilation | ✅ | No errors |
| Prompts Implemented | ✅ | 2 prompts registered |

---

## 12. Unique Architectural Features

### Dual Authentication Router
The NBP Exchange server implements a sophisticated authentication router that automatically detects whether a request is OAuth or API key based:

**Detection Logic**:
```typescript
function isApiKeyRequest(pathname: string, authHeader: string | null): boolean {
    if (pathname !== "/mcp") return false;
    const token = authHeader?.replace("Bearer ", "");
    return token?.startsWith("wtyk_");
}
```

**Flow**:
- API key requests (Bearer wtyk_*) → Direct to handleApiKeyRequest()
- OAuth/no auth → Delegate to OAuthProvider.fetch() → McpAgent flow

**Why This Matters**:
- Single endpoint (/mcp) handles both authentication methods
- Automatic routing based on token prefix
- No client configuration required
- Seamless experience for both OAuth and API key users

### LRU Server Cache (API Key Mode)
The API key path implements an ephemeral LRU cache for MCP server instances:
- **Max Size**: 1000 servers
- **Eviction**: Least Recently Used (LRU)
- **Cache Hit**: ~1ms response time
- **Cache Miss**: ~10-50ms server creation

**Safety**:
- Ephemeral (Worker-instance-specific)
- Non-persistent (cleared on Worker eviction)
- No critical state (all data from D1/NBP API)

**Rationale**:
- Avoids recreating MCP server on every API key request
- Improves response times significantly
- Prevents memory exhaustion via LRU eviction

### Centralized Session Management
Sessions are stored in shared KV namespace (USER_SESSIONS) with:
- **TTL**: 30 days (2,592,000 seconds)
- **Auto-Refresh**: Token refresh on expiration
- **Redirect Flow**: Unified login via panel.wtyczki.ai/auth/login-custom

**Benefits**:
- Single login across all MCP servers
- Persistent sessions (30 days)
- Unified user experience
- Automatic token management

### Free Public Service Model
Unlike typical MCP servers, NBP Exchange operates as a free service:
- **No token consumption**: All tools cost 0 tokens
- **No balance checks**: No database queries for balances
- **Public API**: NBP API requires no authentication
- **No rate limiting**: NBP API has no documented rate limits

**Rationale**:
- Currency exchange data is public information
- Educational and financial analysis use cases
- Demonstrates MCP Apps value without paywalls
- Reference implementation for free MCP services

### 93-Day Validation Pattern
The `getCurrencyHistory` tool implements pre-validation before API calls:
```typescript
// Pre-validate 93-day limit
if (daysDiff > 93) {
    throw new Error("Date range cannot exceed 93 days (NBP API limit)");
}

// Pre-validate date ordering
if (startDate > endDate) {
    throw new Error("Start date must be before or equal to end date");
}
```

**Why This Matters**:
- Prevents unnecessary API calls
- User-friendly error messages
- Reduces external API load
- Implements business logic locally

---

## 13. Known Issues & Limitations

1. **Trading Days Only**: NBP publishes rates only on weekdays (Mon-Fri) excluding Polish holidays
2. **No Real-Time Data**: Rates are typically published once per day (morning)
3. **Limited Currency Selection**: Only 12 major currencies (USD, EUR, GBP, CHF, AUD, CAD, SEK, NOK, DKK, JPY, CZK, HUF)
4. **93-Day History Limit**: Cannot fetch more than 93 days in single query
5. **No Weekend Rates**: Queries for weekend dates return 404 with explanatory message
6. **Polish Language**: Some field names (currency names) are in Polish

---

## 14. Future Roadmap

**Planned Components**:
- Historical trend analysis widget (line charts)
- Currency comparison tool (multiple currencies side-by-side)
- Email alerts for rate thresholds
- Export to CSV/Excel functionality

**Planned Use Cases**:
1. Currency portfolio tracking (monitor multiple currencies)
2. Automated currency conversion calculations
3. Historical rate analysis for business planning
4. Integration with accounting software

---

## 15. Testing Status

### Unit Tests
- **Status**: ❌ Not implemented
- **Coverage**: N/A

### Integration Tests
- **Status**: ❌ Not implemented
- **Endpoints tested**: N/A

### Manual Testing Checklist
- [x] OAuth flow (desktop client)
- [x] API key authentication
- [x] Tool execution (all tools)
- [x] Error handling scenarios
- [x] Widget rendering and functionality
- [ ] 93-day limit validation
- [ ] Weekend/holiday error messages
- [ ] Session expiration and refresh

---

## 16. Documentation Status

- **README.md**: ✅ Complete
- **API Documentation**: ⚠️ Incomplete (no server-instructions.ts)
- **Setup Guide**: ✅ Complete
- **Troubleshooting Guide**: ⚠️ Incomplete
- **Deployment Guide**: ✅ Complete

---

## 17. File Structure (MCP Apps Standard)

### Source Files (`src/`)
```
src/
├── index.ts                    # Entry point (Dual auth router, DO exports)
├── server.ts                   # McpAgent class (OAuth path)
├── api-key-handler.ts          # API key authentication path with LRU cache
├── api-client.ts               # NBP API client
├── types.ts                    # TypeScript type definitions
├── auth/                       # Authentication helpers
│   ├── authkit-handler.ts      # WorkOS OAuth flow
│   ├── apiKeys.ts              # API key generation/validation
│   ├── props.ts                # Auth context type
│   ├── auth-utils.ts           # Helper functions
│   └── session-types.ts        # Session interfaces
├── helpers/                    # Utility functions
│   └── assets.ts               # loadHtml() for Assets binding
├── optional/                   # Optional features
│   └── prompts/
│       └── index.ts            # Prompt definitions
├── resources/                  # UI resource definitions
│   └── ui-resources.ts         # UI_RESOURCES constant with uri, _meta
├── schemas/                    # Zod schemas
│   ├── inputs.ts               # Input validation schemas
│   └── outputs.ts              # Output schemas for structuredContent
├── shared/                     # Shared utilities
│   ├── logger.ts               # Logging helper
│   └── ai-gateway.ts           # AI Gateway helpers
└── tools/                      # Tool implementations
    └── nbp-tools.ts            # executeGetCurrencyHistory
```

### Widget Files (`web/widgets/`)
```
web/widgets/
├── currency-rate.html          # HTML entry point for Vite
└── currency-rate.tsx           # Widget implementation (React)
```

### Build Output (`web/dist/widgets/`)
```
web/dist/widgets/
└── currency-rate.html          # Single-file HTML output (470KB)
```

### Configuration Files
```
├── wrangler.jsonc              # Cloudflare Workers configuration
├── package.json                # Dependencies and scripts
├── tsconfig.json               # Server TypeScript configuration
├── tsconfig.web.json           # Widget TypeScript configuration
├── vite.config.ts              # Vite build configuration
├── tailwind.config.js          # Tailwind CSS configuration
├── components.json             # shadcn/ui configuration
└── postcss.config.js           # PostCSS configuration
```

### Common Scripts (package.json)
```json
{
  "scripts": {
    "dev": "wrangler dev",
    "dev:full": "concurrently \"npm run dev\" \"npm run watch:widgets\"",
    "deploy": "npm run build:widgets && wrangler deploy",
    "build:widget:rate": "INPUT=widgets/currency-rate.html vite build",
    "build:widgets": "npm run build:widget:rate",
    "watch:widgets": "npm run dev:widget",
    "dev:widget": "INPUT=widgets/currency-rate.html vite build --watch"
  }
}
```

---

**End of Snapshot**

---

## Appendix A: MCP Apps (SEP-1865) Quick Reference

### Two-Part Registration Pattern

**Part 1: Register Resource**
```typescript
this.server.registerResource(
    resourceUri,                    // "ui://nbp-exchange/currency-rate"
    resourceUri,                    // Same for predeclared
    { description, mimeType },
    async () => ({ contents: [{ uri, mimeType, text, _meta }] })
);
```

**Part 2: Register Tool with _meta Linkage**
```typescript
this.server.registerTool(
    toolId,
    {
        description,
        inputSchema,
        outputSchema,
        _meta: {
            [RESOURCE_URI_META_KEY]: resourceUri  // Links to UI
        }
    },
    async (params) => ({
        content: [{
            type: 'text',
            text: result
        }],
        structuredContent: validatedOutput,
        isError: false
    })
);
```

### Widget Build Configuration (vite.config.ts)
```typescript
export default defineConfig({
    plugins: [
        react(),
        viteSingleFile()  // Bundles to single HTML
    ],
    build: {
        rollupOptions: {
            input: process.env.INPUT || 'widgets/default.html'
        }
    }
});
```

---

## Appendix B: AnythingLLM Configuration Example

**Standard MCP Configuration** (for API key authentication):
```json
{
  "mcpServers": {
    "nbp-exchange": {
      "url": "https://nbp-rates.wtyczki.ai/mcp",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer wtyk_YOUR_API_KEY_HERE"
      }
    }
  }
}
```

**Notes**:
- Server name ("nbp-exchange") is a local identifier - customize as needed
- API key must start with `wtyk_` prefix
- Use `/mcp` endpoint for streamable HTTP transport

---

## Appendix C: Common Architecture Patterns

### Pattern 1: Stateless External API Server
**Example**: nbp-exchange (NBP Exchange Rates)
- No Durable Object state management
- Direct API calls to external service
- No caching (real-time data expected)
- Simple, synchronous tool execution

### Pattern 2: Stateful OAuth Token Caching
**Example**: opensky (OpenSky Flight Tracker)
- Durable Object stores OAuth access token
- Token auto-refresh every 30 minutes
- State: `{ opensky_access_token, opensky_token_expires_at }`

### Pattern 3: Pure Widget Server
**Example**: quiz (General Knowledge Quiz)
- No external API calls
- Widget manages state internally
- Single tool launches widget

---

## Appendix D: Checklist References

This snapshot template is based on the following checklists:
- `features/CHECKLIST_BACKEND.md` - Backend requirements
- `features/CHECKLIST_FRONTEND.md` - 6 Pillars of MCP Server Maturity
- `features/OPTIONAL_FEATURES.md` - Optional features guide
- `features/SERVER_REQUIREMENTS_CHECKLIST.md` - Required vs optional breakdown
- `features/UX_IMPLEMENTATION_CHECKLIST.md` - UX quality checklist

---

## Appendix E: Quick Commands

**Development**:
```bash
npm run dev                    # Start local dev server
npm run dev:full              # Dev server + widget watch mode
npm run type-check            # TypeScript validation
```

**Building & Deployment**:
```bash
npm run build:widgets         # Build all widgets
npm run deploy                # Build widgets + deploy to Cloudflare
```

**Secrets Management**:
```bash
wrangler secret put WORKOS_CLIENT_ID
wrangler secret put WORKOS_API_KEY
wrangler secret list          # View configured secrets
```

**Testing**:
```bash
../../scripts/verify-consistency.sh    # Verify infrastructure consistency
npx tsc --noEmit                       # Type check without building
```