#!/usr/bin/python3
"""Gera o "carregando" do boot no estilo macOS: 12 raios brancos que giram esmaecendo.
Uso: branding/plymouth/throbber.py <pasta>  ->  throbber-0001.png ... throbber-0012.png
"""
import math
import os
import sys

import cairo

SIZE, FRAMES, SPOKES = 48, 12, 12


def frame(i, path):
    s = cairo.ImageSurface(cairo.FORMAT_ARGB32, SIZE, SIZE)
    c = cairo.Context(s)
    c.translate(SIZE / 2, SIZE / 2)
    c.set_line_cap(cairo.LINE_CAP_ROUND)
    c.set_line_width(SIZE * 0.085)
    for k in range(SPOKES):
        # o raio "da frente" é o mais claro; os de trás vão sumindo
        age = (k - i) % SPOKES
        alpha = 0.2 + 0.8 * (1 - age / SPOKES)
        ang = 2 * math.pi * k / SPOKES - math.pi / 2
        c.set_source_rgba(1, 1, 1, alpha)
        c.move_to(math.cos(ang) * SIZE * 0.24, math.sin(ang) * SIZE * 0.24)
        c.line_to(math.cos(ang) * SIZE * 0.44, math.sin(ang) * SIZE * 0.44)
        c.stroke()
    s.write_to_png(path)


if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for i in range(FRAMES):
        frame(i, os.path.join(out, f"throbber-{i + 1:04d}.png"))
    print("OK:", out)
