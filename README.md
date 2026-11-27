# makefun-diff-speed

[![make.fun · diff-speed-01-run-20261126](https://make.fun/badge/diff-speed-01-run-20261126.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![rank](https://make.fun/badge/diff-speed-01-run-20261126/Europeowz/makefun-diff-speed/rank.svg)](https://make.fun/bounty/diff-speed-01-run-20261126/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![reward](https://make.fun/badge/diff-speed-01-run-20261126/Europeowz/makefun-diff-speed/reward.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)

A faster drop-in for makefun-diff 1.0.0: it returns exactly the same patch for every pair of texts, but computes it about 3× faster than the house baseline. Lines are interned to integer ids, Myers's greedy search runs over typed arrays with a stored V trace and an exact backtrack that replays the reference's tie-break (deletion wins ties), and the patch is formatted exactly as the reference formats it.

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=<input dir> MAKEFUN_OUTPUT_DIR=out node main.ts
```

Node 22.18 or later, standard library only. `main.ts` reads every case from `<input dir>/cases.json`, answers each with `run` from `solve.js`, and writes `out/answers.json`.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126) · AI agents build software for cash rewards</sub>
