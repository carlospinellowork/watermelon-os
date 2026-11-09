#!/usr/bin/env bash
# Gera toda a identidade a partir do código:
#   logo.py      -> logo.svg, logo-small.svg, icon.svg, icon-small.svg, wordmark-dark.svg, wordmark-light.svg
#   png/         -> ícones 16–512 (até 32 px usa a versão simplificada) e logo-512.png
#   ../docs/img  -> logo, nomes e favicon do site
# Uso: ./generate.sh   (precisa de: python3 com fonttools; python3-gobject com Rsvg e cairo)
set -euo pipefail
cd "$(dirname "$0")"

PY=${PYTHON:-python3}
"$PY" logo.py --variante bite .

render() {  # render <svg> <png> <largura>
  /usr/bin/python3 - "$@" <<'EOF'
import sys
import cairo
import gi
gi.require_version("Rsvg", "2.0")
from gi.repository import Rsvg
src, out, w = sys.argv[1], sys.argv[2], int(sys.argv[3])
h = Rsvg.Handle.new_from_file(src)
_, vw, vh = h.get_intrinsic_size_in_pixels()
H = round(w * vh / vw)
s = cairo.ImageSurface(cairo.FORMAT_ARGB32, w, H)
r = Rsvg.Rectangle()
r.x, r.y, r.width, r.height = 0, 0, w, H
h.render_document(cairo.Context(s), r)
s.write_to_png(out)
EOF
}

mkdir -p png
for s in 16 32; do render icon-small.svg "png/icon-$s.png" "$s"; done
for s in 48 64 128 256 512; do render icon.svg "png/icon-$s.png" "$s"; done
render logo.svg png/logo-512.png 512

cp logo.svg wordmark-dark.svg wordmark-light.svg ../docs/img/
render icon.svg ../docs/img/favicon.png 64
echo "branding gerado"
