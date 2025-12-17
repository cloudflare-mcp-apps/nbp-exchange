/**
 * NBP Tool Extractors - FREE MCP Server
 *
 * No token consumption - just API calls.
 */

import type { Env } from "../types";
import type { GetCurrencyHistoryParams } from "../schemas/inputs";
import { fetchCurrencyHistory } from "../api-client";

/**
 * Tool result interface for MCP protocol
 */
interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: any;
  isError?: boolean;
}

/**
 * Execute getCurrencyHistory tool
 *
 * FREE tool - no token consumption, just validation and API call.
 */
export async function executeGetCurrencyHistory(
  params: GetCurrencyHistoryParams,
  _env: Env,
  userId: string
): Promise<ToolResult> {
  const TOOL_NAME = "getCurrencyHistory";

  // Validate date range (NBP API limit: 93 days)
  const start = new Date(params.startDate);
  const end = new Date(params.endDate);
  const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  if (daysDiff > 93) {
    return {
      content: [{
        type: "text",
        text: "Error: Date range exceeds maximum of 93 days. Please reduce the range."
      }],
      isError: true
    };
  }

  if (daysDiff < 0) {
    return {
      content: [{
        type: "text",
        text: "Error: End date must be after start date."
      }],
      isError: true
    };
  }

  try {
    const result = await fetchCurrencyHistory(params.currencyCode, params.startDate, params.endDate);
    console.log(`[Tool] ${TOOL_NAME} completed for user ${userId}`);

    const resultText = JSON.stringify(result, null, 2);

    return {
      content: [{ type: "text", text: resultText }],
      structuredContent: result
    };
  } catch (error) {
    console.error(`[Tool] ${TOOL_NAME} failed: ${error}`);
    return {
      content: [{
        type: "text",
        text: `Error: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true
    };
  }
}
