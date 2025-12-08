import type {
    NbpCurrencyRateResponse,
    NbpGoldPriceResponse,
    CurrencyRateResult,
    GoldPriceResult,
    CurrencyHistoryResult,
} from "./types";

const NBP_API_BASE = "https://api.nbp.pl/api";
const REQUEST_TIMEOUT = 10000; // 10 seconds

/**
 * Fetch with timeout wrapper
 */
async function fetchWithTimeout(url: string, timeout = REQUEST_TIMEOUT): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                Accept: "application/json",
            },
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === "AbortError") {
            throw new Error("Request timeout - NBP API did not respond within 10 seconds");
        }
        throw new Error(`Network error: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Handle NBP API errors with user-friendly messages
 */
function handleNbpError(status: number, url: string): never {
    if (status === 404) {
        throw new Error(
            "No exchange rate data available for this date. NBP does not publish rates on weekends and holidays."
        );
    }
    if (status === 400) {
        throw new Error("Invalid request parameters. Please check the currency code and date format.");
    }
    throw new Error(`NBP API error: HTTP ${status}`);
}

/**
 * Fetch current or historical currency rate from NBP Table C
 */
export async function fetchCurrencyRate(
    currencyCode: string,
    date?: string
): Promise<CurrencyRateResult> {
    const endpoint = date
        ? `${NBP_API_BASE}/exchangerates/rates/c/${currencyCode}/${date}/`
        : `${NBP_API_BASE}/exchangerates/rates/c/${currencyCode}/`;

    const response = await fetchWithTimeout(endpoint);

    if (!response.ok) {
        handleNbpError(response.status, endpoint);
    }

    const data: NbpCurrencyRateResponse = await response.json();

    // NBP returns an array of rates, we need the first (and only) one
    if (!data.rates || data.rates.length === 0) {
        throw new Error("No rate data returned from NBP API");
    }

    const rate = data.rates[0];

    return {
        table: data.table,
        currency: data.currency,
        code: data.code,
        bid: rate.bid,
        ask: rate.ask,
        tradingDate: rate.tradingDate || rate.effectiveDate,
        effectiveDate: rate.effectiveDate,
    };
}

/**
 * Fetch current or historical gold price from NBP
 */
export async function fetchGoldPrice(date?: string): Promise<GoldPriceResult> {
    const endpoint = date
        ? `${NBP_API_BASE}/cenyzlota/${date}/`
        : `${NBP_API_BASE}/cenyzlota/`;

    const response = await fetchWithTimeout(endpoint);

    if (!response.ok) {
        handleNbpError(response.status, endpoint);
    }

    const data: NbpGoldPriceResponse[] = await response.json();

    // NBP returns an array, we need the first element
    if (!data || data.length === 0) {
        throw new Error("No gold price data returned from NBP API");
    }

    return {
        date: data[0].data,
        price: data[0].cena,
    };
}

/**
 * Fetch historical currency rates within a date range from NBP Table C
 */
export async function fetchCurrencyHistory(
    currencyCode: string,
    startDate: string,
    endDate: string
): Promise<CurrencyHistoryResult> {
    const endpoint = `${NBP_API_BASE}/exchangerates/rates/c/${currencyCode}/${startDate}/${endDate}/`;

    const response = await fetchWithTimeout(endpoint);

    if (!response.ok) {
        handleNbpError(response.status, endpoint);
    }

    const data: NbpCurrencyRateResponse = await response.json();

    if (!data.rates || data.rates.length === 0) {
        throw new Error("No rate data returned from NBP API for the specified date range");
    }

    return {
        table: data.table,
        currency: data.currency,
        code: data.code,
        rates: data.rates.map((rate) => ({
            tradingDate: rate.tradingDate || rate.effectiveDate,
            effectiveDate: rate.effectiveDate,
            bid: rate.bid,
            ask: rate.ask,
        })),
    };
}
