# NBP Exchange MCP Server

A Model Context Protocol (MCP) server for accessing Polish National Bank (NBP) exchange rates and gold prices.

## Features

- Get current & historical exchange rates for 12 major currencies
- Query official NBP gold prices
- Historical data series (up to 93 days)
- **Phase 2 Security**: Output sanitization and PII redaction with Polish market support

## Quick Start

```bash
npm install
npm run dev
```

Server runs at `http://localhost:8787`

## Available Tools

### `getCurrencyRate`
Get buy/sell exchange rates for a currency.

**Parameters:**
- `currencyCode` - USD, EUR, GBP, CHF, AUD, CAD, SEK, NOK, DKK, JPY, CZK, HUF
- `date` - Optional YYYY-MM-DD format

### `getGoldPrice`
Get NBP gold price (1g, 1000 millesimal fineness).

**Parameters:**
- `date` - Optional YYYY-MM-DD format

### `getCurrencyHistory`
Get historical exchange rates over a date range.

**Parameters:**
- `currencyCode` - Currency code
- `startDate` - YYYY-MM-DD format
- `endDate` - YYYY-MM-DD format (max 93 days)

## Endpoints

- `/sse` - Server-Sent Events transport
- `/mcp` - Streamable HTTP transport

## Available Commands

```bash
# Development
npm run dev              # Start local development server
npm run type-check       # Run TypeScript type checking
npm run cf-typegen       # Generate Cloudflare Workers type definitions

# Deployment
npm run deploy           # Deploy to Cloudflare Workers
```

## Usage Examples

### Example 1: Get Current USD Exchange Rate
```json
{
  "tool": "getCurrencyRate",
  "parameters": {
    "currencyCode": "USD"
  }
}
```

**Response:**
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

### Example 2: Get Historical EUR Rate
```json
{
  "tool": "getCurrencyRate",
  "parameters": {
    "currencyCode": "EUR",
    "date": "2025-09-15"
  }
}
```

### Example 3: Get Current Gold Price
```json
{
  "tool": "getGoldPrice",
  "parameters": {}
}
```

**Response:**
```json
{
  "date": "2025-10-01",
  "price": 446.64
}
```

### Example 4: Get Currency History (7 days)
```json
{
  "tool": "getCurrencyHistory",
  "parameters": {
    "currencyCode": "GBP",
    "startDate": "2025-09-01",
    "endDate": "2025-09-07"
  }
}
```

**Response:**
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

### Example 5: Analyze Currency Trend (1 month)
```json
{
  "tool": "getCurrencyHistory",
  "parameters": {
    "currencyCode": "CHF",
    "startDate": "2025-09-01",
    "endDate": "2025-09-30"
  }
}
```

## Testing with MCP Inspector

```bash
# Terminal 1: Start the server
npm run dev

# Terminal 2: Start MCP Inspector
npx @modelcontextprotocol/inspector

# Open browser: http://localhost:5173
# Connect to: http://localhost:8787/sse
```

## Security Features (Phase 2)

This server implements comprehensive output security powered by `@pilpat/mcp-security@1.1.0`:

### Output Sanitization
- **HTML/XSS Removal**: Strips all HTML tags and script content
- **Control Character Stripping**: Removes non-printable control characters
- **Whitespace Normalization**: Cleans excessive whitespace
- **Length Limiting**: Maximum 5000 characters per response

### PII Redaction
- **Credit Cards**: Full card number redaction
- **SSN/Tax IDs**: Social Security Number protection
- **Bank Accounts**: Account number redaction
- **Emails**: Preserved by default (v1.1.0+, configurable)
- **Phone Numbers**: General phone pattern redaction

### Polish Market Support (EU/GDPR Compliance)
- **PESEL**: Polish national ID (11 digits, e.g., 44051401359)
- **Polish ID Card**: Format ABC123456 (3 letters + 6 digits)
- **Polish Passport**: Format FG1234567 (2 letters + 7 digits)
- **Polish Phone Numbers**: +48 or 0048 prefix patterns

### Security Logging
All PII detections are logged for audit purposes:
```
[Security] Tool getCurrencyRate: Redacted PII types: pesel, polishPhone
```

### Expected PII Detection Rate
**~0%** - NBP API returns public exchange rate data. Any PII detection indicates data contamination and should be investigated immediately.

### Configuration Notes
- Email redaction is **disabled by default** (v1.1.0+) for business use cases
- To enable email redaction, see `src/server.ts:117` and `src/api-key-handler.ts:333`
- NIP (tax ID) and REGON (business registry) are **not redacted** (publicly searchable)

## Notes

- NBP publishes rates only on trading days (Mon-Fri, excluding holidays)
- Historical data: currencies from 2002-01-02, gold from 2013-01-02
- Maximum query range: 93 days
- Bid = bank buy price, Ask = bank sell price
