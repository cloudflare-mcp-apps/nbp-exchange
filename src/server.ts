import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeToolWithTokenConsumption } from "./shared/tool-executor";
import { executeGetCurrencyHistory } from "./tools/nbp-tools";
import { getExchangeRatePrompt, calculateExchangeCostPrompt } from "./optional/prompts";
import {
    GetCurrencyRateInput,
    GetGoldPriceInput,
    GetCurrencyHistoryInput
} from "./schemas/inputs";
import {
    GetCurrencyRateOutputSchema,
    GetGoldPriceOutputSchema,
    GetCurrencyHistoryOutputSchema
} from "./schemas/outputs";
import { fetchCurrencyRate, fetchGoldPrice } from "./api-client";
import { loadHtml } from "./helpers/assets";
import { UI_RESOURCES, UI_MIME_TYPE } from "./resources/ui-resources";
import type { Env } from "./types";
import type { Props } from "./auth/props";

/**
 * NBP Exchange MCP Server with WorkOS Authentication
 *
 * Provides access to Polish National Bank (NBP) currency exchange rates and gold prices
 * via their public API. All tools are protected by WorkOS Magic Auth authentication.
 *
 * Generic type parameters:
 * - Env: Cloudflare Workers environment bindings (KV, WorkOS credentials)
 * - unknown: No state management (stateless server)
 * - Props: Authenticated user context from WorkOS (user, tokens, permissions)
 *
 * Authentication flow:
 * 1. User connects via MCP client
 * 2. Redirected to WorkOS AuthKit (Magic Auth)
 * 3. User enters email → receives 6-digit code
 * 4. After authentication, user info available via this.props
 * 5. All NBP tools become accessible
 */
export class NbpMCP extends McpAgent<Env, unknown, Props> {
    server = new McpServer({
        name: "NBP Exchange Rates",
        version: "1.0.0",
    });

    // NO initialState - this is a stateless server
    // NO setState() - no state management needed
    // NO onStateUpdate() - no state to update

    async init() {
        // ========================================================================
        // UI RESOURCE REGISTRATION SECTION (SEP-1865 MCP Apps)
        // ========================================================================
        // Register UI widgets that can be linked to tools via _meta["ui/resourceUri"]
        const currencyRateResource = UI_RESOURCES.currencyRate;
        this.server.registerResource(
            currencyRateResource.name,
            currencyRateResource.uri,
            {
                description: currencyRateResource.description,
                mimeType: currencyRateResource.mimeType,
            },
            async () => {
                const templateHTML = await loadHtml(this.env.ASSETS, "/currency-rate.html");
                return {
                    contents: [{
                        uri: currencyRateResource.uri,
                        mimeType: UI_MIME_TYPE,
                        text: templateHTML,
                        _meta: currencyRateResource._meta,
                    }],
                };
            }
        );

        // ========================================================================
        // PROMPT REGISTRATION SECTION
        // ========================================================================
        // Prompts are now modularized in src/optional/prompts/index.ts
        // This makes them easier to maintain and update
        this.server.registerPrompt(
            getExchangeRatePrompt.name,
            getExchangeRatePrompt.config,
            getExchangeRatePrompt.handler
        );
        this.server.registerPrompt(
            calculateExchangeCostPrompt.name,
            calculateExchangeCostPrompt.config,
            calculateExchangeCostPrompt.handler
        );

        // ========================================================================
        // TOOL REGISTRATION SECTION
        // ========================================================================
        // Tools now use hybrid pattern:
        // - Simple tools (getCurrencyRate, getGoldPrice): Generic executor
        // - Complex tools (getCurrencyHistory): Tool extractor

        // Tool 1: Get currency rate (1 token) - Uses generic executor
        // Linked to Currency Rate Widget via _meta["ui/resourceUri"]
        this.server.registerTool(
            "getCurrencyRate",
            {
                title: "Get Currency Exchange Rate",
                description: "Get current or historical buy/sell exchange rates for a specific currency from the Polish National Bank (NBP). " +
                    "Returns bid (bank buy) and ask (bank sell) prices in Polish Zloty (PLN) from NBP Table C. " +
                    "Use this when you need to know how much a currency costs to exchange at Polish banks. " +
                    "Note: NBP only publishes rates on trading days (Mon-Fri, excluding Polish holidays). ",
                inputSchema: GetCurrencyRateInput,
                outputSchema: GetCurrencyRateOutputSchema,
                // Link tool to UI resource (SEP-1865)
                _meta: {
                    "ui/resourceUri": UI_RESOURCES.currencyRate.uri,
                },
            },
            async (params) => {
                if (!this.props?.userId) {
                    throw new Error("User ID not found in authentication context");
                }

                return executeToolWithTokenConsumption({
                    toolName: "getCurrencyRate",
                    toolCost: 1,
                    userId: this.props.userId,
                    tokenDb: this.env.TOKEN_DB,
                    inputs: params,
                    execute: async (inputs) => await fetchCurrencyRate(inputs.currencyCode, inputs.date),
                    sanitizationOptions: { maxLength: 5000, redactEmails: false }
                }) as any;
            }
        );

        // Tool 2: Get gold price (1 token) - Uses generic executor
        this.server.registerTool(
            "getGoldPrice",
            {
                title: "Get Gold Price",
                description: "Get the official price of 1 gram of gold (1000 millesimal fineness) in Polish Zloty (PLN) " +
                    "as calculated and published by the Polish National Bank (NBP). " +
                    "Use this for investment analysis, comparing gold prices over time, or checking current gold valuation. " +
                    "Note: Prices are only published on trading days (Mon-Fri, excluding holidays). " +
                    "Historical data available from January 2, 2013 onwards. ",
                inputSchema: GetGoldPriceInput,
                outputSchema: GetGoldPriceOutputSchema
            },
            async (params) => {
                if (!this.props?.userId) {
                    throw new Error("User ID not found in authentication context");
                }

                return executeToolWithTokenConsumption({
                    toolName: "getGoldPrice",
                    toolCost: 1,
                    userId: this.props.userId,
                    tokenDb: this.env.TOKEN_DB,
                    inputs: params,
                    execute: async (inputs) => await fetchGoldPrice(inputs.date),
                    sanitizationOptions: { maxLength: 5000, redactEmails: false }
                }) as any;
            }
        );

        // Tool 3: Get currency history (1 token) - Uses tool extractor (has pre-validation)
        this.server.registerTool(
            "getCurrencyHistory",
            {
                title: "Get Currency History",
                description: "Get a time series of historical exchange rates for a currency over a date range. " +
                    "Returns buy/sell rates (bid/ask) in PLN for each trading day within the specified period. " +
                    "Useful for analyzing currency trends, calculating average rates, or comparing rates across months. " +
                    "IMPORTANT: NBP API limit is maximum 93 days per query. Only trading days are included (weekends/holidays are skipped). ",
                inputSchema: GetCurrencyHistoryInput,
                outputSchema: GetCurrencyHistoryOutputSchema
            },
            async (params) => {
                if (!this.props?.userId) {
                    throw new Error("User ID not found in authentication context");
                }

                return executeGetCurrencyHistory(params, this.env, this.props.userId) as any;
            }
        );
    }
}
