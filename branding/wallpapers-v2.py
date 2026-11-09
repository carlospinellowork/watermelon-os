#!/usr/bin/python3
"""Gera os papéis de parede "Órbita" e "Vidro" do WatermelonOS (4K, PNG).

  Órbita  céu estrelado, planeta gigante com atmosfera surgindo de baixo,
          planetinhas em volta e o logo brilhando no centro (estilo macOS).
  Vidro   manchas de cor bem desfocadas e um painel de vidro fosco no centro
          com o logo (glassmorphism). Versões clara (dia) e escura (noite).

Uso: branding/wallpapers-v2.py <pasta de saída>
Precisa de python3-gobject (Rsvg), pycairo e ImageMagick (`magick`) para o desfoque.
"""
import math
import os
import random
import subprocess
import sys
import tempfile

import cairo
import gi

gi.require_version("Rsvg", "2.0")
from gi.repository import Rsvg  # noqa: E402

W, H = 3840, 2160
HERE = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(HERE, "logo.svg")


def hexrgb(h, a=1.0):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)) + (a,)


def svg(ctx, path, x, y, w, h):
    handle = Rsvg.Handle.new_from_file(path)
    vp = Rsvg.Rectangle()
    vp.x, vp.y, vp.width, vp.height = x, y, w, h
    handle.render_document(ctx, vp)


def blur(png_in, png_out, sigma, scale=4):
    """Desfoque gaussiano grande: reduz, desfoca e amplia (rápido e sem diferença visível)."""
    small = 100 / scale
    subprocess.run(["magick", png_in, "-resize", f"{small}%", "-blur", f"0x{sigma / scale}",
                    "-resize", f"{W}x{H}!", png_out], check=True)


def surface():
    s = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
    return s, cairo.Context(s)


def paste(ctx, png, alpha=1.0):
    img = cairo.ImageSurface.create_from_png(png)
    ctx.set_source_surface(img, 0, 0)
    ctx.paint_with_alpha(alpha)


def glow(tmp, name, draw, sigma):
    """Desenha algo numa camada separada e devolve o PNG desfocado (para brilhos)."""
    s, c = surface()
    draw(c)
    raw = os.path.join(tmp, f"{name}-raw.png")
    out = os.path.join(tmp, f"{name}.png")
    s.write_to_png(raw)
    blur(raw, out, sigma)
    return out


def logo_shadow(ctx, tmp, name, x, y, size, dy=26, sigma=34, alpha=0.55):
    """Sombra suave do logo: silhueta preta, deslocada para baixo e desfocada."""
    def draw(cc):
        cc.push_group()
        svg(cc, LOGO, x, y + dy, size, size)
        mask = cc.pop_group()
        cc.set_source_rgba(0, 0, 0, alpha)
        cc.mask(mask)
    paste(ctx, glow(tmp, name, draw, sigma))


def grain(ctx, amount=0.025, seed=7):
    """Granulado sutil: evita faixas (banding) nos degradês."""
    rnd = random.Random(seed)
    noise = cairo.ImageSurface(cairo.FORMAT_ARGB32, 512, 512)
    data = noise.get_data()
    for i in range(0, len(data), 4):
        v = rnd.randint(0, 255)
        data[i:i + 4] = bytes((v, v, v, 255))
    noise.mark_dirty()
    pat = cairo.SurfacePattern(noise)
    pat.set_extend(cairo.EXTEND_REPEAT)
    ctx.set_source(pat)
    ctx.paint_with_alpha(amount)


# ------------------------------------------------------------------ Órbita
def orbit(out, tmp):
    s, c = surface()
    # céu: violeta escuro no alto, quase preto
    g = cairo.RadialGradient(W * 0.5, H * 1.1, 0, W * 0.5, H * 0.6, W * 0.85)
    for off, col in ((0, "#2a1640"), (0.45, "#120b26"), (1, "#04040a")):
        g.add_color_stop_rgba(off, *hexrgb(col))
    c.set_source(g)
    c.paint()

    # estrelas
    rnd = random.Random(42)
    for _ in range(1400):
        x, y = rnd.uniform(0, W), rnd.uniform(0, H * 0.92)
        r = rnd.choice([0.8, 1.0, 1.2, 1.6, 2.2]) * (1.6 if rnd.random() < 0.03 else 1)
        c.arc(x, y, r, 0, 2 * math.pi)
        c.set_source_rgba(1, 1, 1, rnd.uniform(0.25, 0.9))
        c.fill()

    # nebulosas: manchas de cor desfocadas
    def nebula(cc):
        for x, y, r, col, a in ((W * 0.18, H * 0.30, 700, "#7d5cff", 0.35), (W * 0.85, H * 0.22, 620, "#ff5468", 0.28),
                                (W * 0.62, H * 0.55, 520, "#30d1a0", 0.12)):
            cc.arc(x, y, r, 0, 2 * math.pi)
            cc.set_source_rgba(*hexrgb(col, a))
            cc.fill()
    paste(c, glow(tmp, "nebula", nebula, 260))

    # planeta gigante surgindo de baixo, com atmosfera
    pcx, pcy, pr = W * 0.5, H + H * 0.92, H * 1.32

    def atmosphere(cc):
        cc.arc(pcx, pcy, pr + 30, 0, 2 * math.pi)
        cc.set_line_width(90)
        cc.set_source_rgba(*hexrgb("#ff7a8a", 0.9))
        cc.stroke()
    paste(c, glow(tmp, "atmo", atmosphere, 120))
    c.arc(pcx, pcy, pr, 0, 2 * math.pi)
    pg = cairo.LinearGradient(0, pcy - pr, 0, H)
    for off, col in ((0, "#ff5468"), (0.012, "#c52a4f"), (0.06, "#5a1435"), (0.16, "#1a0716"), (1, "#05030a")):
        pg.add_color_stop_rgba(off, *hexrgb(col))
    c.set_source(pg)
    c.fill()
    # borda iluminada (crescente fino)
    c.arc(pcx, pcy, pr, 0, 2 * math.pi)
    c.set_line_width(5)
    c.set_source_rgba(*hexrgb("#ffd1d8", 0.85))
    c.stroke()

    # planetinha verde com anel (esquerda) e lua (direita)
    def planet(cx, cy, r, c1, c2, ring=False):
        if ring:
            c.save()
            c.translate(cx, cy)
            c.rotate(-0.35)
            c.scale(1, 0.28)
            c.arc(0, 0, r * 1.9, math.pi, 2 * math.pi)   # metade de trás do anel
            c.restore()
            c.set_line_width(10)
            c.set_source_rgba(1, 1, 1, 0.35)
            c.stroke()
        rg = cairo.RadialGradient(cx - r * 0.4, cy - r * 0.4, r * 0.1, cx, cy, r)
        rg.add_color_stop_rgba(0, *hexrgb(c1))
        rg.add_color_stop_rgba(1, *hexrgb(c2))
        c.arc(cx, cy, r, 0, 2 * math.pi)
        c.set_source(rg)
        c.fill()
        if ring:
            c.save()
            c.translate(cx, cy)
            c.rotate(-0.35)
            c.scale(1, 0.28)
            c.arc(0, 0, r * 1.9, 0, math.pi)                 # metade da frente
            c.restore()
            c.set_line_width(10)
            c.set_source_rgba(1, 1, 1, 0.55)
            c.stroke()
    planet(W * 0.15, H * 0.62, 120, "#a8e6a1", "#0f3d22", ring=True)
    planet(W * 0.86, H * 0.40, 46, "#e7e3f5", "#4b4766")
    planet(W * 0.74, H * 0.16, 22, "#ffd9a0", "#7a4a1a")

    # logo no centro com halo
    ls = 560
    lx, ly = (W - ls) / 2, H * 0.40 - ls / 2

    def halo(cc):
        cc.arc(W / 2, ly + ls / 2, ls * 0.55, 0, 2 * math.pi)
        cc.set_source_rgba(1, 0.55, 0.62, 0.55)
        cc.fill()
    paste(c, glow(tmp, "halo", halo, 160))
    logo_shadow(c, tmp, "orbit-shadow", lx, ly, ls)
    svg(c, LOGO, lx, ly, ls, ls)

    grain(c)
    s.write_to_png(out)


# ------------------------------------------------------------------ Vidro
def glass(out, tmp, dark):
    s, c = surface()
    base = "#0b0a14" if dark else "#f4f0fb"
    c.set_source_rgba(*hexrgb(base))
    c.paint()

    blobs = [  # x, y, raio, cor, opacidade
        (0.18, 0.25, 900, "#ff5468", 0.95 if dark else 0.75),
        (0.82, 0.20, 820, "#7d5cff", 0.95 if dark else 0.65),
        (0.70, 0.88, 950, "#30d1a0", 0.70 if dark else 0.55),
        (0.25, 0.92, 700, "#ffb347", 0.70 if dark else 0.60),
        (0.50, 0.50, 500, "#ff7ab6", 0.45 if dark else 0.35),
    ]

    def draw_blobs(cc):
        cc.set_source_rgba(*hexrgb(base))
        cc.paint()
        for x, y, r, col, a in blobs:
            cc.arc(W * x, H * y, r, 0, 2 * math.pi)
            cc.set_source_rgba(*hexrgb(col, a))
            cc.fill()
    bg = glow(tmp, f"blobs-{dark}", draw_blobs, 360)
    paste(c, bg)

    def glass_shape(cc, x, y, w, h, r):
        cc.new_sub_path()
        cc.arc(x + w - r, y + r, r, -math.pi / 2, 0)
        cc.arc(x + w - r, y + h - r, r, 0, math.pi / 2)
        cc.arc(x + r, y + h - r, r, math.pi / 2, math.pi)
        cc.arc(x + r, y + r, r, math.pi, 3 * math.pi / 2)
        cc.close_path()

    def pane(x, y, w, h, r, fill_a, edge_a):
        # sombra suave
        def shadow(cc):
            glass_shape(cc, x + 10, y + 40, w, h, r)
            cc.set_source_rgba(0, 0, 0, 0.45 if dark else 0.18)
            cc.fill()
        paste(c, glow(tmp, f"shadow-{x}-{dark}", shadow, 70))
        # vidro: fundo mais claro + reflexo em degradê de cima para baixo
        glass_shape(c, x, y, w, h, r)
        c.set_source_rgba(1, 1, 1, fill_a)
        c.fill_preserve()
        lg = cairo.LinearGradient(x, y, x + w * 0.6, y + h)
        lg.add_color_stop_rgba(0, 1, 1, 1, 0.20)
        lg.add_color_stop_rgba(0.5, 1, 1, 1, 0.03)
        lg.add_color_stop_rgba(1, 1, 1, 1, 0.08)
        c.set_source(lg)
        c.fill_preserve()
        c.set_line_width(3)
        c.set_source_rgba(1, 1, 1, edge_a)
        c.stroke()

    # dois vidros pequenos "flutuando" atrás, para dar profundidade
    pane(W * 0.12, H * 0.14, 420, 420, 110, 0.06, 0.25)
    pane(W * 0.76, H * 0.62, 520, 340, 90, 0.06, 0.25)
    # painel principal
    pw = ph = 860
    px, py = (W - pw) / 2, (H - ph) / 2
    pane(px, py, pw, ph, 200, 0.10 if dark else 0.28, 0.40 if dark else 0.75)

    ls = 600
    lx, ly = (W - ls) / 2, (H - ls) / 2 - 6
    logo_shadow(c, tmp, f"glass-shadow-{dark}", lx, ly, ls, dy=22, sigma=28, alpha=0.5 if dark else 0.3)
    svg(c, LOGO, lx, ly, ls, ls)

    grain(c, 0.03 if dark else 0.02)
    s.write_to_png(out)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(out, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        orbit(os.path.join(out, "orbit.png"), tmp)
        glass(os.path.join(out, "glass-night.png"), tmp, dark=True)
        glass(os.path.join(out, "glass-day.png"), tmp, dark=False)
    print("OK:", out)


if __name__ == "__main__":
    main()
