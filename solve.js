// A faster drop-in for makefun-diff 1.0.0: run(input) returns exactly the
// patch makefun-diff returns for { old, new }, but computes it with far
// less work than the house baseline.
//
// The reference (vendor/makefun-diff/index.js in the kit) runs Myers's
// greedy search while building a linked list of path components for every
// candidate: one object per step, plus string comparisons on every snake.
// This version keeps the reference's exact rule — common prefix, then
// common suffix, then Myers with deletion winning ties, no edge pruning,
// snakes followed as far as they go, first path to both ends wins — but:
//   - every distinct line is interned once to an integer id (one shared
//     Map for both texts), so line equality is one integer compare;
//   - the search runs over Int32Arrays: V_d[k] is the furthest old-line
//     count reached on diagonal k after d edits and the snake, and the
//     whole V trace is kept for an exact backtrack that replays the
//     reference's tie-break (deletion iff the deletion candidate reaches
//     at least as far into the old text as the insertion candidate);
//   - the patch is formatted exactly as the reference formats it
//     (header, hunk headers, context 3, runs at most 6 kept lines apart
//     sharing a hunk, "%" after a line with no trailing newline).

/** The patch's first word. */
const FORMAT = 'makefun-diff/1';

/** The kept lines a hunk shows before and after each change run. */
const CONTEXT = 3;

/** The op of a kept, a deleted and an inserted line, as the patch writes them. */
const KEEP = '=';
const DELETE = '-';
const INSERT = '+';

/**
 * A text's lines, each with its "\n" (the last one without, when the text
 * does not end in one), and each line's interned id. The empty text has
 * no lines; "\n" has one, an empty line.
 */
function tokenize(text, intern) {
  const parts = text.split('\n');
  const last = parts.length - 1;
  const lines = [];
  const ids = new Int32Array(parts.length);
  let n = 0;
  for (let i = 0; i < last; i++) {
    const line = `${parts[i]}\n`;
    lines.push(line);
    let id = intern.get(line);
    if (id === undefined) {
      id = intern.size;
      intern.set(line, id);
    }
    ids[n++] = id;
  }
  if (parts[last] !== '') {
    const line = parts[last];
    lines.push(line);
    let id = intern.get(line);
    if (id === undefined) {
      id = intern.size;
      intern.set(line, id);
    }
    ids[n++] = id;
  }
  return { lines, ids: ids.subarray(0, n) };
}

/**
 * The runs of the edit script of oldIds into newIds: [{ kind, count }],
 * in order, by the reference's rule. Positions are counts of lines
 * consumed; diagonal k = x - y.
 */
function editRuns(a, b) {
  const N = a.length;
  const M = b.length;
  if (N === 0 && M === 0) return [];
  // trace[d] is V_d: index k + d holds the furthest x on diagonal k
  // after d edits and the snake (-1 where the diagonal was not reached).
  const trace = [];
  let v0 = new Int32Array(1);
  let x = 0;
  let y = 0;
  while (x < N && y < M && a[x] === b[y]) {
    x++;
    y++;
  }
  v0[0] = x;
  trace.push(v0);
  let D = -1;
  let kFinal = 0;
  if (x >= N && y >= M) {
    D = 0;
  } else {
    for (let d = 1; D < 0; d++) {
      const prev = trace[d - 1];
      const cur = new Int32Array(2 * d + 1);
      cur.fill(-1);
      // k = -d: only an insertion from prev[0] (diagonal -d + 1).
      {
        const insX = prev[0];
        if (insX >= 0 && insX + d - 1 < M) {
          let xx = insX;
          let yy = xx + d;
          const lim = N - xx < M - yy ? N - xx : M - yy;
          let t = 0;
          while (t < lim && a[xx + t] === b[yy + t]) t++;
          xx += t;
          yy += t;
          cur[0] = xx;
          if (xx >= N && yy >= M) {
            D = d;
            kFinal = -d;
          }
        }
      }
      // k = d: only a deletion from prev[2d - 2] (diagonal d - 1).
      if (D < 0) {
        const delX = prev[2 * d - 2];
        if (delX >= 0 && delX < N) {
          let xx = delX + 1;
          let yy = xx - d;
          const lim = N - xx < M - yy ? N - xx : M - yy;
          let t = 0;
          while (t < lim && a[xx + t] === b[yy + t]) t++;
          xx += t;
          yy += t;
          cur[2 * d] = xx;
          if (xx >= N && yy >= M) {
            D = d;
            kFinal = d;
          }
        }
      }
      // Interior diagonals: both predecessors exist, so no index checks.
      for (let k = -d + 2; k <= d - 2 && D < 0; k += 2) {
        const delX = prev[k + d - 2];
        const insX = prev[k + d];
        const canDel = delX >= 0 && delX < N;
        const canIns = insX >= 0 && insX - 1 - k < M;
        if (!canDel && !canIns) continue;
        const byDel = canDel ? delX : -2;
        const byIns = canIns ? insX - 1 : -2;
        let xx;
        if (byDel >= byIns) xx = delX + 1;
        else xx = insX;
        let yy = xx - k;
        const lim = N - xx < M - yy ? N - xx : M - yy;
        let t = 0;
        while (t < lim && a[xx + t] === b[yy + t]) t++;
        xx += t;
        yy += t;
        cur[k + d] = xx;
        if (xx >= N && yy >= M) {
          D = d;
          kFinal = k;
          break;
        }
      }
      trace.push(cur);
    }
  }
  // Backtrack from (N, M) on diagonal kFinal, replaying the forward
  // tie-break at each step. The snake between the post-edit point and
  // the current point is read off the V arrays, never re-matched, so a
  // repeated line can never pull the walk past an edit.
  const ops = []; // reversed: 0 keep, 1 delete, 2 insert
  let cx = N;
  let cy = M;
  let ck = kFinal;
  for (let d = D; d >= 1; d--) {
    const prev = trace[d - 1];
    const prevLen = prev.length;
    const delIdx = ck + d - 2;
    const insIdx = ck + d;
    const delX = delIdx >= 0 && delIdx < prevLen ? prev[delIdx] : -1;
    const insX = insIdx >= 0 && insIdx < prevLen ? prev[insIdx] : -1;
    const canDel = delX >= 0 && delX < N;
    const canIns = insX >= 0 && insX - 1 - ck < M;
    const byDel = canDel ? delX : -2;
    const byIns = canIns ? insX - 1 : -2;
    if (byDel >= byIns) {
      const keep = cx - (delX + 1);
      for (let t = 0; t < keep; t++) ops.push(0);
      ops.push(1);
      cx = delX;
      cy = delX - (ck - 1);
      ck = ck - 1;
    } else {
      const keep = cx - insX;
      for (let t = 0; t < keep; t++) ops.push(0);
      ops.push(2);
      cx = insX;
      cy = insX - (ck + 1);
      ck = ck + 1;
    }
  }
  for (let t = 0; t < cx; t++) ops.push(0);
  ops.reverse();
  const runs = [];
  for (const op of ops) {
    const kind = op === 0 ? KEEP : op === 1 ? DELETE : INSERT;
    const lastRun = runs.length > 0 ? runs[runs.length - 1] : undefined;
    if (lastRun !== undefined && lastRun.kind === kind) lastRun.count++;
    else runs.push({ kind, count: 1 });
  }
  return runs;
}

/** A line as the patch writes it: its op, the line, a newline, and "%" on a line of its own when it had none. */
function written(op, line) {
  return line.endsWith('\n') ? `${op}${line}` : `${op}${line}\n%\n`;
}

/** makefun-diff 1.0.0's answer for one case's input. */
export function run(input) {
  if (input === null || typeof input !== 'object' || typeof input.old !== 'string' || typeof input.new !== 'string') {
    throw new TypeError('makefun-diff: the input is { old, new }, two strings');
  }
  const intern = new Map();
  const A = tokenize(input.old, intern);
  const B = tokenize(input.new, intern);
  const a = A.lines;
  const b = B.lines;
  const ai = A.ids;
  const bi = B.ids;
  const n = a.length;
  const m = b.length;
  // The common prefix, then the common suffix of what is left.
  let prefix = 0;
  while (prefix < n && prefix < m && ai[prefix] === bi[prefix]) prefix++;
  let suffix = 0;
  while (suffix < n - prefix && suffix < m - prefix && ai[n - 1 - suffix] === bi[m - 1 - suffix]) suffix++;
  const runs = [];
  if (prefix > 0) runs.push({ kind: KEEP, count: prefix });
  runs.push(...editRuns(ai.subarray(prefix, n - suffix), bi.subarray(prefix, m - suffix)));
  if (suffix > 0) runs.push({ kind: KEEP, count: suffix });

  // The change runs: each a stretch of deletions and insertions between two kept lines, at old line o and new line p.
  const changes = [];
  let o = 0;
  let p = 0;
  let deleted = 0;
  let inserted = 0;
  for (const r of runs) {
    if (r.kind === KEEP) {
      o += r.count;
      p += r.count;
      continue;
    }
    let c = changes.length > 0 ? changes[changes.length - 1] : undefined;
    if (c === undefined || c.o + c.dels !== o || c.p + c.ins !== p) {
      c = { o, p, dels: 0, ins: 0 };
      changes.push(c);
    }
    if (r.kind === DELETE) {
      c.dels += r.count;
      o += r.count;
      deleted += r.count;
    } else {
      c.ins += r.count;
      p += r.count;
      inserted += r.count;
    }
  }

  // The hunks: change runs at most 2 * CONTEXT kept lines apart share one.
  const hunks = [];
  for (const c of changes) {
    const h = hunks.length > 0 ? hunks[hunks.length - 1] : undefined;
    const prev = h !== undefined ? h[h.length - 1] : undefined;
    if (prev !== undefined && c.o - (prev.o + prev.dels) <= 2 * CONTEXT) h.push(c);
    else hunks.push([c]);
  }
  const out = [`${FORMAT} old=${n} new=${m} hunks=${hunks.length} deleted=${deleted} inserted=${inserted}\n`];
  for (const h of hunks) {
    const first = h[0];
    const last = h[h.length - 1];
    const oldStart = Math.max(0, first.o - CONTEXT);
    const newStart = first.p - (first.o - oldStart);
    const after = Math.min(CONTEXT, n - (last.o + last.dels));
    const oldEnd = last.o + last.dels + after;
    const newEnd = last.p + last.ins + after;
    out.push(`@ ${oldStart + 1} ${oldEnd - oldStart} ${newStart + 1} ${newEnd - newStart}\n`);
    let at = oldStart;
    for (const c of h) {
      for (; at < c.o; at++) out.push(written(KEEP, a[at]));
      for (let i = 0; i < c.dels; i++) out.push(written(DELETE, a[c.o + i]));
      for (let i = 0; i < c.ins; i++) out.push(written(INSERT, b[c.p + i]));
      at = c.o + c.dels;
    }
    for (; at < oldEnd; at++) out.push(written(KEEP, a[at]));
  }
  return out.join('');
}
