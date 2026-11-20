"""Silly cartoon-babble voices for every dialogue line (local Kokoro, no network, no account).

Usage (from E:\\Tikshuv Games\\packet-run):  python tools/make_voices.py [lineId ...]
The game's text is Hebrew and Kokoro only speaks English, so each line becomes nonsense syllables whose rhythm
follows the real line: one phrase per sentence, the same ending punctuation, a length that follows the text.
Each character has its own Kokoro voice, speed, pitch shift and syllable flavour. Output: public/assets/voice/<id>.mp3
plus public/assets/voice/index.json ({"ids": [...]}), which the game reads. Cached by hash: unchanged lines are skipped.
"""
import hashlib, json, os, random, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LINES = ROOT / "content" / "he" / "lines.json"
OUT = ROOT / "public" / "assets" / "voice"
RAW = ROOT / "tmp" / "voice_raw"
STP = Path(r"E:\Tikshuv Games\stp-film")  # has the Kokoro venv and `npx hyperframes tts`
SR = 24000

# who -> Kokoro voice, speed, pitch factor (1.0 = none), tremolo (0 = none), syllables
VOICES = {
    "dina":     dict(v="af_bella",   s=1.10, pitch=1.00, trem=0.0, syl="la ba da ma na lee doo ba la mi ra".split()),
    "gee":      dict(v="am_michael", s=1.25, pitch=1.28, trem=0.0, syl="bee bop boo zip beep bap zoop dee bip".split()),
    "uri":      dict(v="bm_george",  s=0.95, pitch=0.90, trem=0.0, syl="bum dun gah rom bo mah dor gum".split()),
    "talia":    dict(v="af_sky",     s=1.20, pitch=1.10, trem=0.0, syl="tee lee pi ki sa ni tu ri fi".split()),
    "barak":    dict(v="am_adam",    s=0.85, pitch=0.78, trem=0.0, syl="bro dom gro mo zon ba rum tok".split()),
    "noise":    dict(v="af_nova",    s=1.50, pitch=1.45, trem=9.0, syl="zzt kra bzz pop fzt krr zap".split()),
    "narrator": dict(v="bf_emma",    s=0.98, pitch=0.96, trem=0.0, syl="ha lo ve ma ren so tel ban".split()),
}
DEFAULT = VOICES["narrator"]


def phrases(text: str, voice: dict, rng: random.Random) -> str:
    """Nonsense phrase per sentence; the sentence's own punctuation is kept for the intonation."""
    parts = re.findall(r"[^.!?…]+[.!?…]*", text.replace("{name}", "friend"))
    out = []
    for p in parts:
        words = len(re.findall(r"\S+", p))
        if not words:
            continue
        end = re.search(r"[.!?…]+\s*$", p)
        end = (end.group(0).strip()[-1] if end else ".")
        n = max(2, min(12, round(words * 1.15)))
        sy = [rng.choice(voice["syl"]) for _ in range(n)]
        # little "words" of 1 to 3 syllables with commas now and then, so it sounds like chatter
        ws, i = [], 0
        while i < len(sy):
            k = rng.choice([1, 2, 2, 3])
            ws.append("".join(sy[i:i + k]))
            i += k
        s = " ".join(ws)
        if len(ws) > 4:
            c = len(ws) // 2
            s = " ".join(ws[:c]) + ", " + " ".join(ws[c:])
        out.append(s + end)
    return " ".join(out)


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kw)


def main() -> int:
    lines = json.loads(LINES.read_text(encoding="utf-8"))
    want = sys.argv[1:] or list(lines)
    OUT.mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)
    cache_f = RAW / "cache.json"
    cache = json.loads(cache_f.read_text()) if cache_f.exists() else {}
    env = dict(os.environ, HYPERFRAMES_PYTHON=str(STP / ".venv" / "Scripts" / "python.exe"))
    for lid in want:
        l = lines[lid]
        voice = VOICES.get(l["who"], DEFAULT)
        rng = random.Random(hashlib.md5(lid.encode()).hexdigest())
        babble = phrases(l["text"], voice, rng)
        key = hashlib.md5(json.dumps([voice["v"], voice["s"], voice["pitch"], voice["trem"], babble]).encode()).hexdigest()
        mp3 = OUT / f"{lid}.mp3"
        if cache.get(lid) == key and mp3.exists():
            continue
        raw = RAW / f"{lid}.wav"
        run(["npx", "hyperframes", "tts", babble, "-v", voice["v"], "-s", str(voice["s"]), "-o", str(raw), "--json"],
            cwd=str(STP), env=env, shell=True)
        f = voice["pitch"]
        af = [f"asetrate={int(SR * f)}", f"aresample={SR}"]
        if abs(f - 1) > 0.01:
            af.append(f"atempo={1 / f:.4f}" if 0.5 <= 1 / f <= 2 else "atempo=1")
        if voice["trem"]:
            af.append(f"tremolo=f={voice['trem']}:d=0.5")
        af += ["highpass=f=80", "loudnorm=I=-18:TP=-2:LRA=7", "silenceremove=start_periods=1:start_threshold=-50dB"]
        run(["ffmpeg", "-y", "-i", str(raw), "-af", ",".join(af), "-ac", "1", "-ar", "22050", "-b:a", "48k", str(mp3)])
        cache[lid] = key
        cache_f.write_text(json.dumps(cache))
        print("ok", lid, l["who"], babble[:48])
    ids = sorted(p.stem for p in OUT.glob("*.mp3"))
    (OUT / "index.json").write_text(json.dumps({"ids": ids}), encoding="utf-8")
    print("voices:", len(ids))
    return 0


if __name__ == "__main__":
    sys.exit(main())
