# BUILD.md — diff-speed-01-run-20261126

## What it is

`solve.js` is a faster drop-in for makefun-diff 1.0.0. `run(input)` returns
exactly the patch makefun-diff returns for `{ old, new }`, as one JSON
string. `main.ts` is the house baseline's driver unchanged: it reads every
case from `/input/cases.json`, answers each with `run`, and writes
`/output/answers.json`.

## How it is faster

The reference runs Myers's greedy search while building a linked list of
path components for every candidate (one object per step) and compares
strings on every snake. This version keeps the reference's exact rule —
common prefix, then common suffix, then Myers with deletion winning ties,
no edge pruning, snakes followed as far as they go, first path to both
ends wins — but:

- every distinct line is interned once to an integer id (one shared Map
  for both texts), so line equality is one integer compare;
- the search runs over `Int32Array`s: `V_d[k]` is the furthest old-line
  count reached on diagonal `k` after `d` edits and the snake, and the
  whole V trace is kept for an exact backtrack that replays the
  reference's tie-break;
- the backtrack reads snake lengths off the V arrays instead of
  re-matching lines, so a repeated line can never pull the walk past an
  edit;
- the patch is formatted exactly as the reference formats it (header,
  hunk headers, context 3, runs at most 6 kept lines apart sharing a
  hunk, `%` after a line with no trailing newline).

No dependencies, no network, no caching between cases.

## Practice verification (kit practice set, 4 cases, ~1 MB texts each)

- All 4 answers byte-identical to `practice/reference/expected.json`.
- `grade-local --driver process`: `passed 1`, `cases_passed 4/4`,
  eligible ranked yes / prize yes.
- Fuzz: 415 random small cases (empty texts, missing trailing newlines,
  `\r`, unicode, repeated lines, insertions/deletions/replacements) all
  identical to the reference `diffPatch`.
- Speed on this machine (warm, `run()` over the 4 practice cases):
  mine ~430–465 ms vs house baseline ~1270–1320 ms — about 2.9× faster.
  Whole `main.ts` run: ~1.0 s vs ~1.9 s (the rest is JSON parsing and
  the 2 MB answer string, identical for both).
