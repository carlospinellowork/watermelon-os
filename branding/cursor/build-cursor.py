#!/usr/bin/python3
"""Gera o cursor "Watermelon" a partir dos SVGs do Bibata Modern (GPL-3.0, github.com/ful1e5/Bibata_Cursor).

Seta vermelho-polpa com contorno verde-casca; o "carregando" gira como fatias de melancia.

Uso (precisa de python3-gobject com Rsvg e do clickgen: `pip install clickgen`):
    branding/cursor/build-cursor.py <pasta do Bibata_Cursor> <saída>
Ex.: branding/cursor/build-cursor.py /tmp/Bibata_Cursor system_files/usr/share/icons

O resultado (pasta Watermelon-Cursor) vai versionado no repositório, então o
build da imagem não precisa rodar isto.
"""
import os
import shutil
import subprocess
import sys
import tempfile

import gi

gi.require_version("Rsvg", "2.0")
from gi.repository import Rsvg  # noqa: E402

import cairo  # noqa: E402

NAME = "Watermelon-Cursor"
COMMENT = "Cursor do WatermelonOS: polpa vermelha, casca verde (baseado no Bibata Modern)"

# Cores-placeholder do Bibata -> paleta da melancia
COLORS = {
    "#00FF00": "#FF5468",  # corpo da seta (polpa)
    "#0000FF": "#123D22",  # contorno (casca escura, contraste em fundo claro e escuro)
    "#FF0000": "#121614",  # fundo do relógio "carregando"
    # gomos do "carregando": vermelho, verde, verde-claro, vermelho escuro
    "#F05024": "#FF5468",
    "#7EBA41": "#1E7A3C",
    "#32A0DA": "#A8E6A1",
    "#FCB813": "#E8304A",
}
SIZE = 256


def render(svg_text, png_path):
    handle = Rsvg.Handle.new_from_data(svg_text.encode())
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, SIZE, SIZE)
    ctx = cairo.Context(surface)
    vp = Rsvg.Rectangle()
    vp.x, vp.y, vp.width, vp.height = 0, 0, SIZE, SIZE
    handle.render_document(ctx, vp)
    surface.write_to_png(png_path)


def recolor(text):
    for old, new in COLORS.items():
        text = text.replace(old, new).replace(old.lower(), new)
    return text


def main():
    src, out = sys.argv[1], os.path.abspath(sys.argv[2])
    svg_dir = os.path.join(src, "svg", "modern")
    with tempfile.TemporaryDirectory() as tmp:
        bitmaps = os.path.join(tmp, "bitmaps")
        os.makedirs(bitmaps)
        for root, _, files in os.walk(svg_dir, followlinks=True):
            for f in files:
                if f.endswith(".svg"):
                    with open(os.path.join(root, f)) as fh:
                        render(recolor(fh.read()), os.path.join(bitmaps, f[:-4] + ".png"))
        cfg = os.path.join(src, "configs", "normal", "x.build.toml")
        subprocess.run(["ctgen", cfg, "-d", bitmaps, "-o", tmp, "-n", NAME, "-c", COMMENT,
                        "-s", "24", "32", "48", "64",
                        "-w", "https://github.com/carlospinellowork/watermelon-os"], check=True)
        dest = os.path.join(out, NAME)
        shutil.rmtree(dest, ignore_errors=True)
        shutil.copytree(os.path.join(tmp, NAME), dest, symlinks=True)
    print("OK:", dest)


if __name__ == "__main__":
    main()
