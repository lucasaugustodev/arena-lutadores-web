"""Remove white/near-white background from generated character sprites.

Uses flood-fill from corners to identify outer white area and make it transparent,
preserving white inside the character (eyes, teeth, highlights).
"""
import os
import sys
from pathlib import Path
from PIL import Image, ImageFilter
from collections import deque

CHAR_ROOT = Path(__file__).resolve().parent.parent / "public" / "assets" / "characters"
TOLERANCE = 28           # how far from white still counts as "background"
ALPHA_FEATHER = 2        # blur edge by this many px for soft edge

def is_bg(rgb, ref=(255, 255, 255), tol=TOLERANCE):
    return all(abs(c - r) <= tol for c, r in zip(rgb, ref))

def remove_bg(path: Path):
    img = Image.open(path).convert("RGBA")
    px = img.load()
    w, h = img.size

    # Flood fill from all 4 corners, marking pure-bg pixels
    visited = [[False] * h for _ in range(w)]
    queue = deque()
    for sx, sy in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if is_bg(px[sx, sy][:3]):
            queue.append((sx, sy))

    while queue:
        x, y = queue.popleft()
        if x < 0 or x >= w or y < 0 or y >= h or visited[x][y]:
            continue
        if not is_bg(px[x, y][:3]):
            continue
        visited[x][y] = True
        # Set alpha 0
        r, g, b, _ = px[x, y]
        px[x, y] = (r, g, b, 0)
        queue.append((x + 1, y))
        queue.append((x - 1, y))
        queue.append((x, y + 1))
        queue.append((x, y - 1))

    # Soften edges via gaussian blur on alpha channel only
    if ALPHA_FEATHER > 0:
        r, g, b, a = img.split()
        a = a.filter(ImageFilter.GaussianBlur(ALPHA_FEATHER))
        img = Image.merge("RGBA", (r, g, b, a))

    img.save(path)
    print(f"  OK {path.name}")

def main():
    for char_dir in sorted(CHAR_ROOT.iterdir()):
        if not char_dir.is_dir():
            continue
        print(f"=== {char_dir.name} ===")
        for png in sorted(char_dir.glob("*.png")):
            remove_bg(png)

    arena = CHAR_ROOT.parent / "arena.png"
    # Don't process arena (we want it opaque)

if __name__ == "__main__":
    main()
