# Perps Pulse

An MCP App built with [mcp-use](https://github.com/mcp-use/mcp-use) that shows live Hyperliquid perpetual futures markets: price, 24h change, funding, open interest and volume. Data comes from Hyperliquid's public info API, with no key needed.

- `market-overview`: the most active markets (or the ones you name) in an interactive table. Clicking a row shows annualized funding and who is paying whom, and lets you refresh the row or ask the model about it.
- `get-market`: one market's numbers without a view. The view uses it to refresh a row.

```bash
npm install
npm run dev            # http://localhost:3000/mcp, Inspector at /mcp/inspector
npm run build && VIEW_DOMAIN=https://<your-origin> npx mcp-use start --tunnel
```

Set `VIEW_DOMAIN` to the app's public origin before submitting to ChatGPT. The view's `_meta.ui.domain` comes from it.

Scored 96/100 (A+) on Manufact's MCP catalog report on 2026-10-20.
