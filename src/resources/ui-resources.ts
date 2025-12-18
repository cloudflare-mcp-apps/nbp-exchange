/**
 * MCP App UI Resource Definitions (SEP-1865)
 *
 * Defines UI resources that can be linked to MCP tools via the
 * _meta["ui/resourceUri"] field, enabling rich interactive widgets
 * to be displayed in MCP-capable chat clients.
 */

/**
 * MIME type for MCP App UI resources
 * Uses profile parameter to indicate MCP App compliance
 * Note: This value matches the SEP-1865 specification
 */
export const UI_MIME_TYPE = "text/html;profile=mcp-app" as const;

/**
 * UI Resource definitions for NBP Exchange widgets
 */
export const UI_RESOURCES = {
    /**
     * Currency Rate Widget
     *
     * Interactive card displaying bid/ask exchange rates for a single currency.
     * Features:
     * - Large bid/ask price display with color coding
     * - Spread calculation
     * - Date information
     * - Refresh button for updated rates
     * - Link to NBP official page
     */
    currencyRate: {
        /** Unique URI identifying this UI resource */
        uri: "ui://nbp-exchange/currency-rate",

        /** Resource name for registration */
        name: "currency_rate_widget",

        /** Human-readable description */
        description: "Interactive currency exchange rate display card showing NBP bid/ask prices",

        /** MIME type indicating this is an MCP App */
        mimeType: UI_MIME_TYPE,

        /** SEP-1865 UI metadata */
        _meta: {
            ui: {
                csp: {
                    // connectDomains: Empty because all data comes via MCP protocol (no external API calls from widget)
                    // Currency exchange rate data is received via ui/notifications/tool-result postMessage
                    connectDomains: [] as string[],
                    // resourceDomains: Empty because all resources (React, shadcn/ui, Tailwind) are inlined by viteSingleFile
                    // The widget is a self-contained single HTML file with no external dependencies
                    resourceDomains: [] as string[],
                },
                /** Request visible border from host client */
                prefersBorder: true,
            },
        },
    },

    /**
     * Currency History Chart Widget
     *
     * Interactive line chart displaying historical bid/ask exchange rates.
     * Features:
     * - Dual-line chart (bid in green, ask in red)
     * - Date range up to 93 days
     * - Summary statistics (average, min/max, trend)
     * - Refresh button for re-fetching data
     * - Link to NBP official page
     */
    currencyHistory: {
        /** Unique URI identifying this UI resource */
        uri: "ui://nbp-exchange/currency-history",

        /** Resource name for registration */
        name: "currency_history_widget",

        /** Human-readable description */
        description: "Interactive historical exchange rate chart showing NBP bid/ask price trends over time",

        /** MIME type indicating this is an MCP App */
        mimeType: UI_MIME_TYPE,

        /** SEP-1865 UI metadata */
        _meta: {
            ui: {
                csp: {
                    // connectDomains: Empty because all data comes via MCP protocol
                    connectDomains: [] as string[],
                    // resourceDomains: Empty because all resources are inlined by viteSingleFile
                    resourceDomains: [] as string[],
                },
                /** Request visible border from host client */
                prefersBorder: true,
            },
        },
    },
} as const;

/**
 * Type helper for UI resource URIs
 */
export type UiResourceUri = typeof UI_RESOURCES[keyof typeof UI_RESOURCES]["uri"];
