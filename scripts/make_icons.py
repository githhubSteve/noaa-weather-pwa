"""Generates simple solid-color placeholder PNG icons (no Pillow dependency).
Swap these for real artwork later -- these just satisfy manifest.json / iOS
home-screen icon requirements so install works today.
"""
import struct
import zlib
import os

BG = (11, 18, 32)      # matches --bg
FG = (79, 163, 255)    # matches --accent


def make_png(path, size):
    # Simple design: background square with a smaller centered accent square
    # (a crude placeholder "sun/temperature" glyph).
    inset = size // 4
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            if inset <= x < size - inset and inset <= y < size - inset:
                r, g, b = FG
            else:
                r, g, b = BG
            row += bytes([r, g, b, 255])
        rows.append(bytes([0]) + bytes(row))  # filter type 0 per scanline
    raw = b"".join(rows)
    compressed = zlib.compress(raw, 9)

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(sig)
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", compressed))
        f.write(chunk(b"IEND", b""))


if __name__ == "__main__":
    out_dir = os.path.join(os.path.dirname(__file__), "..", "icons")
    os.makedirs(out_dir, exist_ok=True)
    make_png(os.path.join(out_dir, "icon-192.png"), 192)
    make_png(os.path.join(out_dir, "icon-512.png"), 512)
    print("wrote icons to", out_dir)
