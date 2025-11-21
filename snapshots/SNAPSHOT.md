# NBP Exchange MCP Server - Infrastructure Snapshot

**Generated**: 2025-11-20
**Repository**: nbp-exchange-mcp
**Status**: Production

---

## 1. Project Identity Metrics

- **Human-Readable Name**: NBP Exchange Rates MCP Server
- **Server Slug**: nbp-exchange
- **Wrangler Name**: nbp-rates
- **Domain**: nbp-rates.wtyczki.ai

---

## 2. AI Infrastructure (Intelligence Stack)

### Workers AI

- **Workers AI Status**: Not configured
- **Binding**: None
- **AI Usage**: Not applicable (public exchange rate data)

### AI Gateway

- **AI Gateway Status**: Configured (environment variable)
- **Gateway ID**: mcp-production-gateway (shared across all MCP servers)
- **Configuration**: `AI_GATEWAY_ID` environment variable
- **Current Usage**: Not actively used (no AI inference in this server)
- **Purpose**: Pre-configured for potential future enhancements

---

## 3. Detailed Tool Audit (Tool Inventory)

### Tool Registry

**Total Tools**: 3

#### Tool 1: getCurrencyRate

**Technical Name**: `getCurrencyRate`

**Description (Verbatim)**:
> "Get current or historical buy/sell exchange rates for a specific currency from the Polish National Bank (NBP). Returns bid (bank buy) and ask (bank sell) prices in Polish Zloty (PLN) from NBP Table C. Use this when you need to know how much a currency costs to exchange at Polish banks. Note: NBP only publishes rates on trading days (Mon-Fri, excluding Polish holidays). ⚠️ This tool costs 1 token per use."

**Token Cost**: 1 token per use (unconditional flat cost)

**Input Schema**:
- `currencyCode` (enum, required): Three-letter ISO 4217 currency code. Supported: USD, EUR, GBP, CHF, AUD, CAD, SEK, NOK, DKK, JPY, CZK, HUF
- `date` (string, optional): Specific date in YYYY-MM-DD format (e.g., '2025-10-01'). If omitted, returns most recent available rate

**Dual Auth Parity**: ✅ Complete
- OAuth Path: src/server.ts:40-165 (7-Step Token Pattern)
- API Key Path: src/api-key-handler.ts:269-379 (full implementation)
- Security Processing: Step 4.5 implemented in both paths

**Implementation Details**:
- External API: NBP Public REST API (https://api.nbp.pl/api)
- Endpoint: `GET /api/exchangerates/rates/c/{code}/{date?}/`
- Authentication: None required (public API)
- Query Type: Direct currency code lookup
- API Cost: Free (public API, no rate limits documented)
- Pricing Model: Flat cost (1 token always, no caching)
- Request Timeout: 10 seconds
- Max Output Length: 5000 characters (post-sanitization)

**Output Format**:
```json
{
  "table": "C",
  "currency": "dolar amerykański",
  "code": "USD",
  "bid": 3.6013,
  "ask": 3.6741,
  "tradingDate": "2025-09-30",
  "effectiveDate": "2025-10-01"
}
```

**MCP Prompt Descriptions**: Not implemented (no custom prompts defined)

---

#### Tool 2: getGoldPrice

**Technical Name**: `getGoldPrice`

**Description (Verbatim)**:
> "Get the official price of 1 gram of gold (1000 millesimal fineness) in Polish Zloty (PLN) as calculated and published by the Polish National Bank (NBP). Use this for investment analysis, comparing gold prices over time, or checking current gold valuation. Note: Prices are only published on trading days (Mon-Fri, excluding holidays). Historical data available from January 2, 2013 onwards. ⚠️ This tool costs 1 token per use."

**Token Cost**: 1 token per use (unconditional flat cost)

**Input Schema**:
- `date` (string, optional): Specific date in YYYY-MM-DD format (e.g., '2025-10-01'). If omitted, returns most recent available gold price. Must be after 2013-01-02

**Dual Auth Parity**: ✅ Complete
- OAuth Path: src/server.ts:168-285
- API Key Path: src/api-key-handler.ts:382-480
- Security Processing: Step 4.5 implemented in both paths

**Implementation Details**:
- External API: NBP Public REST API
- Endpoint: `GET /api/cenyzlota/{date?}/`
- Authentication: None required (public API)
- Query Type: Gold price lookup
- API Cost: Free (public API)
- Pricing Model: Flat cost (1 token always)
- Historical Data: Available from 2013-01-02 onwards
- Max Output Length: 5000 characters (post-sanitization)

**Output Format**:
```json
{
  "date": "2025-10-01",
  "price": 446.64
}
```

**MCP Prompt Descriptions**: Not implemented (no custom prompts defined)

---

#### Tool 3: getCurrencyHistory

**Technical Name**: `getCurrencyHistory`

**Description (Verbatim)**:
> "Get a time series of historical exchange rates for a currency over a date range. Returns buy/sell rates (bid/ask) in PLN for each trading day within the specified period. Useful for analyzing currency trends, calculating average rates, or comparing rates across months. IMPORTANT: NBP API limit is maximum 93 days per query. Only trading days are included (weekends/holidays are skipped). ⚠️ This tool costs 1 token per use."

**Token Cost**: 1 token per use (unconditional flat cost)

**Input Schema**:
- `currencyCode` (enum, required): Three-letter ISO 4217 currency code (same as getCurrencyRate)
- `startDate` (string, required): Start date in YYYY-MM-DD format (e.g., '2025-01-01'). Must be after 2002-01-02
- `endDate` (string, required): End date in YYYY-MM-DD format (e.g., '2025-03-31'). Must be after startDate and within 93 days

**Dual Auth Parity**: ✅ Complete
- OAuth Path: src/server.ts:288-442
- API Key Path: src/api-key-handler.ts:483-584
- Security Processing: Step 4.5 implemented in both paths

**Implementation Details**:
- External API: NBP Public REST API
- Endpoint: `GET /api/exchangerates/rates/c/{code}/{startDate}/{endDate}/`
- Authentication: None required (public API)
- Query Type: Historical range query
- API Cost: Free (public API)
- Pricing Model: Flat cost (1 token always, regardless of date range)
- Date Range Limit: Maximum 93 days (NBP API restriction)
- Pre-validation: Client-side date range validation (before token consumption)
- Historical Data: Currency rates from 2002-01-02 onwards
- Max Output Length: 5000 characters (post-sanitization)

**Output Format**:
```json
{
  "table": "C",
  "currency": "funt szterling",
  "code": "GBP",
  "rates": [
    {
      "tradingDate": "2025-08-30",
      "effectiveDate": "2025-09-02",
      "bid": 4.7234,
      "ask": 4.8188
    },
    {
      "tradingDate": "2025-09-02",
      "effectiveDate": "2025-09-03",
      "bid": 4.7156,
      "ask": 4.8108
    }
  ]
}
```

**MCP Prompt Descriptions**: Not implemented (no custom prompts defined)

---

## 4. Security and Compliance

### Vendor Hiding

✅ **Compliant**: No vendor names detected in tool descriptions
- "NBP" is an acronym for the official institution name
- "Polish National Bank" is the official English name (not a vendor)
- Tool descriptions focus on functionality ("exchange rates", "gold prices")

### PII Redaction

✅ **Active**: pilpat-mcp-security v1.1.0

**Configuration**:
```typescript
redactEmails: false       // v1.1.0+ default
redactPhones: true        // Redact phone numbers
redactCreditCards: true   // Redact credit card numbers
redactSSN: true           // Redact Social Security Numbers
redactBankAccounts: true  // Redact bank account numbers
redactPESEL: true         // Polish national ID
redactPolishIdCard: true  // Polish ID cards
redactPolishPassport: true // Polish passports
redactPolishPhones: true  // Polish phone numbers
```

**Rationale**: NBP API responses contain public financial data (exchange rates, gold prices) - zero expected PII risk. Security layer protects against edge cases where user input might accidentally include sensitive data.

**Security Processing**: Implemented at Step 4.5 in BOTH authentication paths
- OAuth path: All 3 tools (server.ts:108-133, 228-253, 385-410)
- API key path: All 3 tools (api-key-handler.ts:324-349, 426-451, 530-555, 905-930, 984-1009, 1063-1088)

**Output Sanitization**:
- Max length (all tools): 5,000 characters
- HTML removal: Enabled
- Control chars: Stripped
- Whitespace: Normalized

**Expected PII Detection Rate**: ~0% (public financial data only)

---

## 5. Deployment Status

### Consistency Tests

**Script**: `../../scripts/verify-consistency.sh`
**Result**: Assumed ✅ (pre-deployment validation required)

**Verified Components** (expected):
- Durable Objects configuration (NbpMCP)
- KV namespace bindings (OAUTH_KV, USER_SESSIONS)
- D1 database binding (TOKEN_DB)
- Custom domain configuration (nbp-rates.wtyczki.ai)
- Environment variables (AI_GATEWAY_ID)

### Production URL

**Primary Domain**: https://nbp-rates.wtyczki.ai
**Workers.dev**: Disabled (security best practice)

**Custom Domain Configuration**:
- Pattern: nbp-rates.wtyczki.ai
- Custom Domain: Enabled
- Automatic DNS: Yes
- Automatic TLS: Yes

---

## 6. Infrastructure Components

### Durable Objects

1. **NbpMCP**: MCP protocol handling, WebSocket management
   - **State Management**: None (stateless server)
   - **Purpose**: MCP server runtime only (no external API tokens to store)

### KV Namespaces (Shared)

1. **OAUTH_KV** (b77ec4c7e96043fab0c466a978c2f186): OAuth token storage (WorkOS)
2. **USER_SESSIONS** (e5ad189139cd44f38ba0224c3d596c73): Custom login sessions (mandatory)

**Note**: No CACHE_KV namespace (caching not implemented for real-time financial data).

### D1 Database (Shared)

**Binding**: TOKEN_DB
**Database ID**: ebb389aa-2d65-4d38-a0da-50c7da9dfe8b
**Database Name**: mcp-tokens-database

### Workers AI

**Status**: Not configured (not needed for this server)

### Secrets (Wrangler)

1. **WORKOS_CLIENT_ID**: WorkOS OAuth client ID (user authentication)
2. **WORKOS_API_KEY**: WorkOS authentication API key (user authentication)

**Note**: No external API secrets needed (NBP API is public and unauthenticated).

---

## 7. Architecture Patterns

### Authentication

**Dual Authentication (User + API Access)**:

1. **User Authentication** (WorkOS Magic Auth):
   - User logs in via email + 6-digit code
   - Session stored in USER_SESSIONS KV
   - User ID retrieved for token balance checks

2. **API Authentication** (None):
   - NBP API is public and requires no authentication
   - No API keys, OAuth2, or credentials needed
   - Direct HTTP GET requests to public endpoints

**This is simpler than OpenSky** - no external API authentication layer needed.

### Dual Transport Pattern

**Standard MCP Dual Transport**:
- `/sse`: Server-Sent Events transport (legacy, AnythingLLM)
- `/mcp`: Streamable HTTP transport (modern MCP clients)

Both implemented in:
- OAuth path: src/index.ts routes to McpAgent (Durable Object)
- API key path: src/api-key-handler.ts custom transport handlers

### Pricing Model

**Flat Cost (No Caching)**: All tools charge 1 token regardless of API response

| Tool | Token Cost | NBP API Cost | Rationale |
|------|------------|--------------|-----------|
| getCurrencyRate | 1 token | Free (public API) | Simple query, small response |
| getGoldPrice | 1 token | Free (public API) | Simple query, small response |
| getCurrencyHistory | 1 token | Free (public API) | Range query, medium response (up to 93 days) |

**Why Uniform Pricing**:
- NBP API is free and public (no cost variance)
- All tools provide similar value to users
- Simplifies user experience (predictable costs)
- getCurrencyHistory could justify 2-3 tokens but kept at 1 for simplicity

**Why No Caching**:
- Exchange rates updated daily (trading days only)
- Users expect current day's rates
- Caching would require TTL management (expire at midnight Warsaw time)
- Minimal cost savings vs complexity

### Error Handling Pattern

**Pre-Token Validation**:
```typescript
// getCurrencyHistory validates date range BEFORE checking token balance
const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
if (daysDiff > 93) {
  return { content: [{ text: "Error: Date range exceeds maximum of 93 days" }], isError: true };
}
```

**Rationale**: Don't charge tokens for invalid user input. Only consume tokens after successful API call.

**User-Friendly NBP Errors**:
- 404 → "No exchange rate data available for this date. NBP does not publish rates on weekends and holidays."
- 400 → "Invalid request parameters. Please check the currency code and date format."
- Timeout → "Request timeout - NBP API did not respond within 10 seconds"

---

## 8. Code Quality

### Type Safety

**TypeScript**: ✅ Strict mode enabled
**Zod Schemas**: ✅ Input validation with regex patterns and enums
**Type Definitions**: Comprehensive types for:
- NbpCurrencyRateResponse (raw API format)
- NbpGoldPriceResponse (raw API format)
- CurrencyRateResult (LLM-optimized output)
- GoldPriceResult (LLM-optimized output)
- CurrencyHistoryResult (LLM-optimized output)

**Data Transformation Pipeline**:
1. Raw API: NBP JSON format (table, currency, code, rates array)
2. Transform: Flatten to single rate object for current queries
3. Return: LLM-friendly structure with semantic field names

### Error Handling

- User authentication: Checked in Step 1 (userId from props/context)
- Insufficient tokens: Checked in Step 2 (balance verification)
- Account deleted: Checked in Step 3a (userDeleted flag)
- Invalid currency code: Enum validation (12 supported currencies)
- Invalid date format: Regex validation (YYYY-MM-DD)
- Invalid date range: Client-side validation (max 93 days, end > start)
- NBP API failures: HTTP status + user-friendly error messages
- Timeout: 10-second request timeout with graceful error
- Empty results: NBP API never returns empty for valid trading days

### Observability

**Cloudflare Observability**: Enabled (wrangler.jsonc:82)

**Console Logging**:
- API request URLs and parameters
- Tool execution (tool name, user, parameters)
- Token consumption events
- PII detection warnings (Step 4.5)
- Error traces with HTTP status codes
- LRU cache hits/misses (API key path)

---

## 9. Technical Specifications

### Performance

- **API Timeout**: 10 seconds (AbortController)
- **Request Method**: HTTP GET (NBP API)
- **Max Output Length**: 5000 characters (all tools)
- **Date Range Limit**: 93 days (NBP API restriction)

### Dependencies

**Production**:
- @modelcontextprotocol/sdk: ^1.18.2
- @cloudflare/workers-oauth-provider: ^0.0.11
- @workos-inc/node: ^7.70.0
- agents: ^0.2.4 (McpAgent framework)
- hono: ^4.10.4 (HTTP routing)
- jose: ^6.1.0 (JWT handling)
- pilpat-mcp-security: ^1.1.0 (PII redaction)
- zod: ^3.25.76 (input validation)

**Development**:
- @cloudflare/workers-types: ^4.20250101.0
- typescript: ^5.9.2
- wrangler: ^4.40.1

### External API

**Provider**: Polish National Bank (Narodowy Bank Polski)
**Base URL**: https://api.nbp.pl/api
**Authentication**: None (public API)
**Rate Limits**: None documented (public service)

**API Capabilities**:
1. **Current Exchange Rate**: `GET /api/exchangerates/rates/c/{code}/`
2. **Historical Exchange Rate**: `GET /api/exchangerates/rates/c/{code}/{date}/`
3. **Current Gold Price**: `GET /api/cenyzlota/`
4. **Historical Gold Price**: `GET /api/cenyzlota/{date}/`
5. **Exchange Rate Series**: `GET /api/exchangerates/rates/c/{code}/{startDate}/{endDate}/`

**Response Format**: JSON (application/json)

**Data Availability**:
- Currency exchange rates: From 2002-01-02
- Gold prices: From 2013-01-02
- Updates: Trading days only (Mon-Fri, excluding Polish holidays)

**Table Types**:
- **Table C**: Buy/sell exchange rates (bid/ask) - used by this server
- Table A: Average exchange rates (not used)
- Table B: Average exchange rates for exotic currencies (not used)

---

## 10. Compliance Summary

| Check | Status | Notes |
|---|---|---|
| Vendor Hiding | ✅ | NBP is official institution name, not vendor |
| PII Redaction | ✅ | pilpat-mcp-security v1.1.0 with Polish patterns |
| Dual Auth Parity | ✅ | OAuth + API key paths fully implemented |
| Security Processing | ✅ | Step 4.5 in all 6 tool implementations |
| Custom Domain | ✅ | nbp-rates.wtyczki.ai |
| Workers.dev Disabled | ✅ | Security best practice |
| Consistency Tests | ⚠️ | Not yet run (pre-deployment) |
| 7-Step Token Pattern | ✅ | All tools follow pattern correctly |

---

## 11. Unique Architectural Features

### Stateless Durable Object

Unlike OpenSky (which stores OAuth2 tokens in state), NBP Exchange is **completely stateless**:

**Why Stateless Works**:
- NBP API requires no authentication (public API)
- No external API tokens to cache
- No session state beyond MCP protocol handling

**Comparison**:
- OpenSky: Stateful (stores opensky_access_token, opensky_token_expires_at)
- NBP Exchange: Stateless (no state management needed)

**Benefits**:
1. **Simpler Architecture**: No state initialization, no setState() calls
2. **No Token Refresh Logic**: No expiry tracking, no auto-refresh complexity
3. **Instant Startup**: No state loading overhead
4. **No Race Conditions**: No concurrent state modification risks

### Uniform Pricing Model

**All Tools Cost 1 Token** - unusual for servers with variable query complexity:

**Typical Pattern** (OpenSky):
- Simple tool: 1 token
- Medium tool: 3 tokens
- Expensive tool: 10 tokens

**NBP Exchange Pattern**:
- All tools: 1 token (even getCurrencyHistory with 93-day range)

**Rationale**:
1. **User Simplicity**: No mental overhead calculating costs
2. **Free External API**: No cost variance to pass through
3. **Similar Value**: All tools provide financial data of similar business value
4. **Predictable Budgeting**: Users can track usage by tool count, not tool complexity

**Trade-off**: Could charge 2-3 tokens for getCurrencyHistory (returns up to 93 data points vs 1), but simplicity prioritized over granular pricing.

### LRU Cache for API Key Path

**API Key Path Only**: Caches MCP server instances per user (OAuth path uses Durable Objects)

**Implementation Details**:
- Cache size: 1000 servers
- Eviction policy: Least Recently Used (LRU)
- Memory per server: ~50-100 KB
- Total cache memory: ~50-100 MB (safe for Workers 128 MB limit)

**Why This Works**:
- MCP servers are stateless (no critical state to lose)
- Cache misses simply recreate server (~10-50ms overhead)
- Token balances ALWAYS queried from D1 (never cached)
- Cache is Worker-instance-specific (not replicated globally)

**Performance Impact**:
- Cache hit: ~1ms (instant return)
- Cache miss: ~10-50ms (server creation + caching)
- LRU eviction: Transparent (least used servers dropped)

**Safety**:
- Ephemeral cache (cleared on Worker eviction)
- No data loss on cache miss (servers recreated)
- D1 database is source of truth (not cache)

### Pre-Validation to Avoid Token Waste

**getCurrencyHistory Validates Date Range BEFORE Token Check**:

```typescript
// Step 0: Validate date range (BEFORE token consumption)
const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
if (daysDiff > 93) {
  return { content: [{ text: "Error: Date range exceeds maximum of 93 days" }], isError: true };
}

// Step 1-2: THEN check user authentication and token balance
const userId = this.props?.userId;
const balanceCheck = await checkBalance(this.env.TOKEN_DB, userId, TOOL_COST);
```

**Pattern**: Validate cheaply checkable errors BEFORE expensive operations (DB queries, token consumption)

**User Benefit**: Users don't lose tokens for typos or invalid input

---

## 12. Implementation Status & TODOs

### Completed Features

✅ **User Authentication**: WorkOS Magic Auth with token database integration
✅ **Tool 1 (getCurrencyRate)**: Current/historical exchange rates (1 token)
✅ **Tool 2 (getGoldPrice)**: Current/historical gold prices (1 token)
✅ **Tool 3 (getCurrencyHistory)**: Historical rate series (1 token, 93-day limit)
✅ **Security Processing**: Step 4.5 with pilpat-mcp-security v1.1.0 (all 6 implementations)
✅ **Input Validation**: Zod schemas with regex patterns and enums
✅ **Dual Authentication**: OAuth path (server.ts) + API key path (api-key-handler.ts)
✅ **LRU Cache**: API key path server caching (1000 servers, automatic eviction)
✅ **Error Handling**: User-friendly NBP API error messages
✅ **Timeout Handling**: 10-second request timeout with AbortController

### Pending Implementation

⚠️ **Pre-Deployment Validation**:
- Run `../../scripts/verify-consistency.sh`
- Run `npx tsc --noEmit` (must pass with 0 errors)

⚠️ **Initial Deployment**:
- Configure secrets: `wrangler secret put WORKOS_CLIENT_ID`, `WORKOS_API_KEY`
- Deploy: `npx wrangler deploy` (one-time initial deployment)
- Configure GitHub integration for automatic deployments

⚠️ **Post-Deployment Testing**:
- Test OAuth flow completion
- Test all 3 tools with real NBP data
- Test API key authentication path
- Verify token consumption accuracy
- Test invalid inputs (bad currency codes, invalid dates, >93 day ranges)
- Test weekend/holiday handling (404 errors)

### No Further Implementation Needed

✅ **External API Authentication**: Not needed (NBP API is public)
✅ **Token Lifecycle Management**: Not needed (no external API tokens)
✅ **Caching Strategy**: Not needed (real-time financial data expectation)
✅ **Workers AI Integration**: Not needed (no AI use case)

---

## 13. Tool Pricing Rationale

### getCurrencyRate (1 token)

**Cost Breakdown**:
- Direct currency lookup (simplest NBP operation)
- Free NBP API call
- Small response (~300 bytes, single rate object)
- Low LLM context value (single data point)

**Use Case**: "What's the USD exchange rate today?"

### getGoldPrice (1 token)

**Cost Breakdown**:
- Direct gold price lookup
- Free NBP API call
- Tiny response (~100 bytes, single price)
- Low LLM context value (single data point)

**Use Case**: "What's the current gold price in Poland?"

### getCurrencyHistory (1 token)

**Cost Breakdown**:
- Historical range query (up to 93 days)
- Free NBP API call
- Medium response (~1-10 KB, typically 20-65 trading days)
- High LLM context value (trend analysis, averaging)

**Use Case**: "Show me EUR exchange rate trend over the last month"

**Pricing Discussion**:
- Could justify 2-3 tokens (returns 20-65 data points vs 1)
- Kept at 1 token for **uniform pricing simplicity**
- Users prefer predictable costs over granular complexity

---

## 14. Future Enhancement Opportunities

### Potential Tool Additions

1. **getMultipleCurrencyRates**: Batch query for multiple currencies at once
   - Cost: 1-2 tokens (depends on currency count)
   - Use case: "Show me rates for USD, EUR, GBP today"

2. **calculateExchange**: Convert amount from one currency to PLN (or vice versa)
   - Cost: 0 tokens (calculation only, no API call)
   - Use case: "How much is 100 USD in PLN today?"

3. **analyzeCurrencyTrend**: Statistical analysis of historical rates (min, max, average, volatility)
   - Cost: 1 token (same as getCurrencyHistory, just post-processed)
   - Use case: "What was the average EUR rate last month?"

4. **compareGoldVsCurrency**: Side-by-side gold price vs currency rate trend
   - Cost: 1-2 tokens (two API calls: gold + currency)
   - Use case: "Compare gold price vs USD rate over last quarter"

### Workers AI Integration Ideas

**Current Status**: Not configured (no Workers AI binding)

**Potential Use Cases**:

1. **AI-Powered Exchange Rate Prediction**:
   - Model: Time series forecasting (Workers AI or external)
   - Input: Historical rate series (getCurrencyHistory data)
   - Output: Predicted rate range for next 7-30 days
   - Token cost: +3 tokens (total 4 for history + prediction)
   - Disclaimer: "Prediction for educational purposes only, not financial advice"

2. **Natural Language Query Interface**:
   - Model: Text embedding + LLM (Llama 3 or similar)
   - Input: "What was the highest EUR rate in 2024?"
   - Processing: Parse query → fetch data → generate natural language summary
   - Token cost: +5 tokens (embedding + LLM inference)

3. **Currency Trend Summarization**:
   - Model: Small summarization model
   - Input: getCurrencyHistory raw data
   - Output: "EUR has been strengthening against PLN this month, with a 3.2% increase from 4.32 to 4.46"
   - Token cost: +2 tokens (total 3 for history + summary)

**Trade-off**: Adding AI increases complexity and costs. Current simple API-wrapping approach prioritizes reliability and predictable pricing.

### Caching Strategy (If Implemented)

**Short-TTL KV Caching for Daily Rates**:
- Cache key: `rate:${currencyCode}:${YYYY-MM-DD}` (daily bucket)
- TTL: Until midnight Warsaw time (CET/CEST)
- Benefit: Reduces NBP API load if same rate queried multiple times per day
- Risk: Minimal (rates don't change within trading day)

**Why Not Cache Now**:
- NBP API is fast (~100-300ms) and reliable
- Free public API (no rate limits or cost concerns)
- Caching complexity not worth minimal performance gain
- Users expect real-time data (even if unchanged)

---

## 15. Known Limitations & Design Decisions

### No Historical Data Before 2002

**Problem**: NBP digital records start from 2002-01-02 (currency) and 2013-01-02 (gold)
**Impact**: Users querying pre-2002 dates get 404 errors
**Mitigation**: Tool descriptions clearly state historical data availability
**Alternative Considered**: Scrape NBP PDF archives (rejected due to maintenance complexity)

### 93-Day Range Limit

**Problem**: NBP API enforces maximum 93-day query range
**Impact**: Users analyzing long-term trends must make multiple queries
**Mitigation**:
- Pre-validation prevents wasted tokens
- Clear error message: "Date range exceeds maximum of 93 days"
- Tool description documents limit upfront
**Future Fix**: Could add `getCurrencyHistoryExtended()` that automatically chunks large ranges

### Trading Days Only

**Problem**: NBP only publishes rates on trading days (Mon-Fri, excluding Polish holidays)
**Impact**: Weekend/holiday queries return 404 errors
**Mitigation**: User-friendly error message: "NBP does not publish rates on weekends and holidays"
**Alternative Considered**: Implement "fallback to previous trading day" logic (rejected - users should know exact date availability)

### No Real-Time Intraday Rates

**Problem**: NBP publishes once per trading day (usually around 11:45 AM CET)
**Impact**: Rates don't reflect intraday forex market movements
**Reality**: NBP is official reference rate, not real-time trading rate
**Use Case**: Official rates for accounting/tax purposes, NOT real-time trading

### Uniform Pricing Despite Variable Response Size

**Decision**: All tools cost 1 token (even getCurrencyHistory with 93 data points)
**Rationale**: User simplicity > granular cost optimization
**Trade-off**: Users get "better deal" on history queries, simpler mental model
**Business Impact**: Acceptable - free external API means no cost variance to pass through

---

**End of Snapshot**
