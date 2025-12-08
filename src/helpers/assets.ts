/**
 * Asset loading utilities for MCP App widgets
 *
 * Provides helper functions to load built HTML widget files from
 * Cloudflare Assets binding for serving via MCP UI resources.
 */

export type AssetsBinding = Fetcher;

/**
 * Load HTML content from Cloudflare Assets binding
 *
 * @param assets - Cloudflare Assets Fetcher binding
 * @param htmlPath - Path to the HTML file (e.g., "/currency-rate.html")
 * @returns HTML content as string
 * @throws Error if ASSETS binding is unavailable or file not found
 */
export async function loadHtml(
    assets: AssetsBinding | undefined,
    htmlPath: string
): Promise<string> {
    if (!assets) {
        throw new Error("ASSETS binding not available");
    }

    // Assets fetcher expects an absolute URL, so use a placeholder origin
    const buildRequest = (path: string) =>
        new Request(new URL(path, "https://assets.invalid").toString());

    const htmlResponse = await assets.fetch(buildRequest(htmlPath));

    if (!htmlResponse.ok) {
        throw new Error(`Failed to fetch HTML: ${htmlPath} (status: ${htmlResponse.status})`);
    }

    return await htmlResponse.text();
}
