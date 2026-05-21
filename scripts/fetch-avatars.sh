#!/usr/bin/env bash
# Fetch DiceBear SVG portraits via curl (node fetch was TLS-resetting).
set -e
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/agents"
mkdir -p "$OUT"

# id|style|seed|bg
AGENTS=(
  "super_influencer_001|notionists|Catherine-Lin-CW|fce7f3"
  "pod_pm_001|personas|David-Tang-Citadel|e2e8f0"
  "activist_short_001|lorelei|Sarah-Klein-Hindenburg|fee2e2"
  "sell_side_001|personas|Michael-Chen-MS-Analyst|dbeafe"
  "cta_forced_001|bottts|ManCo-CTA-Trend|1f2937"
  "retail_fomo_001|avataaars|Alex-Park-WSB|ede9fe"
  "permabull_001|notionists|Thomas-Lin-Fundstrat|dcfce7"
  "day_trader_001|avataaars|Devon-Wallace-DayTrader|ffedd5"
  "economist_macro_001|notionists|Ben-Brandeis-Fed-Governor|ecfccb"
  "economist_political_001|notionists|Paul-Kramer-NYT-MIT|fee2e2"
  "economist_trader_001|notionists|Stan-Drucker-FamilyOffice|cffafe"
)

ok=0
for a in "${AGENTS[@]}"; do
  IFS='|' read -r id style seed bg <<< "$a"
  url="https://api.dicebear.com/9.x/${style}/svg?seed=${seed}&backgroundColor=${bg}"
  if curl -sS --max-time 15 --fail -o "$OUT/${id}.svg" "$url"; then
    size=$(wc -c < "$OUT/${id}.svg" | tr -d ' ')
    echo "✓ ${id} · ${style} · ${size} bytes"
    ok=$((ok + 1))
  else
    echo "✗ ${id} · curl failed"
  fi
done
echo ""
echo "Fetched ${ok}/${#AGENTS[@]} avatars to $OUT"
