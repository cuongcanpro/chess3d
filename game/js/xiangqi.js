// Luật cờ tướng + AI đơn giản (negamax alpha-beta).
// Bàn cờ: B[r][c], r 0..9 (0 = hàng cuối của Đen, phía xa), c 0..8. Đỏ ở dưới (r = 9).

export const NAMES = { k: 'Tướng', a: 'Sĩ', b: 'Tượng', n: 'Mã', r: 'Xe', c: 'Pháo', p: 'Tốt' };
export const GLYPH = {
  r: { k: '帥', a: '仕', b: '相', n: '傌', r: '俥', c: '炮', p: '兵' },
  b: { k: '將', a: '士', b: '象', n: '馬', r: '車', c: '砲', p: '卒' },
};
export const VAL = { k: 6000, r: 900, c: 450, n: 400, b: 200, a: 200, p: 100 };

const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DX = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

export const opp = s => (s === 'r' ? 'b' : 'r');
const inB = (r, c) => r >= 0 && r < 10 && c >= 0 && c < 9;
const inPalace = (r, c, s) => c >= 3 && c <= 5 && (s === 'r' ? r >= 7 && r <= 9 : r >= 0 && r <= 2);

export function initialBoard() {
  const B = Array.from({ length: 10 }, () => Array(9).fill(null));
  const back = ['r', 'n', 'b', 'a', 'k', 'a', 'b', 'n', 'r'];
  let id = 0;
  const put = (r, c, t, s) => (B[r][c] = { t, s, id: id++ });
  back.forEach((t, c) => { put(0, c, t, 'b'); put(9, c, t, 'r'); });
  put(2, 1, 'c', 'b'); put(2, 7, 'c', 'b'); put(7, 1, 'c', 'r'); put(7, 7, 'c', 'r');
  for (let c = 0; c < 9; c += 2) { put(3, c, 'p', 'b'); put(6, c, 'p', 'r'); }
  return B;
}

export function pseudoMoves(B, r, c) {
  const p = B[r][c];
  if (!p) return [];
  const s = p.s, out = [];
  const add = (tr, tc) => {
    if (!inB(tr, tc)) return;
    const q = B[tr][tc];
    if (q && q.s === s) return;
    out.push([tr, tc]);
  };
  switch (p.t) {
    case 'k':
      for (const [dr, dc] of D4) if (inPalace(r + dr, c + dc, s)) add(r + dr, c + dc);
      break;
    case 'a':
      for (const [dr, dc] of DX) if (inPalace(r + dr, c + dc, s)) add(r + dr, c + dc);
      break;
    case 'b':
      for (const [dr, dc] of DX) {
        const tr = r + 2 * dr, tc = c + 2 * dc;
        if (!inB(tr, tc)) continue;
        if (s === 'r' ? tr < 5 : tr > 4) continue; // không qua sông
        if (B[r + dr][c + dc]) continue; // cản mắt tượng
        add(tr, tc);
      }
      break;
    case 'n':
      for (const [lr, lc] of D4) {
        if (!inB(r + lr, c + lc) || B[r + lr][c + lc]) continue; // cản chân mã
        if (lr !== 0) { add(r + 2 * lr, c + 1); add(r + 2 * lr, c - 1); }
        else { add(r + 1, c + 2 * lc); add(r - 1, c + 2 * lc); }
      }
      break;
    case 'r':
      for (const [dr, dc] of D4) {
        let tr = r + dr, tc = c + dc;
        while (inB(tr, tc)) {
          if (B[tr][tc]) { if (B[tr][tc].s !== s) out.push([tr, tc]); break; }
          out.push([tr, tc]); tr += dr; tc += dc;
        }
      }
      break;
    case 'c':
      for (const [dr, dc] of D4) {
        let tr = r + dr, tc = c + dc;
        while (inB(tr, tc) && !B[tr][tc]) { out.push([tr, tc]); tr += dr; tc += dc; }
        tr += dr; tc += dc; // nhảy qua ngòi
        while (inB(tr, tc)) {
          if (B[tr][tc]) { if (B[tr][tc].s !== s) out.push([tr, tc]); break; }
          tr += dr; tc += dc;
        }
      }
      break;
    case 'p': {
      const f = s === 'r' ? -1 : 1;
      add(r + f, c);
      const crossed = s === 'r' ? r <= 4 : r >= 5;
      if (crossed) { add(r, c - 1); add(r, c + 1); }
      break;
    }
  }
  return out;
}

export function findKing(B, s) {
  const r0 = s === 'r' ? 7 : 0;
  for (let r = r0; r < r0 + 3; r++) for (let c = 3; c <= 5; c++) {
    const p = B[r][c];
    if (p && p.t === 'k' && p.s === s) return [r, c];
  }
  return null;
}

export function inCheck(B, s) {
  const k = findKing(B, s), ok = findKing(B, opp(s));
  if (!k || !ok) return true;
  const [kr, kc] = k;
  // Lộ mặt tướng
  if (kc === ok[1]) {
    let blocked = false;
    for (let r = Math.min(kr, ok[0]) + 1; r < Math.max(kr, ok[0]); r++) if (B[r][kc]) { blocked = true; break; }
    if (!blocked) return true;
  }
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    const p = B[r][c];
    if (!p || p.s === s || p.t === 'k') continue;
    for (const [tr, tc] of pseudoMoves(B, r, c)) if (tr === kr && tc === kc) return true;
  }
  return false;
}

export function makeMove(B, m) {
  const [fr, fc, tr, tc] = m;
  const cap = B[tr][tc];
  B[tr][tc] = B[fr][fc]; B[fr][fc] = null;
  return cap;
}
export function unmakeMove(B, m, cap) {
  const [fr, fc, tr, tc] = m;
  B[fr][fc] = B[tr][tc]; B[tr][tc] = cap;
}

export function legalMoves(B, r, c) {
  const p = B[r][c];
  if (!p) return [];
  return pseudoMoves(B, r, c).filter(([tr, tc]) => {
    const m = [r, c, tr, tc];
    const cap = makeMove(B, m);
    const ok = !inCheck(B, p.s);
    unmakeMove(B, m, cap);
    return ok;
  });
}

export function allLegal(B, s) {
  const out = [];
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    const p = B[r][c];
    if (p && p.s === s) for (const [tr, tc] of legalMoves(B, r, c)) out.push([r, c, tr, tc]);
  }
  return out;
}

// ---------- Ký hiệu nước đi kiểu Việt Nam: "Pháo 2 bình 5", "Mã 8 tiến 7"
const fileOf = (s, c) => (s === 'r' ? 9 - c : c + 1);
export function notation(B, m) {
  const [fr, fc, tr, tc] = m;
  const p = B[fr][fc];
  const name = NAMES[p.t];
  const from = fileOf(p.s, fc);
  if (fr === tr) return `${name} ${from} bình ${fileOf(p.s, tc)}`;
  const forward = p.s === 'r' ? tr < fr : tr > fr;
  const verb = forward ? 'tiến' : 'thoái';
  const n = 'abn'.includes(p.t) ? fileOf(p.s, tc) : Math.abs(tr - fr);
  return `${name} ${from} ${verb} ${n}`;
}

// ---------- AI
function evaluate(B, side) {
  let s = 0;
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    const p = B[r][c];
    if (!p) continue;
    let v = VAL[p.t];
    if (p.t === 'p') {
      const crossed = p.s === 'r' ? r <= 4 : r >= 5;
      if (crossed) v += 80 - Math.abs(c - 4) * 8;
      v += (p.s === 'r' ? 9 - r : r) * 3;
    } else if (p.t === 'n' || p.t === 'c' || p.t === 'r') {
      v += (4 - Math.abs(c - 4)) * 4;
      if (p.t === 'n') v += (p.s === 'r' ? 9 - r : r) * 4;
    }
    s += p.s === side ? v : -v;
  }
  return s;
}

function ordered(B, moves) {
  return moves
    .map(m => ({ m, k: B[m[2]][m[3]] ? VAL[B[m[2]][m[3]].t] * 10 - VAL[B[m[0]][m[1]].t] : 0 }))
    .sort((a, b) => b.k - a.k)
    .map(o => o.m);
}

function search(B, side, depth, alpha, beta) {
  if (depth === 0) return evaluate(B, side);
  const moves = allLegal(B, side);
  if (!moves.length) return -100000 - depth; // bí / hết nước = thua
  for (const m of ordered(B, moves)) {
    const cap = makeMove(B, m);
    const sc = -search(B, opp(side), depth - 1, -beta, -alpha);
    unmakeMove(B, m, cap);
    if (sc > alpha) alpha = sc;
    if (alpha >= beta) break;
  }
  return alpha;
}

// n nước tốt nhất (alpha-beta theo ngưỡng của nước thứ n: nước kém hơn không cần điểm chính xác)
export function topMoves(B, side, n = 3, depth = 3) {
  const best = [];
  for (const m of ordered(B, allLegal(B, side))) {
    const kth = best.length >= n ? best[n - 1].score : -Infinity;
    const cap = makeMove(B, m);
    const sc = -search(B, opp(side), depth - 1, -Infinity, -kth);
    unmakeMove(B, m, cap);
    if (sc > kth) {
      best.push({ m, score: sc });
      best.sort((a, b) => b.score - a.score);
      if (best.length > n) best.length = n;
    }
  }
  return best;
}

export function isAttacked(B, r, c, s) {
  for (let i = 0; i < 10; i++) for (let j = 0; j < 9; j++) {
    const p = B[i][j];
    if (!p || p.s === s) continue;
    for (const [tr, tc] of pseudoMoves(B, i, j)) if (tr === r && tc === c) return true;
  }
  return false;
}

// Lý do "có lý" của một nước đi, để mấy ông quân sư nói cho tự nhiên
export function describe(B, m) {
  const [fr, fc, tr, tc] = m;
  const p = B[fr][fc], cap = B[tr][tc], o = opp(p.s);
  const hangingBefore = p.t !== 'p' && isAttacked(B, fr, fc, p.s);
  makeMove(B, m);
  const check = inCheck(B, o);
  const mate = check && allLegal(B, o).length === 0;
  const safeAfter = !isAttacked(B, tr, tc, p.s);
  let threat = null;
  for (const [ar, ac] of pseudoMoves(B, tr, tc)) {
    const q = B[ar][ac];
    if (q && q.s === o && VAL[q.t] > VAL[p.t] && q.t !== 'k' && (!threat || VAL[q.t] > VAL[threat])) threat = q.t;
  }
  unmakeMove(B, m, cap);
  const backRank = p.s === 'r' ? fr === 9 : fr === 0;
  if (mate) return { kind: 'mate' };
  if (cap && check) return { kind: 'capcheck', t: cap.t };
  if (cap) return { kind: 'cap', t: cap.t };
  if (check) return { kind: 'check' };
  if (hangingBefore && safeAfter) return { kind: 'escape', t: p.t };
  if (threat) return { kind: 'threat', t: threat };
  if (backRank && 'rnc'.includes(p.t)) return { kind: 'develop', t: p.t };
  if (p.t === 'p') return { kind: 'pawn' };
  return { kind: 'solid', t: p.t };
}

export function bestMove(B, side, depth = 3, noise = 12) {
  const moves = ordered(B, allLegal(B, side));
  let best = null, bestScore = -Infinity;
  for (const m of moves) {
    const cap = makeMove(B, m);
    const sc = -search(B, opp(side), depth - 1, -Infinity, -bestScore + noise) + Math.random() * noise;
    unmakeMove(B, m, cap);
    if (sc > bestScore) { bestScore = sc; best = m; }
  }
  return best;
}
