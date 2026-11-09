#!/usr/bin/env python3
"""Logo do WatermelonOS, gerado por código.

Uma fatia de verdade: setor de círculo com cantos arredondados, casca em três
faixas firmes (verde-escuro, verde-claro, polpa) e sementes alinhadas para a ponta.

  logo.svg            símbolo (fonte de tudo)
  logo-small.svg      versão simplificada para 16–32 px (casca mais grossa, 3 sementes)
  icon.svg            ícone de app: símbolo num quadrado arredondado grafite
  icon-small.svg      ícone de app para 16–32 px
  wordmark-dark.svg   símbolo + "WatermelonOS" (texto claro, para fundos escuros)
  wordmark-light.svg  idem, texto escuro (fundos claros)

O texto vira curvas a partir da fonte Outfit (OFL) com fontTools, então o SVG não
depende de fonte instalada.

Uso:  branding/logo.py [--variante bite|clean|half] [--fonte Outfit.ttf] [pasta]
Precisa de: pip install fonttools  (e da fonte Outfit variável, baixada do Google Fonts)
"""
import argparse
import math
import os

# ------------------------------------------------------------------ paleta
RIND = "#17703a"        # casca
RIND_DARK = "#0f5229"   # borda da casca (dá definição em fundo claro)
PITH = "#c9f2bd"        # parte branca/verde-clara
FLESH_TOP = "#ff5a6e"
FLESH_BOTTOM = "#e3243f"
SEED = "#24130f"
INK_DARK_BG = "#f5f5f7"
INK_LIGHT_BG = "#1c1c1e"

S = 512                 # tamanho do quadro do símbolo


def f(x):
    return f"{x:.2f}".rstrip("0").rstrip(".")


# ------------------------------------------------------------------ geometria
class Slice:
    """Setor apontando para cima: ponta em O, arco embaixo."""

    def __init__(self, half_angle=36, radius=372, apex_y=58, corner=30):
        self.a = math.radians(half_angle)
        self.R = radius
        self.O = (S / 2, apex_y)
        self.r = corner

    def pt(self, radius, deg_from_axis, origin=None):
        """Ponto a 'radius' da ponta, 'deg_from_axis' graus a partir do eixo vertical (negativo = esquerda)."""
        ox, oy = origin or self.O
        t = math.radians(90 + deg_from_axis)
        return ox + radius * math.cos(t), oy + radius * math.sin(t)

    def rounded_path(self):
        """Contorno do setor com os 3 cantos arredondados (tangentes de verdade, sem truque de traço)."""
        ox, oy = self.O
        a, R, r = self.a, self.R, self.r
        # ponta: arco de raio r tangente aos dois lados
        d = r / math.sin(a)                       # distância da ponta ao centro do arredondamento
        cx, cy = ox, oy + d
        t_len = d * math.cos(a)                   # distância da ponta ao ponto de tangência
        lx, ly = ox - t_len * math.sin(a), oy + t_len * math.cos(a)
        rx, ry = ox + t_len * math.sin(a), oy + t_len * math.cos(a)
        # cantos de baixo: círculo de raio r tangente ao lado e ao arco (por dentro)
        # centro a distância r do lado e a R - r da ponta
        beta = math.asin(r / (R - r))             # ângulo do centro em relação ao lado
        def corner(sign):
            ang = sign * (math.degrees(a) - math.degrees(beta))
            ccx, ccy = self.pt(R - r, ang)
            # tangência no arco: na direção da ponta -> centro, a R
            ax, ay = self.pt(R, ang)
            # tangência no lado: projeção do centro no lado
            dist_side = math.hypot(ccx - ox, ccy - oy) * math.cos(beta)
            sx, sy = self.pt(dist_side, sign * math.degrees(a))
            return (sx, sy), (ax, ay)
        (lsx, lsy), (lax, lay) = corner(+1)   # +1 = lado esquerdo na tela (ângulo positivo vai para a esquerda)
        (rsx, rsy), (rax, ray) = corner(-1)
        # ordem: tangente esquerda da ponta -> lado esquerdo -> canto -> arco -> canto -> lado direito -> ponta
        return (f"M{f(lx)} {f(ly)} "
                f"L{f(lsx)} {f(lsy)} A{f(r)} {f(r)} 0 0 0 {f(lax)} {f(lay)} "
                f"A{f(R)} {f(R)} 0 0 0 {f(rax)} {f(ray)} "
                f"A{f(r)} {f(r)} 0 0 0 {f(rsx)} {f(rsy)} "
                f"L{f(rx)} {f(ry)} A{f(r)} {f(r)} 0 0 0 {f(lx)} {f(ly)} Z")

    def seed(self, radius, deg, size=1.0):
        """Semente em gota apontando para a ponta."""
        x, y = self.pt(radius, deg)
        w, h = 13 * size, 24 * size
        # gota: ponta fina em cima (na direção da ponta da fatia), base redonda embaixo
        d = (f"M0 {-h} C{w * 0.55} {-h * 0.45} {w} {h * 0.15} {w} {h * 0.42} "
             f"A{w} {w * 0.95} 0 0 1 {-w} {h * 0.42} C{-w} {h * 0.15} {-w * 0.55} {-h * 0.45} 0 {-h} Z")
        return f'<path transform="translate({f(x)} {f(y)}) rotate({f(-deg)})" d="{d}"/>'


def mark(variant="bite", small=False, idp="wm"):
    """SVG <g> do símbolo num quadro 512×512."""
    sl = Slice(half_angle=38 if small else 36, corner=40 if small else 30)
    R = sl.R
    rind_w = 0.17 * R if small else 0.115 * R
    pith_w = 0.055 * R if small else 0.04 * R
    ox, oy = sl.O
    outline = sl.rounded_path()

    bite = ""
    if variant == "bite" and not small:
        # mordida na lateral direita: dois dentes, o de baixo maior
        bx1, by1 = sl.pt(150, -36)
        bx2, by2 = sl.pt(205, -36)
        bite = (f'<circle cx="{f(bx1 + 6)}" cy="{f(by1)}" r="26" fill="#000"/>'
                f'<circle cx="{f(bx2 + 10)}" cy="{f(by2)}" r="31" fill="#000"/>')

    if small:
        seeds = [sl.seed(210, -13, 1.35), sl.seed(210, 13, 1.35), sl.seed(130, 0, 1.25)]
    else:
        seeds = [sl.seed(118, 0, 1.0),
                 sl.seed(186, -12, 1.05), sl.seed(186, 12, 1.05),
                 sl.seed(250, -21, 1.1), sl.seed(250, 0, 1.1), sl.seed(250, 21, 1.1)]

    gloss = "" if small else (
        f'<path d="M{f(ox - 40)} {f(oy + 70)} Q{f(ox - 110)} {f(oy + 210)} {f(ox - 150)} {f(oy + 260)}" '
        f'stroke="#fff" stroke-opacity=".22" stroke-width="16" stroke-linecap="round" fill="none"/>')

    return f'''<defs>
    <linearGradient id="{idp}-flesh" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{FLESH_TOP}"/><stop offset="1" stop-color="{FLESH_BOTTOM}"/>
    </linearGradient>
    <clipPath id="{idp}-clip"><path d="{outline}"/></clipPath>
    <mask id="{idp}-bite" maskUnits="userSpaceOnUse" x="0" y="0" width="{S}" height="{S}">
      <rect width="{S}" height="{S}" fill="#fff"/>{bite}
    </mask>
  </defs>
  <g mask="url(#{idp}-bite)">
    <g clip-path="url(#{idp}-clip)">
      <circle cx="{f(ox)}" cy="{f(oy)}" r="{f(R + 4)}" fill="{RIND}"/>
      <circle cx="{f(ox)}" cy="{f(oy)}" r="{f(R - rind_w)}" fill="{PITH}"/>
      <circle cx="{f(ox)}" cy="{f(oy)}" r="{f(R - rind_w - pith_w)}" fill="url(#{idp}-flesh)"/>
      <g fill="{SEED}">{"".join(seeds)}</g>
      {gloss}
    </g>
    <path d="{outline}" fill="none" stroke="{RIND_DARK}" stroke-opacity=".35" stroke-width="3"/>
  </g>'''


def half_moon(idp="wm"):
    """Variante 'meia-lua': fatia em semicírculo, como o sorriso de uma melancia cortada."""
    cx, cy, R = 256, 170, 220
    rind, pith = 30, 11
    seeds = []
    for r_, angs in ((95, (-40, 0, 40)), (160, (-58, -20, 20, 58))):
        for a in angs:
            t = math.radians(90 + a)
            x, y = cx + r_ * math.cos(t), cy + r_ * math.sin(t)
            seeds.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="10" ry="17" transform="rotate({f(-a)} {f(x)} {f(y)})"/>')
    semi = f"M{cx - R} {cy} A{R} {R} 0 0 0 {cx + R} {cy} Z"
    return f'''<defs>
    <linearGradient id="{idp}-flesh" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{FLESH_TOP}"/><stop offset="1" stop-color="{FLESH_BOTTOM}"/>
    </linearGradient>
  </defs>
  <g transform="translate(0 60)">
    <path d="{semi}" fill="{RIND}" stroke="{RIND}" stroke-width="20" stroke-linejoin="round"/>
    <path d="M{cx - R + rind} {cy} A{R - rind} {R - rind} 0 0 0 {cx + R - rind} {cy} Z" fill="{PITH}"/>
    <path d="M{cx - R + rind + pith} {cy} A{R - rind - pith} {R - rind - pith} 0 0 0 {cx + R - rind - pith} {cy} Z" fill="url(#{idp}-flesh)"/>
    <g fill="{SEED}">{"".join(seeds)}</g>
  </g>'''


# ------------------------------------------------------------------ texto em curvas
def text_path(text_parts, font_path, size, x, baseline, weight=700, tracking=-0.02):
    """[(texto, cor)] -> <path>s usando os contornos da fonte. Retorna (svg, largura)."""
    from fontTools.ttLib import TTFont
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen
    from fontTools.varLib.instancer import instantiateVariableFont

    font = TTFont(font_path)
    if "fvar" in font:
        font = instantiateVariableFont(font, {"wght": weight})
    upm = font["head"].unitsPerEm
    scale = size / upm
    cmap = font.getBestCmap()
    gs = font.getGlyphSet()
    hmtx = font["hmtx"]
    out, cur = [], x
    for text, color in text_parts:
        paths = []
        for ch in text:
            g = cmap.get(ord(ch))
            if not g:
                continue
            pen = SVGPathPen(gs)
            gs[g].draw(TransformPen(pen, (scale, 0, 0, -scale, cur, baseline)))
            paths.append(pen.getCommands())
            cur += hmtx[g][0] * scale + tracking * size
        out.append(f'<path fill="{color}" d="{" ".join(paths)}"/>')
    return "".join(out), cur - x


# ------------------------------------------------------------------ arquivos
def svg(view_w, view_h, body, title="WatermelonOS"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {view_w} {view_h}" width="{view_w}" height="{view_h}">\n'
            f'  <title>{title}</title>\n  {body}\n</svg>\n')


def symbol(variant, idp="wm", small=False):
    return half_moon(idp) if variant == "half" else mark(variant, small, idp)


def icon(variant, small=False):
    tile = f'''<defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2e2e33"/><stop offset="1" stop-color="#141416"/></linearGradient>
    <filter id="drop" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity=".45"/></filter>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#tile)"/>
  <rect x="16.5" y="16.5" width="479" height="479" rx="111.5" fill="none" stroke="#fff" stroke-opacity=".08"/>
  <g filter="url(#drop)" transform="translate(64 66) scale(.75)">
  {symbol(variant, "ic", small=small)}
  </g>'''
    return svg(512, 512, tile)


def wordmark(variant, font, ink):
    sym = f'<g transform="translate(14 22) scale(.5)">{symbol(variant, "wmk")}</g>'
    txt, w = text_path([("Watermelon", ink), ("OS", "#ff5468")], font, 132, 290, 196, weight=700)
    width = int(290 + w + 24)
    return svg(width, 300, sym + txt)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out", nargs="?", default=os.path.dirname(os.path.abspath(__file__)))
    ap.add_argument("--variante", default="bite", choices=["bite", "clean", "half"])
    ap.add_argument("--fonte", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts", "Outfit.ttf"))
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    w = lambda name, s: open(os.path.join(a.out, name), "w").write(s)
    w("logo.svg", svg(512, 512, symbol(a.variante)))
    w("logo-small.svg", svg(512, 512, symbol(a.variante if a.variante == "half" else "clean", small=True)))
    w("icon.svg", icon(a.variante))
    w("icon-small.svg", icon(a.variante, small=True))
    w("wordmark-dark.svg", wordmark(a.variante, a.fonte, INK_DARK_BG))
    w("wordmark-light.svg", wordmark(a.variante, a.fonte, INK_LIGHT_BG))
    print("OK:", a.out)


if __name__ == "__main__":
    main()
