/**
 * Cloudflare AI Gateway Integration
 *
 * This module provides utilities for routing AI requests through Cloudflare AI Gateway with:
 * - Authentication via cf-aig-authorization header
 * - Automatic rate limiting (60 requests/hour per user)
 * - Response caching (1-hour TTL)
 * - Error handling for rate limits and content moderation
 *
 * Documentation: https://developers.cloudflare.com/ai-gateway/
 */

import type { Env } from "./types";

export interface AIGatewayConfig {
  gatewayId: string;
  token: string;
  cacheTtl?: number;
}

export interface AIGatewayResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: number;
    message: string;
  };
  cacheStatus?: "HIT" | "MISS";
}

/**
 * Error codes from AI Gateway
 * Reference: https://developers.cloudflare.com/ai-gateway/reference/error-codes/
 */
export enum AIGatewayErrorCode {
  /** Rate limit exceeded */
  RATE_LIMIT = 429,
  /** Request prompt blocked by Guardrails */
  PROMPT_BLOCKED = 2016,
  /** Response blocked by Guardrails */
  RESPONSE_BLOCKED = 2017,
  /** Invalid gateway authentication */
  UNAUTHORIZED = 401,
  /** Gateway not found */
  NOT_FOUND = 404,
  /** Internal gateway error */
  INTERNAL_ERROR = 500,
}

/**
 * Make an authenticated request to Cloudflare AI Gateway
 *
 * @param config - AI Gateway configuration with ID and token
 * @param provider - AI provider (e.g., "workers-ai", "openai", "anthropic")
 * @param endpoint - Model or endpoint identifier
 * @param requestBody - Request payload to send to the AI provider
 * @returns Response from AI Gateway with cache status
 *
 * @example
 * ```typescript
 * const response = await makeAIGatewayRequest(
 *   { gatewayId: env.AI_GATEWAY_ID, token: env.AI_GATEWAY_TOKEN },
 *   "workers-ai",
 *   "@cf/meta/llama-3.1-8b-instruct",
 *   { prompt: "Tell me a joke" }
 * );
 *
 * if (!response.success) {
 *   if (response.error?.code === 429) {
 *     return { content: [{ type: "text", text: "Rate limit exceeded. Try again later." }], isError: true };
 *   }
 *   if (response.error?.code === 2016) {
 *     return { content: [{ type: "text", text: "Prompt blocked by content policy." }], isError: true };
 *   }
 * }
 *
 * return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
 * ```
 */
export async function makeAIGatewayRequest<T = unknown>(
  config: AIGatewayConfig,
  provider: "workers-ai" | "openai" | "anthropic" | string,
  endpoint: string,
  requestBody: Record<string, unknown>,
  cacheTtl: number = 3600
): Promise<AIGatewayResponse<T>> {
  const { gatewayId, token } = config;

  // Construct gateway URL based on provider
  const gatewayUrl = `https://gateway.ai.cloudflare.com/v1/${gatewayId}/${provider}/${endpoint}`;

  console.log(`[AI Gateway] Making authenticated request to ${provider}/${endpoint}`);

  try {
    const response = await fetch(gatewayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "cf-aig-authorization": `Bearer ${token}`,
        "cf-aig-cache-ttl": cacheTtl.toString(),
      },
      body: JSON.stringify(requestBody),
    });

    // Get cache status from response headers
    const cacheStatus = (response.headers.get("cf-cache-status") || "MISS") as "HIT" | "MISS";

    // Handle successful response
    if (response.ok) {
      const data = await response.json() as T;
      console.log(`[AI Gateway] ✅ Success (cache: ${cacheStatus})`);
      return { success: true, data, cacheStatus };
    }

    // Handle error responses
    const errorData = await response.json() as { error?: string; message?: string };
    const errorMessage = errorData.error || errorData.message || response.statusText;
    const errorCode = response.status;

    // Log specific error conditions
    if (errorCode === 429) {
      console.log("[AI Gateway] ⚠️ Rate limit exceeded (429)");
    } else if (errorCode === 2016) {
      console.log("[AI Gateway] 🚫 Prompt blocked by Guardrails (2016)");
    } else if (errorCode === 2017) {
      console.log("[AI Gateway] 🚫 Response blocked by Guardrails (2017)");
    } else if (errorCode === 401) {
      console.log("[AI Gateway] ❌ Unauthorized: Invalid authentication token");
    } else {
      console.log(`[AI Gateway] ❌ Error ${errorCode}: ${errorMessage}`);
    }

    return {
      success: false,
      error: {
        code: errorCode,
        message: errorMessage,
      },
      cacheStatus,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[AI Gateway] Network error: ${errorMsg}`);

    return {
      success: false,
      error: {
        code: AIGatewayErrorCode.INTERNAL_ERROR,
        message: `Network error: ${errorMsg}`,
      },
    };
  }
}

/**
 * Format AI Gateway error response for MCP tool
 *
 * @param error - Error object from AI Gateway response
 * @returns MCP-formatted error content for LLM
 *
 * @example
 * ```typescript
 * if (!response.success && response.error) {
 *   return {
 *     content: [formatAIGatewayError(response.error)],
 *     isError: true
 *   };
 * }
 * ```
 */
export function formatAIGatewayError(error: { code: number; message: string }): {
  type: "text";
  text: string;
} {
  const messages: Record<number, string> = {
    [AIGatewayErrorCode.RATE_LIMIT]: "❌ Rate limit exceeded. Your account has reached 60 requests per hour. Please try again later.",
    [AIGatewayErrorCode.PROMPT_BLOCKED]: "❌ Your request was blocked by our content safety system. Please rephrase your prompt.",
    [AIGatewayErrorCode.RESPONSE_BLOCKED]: "❌ The AI's response was blocked by our content safety system.",
    [AIGatewayErrorCode.UNAUTHORIZED]: "❌ Authentication failed. Please check your AI Gateway credentials.",
    [AIGatewayErrorCode.NOT_FOUND]: "❌ The requested AI Gateway or model was not found.",
    [AIGatewayErrorCode.INTERNAL_ERROR]: "❌ An internal error occurred. Please try again later.",
  };

  const message = messages[error.code] || `❌ Error (${error.code}): ${error.message}`;

  return {
    type: "text" as const,
    text: message,
  };
}

/**
 * Helper to format AI Gateway cache status for logging
 *
 * @param cacheStatus - Cache status from AI Gateway response
 * @returns Formatted string for logging
 */
export function formatCacheStatus(cacheStatus?: "HIT" | "MISS"): string {
  if (!cacheStatus) return "";
  return cacheStatus === "HIT" ? "⚡ [CACHE HIT]" : "[Cache Miss]";
}
