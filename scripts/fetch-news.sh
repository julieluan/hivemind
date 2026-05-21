#!/usr/bin/env bash
# Fetch real GDELT headlines for each scenario's 32-day window via curl.
# Node fetch and python urllib both kept failing TLS on this machine;
# curl is the only HTTPS client that actually works here.
set -e

cd "$(dirname "$0")/.."
TICKER="AAPL"
DAYS=32
OUT="public/data/news"
mkdir -p "$OUT"

# Pull the trading-day list for each scenario start out of AAPL.json.
# python3 just reads JSON — it's not doing any network here, so no TLS.
SCENARIO_STARTS=(2025-02-19 2022-04-04 2023-01-09 2024-08-05)

fetched=0
cached=0
empty=0

for start in "${SCENARIO_STARTS[@]}"; do
  echo ""
  echo "=== $start ==="
  # Compute 32 trading days from start
  dates=$(python3 -c "
import json
with open('public/data/AAPL.json') as f: prices = json.load(f)['prices']
out = []
on = False
for p in prices:
    if not on and p['date'] >= '$start': on = True
    if on:
        out.append(p['date'])
        if len(out) >= $DAYS: break
print('\n'.join(out))
")
  i=0
  total=$(echo "$dates" | wc -l | tr -d ' ')
  while read -r d; do
    [ -z "$d" ] && continue
    i=$((i + 1))
    out_file="$OUT/${TICKER}_${d}.json"
    if [ -f "$out_file" ] && [ "$(cat "$out_file" | tr -d '[:space:]')" != "[]" ]; then
      cached=$((cached + 1))
      continue
    fi
    ymd=$(echo "$d" | tr -d '-')
    q="$TICKER stock sourcelang:eng"
    url="https://api.gdeltproject.org/api/v2/doc/doc?query=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$q'))")&format=JSON&maxrecords=12&startdatetime=${ymd}000000&enddatetime=${ymd}235959"
    raw=$(curl -sS --max-time 20 --user-agent "hivemind/0.1" "$url" 2>/dev/null || echo "")
    # Extract+clean using python (string parsing in bash is bad)
    cleaned=$(python3 -c "
import json, sys
raw = sys.stdin.read().strip()
if not raw:
    print('[]'); sys.exit(0)
try:
    data = json.loads(raw)
except Exception:
    print('[]'); sys.exit(0)
out = []
for a in data.get('articles', []):
    t = (a.get('title') or '').strip()
    if not t: continue
    out.append({
        'title': t,
        'domain': (a.get('domain') or '').strip(),
        'seendate': (a.get('seendate') or '')[:8],
        'url': a.get('url', ''),
    })
print(json.dumps(out, indent=2))
" <<< "$raw")
    echo "$cleaned" > "$out_file"
    count=$(python3 -c "import json,sys; print(len(json.load(sys.stdin)))" <<< "$cleaned")
    if [ "$count" = "0" ]; then
      empty=$((empty + 1))
    else
      fetched=$((fetched + 1))
    fi
    printf "  [%2d/%d] %s · %d articles\n" "$i" "$total" "$d" "$count"
    # GDELT requires ≥5s between queries — sleep 6s to be safe
    sleep 6
  done <<< "$dates"
done

echo ""
echo "Done. Fetched: $fetched · Already cached: $cached · Empty: $empty"
