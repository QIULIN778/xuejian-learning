(function (global) {
  function shuffled(items, random = Math.random) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [copy[index], copy[other]] = [copy[other], copy[index]];
    }
    return copy;
  }

  function roundPoints(points, scope = 'all', count = 6, random = Math.random) {
    let pool = points.filter((point) => point.id && point.name && String(point.locationText || '').trim());
    if (scope.startsWith('meridian:')) pool = pool.filter((point) => point.meridian === scope.slice(9));
    if (scope.startsWith('category:')) pool = pool.filter((point) => (point.specialCategories || []).includes(scope.slice(9)));
    const byLocation = new Map();
    for (const point of shuffled(pool, random)) {
      const location = point.locationText.trim();
      if (!byLocation.has(location)) byLocation.set(location, point);
    }
    return shuffled([...byLocation.values()], random).slice(0, count);
  }

  function memoryDeck(points, random = Math.random) {
    return shuffled(points.flatMap((point) => [
      { key: `${point.id}:name`, pointId: point.id, kind: 'name', label: point.name },
      { key: `${point.id}:location`, pointId: point.id, kind: 'location', label: point.locationText },
    ]), random);
  }

  function isPair(first, second) {
    return Boolean(first && second && first.key !== second.key && first.pointId === second.pointId && first.kind !== second.kind);
  }

  const api = { shuffled, roundPoints, memoryDeck, isPair };
  global.XuejianGameCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
