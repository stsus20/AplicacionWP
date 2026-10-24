#!/usr/bin/env python3
"""Genera los iconos PNG de la PWA a partir de un diseño vectorial simple.

Requiere Pillow. Uso:
    python tools/generate-icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"
OUT.mkdir(exist_ok=True)

INK = (27, 23, 64, 255)
VIOLET = (108, 77, 255, 255)
INDIGO = (42, 31, 107, 255)
SUN = (255, 197, 61, 255)
WHITE = (255, 255, 255, 255)
SS = 4  # supersampling


def gradient(size: int) -> Image.Image:
    """Degradado diagonal violeta -> índigo."""
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x / size + y / size) / 2
            px[x, y] = (
                round(VIOLET[0] + (INDIGO[0] - VIOLET[0]) * t),
                round(VIOLET[1] + (INDIGO[1] - VIOLET[1]) * t),
                round(VIOLET[2] + (INDIGO[2] - VIOLET[2]) * t),
            )
    return img


def draw_mark(img: Image.Image, scale: float = 1.0) -> None:
    """Dibuja el triángulo de alerta con signo de exclamación."""
    s = img.width
    d = ImageDraw.Draw(img)
    cx, cy = s / 2, s / 2

    def p(x: float, y: float):
        return (cx + (x - 0.5) * s * scale, cy + (y - 0.5) * s * scale)

    apex, left, right = p(0.5, 0.20), p(0.18, 0.80), p(0.82, 0.80)
    width = int(s * 0.045 * scale)
    poly = [apex, right, left]
    # Relleno + contorno con vértices redondeados (se vuelve a rellenar el
    # polígono para dejar solo la mitad exterior del trazo).
    d.polygon(poly, fill=SUN)
    d.line(poly + [apex], fill=INK, width=width, joint="curve")
    for vx, vy in poly:
        d.ellipse([vx - width / 2, vy - width / 2, vx + width / 2, vy + width / 2], fill=INK)
    d.polygon(poly, fill=SUN)
    # Exclamación
    bar_w = int(s * 0.075 * scale)
    bar = [p(0.5, 0.40), p(0.5, 0.62)]
    d.line(bar, fill=INK, width=bar_w)
    for vx, vy in bar:
        d.ellipse([vx - bar_w / 2, vy - bar_w / 2, vx + bar_w / 2, vy + bar_w / 2], fill=INK)
    r = bar_w / 2
    dot = p(0.5, 0.71)
    d.ellipse([dot[0] - r, dot[1] - r, dot[0] + r, dot[1] + r], fill=INK)


def rounded_icon(size: int, radius_ratio: float = 0.22) -> Image.Image:
    ss = size * SS
    base = gradient(ss).convert("RGBA")
    mask = Image.new("L", (ss, ss), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, ss - 1, ss - 1], radius=int(ss * radius_ratio), fill=255
    )
    base.putalpha(mask)
    draw_mark(base, scale=0.92)
    return base.resize((size, size), Image.LANCZOS)


def maskable_icon(size: int) -> Image.Image:
    ss = size * SS
    base = gradient(ss).convert("RGBA")
    # Zona segura: el triángulo ocupa ~72% del lienzo.
    draw_mark(base, scale=0.74)
    return base.resize((size, size), Image.LANCZOS)


def badge(size: int = 72) -> Image.Image:
    ss = size * SS
    img = Image.new("RGBA", (ss, ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = ss / 2, ss / 2
    scale = 0.92

    def p(x: float, y: float):
        return (cx + (x - 0.5) * ss * scale, cy + (y - 0.5) * ss * scale)

    d.polygon([p(0.5, 0.18), p(0.14, 0.84), p(0.86, 0.84)], fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    icons = {
        "icon-192.png": rounded_icon(192),
        "icon-512.png": rounded_icon(512),
        "apple-touch-icon.png": rounded_icon(180, radius_ratio=0.0),
        "icon-maskable-512.png": maskable_icon(512),
        "badge-72.png": badge(72),
    }
    for name, img in icons.items():
        path = OUT / name
        img.save(path, "PNG", optimize=True)
        print(f"OK {path.relative_to(ROOT)} ({img.width}x{img.height})")


if __name__ == "__main__":
    main()
