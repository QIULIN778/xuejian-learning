(function (global) {
  const DAY = 24 * 60 * 60 * 1000;
  const INTERVALS = [1, 3, 7, 14, 30, 60].map((days) => days * DAY);
  // Before the BL41–BL67 correction, these IDs were attached to different names.
  // Remap stored progress once so an old 仆参 mistake remains a 仆参 mistake.
  const oldBlIds = ['BL55','BL56','BL57','BL58','BL59','BL60','BL61','BL62','BL63','BL64','BL65','BL66','BL67','BL41','BL42','BL43','BL44','BL45','BL46','BL47','BL48','BL49','BL50','BL51','BL52','BL53','BL54'];
  const remapId = (id) => /^BL(4[1-9]|5\d|6[0-7])$/.test(id) ? oldBlIds[Number(id.slice(2)) - 41] : id;
  function normalize(progress) {
    const value = progress && typeof progress === 'object' ? progress : {};
    if (value.idSchema !== 'bl-name-aligned-v2') {
      if (Array.isArray(value.wrongIds)) value.wrongIds = [...new Set(value.wrongIds.map(remapId))];
      if (Array.isArray(value.seenIds)) value.seenIds = [...new Set(value.seenIds.map(remapId))];
      if (value.review && typeof value.review === 'object') value.review = Object.fromEntries(Object.entries(value.review).map(([id, item]) => [remapId(id), item]));
      value.idSchema = 'bl-name-aligned-v2';
    }
    value.total = Number(value.total) || 0;
    value.correct = Number(value.correct) || 0;
    value.wrongIds = Array.isArray(value.wrongIds) ? value.wrongIds : [];
    value.seenIds = Array.isArray(value.seenIds) ? value.seenIds : [];
    value.review = value.review && typeof value.review === 'object' ? value.review : {};
    for (const id of value.wrongIds) if (!value.review[id]) value.review[id] = { errors: 1, streak: 0, lastAnsweredAt: 0, dueAt: 0 };
    return value;
  }
  function record(progress, id, correct, now = Date.now()) {
    const data = normalize(progress), previous = data.review[id] || {};
    const errors = (Number(previous.errors) || 0) + (correct ? 0 : 1);
    const streak = correct ? Math.min(6, (Number(previous.streak) || 0) + 1) : 0;
    // Fixed review intervals are an application policy, not an exact Ebbinghaus formula.
    const interval = correct ? Math.max(60 * 60 * 1000, Math.round(INTERVALS[streak - 1] / (1 + errors * 0.5))) : 10 * 60 * 1000;
    data.review[id] = { errors, streak, lastAnsweredAt: now, dueAt: now + interval };
    data.total += 1;
    if (correct) data.correct += 1;
    if (!data.seenIds.includes(id)) data.seenIds.push(id);
    if (correct) data.wrongIds = data.wrongIds.filter((item) => item !== id);
    else if (!data.wrongIds.includes(id)) data.wrongIds.push(id);
    return data;
  }
  function due(record, now = Date.now()) { return Boolean(record && Number(record.dueAt) <= now); }
  function priority(progress, point, now = Date.now()) {
    const data = normalize(progress), item = data.review[point.id];
    if (!item) return 10;
    const errors = Number(item.errors) || 0;
    if (due(item, now)) return 1000 + errors * 100 + Math.min(100, Math.max(0, (now - item.dueAt) / DAY));
    if (data.wrongIds.includes(point.id)) return 100 + errors * 10;
    return Math.max(0, 5 - (Number(item.streak) || 0));
  }
  function select(progress, points, count = 10, now = Date.now(), random = Math.random) {
    const pool = points.map((point) => ({ point, score: priority(progress, point, now), tie: random() }));
    pool.sort((a, b) => b.score - a.score || a.tie - b.tie);
    return pool.slice(0, count).map((item) => item.point);
  }
  const api = { INTERVALS, remapId, normalize, record, due, priority, select };
  global.XuejianReviewScheduler = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
