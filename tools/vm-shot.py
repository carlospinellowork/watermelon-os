#!/usr/bin/env python3
"""Tira um print da tela da VM pelo monitor do QEMU e salva em PNG.

Uso: tools/vm-shot.py saida.png [socket do monitor]
"""
import os
import socket
import struct
import sys
import tempfile
import time
import zlib

out = sys.argv[1]
sock_path = sys.argv[2] if len(sys.argv) > 2 else ".vm/monitor.sock"

ppm = os.path.join(tempfile.mkdtemp(), "shot.ppm")
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
s.connect(sock_path)
s.settimeout(2)
try:
    s.recv(4096)  # banner do monitor
except socket.timeout:
    pass
s.sendall(f"screendump {ppm}\n".encode())
for _ in range(50):
    if os.path.exists(ppm) and os.path.getsize(ppm) > 0:
        time.sleep(0.3)
        break
    time.sleep(0.1)
s.close()

with open(ppm, "rb") as f:
    data = f.read()
# cabeçalho PPM: P6\n<w> <h>\n<max>\n
parts = data.split(b"\n", 3)
w, h = map(int, parts[1].split())
pix = parts[3]

raw = b"".join(b"\x00" + pix[y * w * 3:(y + 1) * w * 3] for y in range(h))


def chunk(tag, body):
    return struct.pack(">I", len(body)) + tag + body + struct.pack(">I", zlib.crc32(tag + body) & 0xFFFFFFFF)


png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) \
    + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b"")
with open(out, "wb") as f:
    f.write(png)
print(f"{out} ({w}x{h})")
