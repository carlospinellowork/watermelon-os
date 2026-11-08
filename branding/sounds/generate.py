#!/usr/bin/python3
"""Gera o tema de sons "watermelon" (sons do sistema, sintetizados do zero).

Timbre de marimba suave: seno com um pouco de harmônico e decaimento rápido.
Uso: branding/sounds/generate.py <pasta de saída>   (precisa do ffmpeg para .oga)
"""
import math
import os
import random
import struct
import subprocess
import sys
import tempfile
import wave

RATE = 48000


def note(freq):
    """Nome da nota -> frequência ('C6', 'E6'...)."""
    names = {"C": -9, "D": -7, "E": -5, "F": -4, "G": -2, "A": 0, "B": 2}
    semis = names[freq[0]] + (1 if "#" in freq else 0) + (int(freq[-1]) - 4) * 12
    return 440 * 2 ** (semis / 12)


def marimba(f, dur, vol=0.5, decay=9.0):
    out = []
    for i in range(int(RATE * dur)):
        t = i / RATE
        env = math.exp(-decay * t) * min(1, t * 400)          # ataque de 2,5 ms
        s = math.sin(2 * math.pi * f * t) + 0.25 * math.sin(2 * math.pi * f * 4 * t) * math.exp(-30 * t)
        out.append(vol * env * s)
    return out


def sweep(f0, f1, dur, vol=0.4):
    out, phase = [], 0.0
    for i in range(int(RATE * dur)):
        t = i / RATE
        f = f0 + (f1 - f0) * (t / dur)
        phase += 2 * math.pi * f / RATE
        env = math.sin(math.pi * t / dur) ** 2
        out.append(vol * env * math.sin(phase))
    return out


def click(dur=0.06, vol=0.5, seed=1):
    rnd = random.Random(seed)
    out, last = [], 0.0
    for i in range(int(RATE * dur)):
        t = i / RATE
        last = 0.6 * last + 0.4 * rnd.uniform(-1, 1)          # ruído suavizado
        out.append(vol * last * math.exp(-60 * t))
    return out


def seq(*parts, gap=0.0):
    """Toca sons em sequência, com sobreposição (gap negativo) ou pausa."""
    total = []
    offset = 0
    for p in parts:
        need = offset + len(p)
        if need > len(total):
            total += [0.0] * (need - len(total))
        for i, s in enumerate(p):
            total[offset + i] += s
        offset += len(p) + int(gap * RATE)
    return total


def mix_at(parts):
    """[(segundos, som)] somados."""
    total = []
    for at, p in parts:
        off = int(at * RATE)
        if off + len(p) > len(total):
            total += [0.0] * (off + len(p) - len(total))
        for i, s in enumerate(p):
            total[off + i] += s
    return total


SOUNDS = {
    # alerta genérico: "ding" de duas notas
    "bell": lambda: mix_at([(0, marimba(note("E6"), 0.5, 0.45)), (0.07, marimba(note("B6"), 0.5, 0.3))]),
    # concluído (build, Pomodoro, comando longo): "plim" subindo
    "complete": lambda: mix_at([(0, marimba(note("C6"), 0.4, 0.4)), (0.08, marimba(note("E6"), 0.4, 0.4)),
                                (0.16, marimba(note("G6"), 0.7, 0.45, 6))]),
    # mensagem: bolha
    "message-new-instant": lambda: sweep(500, 1300, 0.11, 0.45),
    "message": lambda: sweep(500, 1300, 0.11, 0.45),
    # aviso: duas notas descendo
    "dialog-warning": lambda: mix_at([(0, marimba(note("A5"), 0.4, 0.45)), (0.12, marimba(note("E5"), 0.6, 0.45))]),
    "dialog-error": lambda: mix_at([(0, marimba(note("E5"), 0.3, 0.5)), (0.1, marimba(note("C5"), 0.6, 0.5))]),
    # carregador: sobe / desce
    "power-plug": lambda: mix_at([(0, marimba(note("G5"), 0.3, 0.35)), (0.09, marimba(note("D6"), 0.5, 0.4))]),
    "power-unplug": lambda: mix_at([(0, marimba(note("D6"), 0.3, 0.35)), (0.09, marimba(note("G5"), 0.5, 0.4))]),
    # pendrive / dispositivo
    "device-added": lambda: mix_at([(0, marimba(note("C6"), 0.3, 0.35)), (0.07, marimba(note("G6"), 0.4, 0.35))]),
    "device-removed": lambda: mix_at([(0, marimba(note("G6"), 0.3, 0.35)), (0.07, marimba(note("C6"), 0.4, 0.35))]),
    # print: clique de câmera
    "screen-capture": lambda: mix_at([(0, click(0.05, 0.6, 1)), (0.07, click(0.06, 0.45, 2))]),
    "camera-shutter": lambda: mix_at([(0, click(0.05, 0.6, 1)), (0.07, click(0.06, 0.45, 2))]),
    # lixeira esvaziada
    "trash-empty": lambda: mix_at([(0, click(0.12, 0.35, 3)), (0.05, sweep(900, 300, 0.15, 0.25))]),
    # volume
    "audio-volume-change": lambda: marimba(note("A6"), 0.12, 0.3, 25),
}


def write_wav(path, samples):
    peak = max(1e-9, max(abs(s) for s in samples))
    gain = min(1.0, 0.9 / peak)
    with wave.open(path, "w") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<hh", int(s * gain * 32767), int(s * gain * 32767)) for s in samples))


def main():
    out = os.path.abspath(sys.argv[1])
    stereo = os.path.join(out, "stereo")
    os.makedirs(stereo, exist_ok=True)
    with open(os.path.join(out, "index.theme"), "w") as f:
        f.write("[Sound Theme]\nName=WatermelonOS\nComment=Sons do sistema do WatermelonOS\nInherits=freedesktop\nDirectories=stereo\n\n[stereo]\nOutputProfile=stereo\n")
    with tempfile.TemporaryDirectory() as tmp:
        for name, make in SOUNDS.items():
            wav = os.path.join(tmp, f"{name}.wav")
            write_wav(wav, make())
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", wav, "-c:a", "libvorbis", "-q:a", "5",
                            os.path.join(stereo, f"{name}.oga")], check=True)
    print("OK:", out)


if __name__ == "__main__":
    main()
