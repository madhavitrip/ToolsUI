import React, { useMemo, useState, useEffect } from 'react';
import {
  Input,
  Select,
  Tag,
  message,
  Button,
  Tooltip,
  Modal,
  Checkbox,
  Pagination,
} from 'antd';
import axios from 'axios';
import { Search, Download, FileText, ChevronDown, ChevronRight, Archive, ArchiveRestore } from 'lucide-react';
import { useUserMap, getFirstNameFromUserId, getCurrentUserId } from '../../hooks/useUserMap';
import useStore from '../../stores/ProjectData';

// ─── helpers ────────────────────────────────────────────────────────────────

const formatDateTimeToIST = (dateVal) => {
  if (!dateVal) return '-';
  try {
    let s = String(dateVal);
    if (s.includes(' ') && !s.includes('T')) s = s.replace(' ', 'T');
    const d = new Date(s);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('en-IN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
    });
  } catch { return '-'; }
};

const parseEnvLotNumbers = (v) => {
  if (Array.isArray(v)) return v;
  if (!v || v === '0' || v === 0) return [];
  if (typeof v === 'number') return v > 0 ? [v] : [];
  if (typeof v !== 'string') return [];
  return v.split(',').map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n) && n > 0);
};

const extractLotFromFilename = (name) => {
  if (!name || typeof name !== 'string') return null;

  // 1) Pattern: _1_v1, _2_v1, BoxBreaking_1_v1.xlsx
  const m1 = name.match(/_(\d+)_v\d+/i);
  if (m1) return parseInt(m1[1], 10);

  // 2) Pattern: _lot1_, _lot-1_
  const m2 = name.match(/_lot[_-]?(\d+)/i);
  if (m2) return parseInt(m2[1], 10);

  // 3) Pattern: _1.xlsx, _2.xls
  const m3 = name.match(/_(\d+)\.[^.]+$/);
  if (m3) return parseInt(m3[1], 10);

  // 4) Fallback pattern for any underscore followed by number
  const m4 = name.match(/_(\d+)(?:_|\.|$)/);
  if (m4) return parseInt(m4[1], 10);

  return null;
};

// Modules that produce reports (fixed set)
const MODULE_ORDER = [
  'Duplicate Tool',
  'Envelope Setup and Enhancement',
  'Extra Configuration',
  'Envelope Breaking',
  'Box Breaking',
];
const BOX_BREAKING_MODULE = 'box breaking';
const ENVELOPE_BREAKING_MODULE = 'envelope breaking';

// ─── component ───────────────────────────────────────────────────────────────

const ReportTemplateManagement = ({
  reports = [],
  onDownload,
  rptApiUrl,
  apiBaseUrl,
  projectId,
  envLotReports = [],
  availableLots = [],
}) => {
  const { userMap } = useUserMap();
  const projectName = useStore(state => state.projectName);

  // filters
  const [searchText, setSearchText] = useState('');
  const [selectedModule, setSelectedModule] = useState('ALL');
  const [selectedTemplate, setSelectedTemplate] = useState('ALL');
  const [selectedLot, setSelectedLot] = useState('ALL');
  const [viewType, setViewType] = useState('Template');
  // show only the most recent per (template + lot + batch) — default on
  const [showRecentOnly, setShowRecentOnly] = useState(true);

  // pagination
  const [reportPage, setReportPage] = useState(1);
  const [reportPageSize, setReportPageSize] = useState(10);
  const [templatePage, setTemplatePage] = useState(1);
  const [templatePageSize, setTemplatePageSize] = useState(10);

  // expanded accordion keys (set of groupKey strings)
  const [expandedKeys, setExpandedKeys] = useState(new Set());

  // sorting: { field: string | null, dir: 'asc' | 'desc' | null }
  const [sortState, setSortState] = useState({ field: null, dir: null });

  // column visibility modal
  const [columnVisibilityModalOpen, setColumnVisibilityModalOpen] = useState(false);
  const [reportVisibleColumns, setReportVisibleColumns] = useState({
    module: true, lot: true, reportName: true, version: true,
    generated: true, status: false, action: true,
  });
  const [templateVisibleColumns, setTemplateVisibleColumns] = useState({
    module: true, templateName: true, subName: true, lot: true, envLot: true, version: true,
    generated: true, downloaded: true,
    status: false, action: true,
  });

  // shorthand visibility helpers — call as rvc('module'), tvc('lot'), etc.
  const rvc = (col) => reportVisibleColumns[col] !== false;
  const tvc = (col) => templateVisibleColumns[col] !== false;

  // misc
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [envLotCatches, setEnvLotCatches] = useState({});
  const [envLotReportsLocal, setEnvLotReportsLocal] = useState([]);

  // ── helpers ──────────────────────────────────────────────────────────────

  const getCatchesForEnvLot = (no) => envLotCatches[no] || [];

  const handleSelectAllColumns = () => {
    if (viewType === 'Report') {
      setReportVisibleColumns(Object.fromEntries(Object.keys(reportVisibleColumns).map(k => [k, true])));
    } else {
      setTemplateVisibleColumns(Object.fromEntries(Object.keys(templateVisibleColumns).map(k => [k, true])));
    }
  };
  const handleDeselectAllColumns = () => {
    if (viewType === 'Report') {
      setReportVisibleColumns(Object.fromEntries(Object.keys(reportVisibleColumns).map(k => [k, k === 'action'])));
    } else {
      setTemplateVisibleColumns(Object.fromEntries(Object.keys(templateVisibleColumns).map(k => [k, k === 'action'])));
    }
  };

  // ── env lot lookups ───────────────────────────────────────────────────────

  const envLotReportsLookup = useMemo(() => {
    const lookup = {};
    const data = envLotReportsLocal.length > 0 ? envLotReportsLocal : envLotReports;
    (data || []).forEach((r) => {
      const id = Number(r.templateId ?? r.TemplateId);
      if (!id) return;
      if (!lookup[id]) lookup[id] = { templateId: id, envLotNumbers: [], lotNumbers: [], reports: [] };
      lookup[id].envLotNumbers.push(...parseEnvLotNumbers(r.envLotNumbers ?? r.EnvLotNumbers));
      const lot = Number(r.lotNumber ?? r.lotNo ?? r.LotNo ?? 0);
      if (lot > 0) lookup[id].lotNumbers.push(lot);
      lookup[id].reports.push(r);
    });
    Object.values(lookup).forEach((item) => {
      item.envLotNumbers = [...new Set(item.envLotNumbers)];
      item.lotNumbers = [...new Set(item.lotNumbers)];
    });
    return lookup;
  }, [envLotReports, envLotReportsLocal]);

  const envLotReportsByTemplate = useMemo(() => {
    const lookup = {};
    const data = envLotReportsLocal.length > 0 ? envLotReportsLocal : envLotReports;
    (data || []).forEach((r) => {
      const id = Number(r.templateId ?? r.TemplateId);
      if (id) {
        if (!lookup[id]) lookup[id] = [];
        lookup[id].push(r);
      }
      const name = (r.templateName ?? r.TemplateName ?? '').trim().toLowerCase();
      if (name) {
        const nameKey = `name_${name}`;
        if (!lookup[nameKey]) lookup[nameKey] = [];
        lookup[nameKey].push(r);
      }
    });
    return lookup;
  }, [envLotReports, envLotReportsLocal]);

  // ── API fetches ───────────────────────────────────────────────────────────

  useEffect(() => { fetchEnvLotReports(showRecentOnly); }, [projectId, envLotReports, showRecentOnly]);

  const fetchEnvLotReports = async (latestOnly = true) => {
    if (!projectId || !apiBaseUrl) return;
    try {
      const res = await axios.get(
        `${apiBaseUrl}/EnvelopeLotReports/ByProject/${projectId}?latestOnly=${latestOnly}`
      );
      setEnvLotReportsLocal(res.data || []);
    } catch (e) { console.error('Failed to fetch EnvLotReports:', e); }
  };

  useEffect(() => {
    if (projectId && apiBaseUrl) fetchEnvLotCatches();
  }, [projectId, apiBaseUrl]);

  const fetchEnvLotCatches = async () => {
    try {
      const res = await axios.get(`${apiBaseUrl}/NRDataLots/GetAssignedEnvLotCatches/${projectId}`);
      const lk = {};
      (res.data || []).forEach((item) => {
        const en = item.envLotNo ?? item.EnvLotNo;
        const cn = item.catchNo ?? item.CatchNo;
        if (en && cn) {
          if (!lk[en]) lk[en] = [];
          if (!lk[en].includes(cn)) lk[en].push(cn);
        }
      });
      setEnvLotCatches(lk);
    } catch (e) { console.error('Failed to fetch env lot catches:', e); }
  };

  // ── view / filter helpers ─────────────────────────────────────────────────

  const handleTypeChange = (type) => {
    setViewType(type);
    setSelectedModule('ALL');
    setSelectedLot('ALL');
    setSearchText('');
    setExpandedKeys(new Set());
    if (type === 'Report') { setSelectedTemplate('ALL'); setReportPage(1); }
    else setTemplatePage(1);
    fetchEnvLotReports(showRecentOnly);
  };

  useEffect(() => {
    setExpandedKeys(new Set());
    setSortState({ field: null, dir: null });
    if (viewType === 'Report') setReportPage(1);
    else setTemplatePage(1);
  }, [searchText, selectedModule, selectedTemplate, selectedLot, viewType]);

  const moduleOptions = useMemo(() =>
    [...new Set(reports.filter(r => r.type === viewType).map(r => r.module).filter(Boolean))],
    [reports, viewType]);

  const templateOptions = useMemo(() =>
    [...new Set(reports.filter(r => r.type === viewType).map(r => r.templateName).filter(Boolean))],
    [reports, viewType]);

  const getLotNumbers = useMemo(() => {
    const lots = new Set();

    // 1. Add lots from availableLots prop
    (availableLots || []).forEach(l => {
      const lotNo = typeof l === 'number' ? l : Number(l?.lotNo ?? l?.LotNo ?? l?.lotNumber ?? 0);
      if (lotNo > 0) lots.add(lotNo);
    });

    // 2. Add lots from reports for current viewType
    reports.forEach((r) => {
      if (r.type !== viewType) return;
      if (viewType === 'Template') {
        const data = r.templateId ? envLotReportsLookup[Number(r.templateId)] : null;
        data?.lotNumbers?.forEach(l => { if (l > 0) lots.add(Number(l)); });
      } else {
        const dbLot = (r.lot != null && Number(r.lot) > 0) ? Number(r.lot) : null;
        const fnLot = extractLotFromFilename(r.reportName || r.fileName);
        const lot = dbLot || fnLot;
        if (lot && lot > 0) lots.add(lot);
      }
    });

    // 3. Fallback: Check all reports regardless of viewType if set is empty
    if (lots.size === 0) {
      reports.forEach((r) => {
        const dbLot = (r.lot != null && Number(r.lot) > 0) ? Number(r.lot) : null;
        const fnLot = extractLotFromFilename(r.reportName || r.fileName);
        const lot = dbLot || fnLot;
        if (lot && lot > 0) lots.add(lot);
      });
    }

    // 4. Fallback from envLotReportsLookup if still empty
    if (lots.size === 0) {
      Object.values(envLotReportsLookup || {}).forEach(item => {
        item?.lotNumbers?.forEach(l => { if (l > 0) lots.add(Number(l)); });
      });
    }

    return [...lots].sort((a, b) => a - b);
  }, [reports, viewType, envLotReportsLookup, availableLots]);

  // ══════════════════════════════════════════════════════════════════════════
  // ACCORDION GROUPS
  //
  // REPORT VIEW
  //   One group per module. All versions of that module's report are the rows.
  //   Exception: Box Breaking → one group per LOT (lot is encoded in filename).
  //
  // TEMPLATE VIEW
  //   One group per (templateId + lot) for box-breaking-dependent templates,
  //   one group per (templateId + batch/envLot) for envelope-breaking-dependent,
  //   one group per templateId for others.
  //   Within each group all DB rows (versions) are listed.
  // ══════════════════════════════════════════════════════════════════════════

  const accordionGroups = useMemo(() => {
    const search = searchText.trim().toLowerCase();

    // ── REPORT VIEW ─────────────────────────────────────────────────────────
    if (viewType === 'Report') {
      const filtered = reports
        .filter(r => r.type === 'Report')
        .filter(r => {
          const fileName = r.reportName || r.fileName || '';
          const dbLot = (r.lot != null && Number(r.lot) > 0) ? Number(r.lot) : null;
          const lotNum = dbLot || extractLotFromFilename(fileName);
          if (search && !r.module?.toLowerCase().includes(search) && !r.reportName?.toLowerCase().includes(search)) return false;
          if (selectedModule !== 'ALL' && r.module !== selectedModule) return false;
          if (selectedLot !== 'ALL' && Number(lotNum) !== Number(selectedLot)) return false;
          return true;
        });

      // Group: for box breaking use "module||lot", for others use "module||lot" when lot available
      const groupMap = new Map();
      filtered.forEach(r => {
        // Prefer DB lot value, fall back to extracting from filename
        const dbLot = (r.lot != null && Number(r.lot) > 0) ? Number(r.lot) : null;
        const lotNum = dbLot || extractLotFromFilename(r.reportName || r.fileName || '');
        const groupKey = lotNum
          ? `${r.module}||lot-${lotNum}`
          : `${r.module}`;

        if (!groupMap.has(groupKey)) groupMap.set(groupKey, { key: groupKey, module: r.module, lot: lotNum, rows: [] });
        groupMap.get(groupKey).rows.push(r);
      });

      // Sort rows within each group: highest version first
      const groups = [];
      groupMap.forEach((g) => {
        g.rows.sort((a, b) => {
          const av = Number(a.versions?.[0]?.version ?? 0);
          const bv = Number(b.versions?.[0]?.version ?? 0);
          return bv - av;
        });
        groups.push(g);
      });

      // Sort groups by MODULE_ORDER then by lot
      groups.sort((a, b) => {
        const ai = MODULE_ORDER.findIndex(m => a.module?.toLowerCase().includes(m.toLowerCase()));
        const bi = MODULE_ORDER.findIndex(m => b.module?.toLowerCase().includes(m.toLowerCase()));
        if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        return (a.lot || 0) - (b.lot || 0);
      });

      return groups;
    }

    const isArchivedView = selectedTemplate === 'ARCHIVED_TEMPLATES';

    const filtered = reports.filter(r => r.type === 'Template').filter(r => {
      if (search && !r.module?.toLowerCase().includes(search) && !r.templateName?.toLowerCase().includes(search)) return false;
      if (selectedModule !== 'ALL' && r.module !== selectedModule) return false;
      if (selectedTemplate !== 'ALL' && !isArchivedView && r.templateName !== selectedTemplate) return false;
      return true;
    });

    const groupMap = new Map();

    const pushDbRow = (gk, r, db, idx) => {
      const arr = groupMap.get(gk).rows;
      if (!db) {
        if (!isArchivedView) arr.push({ ...r, _dbRow: null });
        return;
      }
      const dbId = db.id ?? db.Id;
      if (dbId && arr.some(x => (x._dbRow?.id ?? x._dbRow?.Id) === dbId)) return;
      arr.push({ ...r, _dbRow: db, _versionIdx: idx });
    };

    filtered.forEach((r) => {
      const templateId = Number(r.templateId ?? r.TemplateId ?? 0);
      const templateName = r.templateName || '-';
      const templateNameKey = (r.templateName || r.TemplateName || '').trim().toLowerCase();
      const moduleLower = (r.module || '').toLowerCase();

      // Get all DB records for this template (first by templateId, fallback by templateName)
      let rawDbRows = templateId ? (envLotReportsByTemplate[templateId] || []) : [];
      if (rawDbRows.length === 0 && templateNameKey) {
        rawDbRows = envLotReportsByTemplate[`name_${templateNameKey}`] || [];
      }
      const dbRows = rawDbRows.filter(db => {
        const isArchived = db.status === false || db.Status === false;
        return isArchivedView ? isArchived : !isArchived;
      });

      // Detect if there's any lot or batch data in the rows
      const hasLot = dbRows.some(db => (Number(db.lotNumber ?? db.lotNo ?? db.LotNo) || 0) > 0);
      const hasEnv = dbRows.some(db => parseEnvLotNumbers(db.envLotNumbers ?? db.EnvLotNumbers).length > 0);

      const isBoxDep = moduleLower.includes(BOX_BREAKING_MODULE) || hasLot;
      const isEnvDep = moduleLower.includes(ENVELOPE_BREAKING_MODULE) || hasEnv;

      if (dbRows.length === 0) {
        // No generated records — show a single placeholder group if we are not in Archived view
        if (isArchivedView) return;

        const gk = `tpl-${templateId}-none`;
        if (!groupMap.has(gk)) {
          groupMap.set(gk, {
            key: gk, module: r.module, templateId, templateName,
            subName: r.subName || r.SubName || null,
            lot: null, envLotNo: null,
            rows: [{ ...r, _dbRow: null }],
          });
        }
        return;
      }

      if (isBoxDep) {
        // Group by lot number
        const lotGroups = {};
        dbRows.forEach((db) => {
          const lot = Number(db.lotNumber ?? db.lotNo ?? db.LotNo ?? 0) || 0;
          if (selectedLot !== 'ALL' && Number(selectedLot) !== lot) return;
          if (!lotGroups[lot]) lotGroups[lot] = [];
          lotGroups[lot].push(db);
        });
        Object.entries(lotGroups).forEach(([lot, dbs]) => {
          const gk = `tpl-${templateId}-lot-${lot}`;
          if (!groupMap.has(gk)) {
            groupMap.set(gk, { key: gk, module: r.module, templateId, templateName, subName: r.subName || r.SubName || null, lot: Number(lot), envLotNo: null, rows: [] });
          }
          // Each DB row = one version row; map to the report shape
          dbs.forEach((db, idx) => {
            pushDbRow(gk, r, db, idx);
          });
        });
      } else if (isEnvDep) {
        // Group by envLotNo (batch)
        const batchGroups = {};
        dbRows.forEach((db) => {
          const envNums = parseEnvLotNumbers(db.envLotNumbers ?? db.EnvLotNumbers);
          const envNo = envNums[0] ?? 0;
          if (!batchGroups[envNo]) batchGroups[envNo] = [];
          batchGroups[envNo].push(db);
        });
        Object.entries(batchGroups).forEach(([envNo, dbs]) => {
          const gk = `tpl-${templateId}-env-${envNo}`;
          if (!groupMap.has(gk)) {
            groupMap.set(gk, { key: gk, module: r.module, templateId, templateName, subName: r.subName || r.SubName || null, lot: null, envLotNo: Number(envNo), rows: [] });
          }
          dbs.forEach((db, idx) => {
            pushDbRow(gk, r, db, idx);
          });
        });
      } else {
        // Plain template — one group per templateId
        const gk = `tpl-${templateId}`;
        if (!groupMap.has(gk)) {
          groupMap.set(gk, { key: gk, module: r.module, templateId, templateName, subName: r.subName || r.SubName || null, lot: null, envLotNo: null, rows: [] });
        }
        dbRows.forEach((db, idx) => {
          pushDbRow(gk, r, db, idx);
        });
      }
    });

    // Sort rows within each group: newest first (by generatedAt)
    const groups = [];
    groupMap.forEach((g) => {
      g.rows.sort((a, b) =>
        new Date(b._dbRow?.generatedAt ?? b._dbRow?.GeneratedAt ?? 0) -
        new Date(a._dbRow?.generatedAt ?? a._dbRow?.GeneratedAt ?? 0)
      );
      groups.push(g);
    });

    // Default display order for Template view: most recent GeneratedAt first (data arrives pre-sorted from backend)
    groups.sort((a, b) => {
      const getNewestDate = (g) => {
        let best = 0;
        g.rows.forEach((row) => {
          const raw = row._dbRow?.generatedAt ?? row._dbRow?.GeneratedAt ?? null;
          if (!raw) return;
          let s = String(raw);
          if (!s.endsWith('Z') && !s.includes('+') && !s.match(/-\d{2}:\d{2}$/)) {
            if (s.includes(' ') && !s.includes('T')) s = s.replace(' ', 'T');
            s += 'Z';
          }
          const t = new Date(s).getTime();
          if (!isNaN(t) && t > best) best = t;
        });
        return best;
      };
      return getNewestDate(b) - getNewestDate(a);
    });

    return groups;
  }, [reports, searchText, selectedModule, selectedTemplate, selectedLot, viewType, envLotReportsByTemplate, envLotReportsLookup]);

  // badge count = number of groups
  const totalReportsCount = accordionGroups.length;

  // sort helper — only module, lot, generatedOn are sortable
  const sortedGroups = useMemo(() => {
    const { field, dir } = sortState;
    if (!field || !dir) return accordionGroups;

    const sign = dir === 'asc' ? 1 : -1;
    return [...accordionGroups].sort((a, b) => {
      switch (field) {
        case 'module':
          return sign * (a.module || '').localeCompare(b.module || '', undefined, { sensitivity: 'base' });
        case 'lot':
          return sign * ((a.lot ?? 0) - (b.lot ?? 0));
        case 'generatedOn': {
          const ad = viewType === 'Report'
            ? new Date(a.rows[0]?.versions?.[0]?.generatedOn ?? 0)
            : new Date(a.rows[0]?._dbRow?.generatedAt ?? a.rows[0]?._dbRow?.GeneratedAt ?? 0);
          const bd = viewType === 'Report'
            ? new Date(b.rows[0]?.versions?.[0]?.generatedOn ?? 0)
            : new Date(b.rows[0]?._dbRow?.generatedAt ?? b.rows[0]?._dbRow?.GeneratedAt ?? 0);
          return sign * (ad - bd);
        }
        default: return 0;
      }
    });
  }, [accordionGroups, sortState, viewType]);

  // pagination over sorted groups
  const currentPage = viewType === 'Report' ? reportPage : templatePage;
  const currentPageSize = viewType === 'Report' ? reportPageSize : templatePageSize;
  const paginatedGroups = useMemo(() => {
    const start = (currentPage - 1) * currentPageSize;
    return sortedGroups.slice(start, start + currentPageSize);
  }, [sortedGroups, currentPage, currentPageSize]);

  // ── accordion toggle ──────────────────────────────────────────────────────

  // Sort cycle: none → asc → desc → none
  const handleSort = (field) => {
    setSortState(prev => {
      if (prev.field !== field) return { field, dir: 'asc' };          // new field → asc
      if (prev.dir === 'asc') return { field, dir: 'desc' };          // asc → desc
      return { field: null, dir: null };                                // desc → reset
    });
  };

  const SortIcon = ({ field }) => {
    const { field: activeField, dir } = sortState;
    if (activeField !== field) return <span className="rtm-sort-icon rtm-sort-icon--idle">⇅</span>;
    return <span className="rtm-sort-icon rtm-sort-icon--active">{dir === 'asc' ? '↑' : '↓'}</span>;
  };

  const toggleExpand = (key, hasMultiple) => {
    if (!hasMultiple) return;
    setExpandedKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // ── download handlers ─────────────────────────────────────────────────────

  // Download the latest (first) version of a report group
  const handleDownloadReport = async (group) => {
    const latestRow = group.rows[0];
    const version = latestRow?.versions?.[0];
    if (!version?.fileUrl) { message.error('Download URL not available.'); return; }
    const link = document.createElement('a');
    let dn = latestRow.reportName || 'report';
    if (!dn.toLowerCase().endsWith('.xlsx')) dn += '.xlsx';
    link.href = version.fileUrl; link.download = dn; link.target = '_blank';
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    message.success('Download started.');
  };

  // Download a specific report version row
  const handleDownloadReportVersion = (versionObj, reportName) => {
    if (!versionObj?.fileUrl) { message.error('Download URL not available for this version.'); return; }
    const link = document.createElement('a');
    let dn = reportName || 'report';
    if (!dn.toLowerCase().endsWith('.xlsx')) dn += '.xlsx';
    link.href = versionObj.fileUrl; link.download = dn; link.target = '_blank';
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    message.success('Download started.');
  };

  // Download a template (uses rptApiUrl)
  const handleDownloadTemplate = async (group, dbRow) => {
    const templateId = group.templateId;
    const lotNumber = dbRow
      ? Number(dbRow.lotNumber ?? dbRow.lotNo ?? dbRow.LotNo ?? 0) || 1
      : group.lot || 1;
    if (!templateId || !projectId) { message.error('Missing template download details.'); return; }
    try {
      const base = (rptApiUrl || import.meta.env.VITE_RPT_API_URL || '').replace(/\/api\/?$/i, '');
      if (!base) { message.error('RPT API URL not configured.'); return; }
      const ok = await axios.get(`${base}/api/report/generated-exists?templateId=${templateId}&projectId=${projectId}`);
      if (!ok.data?.exists && ok.data !== true) { message.error('No generated PDF found.'); return; }

      let fileName = projectName ? projectName.replace(/[^a-zA-Z0-9_-]/g, '_') : `Project_${projectId}`;
      const envNums = parseEnvLotNumbers(dbRow?.envLotNumbers ?? dbRow?.EnvLotNumbers);
      const envLotVal = group.envLotNo ?? envNums[0];

      if (envLotVal) {
        fileName += `_Batch-${envLotVal}`;
      } else if (lotNumber) {
        fileName += `_Lot-${lotNumber}`;
      }

      // Include template name to be descriptive
      const templateNameStr = group.templateName ? `_${group.templateName.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
      fileName += `${templateNameStr}.pdf`;

      message.loading({ content: 'Downloading...', key: 'downloading-template' });
      const res = await axios.get(`${base}/api/report/generated-download`, {
        params: { templateId, projectId, lotNumber },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
      message.success({ content: 'Download completed.', key: 'downloading-template' });

      // track download
      const dbId = dbRow?.id ?? dbRow?.Id;
      if (dbId) {
        try {
          const uid = getCurrentUserId();
          await axios.put(`${apiBaseUrl}/EnvelopeLotReports/${dbId}/track-download`, { downloadedByUserId: uid, DownloadedByUserId: uid });
          await fetchEnvLotReports();
        } catch (e) { console.warn('Failed to track download:', e); }
      }
    } catch (e) { console.error('Template download failed:', e); message.error({ content: 'Failed to download.', key: 'downloading-template' }); }
  };

  const handleDownloadAll = async () => {
    setBulkDownloading(true);
    try {
      if (viewType === 'Report') {
        const res = await axios.get(`${apiBaseUrl}/EnvelopeBreakages/Reports/DownloadAll`, { params: { projectId: Number(projectId) }, responseType: 'blob' });
        const url = window.URL.createObjectURL(new Blob([res.data], { type: res.headers['content-type'] || 'application/zip' }));
        const a = document.createElement('a'); a.href = url; a.download = `reports_${projectId}.zip`;
        document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
        message.success('Reports downloaded.');
        return;
      }
      const base = (rptApiUrl || import.meta.env.VITE_RPT_API_URL || '').replace(/\/api\/?$/i, '');
      if (!base) { message.error('RPT API URL not configured.'); return; }
      const items = [];
      for (const g of accordionGroups) {
        const dbRow = g.rows[0]?._dbRow;
        const lot = Number(dbRow?.lotNumber ?? dbRow?.lotNo ?? dbRow?.LotNo ?? g.lot ?? 1) || 1;
        const exists = envLotReportsLocal.some(x => Number(x.templateId ?? x.TemplateId) === g.templateId && Number(x.lotNumber ?? x.lotNo) === lot);
        if (exists) items.push({ templateId: g.templateId, lotNumber: lot });
      }
      if (!items.length) { message.warning('No generated PDFs found.'); return; }
      const res = await axios.get(`${base}/api/report/generated-download-zip`, {
        params: { projectId: Number(projectId), templateIds: items.map(i => i.templateId).join(','), lotNumbers: items.map(i => i.lotNumber).join(',') },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/zip' }));
      const a = document.createElement('a'); a.href = url; a.download = `templates_${projectId}.zip`;
      document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
      message.success('Templates downloaded.');
    } catch (e) { console.error('Bulk download failed:', e); message.error('Failed to download files.'); }
    finally { setBulkDownloading(false); }
  };

  const handleArchiveTemplate = async (dbRow) => {
    const dbId = dbRow?.id ?? dbRow?.Id;
    if (!dbId) return;

    Modal.confirm({
      title: 'Archive Report',
      content: 'Are you sure you want to archive this report?',
      okText: 'Yes, Archive',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await axios.put(`${apiBaseUrl}/EnvelopeLotReports/${dbId}/archive`);
          message.success('Report archived successfully');
          fetchEnvLotReports();
        } catch (e) {
          console.error('Failed to archive report:', e);
          message.error('Failed to archive report');
        }
      }
    });
  };

  const handleUnarchiveTemplate = async (dbRow) => {
    const dbId = dbRow?.id ?? dbRow?.Id;
    if (!dbId) return;

    try {
      await axios.put(`${apiBaseUrl}/EnvelopeLotReports/${dbId}/unarchive`);
      message.success('Report unarchived successfully');
      fetchEnvLotReports();
    } catch (e) {
      console.error('Failed to unarchive report:', e);
      message.error('Failed to unarchive report');
    }
  };

  // ── render helpers ────────────────────────────────────────────────────────

  const renderStatus = (status) => {
    if (status === 'Archived') return <Tag color="error">Archived</Tag>;
    if (status === 'Latest') return <Tag color="success">Latest</Tag>;
    if (status === 'Previous') return <Tag color="default">Previous</Tag>;
    return <Tag>{status || '-'}</Tag>;
  };

  const renderEnvLotTag = (envLotNo) => {
    if (!envLotNo) return <span style={{ color: '#94a3b8' }}>-</span>;
    const catches = getCatchesForEnvLot(envLotNo);
    const tip = (
      <div style={{ padding: 8, minWidth: 180 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Batch {envLotNo} — Catches</div>
        {catches.length > 0
          ? catches.map((c, i) => <div key={i} style={{ fontSize: 12, padding: '2px 6px', background: '#f0f0f0', borderRadius: 3, marginBottom: 2 }}>{c}</div>)
          : <span style={{ color: '#999' }}>No catches assigned</span>}
      </div>
    );
    return (
      <Tooltip title={tip} color="#fff" overlayInnerStyle={{ color: '#333' }}>
        <Tag color="blue" style={{ cursor: 'pointer' }}>
          Batch {envLotNo}{catches.length > 0 && <span style={{ marginLeft: 4, fontSize: 11 }}>({catches.length})</span>}
        </Tag>
      </Tooltip>
    );
  };

  const resolveUserName = (userId, fallback) =>
    (userId ? getFirstNameFromUserId(userId, userMap) : null) || fallback || '-';

  // ── dynamic grid column string based on visibility ────────────────────────
  // Each visible column contributes its fr width; hidden ones are omitted so the
  // grid naturally collapses without leaving empty gaps.
  const reportGridCols = useMemo(() => {
    const cols = ['22px']; // icon always visible
    if (rvc('module')) cols.push('1.3fr');
    if (rvc('lot')) cols.push('0.6fr');
    if (rvc('reportName')) cols.push('1.8fr');
    if (rvc('version')) cols.push('0.65fr');
    if (rvc('generated')) cols.push('1.6fr');
    if (rvc('status')) cols.push('0.8fr');
    cols.push('0.9fr'); // action always visible
    return cols.join(' ');
  }, [reportVisibleColumns]);

  const templateGridCols = useMemo(() => {
    const cols = ['22px']; // icon always visible
    if (tvc('module')) cols.push('1.1fr');
    if (tvc('lot')) cols.push('0.55fr');
    if (tvc('envLot')) cols.push('0.9fr');
    if (tvc('templateName')) cols.push('1.6fr');
    if (tvc('subName')) cols.push('0.8fr');
    if (tvc('version')) cols.push('0.6fr');
    if (tvc('generated')) cols.push('1.5fr');
    if (tvc('downloaded')) cols.push('1.5fr');
    if (tvc('status')) cols.push('0.75fr');
    cols.push('1.2fr'); // action always visible
    return cols.join(' ');
  }, [templateVisibleColumns]);

  // ══════════════════════════════════════════════════════════════════════════
  // ACCORDION ROW (header + optional expanded body)
  // ══════════════════════════════════════════════════════════════════════════

  const renderGroup = (group) => {
    const isReport = viewType === 'Report';
    const hasMultiple = group.rows.length > 1;
    const isExpanded = expandedKeys.has(group.key);
    const vc = isReport ? rvc : tvc;
    const gridCols = isReport ? reportGridCols : templateGridCols;

    // ── derive header data from the "latest" (first) row ──
    let headerData = {};

    let displayModule = group.module || '-';
    if (displayModule === '-') {
      if (isReport) {
        if (group.lot != null) displayModule = 'Box Breaking';
      } else {
        const dbRows = group.rows.map(r => r._dbRow).filter(Boolean);
        const hasLot = dbRows.some(db => (Number(db.lotNumber ?? db.lotNo ?? db.LotNo) || 0) > 0);
        const hasEnv = dbRows.some(db => parseEnvLotNumbers(db.envLotNumbers ?? db.EnvLotNumbers).length > 0);
        if (hasLot) displayModule = 'Box Breaking';
        else if (hasEnv) displayModule = 'Envelope Breaking';
      }
    }

    if (isReport) {
      const latestRow = group.rows[0];
      const v = latestRow?.versions?.[0];
      headerData = {
        module: displayModule,
        lot: group.lot != null ? `Lot ${group.lot}` : '-',
        name: latestRow?.reportName || '-',
        version: v?.version ?? '-',
        generatedOn: v?.generatedOn,
        generatedBy: resolveUserName(v?.generatedByUserId || latestRow?.generatedByUserId, v?.generatedBy || latestRow?.generatedBy),
        status: v?.status,
        onDownload: () => handleDownloadReport(group),
        canDownload: !!v?.fileUrl,
      };
    } else {
      const firstRow = group.rows[0];
      const firstVer = firstRow?.versions?.[0];
      const latestDb = firstRow?._dbRow;
      const envNums = parseEnvLotNumbers(latestDb?.envLotNumbers ?? latestDb?.EnvLotNumbers ?? firstRow?.envLotNumbers ?? firstRow?.envLotKey);

      const rawVer = latestDb?.version ?? latestDb?.Version ?? firstVer?.version ?? firstRow?.version;
      const formattedVer = rawVer != null && rawVer !== '-' ? (String(rawVer).startsWith('v') ? String(rawVer) : `v${rawVer}`) : '-';

      const resolvedSubName = group.subName || latestDb?.subName || latestDb?.SubName || firstRow?.subName || firstRow?.SubName || null;
      const resolvedLotNumber = (group.lot != null && group.lot > 0) ? group.lot : (firstRow?.lotNumber || firstRow?.lotNo || firstRow?.LotNo || null);

      headerData = {
        module: displayModule,
        lot: resolvedLotNumber ? `Lot ${resolvedLotNumber}` : '-',
        envLotNo: group.envLotNo ?? (envNums[0] || null),
        name: group.templateName || firstRow?.templateName || '-',
        subName: resolvedSubName,
        version: formattedVer,
        generatedOn: latestDb?.generatedAt ?? latestDb?.GeneratedAt ?? firstVer?.generatedOn ?? firstRow?.generatedAt,
        generatedBy: resolveUserName(
          latestDb?.generatedByUserId ?? latestDb?.GeneratedByUserId ?? firstVer?.generatedByUserId ?? firstRow?.generatedByUserId,
          latestDb?.generatedBy ?? latestDb?.GeneratedBy ?? firstVer?.generatedBy ?? firstRow?.generatedBy
        ),
        downloadedBy: resolveUserName(
          latestDb?.downloadedByUserId ?? latestDb?.DownloadedByUserId ?? firstVer?.downloadedByUserId ?? firstRow?.downloadedByUserId,
          latestDb?.downloadedBy ?? latestDb?.DownloadedBy ?? firstVer?.downloadedBy ?? firstRow?.downloadedBy
        ),
        downloadedAt: latestDb?.downloadedAt ?? latestDb?.DownloadedAt ?? firstVer?.downloadedAt ?? firstRow?.downloadedAt,
        status: (latestDb?.status === false || latestDb?.Status === false) ? 'Archived' : (firstVer?.status || 'Latest'),
        onDownload: () => handleDownloadTemplate(group, latestDb),
        canDownload: true,
        onArchive: () => handleArchiveTemplate(latestDb),
        onUnarchive: () => handleUnarchiveTemplate(latestDb),
        canArchive: !(latestDb?.status === false || latestDb?.Status === false),
      };
    }

    return (
      <div
        key={group.key}
        className={`rtm-group ${isExpanded ? 'rtm-group--open' : ''} ${!hasMultiple ? 'rtm-group--single' : ''}`}
        data-view={isReport ? 'report' : 'template'}
        onClick={() => toggleExpand(group.key, hasMultiple)}
      >
        {/* ── header row ── */}
        <div className="rtm-row rtm-row--header" style={{ gridTemplateColumns: gridCols }}>
          {/* expand icon — always shown */}
          <div className="rtm-cell rtm-cell--icon">
            {hasMultiple
              ? isExpanded ? <ChevronDown size={15} className="rtm-chevron" /> : <ChevronRight size={15} className="rtm-chevron" />
              : <span style={{ width: 15, display: 'inline-block' }} />}
          </div>

          {vc('module') && (
            <div className="rtm-cell rtm-cell--module">
              <span className="rtm-label">Module</span>
              <span className="rtm-val rtm-val--bold">{headerData.module}</span>
            </div>
          )}

          {isReport ? (
            vc('lot') && (
              <div className="rtm-cell rtm-cell--lot">
                <span className="rtm-label">Lot</span>
                <span className="rtm-val">{headerData.lot}</span>
              </div>
            )
          ) : (
            <>
              {tvc('lot') && (
                <div className="rtm-cell rtm-cell--lot">
                  <span className="rtm-label">Lot</span>
                  <span className="rtm-val">{headerData.lot}</span>
                </div>
              )}
              {tvc('envLot') && (
                <div className="rtm-cell rtm-cell--batch">
                  <span className="rtm-label">Batch</span>
                  <span className="rtm-val">{renderEnvLotTag(headerData.envLotNo)}</span>
                </div>
              )}
            </>
          )}

          {/* report / template name */}
          {vc(isReport ? 'reportName' : 'templateName') && (
            <div className="rtm-cell rtm-cell--name">
              <span className="rtm-label">{isReport ? 'Report' : 'Template'}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                <FileText size={13} style={{ color: '#3b82f6', flexShrink: 0 }} />
                <span className="rtm-val rtm-val--name" title={headerData.name}>{headerData.name}</span>
              </div>
            </div>
          )}

          {/* sub name — template only */}
          {!isReport && tvc('subName') && (
            <div className="rtm-cell rtm-cell--subname">
              <span className="rtm-label">Sub Name</span>
              <span className="rtm-val rtm-val--muted">{headerData.subName || '-'}</span>
            </div>
          )}

          {vc('version') && (
            <div className="rtm-cell rtm-cell--ver">
              <span className="rtm-label">Version</span>
              <span className="rtm-version-pill">{headerData.version}</span>
            </div>
          )}

          {vc('generated') && (
            <div className="rtm-cell rtm-cell--gen">
              <span className="rtm-label">Generated</span>
              <span className="rtm-val rtm-val--muted" style={{ fontSize: 12 }}>
                {formatDateTimeToIST(headerData.generatedOn)}
              </span>
              <span className="rtm-val" style={{ fontSize: 12, color: '#475569' }}>
                {headerData.generatedBy}
              </span>
            </div>
          )}

          {!isReport && tvc('downloaded') && (
            <div className="rtm-cell rtm-cell--dl">
              <span className="rtm-label">Downloaded</span>
              {headerData.downloadedBy && headerData.downloadedBy !== '-' ? (
                <>
                  <span className="rtm-val rtm-val--muted" style={{ fontSize: 12 }}>
                    {formatDateTimeToIST(headerData.downloadedAt)}
                  </span>
                  <span className="rtm-val" style={{ fontSize: 12, color: '#475569' }}>
                    {headerData.downloadedBy}
                  </span>
                </>
              ) : (
                <span style={{ color: '#94a3b8', fontSize: 11, fontStyle: 'italic' }}>-</span>
              )}
            </div>
          )}

          {vc('status') && (
            <div className="rtm-cell rtm-cell--status">
              <span className="rtm-label">Status</span>
              {renderStatus(headerData.status)}
            </div>
          )}

          {/* action — always shown */}
          <div className="rtm-cell rtm-cell--action" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Tooltip title="Download">
                <Button
                  type="primary" size="small"
                  icon={<Download size={13} />}
                  disabled={!headerData.canDownload}
                  onClick={(e) => { e.stopPropagation(); headerData.onDownload(); }}>
                </Button>
              </Tooltip>
              {!isReport && (
                <>
                  {headerData.status === 'Archived' ? (
                    <Tooltip title="Unarchive">
                      <Button size="small" icon={<ArchiveRestore size={12} />} onClick={(e) => { e.stopPropagation(); headerData.onUnarchive(); }}>
                      </Button>
                    </Tooltip>
                  ) : (
                    <Tooltip title="Archive">
                      <Button size="small" danger icon={<Archive size={12} />}
                        disabled={!headerData.canArchive}
                        onClick={(e) => { e.stopPropagation(); headerData.onArchive(); }}>
                      </Button>
                    </Tooltip>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── expanded version history ── */}
        {hasMultiple && isExpanded && (
          <div className="rtm-versions" onClick={e => e.stopPropagation()}>
            <div className="rtm-versions-label">All Versions ({group.rows.length})</div>
            <div className="rtm-versions-scroll">
              <table className="rtm-vtable">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Version</th>
                    {isReport && rvc('reportName') && <th>Report File</th>}
                    {!isReport && tvc('templateName') && <th>Template</th>}
                    {!isReport && tvc('subName') && <th>Sub Name</th>}
                    {!isReport && tvc('lot') && <th>Lot</th>}
                    {!isReport && tvc('envLot') && <th>Batch</th>}
                    {vc('generated') && <th>Generated</th>}
                    {!isReport && tvc('downloaded') && <th>Downloaded</th>}
                    {vc('status') && <th>Status</th>}
                    <th style={{ textAlign: 'left' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row, idx) => {
                    if (isReport) {
                      const v = row.versions?.[0];
                      const ver = v?.version ?? '-';
                      return (
                        <tr key={idx} className={idx === 0 ? 'rtm-vrow--latest' : ''}>
                          <td style={{ color: '#94a3b8', fontSize: 12 }}>{idx + 1}</td>
                          <td><span className="rtm-version-pill">{ver}</span></td>
                          {rvc('reportName') && (
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <FileText size={12} style={{ color: '#64748b' }} />
                                <span className="rtm-fname">{row.reportName || '-'}</span>
                              </div>
                            </td>
                          )}
                          {rvc('generated') && (
                            <td>
                              <div style={{ fontSize: 12, color: '#64748b' }}>{formatDateTimeToIST(v?.generatedOn)}</div>
                              <div style={{ fontSize: 12, color: '#334155' }}>{resolveUserName(v?.generatedByUserId, v?.generatedBy)}</div>
                            </td>
                          )}
                          {rvc('status') && <td>{renderStatus(v?.status)}</td>}
                          <td style={{ textAlign: 'left' }}>
                            <Button size="small" icon={<Download size={12} />}
                              disabled={!v?.fileUrl}
                              onClick={() => handleDownloadReportVersion(v, row.reportName)}>
                              Download
                            </Button>
                          </td>
                        </tr>
                      );
                    } else {
                      const db = row._dbRow;
                      const firstVer = row.versions?.[0];
                      const rawVer = db?.version ?? db?.Version ?? firstVer?.version ?? row.version;
                      const ver = rawVer != null && rawVer !== '-' ? (String(rawVer).startsWith('v') ? String(rawVer) : `v${rawVer}`) : '-';
                      const lot = Number(db?.lotNumber ?? db?.lotNo ?? db?.LotNo ?? row.lotNumber ?? row.lotNo ?? group.lot ?? 0) || null;
                      const envNums = parseEnvLotNumbers(db?.envLotNumbers ?? db?.EnvLotNumbers ?? row.envLotNumbers ?? row.envLotKey);
                      const envNo = envNums[0] ?? group.envLotNo ?? null;
                      const genBy = resolveUserName(
                        db?.generatedByUserId ?? db?.GeneratedByUserId ?? firstVer?.generatedByUserId ?? row.generatedByUserId,
                        db?.generatedBy ?? db?.GeneratedBy ?? firstVer?.generatedBy ?? row.generatedBy
                      );
                      const genAt = db?.generatedAt ?? db?.GeneratedAt ?? firstVer?.generatedOn ?? row.generatedAt;
                      const dlBy = resolveUserName(
                        db?.downloadedByUserId ?? db?.DownloadedByUserId ?? firstVer?.downloadedByUserId ?? row.downloadedByUserId,
                        db?.downloadedBy ?? db?.DownloadedBy ?? firstVer?.downloadedBy ?? row.downloadedBy
                      );
                      const dlAt = db?.downloadedAt ?? db?.DownloadedAt ?? firstVer?.downloadedAt ?? row.downloadedAt;
                      const subNameVal = group.subName || db?.subName || db?.SubName || row.subName || row.SubName || '-';

                      return (
                        <tr key={idx} className={idx === 0 ? 'rtm-vrow--latest' : ''}>
                          <td style={{ color: '#94a3b8', fontSize: 12 }}>{idx + 1}</td>
                          <td><span className="rtm-version-pill">{ver}</span></td>
                          {tvc('templateName') && (
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <FileText size={12} style={{ color: '#64748b' }} />
                                <span className="rtm-fname">{group.templateName || '-'}</span>
                              </div>
                            </td>
                          )}
                          {tvc('subName') && <td style={{ color: '#64748b', fontSize: 12 }}>{subNameVal}</td>}
                          {tvc('lot') && <td>{lot ? `Lot ${lot}` : '-'}</td>}
                          {tvc('envLot') && <td>{renderEnvLotTag(envNo)}</td>}
                          {tvc('generated') && (
                            <td>
                              <div style={{ fontSize: 12, color: '#64748b' }}>{formatDateTimeToIST(genAt)}</div>
                              <div style={{ fontSize: 12, color: '#334155' }}>{genBy}</div>
                            </td>
                          )}
                          {tvc('downloaded') && (
                            <td>
                              {dlBy && dlBy !== '-' ? (
                                <>
                                  <div style={{ fontSize: 12, color: '#64748b' }}>{formatDateTimeToIST(dlAt)}</div>
                                  <div style={{ fontSize: 12, color: '#334155' }}>{dlBy}</div>
                                </>
                              ) : (
                                <span style={{ color: '#94a3b8', fontSize: 11, fontStyle: 'italic' }}>-</span>
                              )}
                            </td>
                          )}
                          {tvc('status') && <td>{db?.status === false || db?.Status === false ? <Tag color="error">Archived</Tag> : (idx === 0 ? <Tag color="success">Latest</Tag> : <Tag>Previous</Tag>)}</td>}
                          <td style={{ textAlign: 'left' }}>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <Tooltip title="Download">
                                <Button size="small" icon={<Download size={12} />}
                                  onClick={() => handleDownloadTemplate(group, db)}>
                                </Button>
                              </Tooltip>
                              {(db?.status === false || db?.Status === false) ? (
                                <Tooltip title="Unarchive">
                                  <Button size="small" icon={<ArchiveRestore size={12} />} onClick={() => handleUnarchiveTemplate(db)}>
                                  </Button>
                                </Tooltip>
                              ) : (
                                <Tooltip title="Archive">
                                  <Button size="small" danger icon={<Archive size={12} />}
                                    onClick={() => handleArchiveTemplate(db)}>
                                  </Button>
                                </Tooltip>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    }
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── RENDER ────────────────────────────────────────────────────────────────

  const isReport = viewType === 'Report';

  return (
    <section className="mt-6 w-full rounded-xl border border-slate-200 bg-white shadow-sm">

      {/* card header */}
      <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Report &amp; Template Management</h2>
          <p className="mt-1 text-sm text-slate-500">Click any row to expand and view all versions.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="rounded-full bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700">
            {totalReportsCount} {isReport ? 'Reports' : 'Templates'}
          </div>
          <Button size="small" onClick={() => setColumnVisibilityModalOpen(true)}>Column Settings</Button>
        </div>
      </div>

      {/* filter bar */}
      <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50/50 px-6 py-4 flex-wrap">
        <Input allowClear prefix={<Search size={16} />}
          placeholder={isReport ? 'Search by module or report...' : 'Search by module or template...'}
          value={searchText} onChange={e => setSearchText(e.target.value)}
          className="min-w-[280px] flex-1" />

        <Select value={selectedModule} onChange={setSelectedModule} className="w-[170px]">
          <Select.Option value="ALL">All Modules</Select.Option>
          {moduleOptions.map(m => <Select.Option key={m} value={m}>{m}</Select.Option>)}
        </Select>

        {!isReport && (
          <Select value={selectedTemplate} onChange={setSelectedTemplate} className="w-[170px]">
            <Select.Option value="ALL">All Templates</Select.Option>
            {templateOptions.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
            <Select.Option value="ARCHIVED_TEMPLATES">Archived Templates</Select.Option>
          </Select>
        )}

        <Select value={selectedLot} onChange={setSelectedLot} className="w-[140px]">
          <Select.Option value="ALL">All Lots</Select.Option>
          {getLotNumbers.map(l => <Select.Option key={l} value={l}>Lot {l}</Select.Option>)}
        </Select>

        {/* Version filter dropdown — only shown in Template view */}
        {!isReport && (
          <Select
            value={showRecentOnly ? 'recent' : 'all'}
            onChange={(val) => setShowRecentOnly(val === 'recent')}
            className="w-[150px]"
            style={{ flexShrink: 0 }}
          >
            <Select.Option value="recent">Most Recent</Select.Option>
            <Select.Option value="all">All Versions</Select.Option>
          </Select>
        )}

        <Button type="primary" loading={bulkDownloading} disabled={bulkDownloading || accordionGroups.length === 0}
          icon={<Download size={15} />} onClick={handleDownloadAll}>
          {bulkDownloading ? 'Downloading...' : 'Download All'}
        </Button>

        <div className="flex rounded-lg border border-slate-200 bg-white p-1 ml-2">
          <Button type={isReport ? 'primary' : 'default'} onClick={() => handleTypeChange('Report')} className="rounded-md px-4 py-2 text-sm font-medium">Reports</Button>
          <Button type={!isReport ? 'primary' : 'default'} onClick={() => handleTypeChange('Template')} className="rounded-md px-4 py-2 text-sm font-medium">Templates</Button>
        </div>
      </div>

      {/* column visibility modal */}
      <Modal title={`Column Settings — ${viewType} View`} open={columnVisibilityModalOpen}
        onCancel={() => setColumnVisibilityModalOpen(false)} width={400}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={handleSelectAllColumns}>Select All</Button>
              <Button onClick={handleDeselectAllColumns}>Deselect All</Button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={() => setColumnVisibilityModalOpen(false)}>Cancel</Button>
              <Button type="primary" onClick={() => setColumnVisibilityModalOpen(false)}>OK</Button>
            </div>
          </div>
        }
      >
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700 mb-3">Select columns to display:</p>
          {Object.entries(isReport ? reportVisibleColumns : templateVisibleColumns).map(([key, val]) => {
            const labels = {
              module: 'Module', lot: 'Lot', reportName: 'Report', templateName: 'Template Name',
              subName: 'Sub Name', envLot: 'Batch', version: 'Version',
              generated: 'Generated (By + On)', downloaded: 'Downloaded (By + At)',
              status: 'Status', action: 'Action',
            };
            return (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={val} disabled={key === 'action'}
                  onChange={e => isReport
                    ? setReportVisibleColumns(p => ({ ...p, [key]: e.target.checked }))
                    : setTemplateVisibleColumns(p => ({ ...p, [key]: e.target.checked }))} />
                <span className="text-sm text-slate-700">{labels[key] || key}</span>
              </label>
            );
          })}
        </div>
      </Modal>

      {/* list */}
      <div className="p-4">
        {accordionGroups.length === 0 ? (
          <div className="py-10 text-center">
            <FileText size={22} className="mx-auto mb-3 text-slate-400" />
            <p className="text-sm font-medium text-slate-600">No {isReport ? 'reports' : 'templates'} found</p>
            <p className="mt-1 text-xs text-slate-400">Try changing your filters.</p>
          </div>
        ) : (
          <>
            {/* column labels — module, lot, generatedOn are sortable */}
            <div className="rtm-col-header" style={{ gridTemplateColumns: isReport ? reportGridCols : templateGridCols }}>
              <span />
              {(isReport ? rvc('module') : tvc('module')) && (
                <span className="rtm-col-sortable" onClick={() => handleSort('module')}>Module <SortIcon field="module" /></span>
              )}
              {isReport
                ? rvc('lot') && <span className="rtm-col-sortable" onClick={() => handleSort('lot')}>Lot <SortIcon field="lot" /></span>
                : <>
                  {tvc('lot') && <span className="rtm-col-sortable" onClick={() => handleSort('lot')}>Lot <SortIcon field="lot" /></span>}
                  {tvc('envLot') && <span>Batch</span>}
                </>
              }
              {(isReport ? rvc('reportName') : tvc('templateName')) && <span>{isReport ? 'Report' : 'Template'}</span>}
              {!isReport && tvc('subName') && <span>Sub Name</span>}
              {(isReport ? rvc('version') : tvc('version')) && <span>Version</span>}
              {(isReport ? rvc('generated') : tvc('generated')) && (
                <span className="rtm-col-sortable" onClick={() => handleSort('generatedOn')}>Generated <SortIcon field="generatedOn" /></span>
              )}
              {!isReport && tvc('downloaded') && <span>Downloaded</span>}
              {(isReport ? rvc('status') : tvc('status')) && <span>Status</span>}
              <span>Action</span>
            </div>

            <div className="rtm-list">
              {paginatedGroups.map(g => renderGroup(g))}
            </div>

            {/* pagination */}
            <div className="rtm-pagination-bar">
              <span className="rtm-pagination-info">
                {Math.min((currentPage - 1) * currentPageSize + 1, accordionGroups.length)}–{Math.min(currentPage * currentPageSize, accordionGroups.length)} of {accordionGroups.length}
              </span>
              <Pagination
                current={currentPage} pageSize={currentPageSize} total={accordionGroups.length}
                showSizeChanger pageSizeOptions={['10', '20', '50', '100']} size="small"
                onChange={(page, size) => {
                  if (isReport) { setReportPage(page); setReportPageSize(size); }
                  else { setTemplatePage(page); setTemplatePageSize(size); }
                }}
              />
            </div>
          </>
        )}
      </div>

      {/* scoped styles */}
      <style>{`
        /* ── sortable column headers ─────────────────────────────────────── */
        .rtm-col-sortable {
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          white-space: nowrap;
          transition: color 0.15s;
        }
        .rtm-col-sortable:hover { color: #475569; }
        .rtm-sort-icon { font-size: 10px; opacity: 0.5; }
        .rtm-sort-icon--active { opacity: 1; color: #3b82f6; font-weight: 700; }

        /* ── column label header ─────────────────────────────────────────── */
        .rtm-col-header {
          display: grid;
          gap: 0 10px;
          padding: 6px 16px 6px 10px;
          margin-bottom: 4px;
          font-size: 11px;
          font-weight: 600;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        /* ── list container ──────────────────────────────────────────────── */
        .rtm-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        /* ── group (accordion item) ──────────────────────────────────────── */
        .rtm-group {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          overflow: hidden;
          background: #fff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
          transition: box-shadow 0.15s, border-color 0.15s;
          cursor: pointer;
          user-select: none;
        }
        .rtm-group:hover {
          box-shadow: 0 3px 8px rgba(0,0,0,0.09);
        }
        .rtm-group--open {
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59,130,246,0.12);
        }
        .rtm-group--single {
          cursor: default;
        }

        /* ── header row ──────────────────────────────────────────────────── */
        .rtm-row--header {
          display: grid;
          gap: 0 10px;
          padding: 13px 16px 13px 10px;
          align-items: center;
          /* grid-template-columns is set via inline style per row */
        }

        .rtm-cell {
          display: flex;
          flex-direction: column;
          gap: 1px;
          min-width: 0;
        }
        .rtm-cell--action { align-items: flex-start; }
        .rtm-cell--icon   { justify-content: center; align-items: center; }

        .rtm-label {
          font-size: 10px;
          font-weight: 600;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          display: none;
        }
        .rtm-val {
          font-size: 13px;
          color: #334155;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .rtm-val--bold  { font-weight: 600; color: #1e293b; }
        .rtm-val--muted { color: #64748b; font-size: 12px; }
        .rtm-val--name  { font-weight: 500; }

        .rtm-version-pill {
          display: inline-block;
          font-size: 11px;
          font-weight: 700;
          color: #3b82f6;
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 5px;
          padding: 1px 7px;
          white-space: nowrap;
        }

        .rtm-chevron { color: #64748b; flex-shrink: 0; }

        /* ── version history table ───────────────────────────────────────── */
        .rtm-versions {
          border-top: 1px solid #f1f5f9;
          background: #f8fafc;
          padding: 14px 18px 18px;
          cursor: default;
        }
        .rtm-versions-label {
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 10px;
        }
        .rtm-versions-scroll {
          overflow-x: auto;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }
        .rtm-vtable {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .rtm-vtable th {
          background: #f8fafc;
          color: #64748b;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          padding: 8px 12px;
          border-bottom: 1px solid #e2e8f0;
          white-space: nowrap;
          text-align: left;
        }
        .rtm-vtable td {
          padding: 9px 12px;
          color: #334155;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: middle;
          white-space: nowrap;
        }
        .rtm-vtable tr:last-child td { border-bottom: none; }
        .rtm-vrow--latest td { background: #f0fdf4; }
        .rtm-fname {
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          display: inline-block;
          vertical-align: middle;
        }

        /* ── pagination ──────────────────────────────────────────────────── */
        .rtm-pagination-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 14px;
          padding: 0 2px;
        }
        .rtm-pagination-info { font-size: 13px; color: #64748b; }

        /* ── responsive ──────────────────────────────────────────────────── */
        @media (max-width: 900px) {
          .rtm-col-header { display: none; }
          .rtm-group .rtm-row--header,
          .rtm-group[data-view="template"] .rtm-row--header {
            grid-template-columns: 22px 1fr 1fr;
            row-gap: 8px;
          }
          .rtm-label { display: block; }
        }
        @media (max-width: 560px) {
          .rtm-group .rtm-row--header,
          .rtm-group[data-view="template"] .rtm-row--header {
            grid-template-columns: 22px 1fr;
          }
        }
      `}</style>
    </section>
  );
};

export default ReportTemplateManagement;
