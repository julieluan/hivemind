// ============================================================================
// GET /api/market/price?ticker=AAPL&start=YYYY-MM-DD&end=YYYY-MM-DD
//
// Strategy:
//   1. If ALPHA_VANTAGE_KEY env is set → fetch real data from Alpha Vantage
//   2. Else → fall back to bundled sample data in public/data/{ticker}.json
//
// Sample data shape: { ticker, prices: PriceBar[] }
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import type { PriceBar, PriceResponse } from "@/lib/types";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

async function loadBundled(ticker: string): Promise<PriceBar[] | null> {
  const file = path.join(process.cwd(), "public", "data", `${ticker.toUpperCase()}.json`);
  try {
    const raw = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(raw) as { prices: PriceBar[] };
    return parsed.prices;
  } catch {
    return null;
  }
}

async function fetchAlphaVantage(
  ticker: string,
  apiKey: string
): Promise<PriceBar[] | null> {
  // Alpha Vantage TIME_SERIES_DAILY (or DAILY_ADJUSTED if upgraded)
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${ticker}&outputsize=full&apikey=${apiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const data = await resp.json();
  const series = data["Time Series (Daily)"];
  if (!series) return null;

  return Object.entries(series)
    .map(([date, bar]) => {
      const b = bar as Record<string, string>;
      return {
        date,
        open: Number(b["1. open"]),
        high: Number(b["2. high"]),
        low: Number(b["3. low"]),
        close: Number(b["4. close"]),
        volume: Number(b["5. volume"]),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker") ?? "AAPL";
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  let prices: PriceBar[] | null = null;
  let source: PriceResponse["source"] = "bundled";

  const avKey = process.env.ALPHA_VANTAGE_KEY;
  if (avKey) {
    try {
      prices = await fetchAlphaVantage(ticker, avKey);
      if (prices) source = "alpha_vantage";
    } catch {
      // fall through to bundled
    }
  }

  if (!prices) {
    prices = await loadBundled(ticker);
    source = "bundled";
  }

  if (!prices) {
    return NextResponse.json(
      { error: `No data for ${ticker} (no API key, no bundled fallback)` },
      { status: 404 }
    );
  }

  // Optional date filter
  if (start) prices = prices.filter((p) => p.date >= start);
  if (end) prices = prices.filter((p) => p.date <= end);

  const resp: PriceResponse = { ticker, prices, source };
  return NextResponse.json(resp);
}
