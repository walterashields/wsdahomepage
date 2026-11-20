#!/usr/bin/env bash
# Read-only snapshot of what a WSDA host serves, with exact bytes and SHA-256 for every file.
# Usage (on your Mac, in Terminal):
#   bash snapshot-production.sh                         # production: https://wsdalearning.ai
#   bash snapshot-production.sh https://<preview>.wsda-homepage.pages.dev   # a preview, to compare
# Output: a folder wsda-snapshot-<host>-<time>/ and a .zip of it. Attach the .zip in the chat.
# It only sends GET requests. It changes nothing on the site or in Cloudflare.
set -u
HOST="${1:-https://wsdalearning.ai}"
HOST="${HOST%/}"
NAME="$(echo "$HOST" | sed -E 's#https?://##; s#[^A-Za-z0-9.-]#_#g')"
OUT="wsda-snapshot-${NAME}-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT/site" "$OUT/headers"
REPORT="$OUT/report.tsv"
printf 'path\tstatus\tlocation\tcontent_type\tbytes\tsha256\tsaved_as\n' > "$REPORT"
UA="WSDA-site-snapshot/1.0"

map_file() {  # URL path -> file name in the deploy folder
  case "$1" in
    /) echo "index.html" ;;
    */) echo "${1#/}index.html" ;;
    *.*) echo "${1#/}" ;;
    *) echo "${1#/}.html" ;;
  esac
}

fetch() {  # $1 = path; $2 = "save" to keep the body as a site file
  local p="$1" save="${2:-}" safe hdr body meta status loc ctype size sum dest=""
  safe="$(echo "$p" | sed -E 's#[^A-Za-z0-9._-]#_#g')"
  hdr="$OUT/headers/${safe}.txt"; body="$OUT/.body"
  meta="$(curl -sS --compressed -A "$UA" -D "$hdr" -o "$body" \
          -w '%{http_code}\t%{redirect_url}\t%{content_type}\t%{size_download}' "$HOST$p" 2>/dev/null)" || meta="000\t\t\t0"
  status="$(printf '%b' "$meta" | cut -f1)"; loc="$(printf '%b' "$meta" | cut -f2)"
  ctype="$(printf '%b' "$meta" | cut -f3)"; size="$(printf '%b' "$meta" | cut -f4)"
  sum="$(shasum -a 256 "$body" 2>/dev/null | cut -d' ' -f1)"
  if [ "$save" = "save" ] && [ "$status" = "200" ]; then
    dest="$(map_file "$p")"; mkdir -p "$OUT/site/$(dirname "$dest")"; cp "$body" "$OUT/site/$dest"
  fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$p" "$status" "$loc" "$ctype" "$size" "$sum" "$dest" >> "$REPORT"
  echo "$status  $p"
}

echo "Snapshot of $HOST"
PAGES="/ /about /contact /teams /teams/thank-you /robots.txt /sitemap.xml"
for p in $PAGES; do fetch "$p" save; done

# Every local file the pages reference (stylesheets, scripts, images, og images).
for f in $(find "$OUT/site" -name '*.html'); do
  grep -oE '(src|href)="/[^"#?]+"' "$f" | sed -E 's/^(src|href)="//; s/"$//'
  grep -oE 'content="https://(www\.)?wsdalearning\.ai/[^"#?]+"' "$f" | sed -E 's#^content="https://(www\.)?wsdalearning\.ai##; s/"$//'
done | sort -u | while read -r p; do
  case "$p" in /|/about|/contact|/teams|/teams/thank-you|/software-coach*) ;; *.*) fetch "$p" save ;; esac
done

# Redirects (_redirects) and routing behaviour. Not saved as site files.
for p in /pages/ai-data-analyst /users/sign_in /enroll/x /manage/x /courses/x /bundles/x \
         /index.html /about.html /teams.html /software-coach /software-coach/terms \
         /this-page-should-not-exist-123; do fetch "$p"; done
echo "www host:"; curl -sS -A "$UA" -o /dev/null -D "$OUT/headers/_www_root.txt" -w '%{http_code} %{redirect_url}\n' "$(echo "$HOST" | sed 's#://#://www.#')/" 2>/dev/null

# Flags for anything Cloudflare may inject into served HTML (these must be removed before re-uploading).
{
  echo "Injected-content check (should all be 0):"
  for k in '__cf_email__' '/cdn-cgi/l/email-protection' 'cloudflareinsights' 'rocket-loader' 'cdn-cgi/scripts'; do
    printf '  %-32s %s\n' "$k" "$(grep -rl -- "$k" "$OUT/site" 2>/dev/null | wc -l | tr -d ' ')"
  done
  echo "GTM IDs found:"; grep -rhoE 'GTM-[A-Z0-9]+' "$OUT/site" | sort | uniq -c
} > "$OUT/flags.txt"
cat "$OUT/flags.txt"
rm -f "$OUT/.body"
(cd "$(dirname "$OUT")" && zip -qr "$OUT.zip" "$OUT")
echo "Done: $OUT.zip  (attach this file in the chat)"
