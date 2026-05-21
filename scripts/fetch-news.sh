#!/usr/bin/env bash
# Fetch real GDELT headlines in 10-day batches, then bucket by date.
# Single-day GDELT queries return 0 articles ~80% of the time due to
# silent throttling, but a 10-day window returns 100+ articles in one
# call — that's the working ratio.
#
# 4 scenarios × ~4 batched queries = ~16 calls total. 15s between calls
# stays well clear of GDELT's 5s/req rate limit, with a buffer for
# their aggressive IP-level throttling.
set -e

cd "$(dirname "$0")/.."
TICKER="AAPL"
DAYS=32
BATCH=10
OUT="public/data/news"
mkdir -p "$OUT"
SCENARIO_STARTS=(2025-02-19 2022-04-04 2023-01-09 2024-08-05)

fetched=0
covered_days=0

for start in "${SCENARIO_STARTS[@]}"; do
  echo ""
  echo "=== $start ==="
  # Compute the 32 trading dates for this scenario from AAPL.json
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
print(','.join(out))
")
  IFS=',' read -ra DATE_LIST <<< "$dates"
  total=${#DATE_LIST[@]}

  # Batch over 10-day windows
  for ((i = 0; i < total; i += BATCH)); do
    window_start_idx=$i
    window_end_idx=$((i + BATCH - 1))
    [ $window_end_idx -ge $total ] && window_end_idx=$((total - 1))
    win_start="${DATE_LIST[$window_start_idx]}"
    win_end="${DATE_LIST[$window_end_idx]}"
    start_ymd=$(echo "$win_start" | tr -d '-')
    end_ymd=$(echo "$win_end" | tr -d '-')
    echo "  window ${win_start} → ${win_end}"
    raw=$(curl -sS --max-time 40 --user-agent "hivemind-fetch/0.3" \
      "https://api.gdeltproject.org/api/v2/doc/doc?query=AAPL%20stock%20sourcelang%3Aeng&format=JSON&maxrecords=250&startdatetime=${start_ymd}000000&enddatetime=${end_ymd}235959" 2>/dev/null || echo "")
    if [ -z "$raw" ] || ! echo "$raw" | grep -q '"articles"'; then
      echo "    fetch failed"
      sleep 20
      continue
    fi
    # Group by date and write each day's file
    valid_dates="${DATE_LIST[@]:$window_start_idx:$((window_end_idx - window_start_idx + 1))}"
    py_result=$(python3 -c "
import json, sys, os
raw = sys.stdin.read()
valid = '$valid_dates'.split()
data = json.loads(raw)
arts = data.get('articles', [])
by = {d: [] for d in valid}
for a in arts:
    sd = (a.get('seendate') or '')[:8]
    if not sd: continue
    iso = f'{sd[0:4]}-{sd[4:6]}-{sd[6:8]}'
    if iso in by:
        t = (a.get('title') or '').strip()
        if t:
            by[iso].append({
                'title': t,
                'domain': (a.get('domain') or '').strip(),
                'seendate': sd,
                'url': a.get('url', ''),
            })
written = 0
covered = 0
for iso, items in by.items():
    out_file = '$OUT' + '/' + '$TICKER' + '_' + iso + '.json'
    # Only write if file doesn't exist or is empty (preserve good caches)
    if os.path.exists(out_file):
        with open(out_file) as f:
            existing = f.read().strip()
        if existing and existing != '[]':
            continue
    items = items[:12]  # cap to 12 per day
    with open(out_file, 'w') as f:
        json.dump(items, f, indent=2)
    written += 1
    if items:
        covered += 1
print(f'{written},{covered}', flush=True)
" <<< "$raw")
    w=$(echo "$py_result" | cut -d, -f1)
    c=$(echo "$py_result" | cut -d, -f2)
    fetched=$((fetched + w))
    covered_days=$((covered_days + c))
    echo "    wrote $w files · $c had real articles"
    sleep 15
  done
done

echo ""
echo "Done. Wrote $fetched files across 4 scenarios · $covered_days days have real headlines"
