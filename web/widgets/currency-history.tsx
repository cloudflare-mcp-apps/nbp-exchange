/**
 * NBP Currency History Chart Widget
 *
 * Interactive MCP App widget displaying historical exchange rates from the
 * Polish National Bank (NBP). Shows bid/ask prices over time using Chart.js
 * line chart with summary statistics.
 *
 * Features:
 * - Dual-line chart (bid in green, ask in red)
 * - Date range up to 93 days
 * - Summary statistics (average, min/max, trend)
 * - Refresh button to re-fetch data
 * - External link to NBP official page
 * - Dark mode support from host theme
 */
import { StrictMode, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import { McpUiToolCancelledNotificationSchema } from "@modelcontextprotocol/ext-apps";
import { Chart, registerables } from "chart.js";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import "../styles/globals.css";

// Register all Chart.js components
Chart.register(...registerables);

// Prefixed logging pattern for better debugging
const log = {
    info: console.log.bind(console, "[NBP History]"),
    warn: console.warn.bind(console, "[NBP History]"),
    error: console.error.bind(console, "[NBP History]"),
};

// Inline SVG icons (avoiding extra dependency weight)
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

const Minus = ({ className }: { className?: string }) => (
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
        <path d="M5 12h14" />
    </svg>
);

/**
 * Rate data point from getCurrencyHistory tool
 */
interface RateDataPoint {
    tradingDate: string;
    effectiveDate: string;
    bid: number;
    ask: number;
}

/**
 * Currency history data structure from getCurrencyHistory tool
 */
interface CurrencyHistoryData {
    table: string;
    currency: string;
    code: string;
    rates: RateDataPoint[];
}

/**
 * Summary statistics calculated from rates
 */
interface SummaryStats {
    avgBid: number;
    avgAsk: number;
    minBid: number;
    maxBid: number;
    minAsk: number;
    maxAsk: number;
    spreadRange: number;
    trend: "up" | "down" | "stable";
    trendPercent: number;
}

/**
 * useTheme Hook - Detects dark/light mode from system preference
 * Pattern from scenario-modeler example
 */
function useTheme(): "dark" | "light" {
    const [theme, setTheme] = useState<"dark" | "light">(() => {
        if (typeof window === "undefined") return "light";
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    });

    useEffect(() => {
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const handleChange = (e: MediaQueryListEvent) => setTheme(e.matches ? "dark" : "light");
        mediaQuery.addEventListener("change", handleChange);
        return () => mediaQuery.removeEventListener("change", handleChange);
    }, []);

    return theme;
}

/**
 * Calculate summary statistics from rate data
 */
function calculateSummaryStats(rates: RateDataPoint[]): SummaryStats {
    if (rates.length === 0) {
        return {
            avgBid: 0,
            avgAsk: 0,
            minBid: 0,
            maxBid: 0,
            minAsk: 0,
            maxAsk: 0,
            spreadRange: 0,
            trend: "stable",
            trendPercent: 0,
        };
    }

    const bids = rates.map((r) => r.bid);
    const asks = rates.map((r) => r.ask);

    const avgBid = bids.reduce((a, b) => a + b, 0) / bids.length;
    const avgAsk = asks.reduce((a, b) => a + b, 0) / asks.length;
    const minBid = Math.min(...bids);
    const maxBid = Math.max(...bids);
    const minAsk = Math.min(...asks);
    const maxAsk = Math.max(...asks);

    // Calculate trend based on mid price change
    const firstMid = (rates[0].bid + rates[0].ask) / 2;
    const lastMid = (rates[rates.length - 1].bid + rates[rates.length - 1].ask) / 2;
    const trendPercent = ((lastMid - firstMid) / firstMid) * 100;

    let trend: "up" | "down" | "stable" = "stable";
    if (trendPercent > 0.5) trend = "up";
    else if (trendPercent < -0.5) trend = "down";

    return {
        avgBid,
        avgAsk,
        minBid,
        maxBid,
        minAsk,
        maxAsk,
        spreadRange: maxAsk - minBid,
        trend,
        trendPercent,
    };
}

/**
 * HistoryChart Component - Chart.js line chart
 * Pattern from scenario-modeler example
 */
interface HistoryChartProps {
    rates: RateDataPoint[];
    currencyCode: string;
}

function HistoryChart({ rates, currencyCode }: HistoryChartProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef = useRef<Chart | null>(null);
    const theme = useTheme();

    // Create chart on mount, rebuild on theme change
    useEffect(() => {
        if (!canvasRef.current) return;

        const textColor = theme === "dark" ? "#9ca3af" : "#6b7280";
        const gridColor = theme === "dark" ? "#374151" : "#e5e7eb";

        chartRef.current = new Chart(canvasRef.current, {
            type: "line",
            data: {
                labels: [],
                datasets: [
                    {
                        label: "Bid (Bank Kupuje)",
                        borderColor: "#22c55e", // green-500
                        backgroundColor: "rgba(34, 197, 94, 0.1)",
                        data: [],
                        fill: false,
                        tension: 0.3,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        borderWidth: 2,
                    },
                    {
                        label: "Ask (Bank Sprzedaje)",
                        borderColor: "#ef4444", // red-500
                        backgroundColor: "rgba(239, 68, 68, 0.1)",
                        data: [],
                        fill: false,
                        tension: 0.3,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        borderWidth: 2,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: "index",
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: theme === "dark" ? "#1f2937" : "#ffffff",
                        titleColor: theme === "dark" ? "#f9fafb" : "#111827",
                        bodyColor: theme === "dark" ? "#9ca3af" : "#6b7280",
                        borderColor: gridColor,
                        borderWidth: 1,
                        callbacks: {
                            label: (context) => {
                                const value = context.parsed.y;
                                if (value === null) return "";
                                return `${context.dataset.label}: ${value.toFixed(4)} PLN`;
                            },
                        },
                    },
                },
                scales: {
                    y: {
                        grid: { color: gridColor },
                        ticks: {
                            color: textColor,
                            callback: (value) => `${Number(value).toFixed(4)}`,
                        },
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: textColor,
                            maxRotation: 45,
                            minRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 10,
                        },
                    },
                },
            },
        });

        return () => chartRef.current?.destroy();
    }, [theme]);

    // Update data when rates change (without recreating chart)
    useEffect(() => {
        if (!chartRef.current || rates.length === 0) return;

        const chart = chartRef.current;
        const labels = rates.map((r) => {
            // Format date as DD.MM
            const d = new Date(r.effectiveDate);
            return `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1).toString().padStart(2, "0")}`;
        });

        chart.data.labels = labels;
        chart.data.datasets[0].data = rates.map((r) => r.bid);
        chart.data.datasets[1].data = rates.map((r) => r.ask);
        chart.update("none"); // Skip animation for performance
    }, [rates]);

    return (
        <div className="h-48 w-full">
            <canvas ref={canvasRef} />
        </div>
    );
}

/**
 * Main Widget Component
 */
function CurrencyHistoryWidget() {
    const [data, setData] = useState<CurrencyHistoryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastParams, setLastParams] = useState<{
        currencyCode: string;
        startDate: string;
        endDate: string;
    } | null>(null);

    const { app } = useApp({
        appInfo: { name: "currency-history-widget", version: "1.0.0" },
        capabilities: {},
        onAppCreated: (appInstance) => {
            // Handle tool input (parameters received)
            appInstance.ontoolinput = (params) => {
                log.info("Tool input received:", params.arguments);
                const args = params.arguments as {
                    currencyCode: string;
                    startDate: string;
                    endDate: string;
                };
                setLastParams(args);
            };

            // Handle tool result from MCP server
            appInstance.ontoolresult = (params) => {
                log.info("Tool result received");
                const payload = params.structuredContent as CurrencyHistoryData | undefined;
                if (payload?.rates) {
                    setData(payload);
                    setLoading(false);
                    setError(null);
                }
            };

            // Handle errors
            appInstance.onerror = (err) => {
                log.error("Error:", err);
                setError(err.message || "Wystąpił nieznany błąd");
                setLoading(false);
            };

            // Handle theme from host client
            appInstance.onhostcontextchanged = (context) => {
                if (context.theme === "dark") {
                    document.documentElement.classList.add("dark");
                } else if (context.theme === "light") {
                    document.documentElement.classList.remove("dark");
                }
                if (context.viewport) {
                    log.info("Viewport changed:", context.viewport);
                }
            };

            // Handle teardown (graceful cleanup)
            appInstance.onteardown = async () => {
                log.info("Teardown requested");
                return {};
            };

            // Handle tool cancellation
            appInstance.setNotificationHandler(
                McpUiToolCancelledNotificationSchema,
                (notification) => {
                    log.info("Tool cancelled:", notification.params);
                    setLoading(false);
                }
            );
        },
    });

    // Refresh data by calling server tool
    const handleRefresh = useCallback(async () => {
        if (!app || !lastParams) return;
        setLoading(true);
        setError(null);

        try {
            const result = await app.callServerTool({
                name: "getCurrencyHistory",
                arguments: lastParams,
            });

            if (result.isError) {
                setError("Nie udało się odświeżyć danych");
            } else {
                const payload = result.structuredContent as CurrencyHistoryData | undefined;
                if (payload) {
                    setData(payload);
                }
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Błąd połączenia");
        } finally {
            setLoading(false);
        }
    }, [app, lastParams]);

    // Open NBP official page
    const handleOpenNbp = useCallback(() => {
        app?.openLink({
            url: "https://www.nbp.pl/home.aspx?f=/kursy/kursyc.html",
        });
    }, [app]);

    // Calculate summary statistics
    const stats = useMemo(() => (data ? calculateSummaryStats(data.rates) : null), [data]);

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
                <p className="text-muted-foreground">Oczekiwanie na dane historyczne...</p>
            </Card>
        );
    }

    return (
        <Card className="h-[400px] flex flex-col overflow-hidden">
            {/* Header */}
            <CardHeader className="flex-none py-3 px-4">
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle className="text-lg">{data.code}/PLN Historia</CardTitle>
                        <CardDescription className="text-xs">
                            {data.currency} ({data.rates.length} dni)
                        </CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={handleRefresh}
                            disabled={loading}
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={handleOpenNbp}>
                            <ExternalLink className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </CardHeader>

            {/* Chart Section */}
            <CardContent className="flex-1 px-4 py-2 min-h-0">
                <HistoryChart rates={data.rates} currencyCode={data.code} />

                {/* Legend */}
                <div className="flex gap-4 justify-center text-xs mt-2">
                    <span className="flex items-center gap-1">
                        <span className="w-3 h-0.5 bg-green-500"></span> Bid (Kupno)
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-3 h-0.5 bg-red-500"></span> Ask (Sprzedaż)
                    </span>
                </div>
            </CardContent>

            {/* Stats Footer */}
            {stats && (
                <div className="flex-none px-4 py-3 border-t bg-muted/50">
                    <div className="grid grid-cols-4 gap-2 text-center text-xs">
                        <div>
                            <div className="font-semibold text-green-600 dark:text-green-400">
                                {stats.avgBid.toFixed(4)}
                            </div>
                            <div className="text-muted-foreground">Śr. Bid</div>
                        </div>
                        <div>
                            <div className="font-semibold text-red-600 dark:text-red-400">
                                {stats.avgAsk.toFixed(4)}
                            </div>
                            <div className="text-muted-foreground">Śr. Ask</div>
                        </div>
                        <div>
                            <div className="font-semibold">
                                {stats.minBid.toFixed(4)} - {stats.maxAsk.toFixed(4)}
                            </div>
                            <div className="text-muted-foreground">Zakres</div>
                        </div>
                        <div>
                            <div
                                className={`font-semibold flex items-center justify-center gap-1 ${
                                    stats.trend === "up"
                                        ? "text-green-600 dark:text-green-400"
                                        : stats.trend === "down"
                                          ? "text-red-600 dark:text-red-400"
                                          : "text-muted-foreground"
                                }`}
                            >
                                {stats.trend === "up" && <TrendingUp className="h-3 w-3" />}
                                {stats.trend === "down" && <TrendingDown className="h-3 w-3" />}
                                {stats.trend === "stable" && <Minus className="h-3 w-3" />}
                                {stats.trendPercent >= 0 ? "+" : ""}
                                {stats.trendPercent.toFixed(2)}%
                            </div>
                            <div className="text-muted-foreground">Trend</div>
                        </div>
                    </div>
                </div>
            )}
        </Card>
    );
}

// Mount React app
const container = document.getElementById("root");
if (container) {
    createRoot(container).render(
        <StrictMode>
            <CurrencyHistoryWidget />
        </StrictMode>
    );
}
