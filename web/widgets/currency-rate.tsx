/**
 * NBP Currency Rate Widget
 *
 * Interactive MCP App widget displaying exchange rates from the
 * Polish National Bank (NBP). Shows bid/ask prices with spread
 * calculation and refresh capability.
 *
 * Features:
 * - Bid/Ask price display with color coding
 * - Spread calculation
 * - Date information (effectiveDate)
 * - Refresh button to fetch latest rates
 * - External link to NBP official page
 * - Dark mode support from host theme
 */
import { StrictMode, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import "../styles/globals.css";

// Lucide icons inline (avoiding extra dependency weight)
const Loader2 = ({ className }: { className?: string }) => (
    <svg
        className={className}
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
);

const RefreshCw = ({ className }: { className?: string }) => (
    <svg
        className={className}
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
        <path d="M8 16H3v5" />
    </svg>
);

const ExternalLink = ({ className }: { className?: string }) => (
    <svg
        className={className}
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M15 3h6v6" />
        <path d="M10 14 21 3" />
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
);

const TrendingUp = ({ className }: { className?: string }) => (
    <svg
        className={className}
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
    </svg>
);

const TrendingDown = ({ className }: { className?: string }) => (
    <svg
        className={className}
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
        <polyline points="16 17 22 17 22 11" />
    </svg>
);

/**
 * Currency rate data structure from getCurrencyRate tool
 */
interface CurrencyRateData {
    table: string;
    currency: string; // "dolar amerykański"
    code: string; // "USD"
    bid: number; // Bank buys at
    ask: number; // Bank sells at
    tradingDate: string;
    effectiveDate: string;
}

function CurrencyRateWidget() {
    const [data, setData] = useState<CurrencyRateData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const { app } = useApp({
        appInfo: { name: "currency-rate-widget", version: "1.0.0" },
        capabilities: {},
        onAppCreated: (appInstance) => {
            // Handle tool result from MCP server
            appInstance.ontoolresult = (params) => {
                const payload = params.structuredContent as
                    | CurrencyRateData
                    | undefined;
                if (payload?.code) {
                    setData(payload);
                    setLoading(false);
                    setError(null);
                }
            };

            // Handle theme from host client
            appInstance.onhostcontextchanged = (context) => {
                if (context.theme === "dark") {
                    document.documentElement.classList.add("dark");
                } else if (context.theme === "light") {
                    document.documentElement.classList.remove("dark");
                }
            };
        },
    });

    // Refresh data by calling server tool
    const handleRefresh = useCallback(async () => {
        if (!app || !data) return;
        setLoading(true);
        setError(null);

        try {
            const result = await app.callServerTool({
                name: "getCurrencyRate",
                arguments: { currencyCode: data.code },
            });

            if (result.isError) {
                setError("Nie udało się odświeżyć kursu");
            } else {
                const payload = result.structuredContent as
                    | CurrencyRateData
                    | undefined;
                if (payload) {
                    setData(payload);
                }
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Błąd połączenia");
        } finally {
            setLoading(false);
        }
    }, [app, data]);

    // Open NBP official page
    const handleOpenNbp = useCallback(() => {
        app?.sendOpenLink({
            url: "https://www.nbp.pl/home.aspx?f=/kursy/kursyc.html",
        });
    }, [app]);

    // Calculate spread
    const spread = data ? (data.ask - data.bid).toFixed(4) : null;

    // Loading state
    if (loading) {
        return (
            <Card className="h-[400px] flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </Card>
        );
    }

    // Error state
    if (error) {
        return (
            <Card className="h-[400px] flex flex-col items-center justify-center p-6">
                <p className="text-destructive mb-4">{error}</p>
                <Button onClick={handleRefresh} variant="outline">
                    Spróbuj ponownie
                </Button>
            </Card>
        );
    }

    // Waiting for data state
    if (!data) {
        return (
            <Card className="h-[400px] flex items-center justify-center">
                <p className="text-muted-foreground">
                    Oczekiwanie na dane kursu...
                </p>
            </Card>
        );
    }

    return (
        <Card className="h-[400px] flex flex-col">
            <CardHeader className="flex-none">
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle className="text-2xl">
                            {data.code}/PLN
                        </CardTitle>
                        <CardDescription>{data.currency}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={handleRefresh}
                            disabled={loading}
                        >
                            <RefreshCw
                                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                            />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleOpenNbp}
                        >
                            <ExternalLink className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="flex-1 flex flex-col justify-center gap-6">
                {/* Bid/Ask Display */}
                <div className="grid grid-cols-2 gap-4">
                    {/* Bid - Bank buys (good for customer selling foreign currency) */}
                    <div className="bg-green-50 dark:bg-green-950 rounded-lg p-4">
                        <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm mb-1">
                            <TrendingUp className="h-4 w-4" />
                            <span>Bank Kupuje (Bid)</span>
                        </div>
                        <div className="text-3xl font-bold text-green-700 dark:text-green-400">
                            {data.bid.toFixed(4)}
                        </div>
                        <div className="text-xs text-muted-foreground">PLN</div>
                    </div>

                    {/* Ask - Bank sells (cost for customer buying foreign currency) */}
                    <div className="bg-red-50 dark:bg-red-950 rounded-lg p-4">
                        <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-sm mb-1">
                            <TrendingDown className="h-4 w-4" />
                            <span>Bank Sprzedaje (Ask)</span>
                        </div>
                        <div className="text-3xl font-bold text-red-700 dark:text-red-400">
                            {data.ask.toFixed(4)}
                        </div>
                        <div className="text-xs text-muted-foreground">PLN</div>
                    </div>
                </div>

                {/* Spread & Date Info */}
                <div className="flex justify-between items-center text-sm">
                    <Badge variant="secondary">Spread: {spread} PLN</Badge>
                    <div className="text-muted-foreground">
                        Data: {data.effectiveDate}
                    </div>
                </div>

                {/* NBP Table Info */}
                <div className="text-xs text-center text-muted-foreground">
                    Tabela NBP {data.table} • Kursy kupna i sprzedaży walut
                </div>
            </CardContent>
        </Card>
    );
}

// Mount React app
const container = document.getElementById("root");
if (container) {
    createRoot(container).render(
        <StrictMode>
            <CurrencyRateWidget />
        </StrictMode>
    );
}
