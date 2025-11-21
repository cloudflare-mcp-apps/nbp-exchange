# NBP Exchange MCP Server - Mini Snapshot

**Generated**: 2025-11-20

---

- **Human-Readable Name**: NBP Exchange Rates MCP Server

- **Workers AI Status**: Not configured
- **AI Usage**: Not applicable (public exchange rate data)

- **AI Gateway Status**: Configured (environment variable) but not actively used
- **Gateway ID**: mcp-production-gateway (shared across all MCP servers)

- **Total Tools**: 3

  - Tool 1: getCurrencyRate
    - **Description (Verbatim)**: "Get current or historical buy/sell exchange rates for a specific currency from the Polish National Bank (NBP). Returns bid (bank buy) and ask (bank sell) prices in Polish Zloty (PLN) from NBP Table C. Use this when you need to know how much a currency costs to exchange at Polish banks. Note: NBP only publishes rates on trading days (Mon-Fri, excluding Polish holidays). ⚠️ This tool costs 1 token per use."
    - **Token Cost**: 1 token per use (unconditional flat cost)
    - **Input Schema**:
      - `currencyCode` (enum, required): Three-letter ISO 4217 code (USD, EUR, GBP, CHF, AUD, CAD, SEK, NOK, DKK, JPY, CZK, HUF)
      - `date` (string, optional): YYYY-MM-DD format
    - **Output Format**: JSON with table, currency, code, bid, ask, tradingDate, effectiveDate
    - Max Output Length: 5000 characters (post-sanitization)
    - **MCP Prompt Descriptions**: Not implemented

  - Tool 2: getGoldPrice
    - **Description (Verbatim)**: "Get the official price of 1 gram of gold (1000 millesimal fineness) in Polish Zloty (PLN) as calculated and published by the Polish National Bank (NBP). Use this for investment analysis, comparing gold prices over time, or checking current gold valuation. Note: Prices are only published on trading days (Mon-Fri, excluding holidays). Historical data available from January 2, 2013 onwards. ⚠️ This tool costs 1 token per use."
    - **Token Cost**: 1 token per use (unconditional flat cost)
    - **Input Schema**:
      - `date` (string, optional): YYYY-MM-DD format (must be after 2013-01-02)
    - **Output Format**: JSON with date, price
    - Max Output Length: 5000 characters (post-sanitization)
    - **MCP Prompt Descriptions**: Not implemented

  - Tool 3: getCurrencyHistory
    - **Description (Verbatim)**: "Get a time series of historical exchange rates for a currency over a date range. Returns buy/sell rates (bid/ask) in PLN for each trading day within the specified period. Useful for analyzing currency trends, calculating average rates, or comparing rates across months. IMPORTANT: NBP API limit is maximum 93 days per query. Only trading days are included (weekends/holidays are skipped). ⚠️ This tool costs 1 token per use."
    - **Token Cost**: 1 token per use (unconditional flat cost)
    - **Input Schema**:
      - `currencyCode` (enum, required): Three-letter ISO 4217 code
      - `startDate` (string, required): YYYY-MM-DD format (after 2002-01-02)
      - `endDate` (string, required): YYYY-MM-DD format (within 93 days of startDate)
    - **Output Format**: JSON with table, currency, code, rates array (tradingDate, effectiveDate, bid, ask)
    - Max Output Length: 5000 characters (post-sanitization)
    - **MCP Prompt Descriptions**: Not implemented

* **PII Redaction (is active)**: Yes - pilpat-mcp-security v1.1.0 with Polish patterns (PESEL, ID cards, passports, phones, credit cards, SSN, bank accounts). Email redaction disabled by default.

* **Primary Domain**: https://nbp-rates.wtyczki.ai

* **Workers AI status (is active, model)**: Not active - no Workers AI binding or usage

* **Caching strategy**: No caching implemented. Rationale: Real-time financial data expected by users; NBP API is free and fast (~100-300ms); rates updated daily (trading days only); TTL management complexity not justified for minimal performance gain.

---

**Architecture Notes**:
- Completely stateless Durable Object (no external API tokens to cache)
- Uniform pricing: All 3 tools cost 1 token (simplicity over granular pricing)
- Pre-validation pattern: Date range validated BEFORE token consumption
- External API: NBP Public REST API (no authentication required)
- Dual authentication: OAuth (server.ts) + API key (api-key-handler.ts)
- Security: Step 4.5 implemented in all 6 tool paths (3 OAuth + 3 API key)