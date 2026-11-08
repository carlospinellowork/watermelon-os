#!/usr/bin/env python3
"""Gera os wallpapers do WatermelonOS (dia/pôr do sol e noite) em SVG.

Ilustração original: ponte suspensa sobre a baía com neblina, céu nas cores
da marca (coral melancia, dourado, índigo). Renderizar com generate.sh.
"""
import math
import random

W, H = 3840, 2160
HORIZON = 1480          # linha d'água
DECK_Y = 1330           # tabuleiro da ponte
TOWERS = (1180, 2780)   # x das duas torres
TOWER_TOP = 560
PAD = 300              # margem de renderização (ver render)

THEMES = {
    "day": {
        "sky": [(0, "#241d4a"), (0.30, "#6e2f66"), (0.52, "#d8405e"), (0.68, "#ff6a5a"),
                (0.80, "#ff9d5c"), (0.90, "#ffd27a")],
        "sun": ("#fff4cf", "#ffc86b"), "sun_pos": (2050, 1300, 230), "sun_glow": 0.55,
        "far_hill": "#7a3160", "near_hill": "#3d1c45",
        "water": [(0, "#ffc27f"), (0.12, "#f07a68"), (0.45, "#9c3d62"), (1, "#24122f")],
        "bridge": "#4a1530", "cable": "#5a1a36",
        "fog": "#ffe3d6", "fog_opacity": (0.55, 0.38, 0.28),
        "stars": 0, "lights": False,
    },
    "night": {
        "sky": [(0, "#04060f"), (0.40, "#0d1030"), (0.70, "#251a45"), (0.88, "#4a2350"),
                (1, "#6b2a52")],
        "sun": ("#f4f1ff", "#c9c3ff"), "sun_pos": (2950, 420, 70), "sun_glow": 0.25,
        "far_hill": "#1d1533", "near_hill": "#0d0a1c",
        "water": [(0, "#6b2a52"), (0.15, "#2c1a44"), (0.5, "#110d24"), (1, "#05050d")],
        "bridge": "#1a0d1f", "cable": "#2a1426",
        "fog": "#8f8ab8", "fog_opacity": (0.28, 0.2, 0.14),
        "stars": 260, "lights": True,
    },
}


def gradient(gid, stops, vertical=True):
    s = "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
    xy = 'x1="0" y1="0" x2="0" y2="1"' if vertical else 'x1="0" y1="0" x2="1" y2="0"'
    return f'<linearGradient id="{gid}" {xy}>{s}</linearGradient>'


def hill(points, fill, opacity=1):
    d = f"M0 {HORIZON} " + " ".join(f"L{x} {y}" for x, y in points) + f" L{W} {HORIZON} Z"
    return f'<path d="{d}" fill="{fill}" opacity="{opacity}"/>'


def smooth_ridge(seed, base, amp, n=14):
    rnd = random.Random(seed)
    pts = []
    for i in range(n + 1):
        x = W * i / n
        y = base - amp * (0.5 + 0.5 * math.sin(i * 0.9 + seed)) - rnd.uniform(0, amp * 0.4)
        pts.append((round(x), round(y)))
    # curva suave (Catmull-Rom -> Bézier)
    d = f"M0 {HORIZON} L{pts[0][0]} {pts[0][1]} "
    for i in range(len(pts) - 1):
        p0 = pts[max(i - 1, 0)]; p1 = pts[i]; p2 = pts[i + 1]; p3 = pts[min(i + 2, len(pts) - 1)]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f"C{c1[0]:.0f} {c1[1]:.0f} {c2[0]:.0f} {c2[1]:.0f} {p2[0]} {p2[1]} "
    return d + f"L{W} {HORIZON} Z"


def cable_y(x):
    """Altura do cabo principal: parábolas entre âncoras e torres."""
    a, b = TOWERS
    if x <= a:   # vão lateral esquerdo: sobe da âncora até a torre
        t = (x - 0) / a
        return DECK_Y - 40 - (DECK_Y - 40 - TOWER_TOP - 30) * t ** 1.6
    if x >= b:
        t = (W - x) / (W - b)
        return DECK_Y - 40 - (DECK_Y - 40 - TOWER_TOP - 30) * t ** 1.6
    mid = (a + b) / 2
    half = (b - a) / 2
    sag_bottom = DECK_Y - 28
    top = TOWER_TOP + 30
    return sag_bottom - (sag_bottom - top) * ((x - mid) / half) ** 2


def tower(x, color):
    leg_w, gap = 46, 120
    parts = []
    for lx in (x - gap / 2 - leg_w, x + gap / 2):
        parts.append(f'<rect x="{lx:.0f}" y="{TOWER_TOP}" width="{leg_w}" height="{HORIZON - TOWER_TOP}" fill="{color}"/>')
    for i, y in enumerate((TOWER_TOP + 10, TOWER_TOP + 170, TOWER_TOP + 360, TOWER_TOP + 560)):
        h = 46 if i == 0 else 30
        parts.append(f'<rect x="{x - gap / 2 - leg_w:.0f}" y="{y}" width="{gap + 2 * leg_w}" height="{h}" fill="{color}"/>')
    # aberturas em arco entre as vigas (detalhe art déco)
    return "".join(parts)


def bridge(theme):
    c = theme["bridge"]
    out = []
    # cabos principais (dois, levemente deslocados = profundidade)
    for off, op in ((0, 1), (14, 0.6)):
        pts = " ".join(f"{x} {cable_y(x) + off:.1f}" for x in range(0, W + 1, 20))
        out.append(f'<polyline points="{pts}" fill="none" stroke="{theme["cable"]}" stroke-width="9" opacity="{op}"/>')
    # pendurais
    sus = []
    for x in range(30, W, 46):
        y = cable_y(x)
        if DECK_Y - y > 12:
            sus.append(f"M{x} {y:.0f}V{DECK_Y}")
    out.append(f'<path d="{"".join(sus)}" stroke="{theme["cable"]}" stroke-width="3" opacity="0.8"/>')
    # torres e tabuleiro
    for x in TOWERS:
        out.append(tower(x, c))
    out.append(f'<rect x="0" y="{DECK_Y}" width="{W}" height="34" fill="{c}"/>')
    out.append(f'<rect x="0" y="{DECK_Y + 34}" width="{W}" height="16" fill="{c}" opacity="0.7"/>')
    # luzes à noite
    if theme["lights"]:
        lights = "".join(f'<circle cx="{x}" cy="{DECK_Y - 6}" r="4"/>' for x in range(20, W, 64))
        out.append(f'<g fill="#ffcf7a" opacity="0.9" filter="url(#glow)">{lights}</g>')
        for x in TOWERS:
            out.append(f'<circle cx="{x}" cy="{TOWER_TOP - 10}" r="9" fill="#ff5468" filter="url(#glow)"/>')
    return "".join(out)


def fog(theme, seed, y, height, opacity):
    rnd = random.Random(seed)
    blobs = []
    for _ in range(26):
        cx = rnd.uniform(-200, W + 200)
        rx = rnd.uniform(380, 900)
        ry = rnd.uniform(height * 0.35, height * 0.7)
        cy = y + rnd.uniform(-height * 0.25, height * 0.25)
        blobs.append(f'<ellipse cx="{cx:.0f}" cy="{cy:.0f}" rx="{rx:.0f}" ry="{ry:.0f}"/>')
    return f'<g fill="{theme["fog"]}" opacity="{opacity}" filter="url(#fog)">{"".join(blobs)}</g>'


def stars(n):
    rnd = random.Random(7)
    s = []
    for _ in range(n):
        x, y = rnd.uniform(0, W), rnd.uniform(0, HORIZON * 0.62)
        r = rnd.choice((1.2, 1.6, 2.2, 3))
        s.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r}" opacity="{rnd.uniform(0.35, 1):.2f}"/>')
    return f'<g fill="#ffffff">{"".join(s)}</g>'


def render(name):
    t = THEMES[name]
    sx, sy, sr = t["sun_pos"]
    defs = [
        gradient("sky", t["sky"]),
        gradient("water", t["water"]),
        f'<radialGradient id="sun"><stop offset="0" stop-color="{t["sun"][0]}"/><stop offset="1" stop-color="{t["sun"][1]}"/></radialGradient>',
        f'<radialGradient id="glowg"><stop offset="0" stop-color="{t["sun"][1]}" stop-opacity="{t["sun_glow"]}"/><stop offset="1" stop-color="{t["sun"][1]}" stop-opacity="0"/></radialGradient>',
        f'<filter id="fog" filterUnits="userSpaceOnUse" x="-1200" y="0" width="{W + 2400}" height="{H}"><feGaussianBlur stdDeviation="60" edgeMode="duplicate"/></filter>',
        '<filter id="glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
        '<filter id="soft"><feGaussianBlur stdDeviation="18"/></filter>',
    ]
    body = [
        f'<rect x="{-PAD}" width="{W + 2 * PAD}" height="{HORIZON}" fill="url(#sky)"/>',
        stars(t["stars"]) if t["stars"] else "",
        f'<circle cx="{sx}" cy="{sy}" r="{sr * 4.5}" fill="url(#glowg)"/>',
        f'<circle cx="{sx}" cy="{sy}" r="{sr}" fill="url(#sun)"/>',
        f'<path d="{smooth_ridge(3, HORIZON - 40, 260)}" fill="{t["far_hill"]}" opacity="0.85"/>',
        f'<rect x="{-PAD}" y="1100" width="{PAD}" height="{HORIZON - 1100}" fill="{t["near_hill"]}"/>',
        f'<rect x="{W}" y="1100" width="{PAD}" height="{HORIZON - 1100}" fill="{t["near_hill"]}"/>',
        fog(t, 11, HORIZON - 120, 220, t["fog_opacity"][2]),
        f'<path d="M0 {HORIZON} L0 1180 C 300 1150 520 1260 760 1330 C 900 1370 1000 1420 1100 {HORIZON} Z" fill="{t["near_hill"]}"/>',
        f'<path d="M{W} {HORIZON} L{W} 1120 C 3500 1110 3300 1230 3120 1320 C 3000 1380 2950 1430 2900 {HORIZON} Z" fill="{t["near_hill"]}"/>',
        f'<rect x="{-PAD}" y="{HORIZON}" width="{W + 2 * PAD}" height="{H - HORIZON}" fill="url(#water)"/>',
        # reflexo do sol/lua na água
        f'<ellipse cx="{sx}" cy="{HORIZON + 260}" rx="{sr * 0.9}" ry="300" fill="{t["sun"][1]}" opacity="0.28" filter="url(#soft)"/>',
        f'<g transform="translate(0 {2 * HORIZON}) scale(1 -1)" opacity="0.22" filter="url(#soft)">{bridge(dict(t, lights=False))}</g>',
        fog(t, 5, DECK_Y + 140, 260, t["fog_opacity"][1]),
        bridge(t),
        fog(t, 21, HORIZON + 40, 300, t["fog_opacity"][0]),
    ]
    # Margem extra (PAD) dos dois lados: o desfoque é recortado fora da área visível.
    # Renderize com: rsvg-convert --page-width W --page-height H --left -PAD
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-PAD} 0 {W + 2 * PAD} {H}" width="{W + 2 * PAD}" height="{H}">'
           f'<defs>{"".join(defs)}</defs>{"".join(body)}</svg>')
    with open(f"wallpaper-{name}.svg", "w") as f:
        f.write(svg)


if __name__ == "__main__":
    for n in THEMES:
        render(n)
    print("wallpapers gerados")
