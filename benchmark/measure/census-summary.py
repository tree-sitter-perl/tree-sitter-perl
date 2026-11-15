#!/usr/bin/env python3
"""Summarise two census runs (see census.c) side by side.

    census-summary.py base.tsv new.tsv

Survival is the share of the original tree's named nodes still present after
the edit.  An edit is "bad" when under 90% survive.
"""
import sys
from collections import defaultdict


def load(path):
    return [line.rstrip("\n").split("\t") for line in open(path)]


def survival(row):
    return int(row[3]) / max(1, int(row[2]))


base, new = load(sys.argv[1]), load(sys.argv[2])
if [r[0::12] for r in base] != [r[0::12] for r in new]:
    sys.exit("the two runs did not make the same edits (different lists or K?)")

by = defaultdict(list)
for b, n in zip(base, new):
    by[b[0]].append((survival(b), survival(n)))
by["ALL"] = [p for rows in list(by.values()) for p in rows]

print(f"{'scenario':20s} {'edits':>6s} {'mean':>16s} {'bad':>12s} {'worse':>6s} {'better':>6s}")
for name, rows in by.items():
    n = len(rows)
    print(
        f"{name:20s} {n:6d} "
        f"{100 * sum(b for b, _ in rows) / n:6.2f}% -> {100 * sum(x for _, x in rows) / n:5.2f}% "
        f"{sum(b < 0.9 for b, _ in rows):5d} -> {sum(x < 0.9 for _, x in rows):<4d} "
        f"{sum(x < b for b, x in rows):6d} {sum(x > b for b, x in rows):6d}"
    )
