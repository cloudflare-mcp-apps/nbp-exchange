/**
 * Server Instructions for NBP Exchange MCP Server
 *
 * These instructions are injected into the LLM's system prompt during MCP initialization
 * to provide context about tool usage patterns, performance characteristics, and constraints.
 *
 * Pattern: Purpose → Capabilities → Usage Patterns → Performance → Constraints
 * Aligned with: MCP Specification 2025-11-25, server_instruction_guide.md
 */

export const SERVER_INSTRUCTIONS = `
NBP Exchange Rates - Polish National Bank currency and gold price data

## Key Capabilities
- Current and historical exchange rates (12 currencies)
- Gold prices (1g in PLN, from 2013)
- Interactive widgets for data visualization

## Usage Patterns
- Use getCurrencyRate for single date/currency queries (triggers rate card widget)
- Use getCurrencyHistory for trend analysis (triggers chart widget) - max 93 days
- Use getGoldPrice for gold investment analysis

## Performance & Limits
- All tools: 0.5-3 seconds (direct NBP API, no caching)
- History queries limited to 93 days by NBP API
- Data published Mon-Fri only (trading days)

## Important Notes
- Weekend/holiday dates return 404 with explanation
- Historical data available from 2002 (rates) / 2013 (gold)
- Supported currencies: USD, EUR, GBP, CHF, AUD, CAD, SEK, NOK, DKK, JPY, CZK, HUF
`.trim();

export default SERVER_INSTRUCTIONS;
