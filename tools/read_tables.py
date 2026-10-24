#!/usr/bin/env python3
"""Read the tables made by Excalidraw Table from .excalidraw.md files (no dependencies).

    python3 read_tables.py <file or folder> [...]          # print the tables
    python3 read_tables.py --json <file or folder> [...]   # JSON, one object per table

Each table gives: file, frame (name of the frame it sits in, if any), rows, cols, merges, cells.
cells[r][c] is the cell text (line breaks as <br>, images as ![[path]]); cells covered by a merge are null.
Works with both plain and compressed ("compressed-json") drawings.
"""
import json, os, re, sys


# ---------- LZString.decompressFromBase64 (Excalidraw's compressed drawings) ----------
# A port of lz-string's decompressFromBase64 (https://github.com/pieroxy/lz-string),
# Copyright (c) 2013 pieroxy, MIT License: see THIRD_PARTY_NOTICES.md.
_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="

def _lz_decompress_b64(s):
    if not s:
        return ""
    s = re.sub(r"\s", "", s)
    vals = [_B64.index(ch) for ch in s]
    length, reset, pos, idx = len(vals), 32, 32, 1
    val = vals[0]
    d = {0: 0, 1: 1, 2: 2}
    enlarge, dict_size, num_bits = 4, 4, 3
    out = []

    def bits(n):
        nonlocal val, pos, idx
        b, p, maxp = 0, 1, 2 ** n
        while p != maxp:
            r = val & pos
            pos >>= 1
            if pos == 0:
                pos = reset
                val = vals[idx] if idx < length else 0
                idx += 1
            b |= (1 if r > 0 else 0) * p
            p <<= 1
        return b

    c = bits(2)
    if c == 2:
        return ""
    c = chr(bits(8 if c == 0 else 16))
    d[3] = c
    w = c
    out.append(c)
    while True:
        if idx > length:
            return ""
        c = bits(num_bits)
        if c in (0, 1):
            d[dict_size] = chr(bits(8 if c == 0 else 16))
            dict_size += 1
            c = dict_size - 1
            enlarge -= 1
        elif c == 2:
            return "".join(out)
        if enlarge == 0:
            enlarge = 2 ** num_bits
            num_bits += 1
        if c in d:
            entry = d[c]
        elif c == dict_size:
            entry = w + w[0]
        else:
            return None
        out.append(entry)
        d[dict_size] = w + entry[0]
        dict_size += 1
        enlarge -= 1
        w = entry
        if enlarge == 0:
            enlarge = 2 ** num_bits
            num_bits += 1


def drawing(text):
    m = re.search(r"```json\n(.*?)\n```", text, re.S)
    if m:
        return json.loads(m.group(1))
    m = re.search(r"```compressed-json\n(.*?)\n```", text, re.S)
    if m:
        return json.loads(_lz_decompress_b64(m.group(1)))
    return None


def tables(path):
    with open(path, encoding="utf-8") as f:
        d = drawing(f.read())
    if not d:
        return []
    els = d.get("elements", [])
    frames = {e["id"]: e.get("name") for e in els if e.get("type") == "frame"}
    out = []
    for e in els:
        m = (e.get("customData") or {}).get("exTableModel")
        if not m or e.get("isDeleted"):
            continue
        out.append({"file": path, "frame": frames.get(e.get("frameId")), "rows": m["nR"], "cols": m["nC"],
                    "merges": m.get("merges", []), "cells": m.get("cells", [])})
    return out


def files(args):
    for a in args:
        if os.path.isdir(a):
            for root, _, names in os.walk(a):
                for n in names:
                    if n.endswith(".excalidraw.md") or n.endswith(".excalidraw"):
                        yield os.path.join(root, n)
        else:
            yield a


def main(argv):
    as_json = "--json" in argv
    args = [a for a in argv if a != "--json"]
    if not args:
        print(__doc__)
        return 1
    found = [t for p in files(args) for t in tables(p)]
    if as_json:
        print(json.dumps(found, ensure_ascii=False, indent=1))
        return 0
    for t in found:
        where = f" / frame: {t['frame']}" if t["frame"] else ""
        print(f"{t['file']}{where}  ({t['rows']} x {t['cols']}, merges: {t['merges']})")
        for row in t["cells"]:
            print("  | " + " | ".join("—" if c is None else c for c in row) + " |")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
