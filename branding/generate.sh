#!/usr/bin/env bash
# Gera icon.svg, wordmark-*.svg e os PNGs a partir de logo.svg (a fonte única).
# Uso: ./generate.sh   (precisa de docker; renderiza com rsvg-convert num Alpine)
set -euo pipefail
cd "$(dirname "$0")"

# Miolo da logo (defs + desenho), sem a tag <svg> externa
BODY=$(sed -n '/<defs>/,/^<\/svg>/p' logo.svg | sed '$d')

cat > icon.svg <<EOF
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <title>WatermelonOS</title>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2a22"/><stop offset="1" stop-color="#0d1511"/></linearGradient>
  <rect x="16" y="16" width="480" height="480" rx="108" fill="url(#bg)"/>
  <g transform="translate(38 38) scale(0.85)">
$BODY
  </g>
</svg>
EOF

wordmark() {  # $1 = cor do texto, $2 = arquivo
  cat > "$2" <<EOF
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1240 300" width="1240" height="300">
  <title>WatermelonOS</title>
  <g transform="translate(10 22) scale(0.5)">
$BODY
  </g>
  <text x="290" y="190" font-family="Inter, Cantarell, 'DejaVu Sans', sans-serif" font-size="128" letter-spacing="-3" fill="$1"><tspan font-weight="700">watermelon</tspan><tspan font-weight="300" fill="#e8304a">OS</tspan></text>
</svg>
EOF
}
wordmark "#1d1d1f" wordmark-light.svg
wordmark "#f5f5f7" wordmark-dark.svg
rm -f wordmark.svg

docker run --rm -v "$PWD":/w -w /w alpine:3.20 sh -c '
  apk add -q rsvg-convert font-inter >/dev/null 2>&1
  mkdir -p png
  for s in 16 32 48 64 128 256 512; do rsvg-convert -w $s -h $s icon.svg -o png/icon-$s.png; done
  rsvg-convert -w 512 logo.svg -o png/logo-512.png
  rsvg-convert preview-sheet.svg -o preview.png
  chown -R '"$(id -u):$(id -g)"' .'
echo "branding gerado"
