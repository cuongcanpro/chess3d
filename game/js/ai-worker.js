// Chạy AI trong Web Worker để khung hình 3D không bị khựng khi máy tính nước.
import * as X from './xiangqi.js';

onmessage = e => {
  const { id, type, board, side, depth, n, noise } = e.data;
  if (type === 'best') {
    postMessage({ id, move: X.bestMove(board, side, depth, noise) });
  } else if (type === 'top') {
    const list = X.topMoves(board, side, n, depth).map(o => ({
      m: o.m,
      score: o.score,
      note: X.notation(board, o.m),
      why: X.describe(board, o.m),
    }));
    postMessage({ id, list });
  }
};
