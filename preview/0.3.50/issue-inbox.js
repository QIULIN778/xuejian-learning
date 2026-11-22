(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.XuejianIssueInbox = api;
})(typeof window !== 'undefined' ? window : null, function () {
  const FORMATS = new Set(['xuejian-issue-reports-v1', 'xuejian-mini-issue-reports-v1']);
  const STATUSES = new Set(['pending', 'in_review', 'resolved']);

  function asText(value, max) { return String(value == null ? '' : value).trim().slice(0, max); }

  function parseExport(jsonText, points) {
    if (typeof jsonText !== 'string' || jsonText.length > 1024 * 1024) throw new Error('文件过大或格式错误（最多 1 MB）。');
    let payload;
    try { payload = JSON.parse(jsonText); } catch (_) { throw new Error('文件不是有效的 JSON。'); }
    if (!payload || !FORMATS.has(payload.format) || !Array.isArray(payload.reports) || payload.reports.length > 200) {
      throw new Error('反馈格式不受支持，或单次超过 200 条。');
    }
    const catalog = new Map(points.map((point) => [point.id, point]));
    return payload.reports.map((item, index) => {
      const point = catalog.get(item?.pointId);
      const id = asText(item?.id, 100);
      const description = asText(item?.description, 1000);
      const imagePath = asText(item?.imagePath, 500);
      const createdAt = asText(item?.createdAt, 40);
      if (!point || !id || !description || !createdAt || Number.isNaN(Date.parse(createdAt)) || imagePath !== point.imagePath) {
        throw new Error(`第 ${index + 1} 条的穴位、正式图片路径或必填字段无法核对。`);
      }
      const device = item.device && typeof item.device === 'object' ? item.device : {};
      return {
        id, pointId: point.id, pointName: point.name, meridian: point.meridian,
        imagePath: point.imagePath, issueType: asText(item.issueType, 60), description,
        answerId: point.id, selectedOptionId: asText(item.selectedOptionId, 30),
        releaseVersion: asText(item.releaseVersion, 30), datasetVersion: asText(item.datasetVersion, 80),
        createdAt, module: asText(item.module, 30), sourceFormat: payload.format,
        deviceLabel: asText([device.brand, device.model, device.system, device.platform, device.network].filter(Boolean).join(' / ') || device.userAgent, 180)
      };
    });
  }

  function sameReport(a, b) {
    return ['pointId', 'imagePath', 'issueType', 'description', 'createdAt', 'sourceFormat'].every((field) => a[field] === b[field]);
  }

  function merge(existing, incoming, now = new Date().toISOString()) {
    const result = Array.isArray(existing) ? existing.slice() : [];
    const byId = new Map(result.map((item) => [item.id, item]));
    let added = 0, duplicates = 0;
    for (const item of incoming) {
      const prior = byId.get(item.id);
      if (prior) {
        if (!sameReport(prior, item)) throw new Error(`反馈 ID ${item.id} 与已有记录冲突；本次未导入。`);
        duplicates += 1;
        continue;
      }
      const entry = { ...item, intakeStatus: 'pending', importedAt: now };
      result.push(entry);
      byId.set(item.id, entry);
      added += 1;
    }
    return { records: result, added, duplicates };
  }

  function changeStatus(records, id, status) {
    if (!STATUSES.has(status)) throw new Error('无效处理状态');
    let found = false;
    const next = records.map((item) => {
      if (item.id !== id) return item;
      found = true;
      return { ...item, intakeStatus: status };
    });
    if (!found) throw new Error('反馈记录不存在');
    return next;
  }

  function serializeWorklist(records, exportedAt = new Date().toISOString()) {
    if (!Array.isArray(records)) throw new Error('处理清单格式错误');
    return JSON.stringify({
      format: 'xuejian-teacher-issue-worklist-v1',
      exportedAt,
      storage: 'local_only',
      records: records.map((item) => ({
        id: item.id, pointId: item.pointId, pointName: item.pointName,
        meridian: item.meridian, imagePath: item.imagePath,
        issueType: item.issueType, description: item.description,
        answerId: item.answerId, selectedOptionId: item.selectedOptionId,
        releaseVersion: item.releaseVersion, datasetVersion: item.datasetVersion,
        createdAt: item.createdAt, importedAt: item.importedAt,
        module: item.module, sourceFormat: item.sourceFormat,
        deviceLabel: item.deviceLabel, intakeStatus: item.intakeStatus
      }))
    }, null, 2);
  }

  return { parseExport, merge, changeStatus, serializeWorklist, FORMATS: [...FORMATS], STATUSES: [...STATUSES] };
});
