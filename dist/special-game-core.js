(function (global) {
  const ROLES = ['井', '荥', '输', '经', '合'];
  const TARGETS = ['五输穴', ...ROLES, '原穴', '络穴', '郄穴'];
  const SHORT = { LU: '肺经', LI: '大肠经', ST: '胃经', SP: '脾经', HT: '心经', SI: '小肠经', BL: '膀胱经', KI: '肾经', PC: '心包经', TE: '三焦经', GB: '胆经', LR: '肝经' };
  function shuffled(items, random = Math.random) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
    return copy;
  }
  function hasCategory(point, target) { return ROLES.includes(target) ? point.fiveShuRole === target : (point.specialCategories || []).includes(target); }
  function identity(point) {
    const names = [];
    if (point.fiveShuRole) names.push(`${point.fiveShuRole}穴`);
    for (const name of ['原穴', '络穴', '郄穴']) if ((point.specialCategories || []).includes(name)) names.push(name);
    return names.join('兼') || '未登记本次特定穴身份';
  }
  function gamePool(data) { return data.points.filter((p) => (p.specialCategories || []).some((c) => ['五输穴', '原穴', '络穴', '郄穴'].includes(c))); }
  function matchLines(board, target, width = 6) {
    const found = [], height = board.length / width;
    for (const vertical of [false, true]) for (let outer = 0; outer < (vertical ? width : height); outer += 1) {
      let run = [];
      function finish() { if (run.length >= 3 && new Set(run.map((i) => board[i].id)).size === run.length) found.push(run); run = []; }
      for (let inner = 0; inner < (vertical ? height : width); inner += 1) {
        const i = vertical ? inner * width + outer : outer * width + inner;
        if (board[i] && hasCategory(board[i], target)) run.push(i); else finish();
      }
      finish();
    }
    return found;
  }
  function swap(board, a, b) { const next = board.slice(); [next[a], next[b]] = [next[b], next[a]]; return next; }
  function adjacent(a, b, width = 6) { return Math.abs(a - b) === width || (Math.floor(a / width) === Math.floor(b / width) && Math.abs(a - b) === 1); }
  function validSwaps(board, target, width = 6) {
    const moves = [];
    for (let a = 0; a < board.length; a += 1) for (const b of [a + 1, a + width]) {
      if (b < board.length && adjacent(a, b, width) && matchLines(swap(board, a, b), target, width).some((line) => line.includes(a) || line.includes(b))) moves.push([a, b]);
    }
    return moves;
  }
  function makeMatchBoard(data, target, random = Math.random) {
    const pool = gamePool(data), yes = pool.filter((p) => hasCategory(p, target)), no = pool.filter((p) => !hasCategory(p, target));
    if (yes.length < 12 || no.length < 24) throw new Error(`三消题库不足：${target}`);
    for (let n = 0; n < 3000; n += 1) {
      const board = shuffled([...shuffled(yes, random).slice(0, 12), ...shuffled(no, random).slice(0, 24)], random);
      if (!matchLines(board, target).length && validSwaps(board, target).length) return board;
    }
    throw new Error(`无法生成三消棋盘：${target}`);
  }
  function reshuffleMatchBoard(board, target, random = Math.random) {
    for (let n = 0; n < 3000; n += 1) {
      const next = shuffled(board, random);
      if (!matchLines(next, target).length && validSwaps(next, target).length) return next;
    }
    throw new Error(`无法重排三消棋盘：${target}`);
  }
  function refillBoard(board, data, target, seen = [], random = Math.random) {
    const pool = gamePool(data), used = new Set(board.filter(Boolean).map((p) => p.id)), seenSet = new Set(seen), next = board.slice();
    let targetNeeded = Math.max(0, 12 - board.filter((p) => p && hasCategory(p, target)).length);
    for (let col = 0; col < 6; col += 1) {
      const kept = [];
      for (let row = 5; row >= 0; row -= 1) if (next[row * 6 + col]) kept.push(next[row * 6 + col]);
      for (let row = 5; row >= 0; row -= 1) {
        const i = row * 6 + col;
        if (5 - row < kept.length) next[i] = kept[5 - row];
        else {
          const eligible = pool.filter((p) => !used.has(p.id) && (targetNeeded > 0 ? hasCategory(p, target) : true)), unseen = eligible.filter((p) => !seenSet.has(p.id));
          const source = unseen.length ? unseen : eligible;
          const p = source[Math.floor(random() * source.length)];
          next[i] = p; used.add(p.id); if (hasCategory(p, target)) targetNeeded = Math.max(0, targetNeeded - 1);
        }
      }
    }
    return next;
  }
  function resolveMatch(board, a, b, target, data, seen = [], random = Math.random) {
    if (!adjacent(a, b)) return { valid: false, board };
    let next = swap(board, a, b), lines = matchLines(next, target).filter((line) => line.includes(a) || line.includes(b));
    if (!lines.length) return { valid: false, board };
    const cleared = []; let firstCount = 0, cascadeGroups = 0, round = 0;
    while (lines.length && round < 20) {
      const cells = [...new Set(lines.flat())];
      if (round === 0) firstCount = cells.length; else cascadeGroups += lines.length;
      cleared.push(...cells.map((i) => next[i]));
      for (const i of cells) next[i] = null;
      next = refillBoard(next, data, target, [...seen, ...cleared.map((p) => p.id)], random);
      lines = matchLines(next, target); round += 1;
    }
    if (!validSwaps(next, target).length) next = reshuffleMatchBoard(next, target, random);
    return { valid: true, board: next, cleared, firstCount, cascadeGroups };
  }
  function linkPairs(data, chapter, value, random = Math.random, preferredIds = []) {
    if (chapter === 'meridian') {
      const points = data.points.filter((p) => p.meridian === value);
      const shu = ROLES.map((role) => points.find((p) => p.fiveShuRole === role));
      if (shu.some((p) => !p)) throw new Error(`五输穴缺项：${value}`);
      const pairs = shu.map((p) => ({ point: p, label: p.fiveShuRole === '输' && hasCategory(p, '原穴') ? '输穴兼原穴' : `${p.fiveShuRole}穴` }));
      for (const category of ['原穴', '络穴', '郄穴']) {
        const p = points.find((item) => hasCategory(item, category));
        if (!p) throw new Error(`特定穴缺项：${value}/${category}`);
        if (category !== '原穴' || !pairs.some((pair) => pair.point.id === p.id)) pairs.push({ point: p, label: category });
      }
      return pairs.map(({ point, label }) => ({ id: point.id, point, label }));
    }
    if (chapter !== 'category' || !TARGETS.slice(1).includes(value)) throw new Error(`未知关卡：${chapter}/${value}`);
    const preferred = new Set(preferredIds);
    const meridians = shuffled(data.meridians, random).sort((a, b) => {
      const pa = data.points.find((p) => p.meridian === a && hasCategory(p, value));
      const pb = data.points.find((p) => p.meridian === b && hasCategory(p, value));
      return Number(preferred.has(pb?.id)) - Number(preferred.has(pa?.id));
    });
    return meridians.slice(0, 6).map((meridian) => {
      const point = data.points.find((p) => p.meridian === meridian && hasCategory(p, value));
      if (!point) throw new Error(`特定穴缺项：${meridian}/${value}`);
      const short = SHORT[point.id.match(/^[A-Z]+/)[0]];
      return { id: point.id, point, label: `${short}·${ROLES.includes(value) ? `${value}穴` : value}` };
    });
  }
  function pathBetween(board, a, b, width = 4) {
    const height = board.length / width;
    if (a === b || !board[a] || !board[b]) return null;
    const start = [Math.floor(a / width) + 1, a % width + 1], end = [Math.floor(b / width) + 1, b % width + 1];
    const queue = [{ y: start[0], x: start[1], dir: -1, bends: 0, path: [start] }], best = new Map();
    const dirs = [[-1, 0], [0, 1], [1, 0], [0, -1]];
    for (let head = 0; head < queue.length; head += 1) {
      const node = queue[head];
      if (node.y === end[0] && node.x === end[1]) return node.path;
      for (let dir = 0; dir < 4; dir += 1) {
        const y = node.y + dirs[dir][0], x = node.x + dirs[dir][1], bends = node.bends + (node.dir < 0 || node.dir === dir ? 0 : 1);
        if (y < 0 || y > height + 1 || x < 0 || x > width + 1 || bends > 2) continue;
        if (y >= 1 && y <= height && x >= 1 && x <= width && board[(y - 1) * width + x - 1] && !(y === end[0] && x === end[1])) continue;
        const key = `${y},${x},${dir}`;
        if ((best.get(key) ?? 3) <= bends) continue;
        best.set(key, bends);
        queue.push({ y, x, dir, bends, path: [...node.path, [y, x]] });
      }
    }
    return null;
  }
  function legalLinks(board) {
    const result = [];
    for (let a = 0; a < board.length; a += 1) for (let b = a + 1; b < board.length; b += 1) {
      if (!board[a] || !board[b] || board[a].id !== board[b].id || board[a].kind === board[b].kind) continue;
      const path = pathBetween(board, a, b); if (path) result.push({ a, b, path });
    }
    return result;
  }
  function solvableLinkBoard(board, memo = new Set()) {
    const key = board.map((t) => t ? `${t.id}:${t.kind}` : '.').join('|');
    if (memo.has(key)) return false;
    if (board.every((t) => !t)) return true;
    for (const link of legalLinks(board)) {
      const next = board.slice(); next[link.a] = null; next[link.b] = null;
      if (solvableLinkBoard(next, memo)) return true;
    }
    memo.add(key); return false;
  }
  function makeLinkBoard(pairs, random = Math.random, slots = pairs.length <= 6 ? 12 : 16, vacant = null) {
    const tiles = pairs.flatMap((pair) => [{ id: pair.id, kind: 'name', label: pair.point.name }, { id: pair.id, kind: 'identity', label: pair.label }]);
    const positions = vacant || Array.from({ length: slots }, (_, i) => i);
    for (let n = 0; n < 3000; n += 1) {
      const chosen = shuffled(positions, random), items = shuffled(tiles, random), board = Array(slots).fill(null);
      chosen.forEach((position, index) => { if (index < items.length) board[position] = items[index]; });
      if (solvableLinkBoard(board)) return board;
    }
    throw new Error('无法生成可解连连看棋盘');
  }
  function reshuffleLinkBoard(board, random = Math.random) {
    const ids = [...new Set(board.filter(Boolean).map((t) => t.id))];
    const pairs = ids.map((id) => ({ id, point: { name: board.find((t) => t.id === id && t.kind === 'name').label }, label: board.find((t) => t.id === id && t.kind === 'identity').label }));
    return makeLinkBoard(pairs, random, board.length, board.map((t, i) => t ? i : -1).filter((i) => i >= 0));
  }
  const api = { ROLES, TARGETS, shuffled, hasCategory, identity, gamePool, matchLines, adjacent, validSwaps, makeMatchBoard, reshuffleMatchBoard, resolveMatch, linkPairs, pathBetween, legalLinks, solvableLinkBoard, makeLinkBoard, reshuffleLinkBoard };
  global.XuejianSpecialGameCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
