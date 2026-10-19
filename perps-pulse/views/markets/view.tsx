/** Perps Pulse: live Hyperliquid perp markets with a detail panel. */
import { ModelContext, ThemeProvider, useCallTool, useSendFollowUp, useHostContext, useToolContext } from "mcp-use/react";
import { useEffect, useState } from "react";

const usd = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n).toLocaleString()}`;
const price = (n: number) => (n >= 100 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toPrecision(4));
const pct = (n: number, digits = 2) => `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;

export default function Markets() {
  const view = useToolContext<"market-overview">();
  const refresh = useCallTool("get-market");
  const sendFollowUp = useSendFollowUp();
  const { hostCapabilities } = useHostContext();
  const [selected, setSelected] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, NonNullable<typeof refreshed>>>({});

  const refreshed = refresh.data?.structuredContent?.market ?? null;
  useEffect(() => {
    if (refreshed) setOverrides((o) => ({ ...o, [refreshed.coin]: refreshed }));
  }, [refreshed]);

  if (view.status === "pending") {
    return (
      <ThemeProvider>
        <div className="p-6 text-sm text-neutral-500">Loading Hyperliquid markets…</div>
      </ThemeProvider>
    );
  }
  if (view.status === "error") {
    return (
      <ThemeProvider>
        <div role="alert" className="p-6 text-sm text-red-600">{view.error.message}</div>
      </ThemeProvider>
    );
  }

  const { markets, asOf, notFound } = view.toolOutput;
  const rows = markets.map((m) => overrides[m.coin] ?? m);
  const current = rows.find((m) => m.coin === selected) ?? null;

  return (
    <ThemeProvider>
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-neutral-900 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100">
        {current && (
          <ModelContext
            content={`The user is looking at ${current.coin}: mark $${current.markPx}, ${pct(current.change24hPct)} 24h, funding ${pct(current.fundingHourlyPct, 4)}/h, OI ${usd(current.openInterestUsd)}.`}
          />
        )}
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="m-0 text-base font-semibold">Hyperliquid perps</h2>
          <span className="text-xs text-neutral-500">as of {new Date(asOf).toLocaleTimeString()}</span>
        </div>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="py-1 font-medium">Market</th>
              <th className="py-1 text-right font-medium">Price</th>
              <th className="py-1 text-right font-medium">24h</th>
              <th className="py-1 text-right font-medium">Funding/h</th>
              <th className="hidden py-1 text-right font-medium sm:table-cell">Open interest</th>
              <th className="hidden py-1 text-right font-medium sm:table-cell">24h volume</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr
                key={m.coin}
                onClick={() => setSelected(m.coin)}
                className={`cursor-pointer border-t border-neutral-100 dark:border-white/5 ${
                  m.coin === selected ? "bg-blue-50 dark:bg-blue-500/10" : "hover:bg-neutral-50 dark:hover:bg-white/5"
                }`}
              >
                <td className="py-1.5 font-medium">{m.coin}</td>
                <td className="py-1.5 text-right tabular-nums">${price(m.markPx)}</td>
                <td className={`py-1.5 text-right tabular-nums ${m.change24hPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {pct(m.change24hPct)}
                </td>
                <td className="py-1.5 text-right tabular-nums">{pct(m.fundingHourlyPct, 4)}</td>
                <td className="hidden py-1.5 text-right tabular-nums sm:table-cell">{usd(m.openInterestUsd)}</td>
                <td className="hidden py-1.5 text-right tabular-nums sm:table-cell">{usd(m.volume24hUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {notFound.length > 0 && (
          <p className="mt-2 text-xs text-neutral-500">Not listed on Hyperliquid: {notFound.join(", ")}</p>
        )}

        {current && (
          <div className="mt-4 rounded-xl bg-neutral-50 p-3 text-sm dark:bg-white/5">
            <div className="flex items-center justify-between">
              <strong>{current.coin}</strong>
              <span className="text-xs text-neutral-500">up to {current.maxLeverage}× leverage</span>
            </div>
            <p className="mb-3 mt-1 text-neutral-600 dark:text-neutral-400">
              Funding annualizes to about {pct(current.fundingHourlyPct * 24 * 365, 1)}.{" "}
              {current.fundingHourlyPct >= 0 ? "Longs are paying shorts." : "Shorts are paying longs."}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={refresh.isPending}
                onClick={() => void refresh.callTool({ coin: current.coin })}
                className="rounded-full border border-neutral-300 px-3 py-1 text-xs disabled:opacity-50 dark:border-neutral-600"
              >
                {refresh.isPending ? "Refreshing…" : "Refresh"}
              </button>
              {hostCapabilities?.message !== undefined && (
                <button
                  type="button"
                  onClick={() =>
                    void sendFollowUp({ prompt: `Explain what ${current.coin}'s current funding rate and open interest suggest about positioning.` }).catch(() => {})
                  }
                  className="rounded-full bg-neutral-900 px-3 py-1 text-xs text-white dark:bg-white dark:text-neutral-900"
                >
                  Ask about {current.coin}
                </button>
              )}
            </div>
            {refresh.error !== undefined && <p className="mt-2 text-xs text-red-600">{refresh.error.message}</p>}
          </div>
        )}
        {!current && <p className="mt-3 mb-0 text-xs text-neutral-500">Click a market for details.</p>}
      </div>
    </ThemeProvider>
  );
}
