import { MCPServer } from "mcp-use";
import { z } from "zod";

// Hyperliquid's public info API. No key, no account.
const HL_INFO = "https://api.hyperliquid.xyz/info";

const server = new MCPServer({
  name: "perps-pulse",
  title: "Perps Pulse",
  version: "1.0.0",
  description:
    "Live Hyperliquid perpetual futures markets: price, 24h change, funding, open interest and volume.",
  instructions:
    "Use market-overview to show the most active Hyperliquid perp markets, or pass coins to show specific ones. Use get-market for one coin's numbers without a view.",
  websiteUrl: "https://github.com/zeel991",
  icons: [{ src: "icon.svg", mimeType: "image/svg+xml", sizes: ["512x512"] }],
});

const market = z.object({
  coin: z.string().describe("Market symbol, e.g. BTC"),
  markPx: z.number().describe("Mark price in USD"),
  change24hPct: z.number().describe("Price change versus 24 hours ago, in percent"),
  fundingHourlyPct: z.number().describe("Current hourly funding rate, in percent"),
  openInterestUsd: z.number().describe("Open interest in USD (contracts × mark price)"),
  volume24hUsd: z.number().describe("Notional volume over the last 24 hours, in USD"),
  maxLeverage: z.number().describe("Maximum leverage Hyperliquid allows on this market"),
});
type Market = z.infer<typeof market>;

async function loadMarkets(): Promise<Market[]> {
  const res = await fetch(HL_INFO, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "metaAndAssetCtxs" }),
  });
  if (!res.ok) throw new Error(`Hyperliquid API returned ${res.status}`);
  const [meta, ctxs] = (await res.json()) as [
    { universe: { name: string; maxLeverage: number; isDelisted?: boolean }[] },
    { markPx: string; prevDayPx: string; funding: string; openInterest: string; dayNtlVlm: string }[],
  ];
  return meta.universe
    .map((u, i) => ({ u, c: ctxs[i] }))
    .filter(({ u, c }) => c && !u.isDelisted && Number(c.markPx) > 0)
    .map(({ u, c }) => {
      const markPx = Number(c.markPx);
      const prev = Number(c.prevDayPx);
      return {
        coin: u.name,
        markPx,
        change24hPct: prev > 0 ? ((markPx - prev) / prev) * 100 : 0,
        fundingHourlyPct: Number(c.funding) * 100,
        openInterestUsd: Number(c.openInterest) * markPx,
        volume24hUsd: Number(c.dayNtlVlm),
        maxLeverage: u.maxLeverage,
      };
    });
}

const usd = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${n.toFixed(0)}`;

const summarize = (m: Market) =>
  `${m.coin}: $${m.markPx} (${m.change24hPct >= 0 ? "+" : ""}${m.change24hPct.toFixed(2)}% 24h), ` +
  `funding ${m.fundingHourlyPct.toFixed(4)}%/h, OI ${usd(m.openInterestUsd)}, 24h volume ${usd(m.volume24hUsd)}`;

export const marketOverview = server.tool(
  {
    name: "market-overview",
    title: "Hyperliquid market overview",
    description:
      "Show live Hyperliquid perp markets in an interactive table. Without coins, shows the most active markets by 24h volume.",
    inputSchema: z.object({
      coins: z
        .array(z.string())
        .max(20)
        .optional()
        .describe("Symbols to show, e.g. [\"BTC\", \"ETH\"]. Omit for the most active markets."),
      limit: z.number().int().min(1).max(20).optional().describe("How many markets to show when coins is omitted (default 8)"),
    }),
    outputSchema: z.object({
      asOf: z.string().describe("ISO time the data was fetched"),
      markets: z.array(market),
      notFound: z.array(z.string()).describe("Requested symbols Hyperliquid does not list"),
    }),
    view: {
      name: "markets",
      description: "Table of Hyperliquid perp markets with a detail panel",
      prefersBorder: false,
      // ChatGPT submission requires one exact HTTPS origin for the view.
      ...(process.env.VIEW_DOMAIN ? { domain: process.env.VIEW_DOMAIN } : {}),
    },
    // ChatGPT status labels (flat keys, per developers.openai.com/apps-sdk/reference).
    _meta: {
      "openai/toolInvocation/invoking": "Loading Hyperliquid markets…",
      "openai/toolInvocation/invoked": "Markets loaded",
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ coins, limit }) => {
    const all = await loadMarkets();
    let markets: Market[];
    let notFound: string[] = [];
    if (coins?.length) {
      const want = coins.map((c) => c.trim().toUpperCase());
      markets = want.map((c) => all.find((m) => m.coin.toUpperCase() === c)).filter((m): m is Market => !!m);
      notFound = want.filter((c) => !all.some((m) => m.coin.toUpperCase() === c));
    } else {
      markets = [...all].sort((a, b) => b.volume24hUsd - a.volume24hUsd).slice(0, limit ?? 8);
    }
    const data = { asOf: new Date().toISOString(), markets, notFound };
    const text =
      markets.map(summarize).join("\n") + (notFound.length ? `\nNot listed on Hyperliquid: ${notFound.join(", ")}` : "");
    return { content: [{ type: "text", text: text || "No markets matched." }], structuredContent: data };
  },
);

export const getMarket = server.tool(
  {
    name: "get-market",
    title: "Get one Hyperliquid market",
    description: "Return live numbers for one Hyperliquid perp market. Used by the view to refresh a row.",
    inputSchema: z.object({ coin: z.string().describe("Market symbol, e.g. SOL") }),
    outputSchema: z.object({ market: market.nullable(), asOf: z.string() }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ coin }) => {
    const m = (await loadMarkets()).find((x) => x.coin.toUpperCase() === coin.trim().toUpperCase()) ?? null;
    return {
      content: [{ type: "text", text: m ? summarize(m) : `${coin} is not listed on Hyperliquid.` }],
      structuredContent: { market: m, asOf: new Date().toISOString() },
      ...(m ? {} : { isError: true }),
    };
  },
);

export default server;
