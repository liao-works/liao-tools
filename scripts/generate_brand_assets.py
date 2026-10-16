#!/usr/bin/env python3
"""Rebuild all Liao Tools app icons from the single vector master.

Usage:
    python -m pip install Pillow CairoSVG
    python scripts/generate_brand_assets.py
"""
from __future__ import annotations

from io import BytesIO
from pathlib import Path
import xml.etree.ElementTree as ET

import cairosvg
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "app-icon.svg"
DESKTOP = ROOT / "src-tauri" / "icons"
WEB = ROOT / "public"
FRONTEND = ROOT / "src" / "assets"


def save_png(image: Image.Image, path: Path, width: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.resize((width, width), Image.Resampling.LANCZOS).save(path, "PNG", optimize=True)
    print(f"{path.relative_to(ROOT)}: {width}x{width}")


def generate() -> None:
    ET.parse(SOURCE)  # Reject malformed SVG before touching existing resources.
    # Oversample the vector for smoother 16–64px icons and truly crisp 1024px.
    png = cairosvg.svg2png(url=str(SOURCE), output_width=2048, output_height=2048)
    image = Image.open(BytesIO(png)).convert("RGBA")

    for path, size in {
        DESKTOP / "icon.png": 1024,
        DESKTOP / "icon-1024.png": 1024,
        DESKTOP / "32x32.png": 32,
        DESKTOP / "128x128.png": 128,
        DESKTOP / "128x128@2x.png": 256,
        WEB / "logo.png": 256,
        FRONTEND / "logo.png": 1024,
        FRONTEND / "logo-64.png": 64,
        FRONTEND / "logo-128.png": 128,
    }.items():
        save_png(image, path, size)

    # These icon names are expected by the macOS iconset and Windows MSI tiles.
    for size in (16, 32, 64, 128, 256, 512, 1024):
        name = f"icon_{size}x{size}.png"
        save_png(image, DESKTOP / "icon.iconset" / name, size)
    for size in (16, 32, 128, 256, 512):
        name = f"icon_{size}x{size}@2x.png"
        save_png(image, DESKTOP / "icon.iconset" / name, size * 2)
    for size in (30, 44, 71, 89, 107, 142, 150, 284, 310):
        save_png(image, DESKTOP / f"Square{size}x{size}Logo.png", size)
    save_png(image, DESKTOP / "StoreLogo.png", 50)

    # Pillow stores separate raster resolutions in the ICO instead of a tiny placeholder.
    master = image.resize((1024, 1024), Image.Resampling.LANCZOS)
    master.save(
        DESKTOP / "icon.ico", "ICO",
        sizes=[(n, n) for n in (16, 24, 32, 48, 64, 128, 256)],
    )
    master.save(DESKTOP / "icon.icns", "ICNS")
    with Image.open(DESKTOP / "icon.ico") as ico:
        needed = {(16, 16), (32, 32), (48, 48), (256, 256)}
        if not needed.issubset(ico.info.get("sizes", set())):
            raise RuntimeError("Windows ICO is missing expected image sizes")
    with Image.open(DESKTOP / "icon.icns") as icns:
        if icns.size[0] < 1024:
            raise RuntimeError("macOS ICNS does not contain a 1024px image")
    print("Done: vector master, web logos, Windows ICO, macOS ICNS and tiles")


if __name__ == "__main__":
    generate()
