(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.XuejianStudyPlan = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const SIZE = 5;
  function dayKey(now = new Date()) {
    const date = now instanceof Date ? now : new Date(now);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function normalize(record, points, progress, now = new Date()) {
    const pool = Array.isArray(points) ? points.filter((point) => point && point.id) : [];
    const available = new Set(pool.map((point) => point.id));
    const today = dayKey(now);
    if (record && record.day === today && Array.isArray(record.ids) && record.ids.length && record.ids.every((id) => available.has(id))) {
      const ids = [...new Set(record.ids)].slice(0, SIZE);
      return { day: today, ids, completed: [...new Set(Array.isArray(record.completed) ? record.completed : [])].filter((id) => ids.includes(id)) };
    }
    const wrong = new Set(Array.isArray(progress?.wrongIds) ? progress.wrongIds : []);
    const seen = new Set(Array.isArray(progress?.seenIds) ? progress.seenIds : []);
    const review = progress?.review || {};
    const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
    const dailyRank = (id) => {
      let value = 2166136261;
      for (const char of `${today}:${id}`) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
      return value >>> 0;
    };
    const ordered = [...pool].sort((a, b) => {
      const score = (point) => {
        const item = review[point.id] || {};
        if (wrong.has(point.id)) return -300 - Math.min(99, Number(item.errors) || 0);
        if (seen.has(point.id) && Number(item.dueAt) <= nowMs) return -200;
        if (!seen.has(point.id)) return -100;
        return 0;
      };
      return score(a) - score(b) || dailyRank(a.id) - dailyRank(b.id) || a.id.localeCompare(b.id);
    });
    return { day: today, ids: ordered.slice(0, SIZE).map((point) => point.id), completed: [] };
  }
  function markCorrect(record, pointId) {
    if (!record?.ids?.includes(pointId)) return record;
    return { ...record, completed: [...new Set([...(record.completed || []), pointId])] };
  }
  function remaining(record) {
    return (record?.ids || []).filter((id) => !(record?.completed || []).includes(id));
  }
  return { SIZE, dayKey, normalize, markCorrect, remaining };
});
