#!/usr/bin/env bash
# Proxy diagnostic — finds the exact cause of proxy failures.
#
# Runs five independent checks against the configured proxy:
#   1. Env vars present and well-formed?
#   2. Is the proxy host even reachable (DNS + TCP)?
#   3. Does HTTP-CONNECT auth succeed (basic curl test)?
#   4. Does fetching a real page through the proxy work?
#   5. Control test — same fetch without the proxy.
#
# Run on the VPS:  bash scripts/diagnose-proxy.sh

set -u

# Load .env so the same vars the scrapers see are the ones we test.
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

PROXY_HOST="${PROXY_HOST:-}"
PROXY_PORT="${PROXY_PORT:-}"
PROXY_USERNAME="${PROXY_USERNAME:-}"
PROXY_PASSWORD="${PROXY_PASSWORD:-}"

# Safe printing — show length and first/last 4 chars only.
shorten() {
  local s="$1"
  local n=${#s}
  if [ "$n" -eq 0 ]; then echo "<empty>"; return; fi
  if [ "$n" -lt 8 ]; then echo "<$n chars>"; return; fi
  printf '%s...%s (%s chars)' "${s:0:4}" "${s: -4}" "$n"
}

# Detect characters that need URL-encoding to live inside a proxy URL.
weird_chars() {
  local s="$1"
  echo -n "$s" | LC_ALL=C tr -d 'A-Za-z0-9._~-' | head -c 40
}

separator() { printf '\n%s\n' "----------------------------------------------------------------"; }

separator
echo "[1/5] Proxy env vars (from /root/asterley-bros/.env)"
echo "PROXY_HOST     = ${PROXY_HOST:-<empty>}"
echo "PROXY_PORT     = ${PROXY_PORT:-<empty>}"
echo "PROXY_USERNAME = $(shorten "$PROXY_USERNAME")"
echo "PROXY_PASSWORD = $(shorten "$PROXY_PASSWORD")"

USER_WEIRD=$(weird_chars "$PROXY_USERNAME")
PASS_WEIRD=$(weird_chars "$PROXY_PASSWORD")
if [ -n "$USER_WEIRD" ]; then
  echo "  ⚠ PROXY_USERNAME contains non-URL-safe chars: [$USER_WEIRD]"
  echo "    These often need percent-encoding (e.g. \` is %60, : is %3A)."
fi
if [ -n "$PASS_WEIRD" ]; then
  echo "  ⚠ PROXY_PASSWORD contains non-URL-safe chars: [$PASS_WEIRD]"
fi

if [ -z "$PROXY_HOST" ] || [ -z "$PROXY_PORT" ]; then
  echo
  echo "→ PROXY_HOST/PROXY_PORT empty; nothing to test. Exiting."
  exit 0
fi

separator
echo "[2/5] DNS + TCP reachability to $PROXY_HOST:$PROXY_PORT"
RESOLVED=$(getent hosts "$PROXY_HOST" | awk '{print $1}' | head -1)
if [ -z "$RESOLVED" ]; then
  echo "✗ DNS lookup FAILED for $PROXY_HOST"
else
  echo "✓ DNS OK → $RESOLVED"
fi

if command -v nc >/dev/null 2>&1; then
  if nc -z -w 5 "$PROXY_HOST" "$PROXY_PORT" 2>/dev/null; then
    echo "✓ TCP connect to $PROXY_HOST:$PROXY_PORT succeeded"
  else
    echo "✗ TCP connect FAILED — proxy server unreachable from this VPS"
  fi
else
  echo "(nc not installed; skipping raw TCP probe)"
fi

separator
echo "[3/5] HTTP proxy auth check (curl through proxy, no SSL target)"
# Use ipinfo.io/json — small, JSON, returns the exit IP we appeared to come from.
PROXY_URL_NOAUTH="http://$PROXY_HOST:$PROXY_PORT"

if [ -n "$PROXY_USERNAME" ] || [ -n "$PROXY_PASSWORD" ]; then
  # -x with -U handles auth without URL-encoding required.
  echo "Test A: curl with -U <user>:<pass> (handles special chars)"
  RESP=$(curl -sS --max-time 15 -x "$PROXY_URL_NOAUTH" -U "$PROXY_USERNAME:$PROXY_PASSWORD" \
    -o /tmp/proxy_test.out -w "HTTP %{http_code}, exit=%{exitcode}" \
    http://ipinfo.io/json 2>&1)
  echo "  → $RESP"
  if [ -s /tmp/proxy_test.out ]; then
    IP=$(grep -o '"ip"[^,]*' /tmp/proxy_test.out | head -1)
    REGION=$(grep -o '"country"[^,]*' /tmp/proxy_test.out | head -1)
    echo "  → exit IP: $IP   $REGION"
  fi
  rm -f /tmp/proxy_test.out

  echo
  echo "Test B: curl with credentials embedded in URL (how Camoufox does it)"
  # This is what the scraper code is likely doing internally.
  PROXY_URL_AUTH="http://${PROXY_USERNAME}:${PROXY_PASSWORD}@${PROXY_HOST}:${PROXY_PORT}"
  echo "  Proxy URL (sanitised): http://$(shorten "$PROXY_USERNAME"):$(shorten "$PROXY_PASSWORD")@$PROXY_HOST:$PROXY_PORT"
  RESP=$(curl -sS --max-time 15 -x "$PROXY_URL_AUTH" \
    -o /tmp/proxy_test.out -w "HTTP %{http_code}, exit=%{exitcode}" \
    http://ipinfo.io/json 2>&1)
  echo "  → $RESP"
  rm -f /tmp/proxy_test.out
else
  echo "No PROXY_USERNAME/PROXY_PASSWORD set; testing unauthenticated."
  RESP=$(curl -sS --max-time 15 -x "$PROXY_URL_NOAUTH" \
    -o /tmp/proxy_test.out -w "HTTP %{http_code}, exit=%{exitcode}" \
    http://ipinfo.io/json 2>&1)
  echo "  → $RESP"
  rm -f /tmp/proxy_test.out
fi

separator
echo "[4/5] HTTPS through proxy (closer to what Playwright/Camoufox does)"
if [ -n "$PROXY_USERNAME" ] || [ -n "$PROXY_PASSWORD" ]; then
  RESP=$(curl -sS --max-time 20 -x "http://$PROXY_HOST:$PROXY_PORT" \
    -U "$PROXY_USERNAME:$PROXY_PASSWORD" \
    -o /tmp/proxy_test.out -w "HTTP %{http_code}, exit=%{exitcode}" \
    https://www.google.com/maps 2>&1)
else
  RESP=$(curl -sS --max-time 20 -x "http://$PROXY_HOST:$PROXY_PORT" \
    -o /tmp/proxy_test.out -w "HTTP %{http_code}, exit=%{exitcode}" \
    https://www.google.com/maps 2>&1)
fi
echo "  → $RESP"
BYTES=$(wc -c < /tmp/proxy_test.out 2>/dev/null || echo 0)
echo "  → response bytes: $BYTES"
rm -f /tmp/proxy_test.out

separator
echo "[5/5] Control test — same HTTPS fetch WITHOUT the proxy"
RESP=$(curl -sS --max-time 20 \
  -o /tmp/proxy_test.out -w "HTTP %{http_code}, exit=%{exitcode}" \
  https://www.google.com/maps 2>&1)
echo "  → $RESP"
BYTES=$(wc -c < /tmp/proxy_test.out 2>/dev/null || echo 0)
echo "  → response bytes: $BYTES"
rm -f /tmp/proxy_test.out

separator
echo "Interpretation guide:"
echo "  Step 2 fails        → proxy server is down or unreachable from this VPS"
echo "  Step 3 fails (407)  → proxy auth credentials are wrong"
echo "  Step 3 fails (URL)  → credentials contain special chars that need encoding"
echo "  Step 3 passes / 4 fails → proxy works for HTTP but blocks HTTPS / Google"
echo "  Step 4 passes       → proxy works at curl level; Playwright config bug"
echo "  Step 5 passes       → direct (no-proxy) access works — fallback is safe"
echo
