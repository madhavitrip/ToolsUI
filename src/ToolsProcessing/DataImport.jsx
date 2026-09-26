import React, { useEffect, useRef, useState } from 'react';
import '@ant-design/v5-patch-for-react-19'
import { Row, Col, Card, Select, Upload, Button, Typography, Space, Table, Tabs, Checkbox, Input, Modal, Radio, DatePicker, Popconfirm } from 'antd';
import dayjs from 'dayjs';
import { TriangleAlert, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { MessageService } from "../services/MessageService";
import { useToast } from '../hooks/useToast';
import { CheckCircleOutlined, UploadOutlined, ToolOutlined, SearchOutlined, PlusOutlined, EditOutlined, CloseCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx-js-style';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import API from '../hooks/api';
import axios from 'axios';
import useStore from '../stores/ProjectData';
import { buildReportFileName, resolveTemplateId } from "../utils/rptTemplateUtils";
import useDebounce from '../services/useDebounce';
import MissingData from '../components/MissingData';
import DataImportConflictReport from '../components/DataImportConflictReport';
import LotsBifurcation from "./components/LotsBifurcation";
import MergeCatchNumbers from "./components/MergeCatchNumbers";
import { getCurrentUserId } from "../hooks/useUserMap";

const { Text } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;
const PRIMARY_COLOR = "#1677ff";

const DataImport = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const isConfigured = useStore((state) => state.isConfigured);
  const isLoadingData = useStore((state) => state.isLoadingData);
  const projectId = useStore((state) => state.projectId);
  const selectedLot = useStore((state) => state.selectedLot);
  const addStaleEnvLotIds = useStore((state) => state.addStaleEnvLotIds);
  const setHasDeactivatedCatches = useStore((state) => state.setHasDeactivatedCatches);

  useEffect(() => {
    if (projectId && !isLoadingData && !isConfigured) {
      showToast("Please complete project configuration first", "warning");
      navigate("/projectdashboard");
    }
  }, [projectId, isLoadingData, isConfigured, navigate, showToast]);

  const [fileHeaders, setFileHeaders] = useState([]);
  const [expectedFields, setExpectedFields] = useState([]);
  const [fieldMappings, setFieldMappings] = useState({});
  const [excelData, setExcelData] = useState([]);
  const [conflicts, setConflicts] = useState(null);
  const [conflictSelections, setConflictSelections] = useState({});
  const [showData, setShowData] = useState(false);
  const [existingData, setExistingData] = useState([]); // âœ… default to []
  const [columns, setColumns] = useState([]); // âœ… default to []
  const [loading, setLoading] = useState(false); // âœ… added
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState("1");
  const token = localStorage.getItem('token');
  const [keepZeroQuantity, setKeepZeroQuantity] = useState(false);
  const [skipItems, setSkipItems] = useState(false);
  const [quantity, setQuantity] = useState(0);
  const [isCorrectedNrdataReport, setIsCorrectedNrdataReport] = useState(false);
  const [isChangedNR, setIsChangedNR] = useState(false);
  const [fileList, setFileList] = useState([]);
  const [requiredFieldNames, setRequiredFieldNames] = useState([]);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
  });
  // Uploaded Data search:
  // - globalSearchText => top search bar (key = null)
  // - searchedColumn + columnSearchText => column-specific search (key = searchedColumn)
  const [globalSearchText, setGlobalSearchText] = useState('');
  const [columnFilters, setColumnFilters] = useState({});
  const debouncedGlobalSearchText = useDebounce(globalSearchText, 500);
  const [skippedRows, setSkippedRows] = useState([]);
  const [editableSkippedRows, setEditableSkippedRows] = useState([]); // user-edited cells
  const [selectedUploadedCatchNos, setSelectedUploadedCatchNos] = useState([]);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeModalSeparator, setMergeModalSeparator] = useState("/");
  const [mergeModuleId, setMergeModuleId] = useState(null);
  const [modules, setModules] = useState([]);
  const [loadingModules, setLoadingModules] = useState(false);
  const [uploadedTableSorter, setUploadedTableSorter] = useState({ field: null, order: null });
  const lotBifurcationRef = useRef(null);
  const mergeCatchRef = useRef(null);
  const [mergeSelectionCount, setMergeSelectionCount] = useState(0);
  const [showUploadedDisplayFieldsModal, setShowUploadedDisplayFieldsModal] = useState(false);
  const [uploadedDisplayFields, setUploadedDisplayFields] = useState([]);
  const [addedFieldIds, setAddedFieldIds] = useState([]);
  const [uploadSectionCollapsed, setUploadSectionCollapsed] = useState(false);
  const [shouldOpenBifurcation, setShouldOpenBifurcation] = useState(false);
  const [localLotFilter, setLocalLotFilter] = useState(""); // Local lot number filter

  // 👉 Initialize activeTab from localStorage on mount
  useEffect(() => {
    const savedTab = localStorage.getItem(`dataImportActiveTab_${projectId}`);
    if (savedTab) {
      setActiveTab(savedTab);
    }
  }, [projectId]);

  useEffect(() => {
    const requestedTab = location.state?.activeTab;
    const openBifurcation = location.state?.openBifurcationPanel;

    if (openBifurcation) {
      setShouldOpenBifurcation(true);
    }

    if (requestedTab) {
      handleTabChange(String(requestedTab));
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.activeTab, location.state?.openBifurcationPanel, location.pathname]);

  useEffect(() => {
    if (activeTab === "4" && shouldOpenBifurcation) {
      // The prop handles opening it, so we can clear the trigger after a short delay
      // to ensure the child receives it first.
      const timer = setTimeout(() => setShouldOpenBifurcation(false), 500);
      return () => clearTimeout(timer);
    }
  }, [activeTab, shouldOpenBifurcation]);

  // 👉 Save activeTab to localStorage whenever it changes
  const handleTabChange = (key) => {
    setActiveTab(key);
    localStorage.setItem(`dataImportActiveTab_${projectId}`, key);
  };

  useEffect(() => {
    const storageKey = `uploadedData_displayFields_${projectId || "default"}`;
    const lockedFields = columns.filter((field) => requiredFieldNames.includes(field));

    if (!columns.length) {
      setUploadedDisplayFields([]);
      return;
    }

    const savedValue = localStorage.getItem(storageKey);
    if (savedValue !== null) {
      try {
        const parsed = JSON.parse(savedValue);
        const validSavedFields = Array.isArray(parsed)
          ? parsed.filter((field) => columns.includes(field))
          : [];
        setUploadedDisplayFields(Array.from(new Set([...lockedFields, ...validSavedFields])));
        return;
      } catch (error) {
        console.warn("Failed to restore uploaded data display fields", error);
      }
    }

    setUploadedDisplayFields(Array.from(new Set([...lockedFields, ...columns])));
  }, [columns, projectId, requiredFieldNames]);
  // Load projects
  useEffect(() => {
    if (!projectId) return;
    API.get(`/Fields`)
      .then(res => {
        setExpectedFields(res.data);
        // Fetch project config and build required fields list
        API.get(`/ProjectConfigs/ByProject/${projectId}`)
          .then(configRes => {
            const config = configRes.data;
            const configuredFieldIds = new Set();

            // Collect all field IDs referenced in the project configuration
            (config.envelopeMakingCriteria || []).forEach(id => configuredFieldIds.add(id));
            (config.boxBreakingCriteria || []).forEach(id => configuredFieldIds.add(id));
            (config.duplicateRemoveFields || []).forEach(id => configuredFieldIds.add(id));
            (config.sortingBoxReport || []).forEach(id => configuredFieldIds.add(id));
            (config.innerBundlingCriteria || []).forEach(id => configuredFieldIds.add(id));

            const duplicateCriteria = Array.isArray(config.duplicateCriteria)
              ? config.duplicateCriteria
              : JSON.parse(config.duplicateCriteria || "[]");
            duplicateCriteria.forEach(id => configuredFieldIds.add(id));

            // Resolve field IDs to field names
            const fieldNames = res.data
              .filter(f => configuredFieldIds.has(f.fieldId))
              .map(f => f.name);

            // NRQuantity is always mandatory
            if (!fieldNames.includes("NRQuantity")) {
              fieldNames.push("NRQuantity");
            }

            setRequiredFieldNames(fieldNames);
          })
          .catch(err => {
            if (err.response?.status === 404) {
              console.warn("No project config found, using default required fields");
              setRequiredFieldNames(["NRQuantity"]);
            } else {
              console.error("Failed to fetch project config", err);
            }
          });
      })
      .catch(err => console.error("Failed to fetch fields", err));
  }, [projectId]);

  // 👉 Lazy load Tab 1 (Uploaded Data) - only when tab is clicked
  useEffect(() => {
    if (!projectId || activeTab !== "1") return;
    fetchExistingData(projectId);
  }, [
    projectId,
    activeTab,
    pagination.current,
    pagination.pageSize,
    debouncedGlobalSearchText,
    columnFilters,
    uploadedTableSorter.field,
    uploadedTableSorter.order,
    selectedLot,
    localLotFilter,
  ]);

  const fetchExistingData = async (projectId) => {
    if (!projectId) return;

    setLoading(true);
    try {
      // Use localLotFilter if it's set, otherwise use selectedLot from store
      const effectiveLot = localLotFilter && localLotFilter !== "" && localLotFilter !== "ALL" 
        ? parseInt(localLotFilter, 10) 
        : selectedLot && selectedLot !== "ALL" 
          ? selectedLot 
          : null;
      
      const lotParam = effectiveLot ? { lotNo: effectiveLot } : {};
      const res = await API.get(`/NRDatas/GetByProjectId/${projectId}`, {
        params: {
          pageSize: pagination.pageSize,
          pageNo: pagination.current,
          search: debouncedGlobalSearchText || null,
          filters: Object.keys(columnFilters).length ? JSON.stringify(columnFilters) : null,
          sortField: uploadedTableSorter.field || null,
          sortOrder: uploadedTableSorter.order || null,
          ...lotParam,
        },
      });

      const dynamicKeys = new Set();
      const processedItems = (res.data.items || []).map((item) => {
        let parsedNRDatas = {};
        if (item.NRDatas) {
          try {
            parsedNRDatas = JSON.parse(item.NRDatas);
            if (parsedNRDatas && typeof parsedNRDatas === 'object') {
              Object.keys(parsedNRDatas).forEach(key => {
                if (key !== "ImportRowNo" && key !== "VerificationStatus" && key !== "LotNo") {
                  dynamicKeys.add(key);
                }
              });
            }
          } catch (e) {
            console.error("Error parsing NRDatas JSON", e);
          }
        }
        return {
          ...item,
          ...parsedNRDatas,
          id: item.id ?? item.Id,
        };
      });

      setExistingData(processedItems);

      const baseColumns = (res.data.columns || []).filter((column) =>
        column !== "NRDatas" &&
        column !== "Id" &&
        column !== "ImportRowNo" &&
        column !== "VerificationStatus" &&
        column !== "LotNo" &&
        column !== "EnvLotNo" &&
        column !== "Batch"
      );

      // Combine base columns and dynamic keys
      const allPossibleColumns = [...baseColumns];
      dynamicKeys.forEach(key => {
        if (!allPossibleColumns.includes(key)) {
          allPossibleColumns.push(key);
        }
      });

      // Filter out columns that are null, empty, or 0 for ALL items on the current page
      const activeColumns = allPossibleColumns.filter(col => {
        // Always keep certain critical columns even if empty on this page
        // if (col === "CatchNo" || col === "NRQuantity" || col === "CenterCode" || col === "Pages") return true;
        if (baseColumns.includes(col)) return true;
        return processedItems.some(item => {
          const val = item[col];
          // Check for null, undefined, empty string, or zero (as number or string)
          return val !== null && val !== undefined && val !== "" && val !== 0 && val !== "0";
        });
      });

      setColumns(activeColumns);

      setPagination(prev => ({
        ...prev,
        total: res.data.totalCount
      }));
      useStore.getState().setNrDataCount(res.data.totalCount || 0);
      setShowData(res.data.items && res.data.items.length > 0);
      setSelectedUploadedCatchNos([]);

      // Auto-collapse upload section if data exists, and open if empty
      // Only do this if there are no search filters applied
      const totalCount = res.data.totalCount || 0;
      if (!debouncedGlobalSearchText && Object.keys(columnFilters).length === 0) {
        setUploadSectionCollapsed(totalCount > 0);
      }
    } catch (err) {
      console.error("Failed to fetch existing data", err);
      setExistingData([]);
      setShowData(false);
      setSelectedUploadedCatchNos([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchConflictReport = async () => {
    setActiveTab("2");
    setLoading(true);
    try {
      const lotParam = selectedLot ? { lotNo: selectedLot } : {};
      const res = await API.get(`/NRDatas/ErrorReport`, {
        params: {
          ProjectId: projectId,
          ...lotParam,
        },
      });
      const report = {
        errors: res.data?.errors || res.data?.Errors || [],
      };
      const errors = report.errors;

      if (errors.length > 0) {
        setConflicts(report);
        showToast("Conflict report loaded", "success");
      } else {
        setConflicts({ errors: [] });
        showToast("No conflicts found", "info");
      }
    } catch (err) {
      console.error("Failed to fetch conflict report", err);
      showToast("Failed to load conflict report", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId && activeTab === "2") {
      fetchConflictReport();
    }
  }, [projectId, activeTab, selectedLot]);

  const handleSave = async (record, selectedValue) => {
    const normalizedValue =
      selectedValue === undefined || selectedValue === null
        ? ""
        : String(selectedValue).trim();

    if (normalizedValue === "") {
      showToast('Please enter or select a value before saving.', "warning");
      return;
    }

    if (record.conflictType === "zero_nr_quantity") {
      const parsedValue = Number(normalizedValue);
      const minNrQuantity = record.minNrQuantity;
      const maxNrQuantity = record.maxNrQuantity;

      if (!Number.isFinite(parsedValue) || !Number.isInteger(parsedValue)) {
        showToast("Please enter a valid whole number for NRQuantity.", "warning");
        return;
      }

      if (parsedValue <= 0) {
        showToast("NRQuantity must be greater than 0.", "warning");
        return;
      }

      if (
        minNrQuantity !== undefined &&
        minNrQuantity !== null &&
        maxNrQuantity !== undefined &&
        maxNrQuantity !== null &&
        (parsedValue < minNrQuantity || parsedValue > maxNrQuantity)
      ) {
        showToast(`NRQuantity must be between ${minNrQuantity} and ${maxNrQuantity}.`, "warning");
        return;
      }
    }

    try {
      const payload = {
        conflictType: record.conflictType,
        catchNo: record.catchNo,
        catchNos: record.catchNos || [],
        rowIds: record.rowIds || [],
        importRowNos: record.importRowNos || [],
        uniqueField: record.uniqueField,
        field: record.field,
        selectedValue: normalizedValue,
        centreCode: record.centreCode,
        nodalCode: record.nodalCode,
        nodalCodeGroup: record.nodalCodeGroup,
        collegeName: record.collegeName,
        collegeCode: record.collegeCode,
        collegeKeyType: record.collegeKeyType,
        conflictingValues: record.conflictingValues || [],
        nodalCodes: record.nodalCodes || [],
        centerCodes: record.centerCodes || [],
      };

      const lotParam = selectedLot ? `&lotNo=${selectedLot}` : '';
      await API.put(`/NRDatas?ProjectId=${projectId}${lotParam}`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      showToast(`Resolved conflict for ${record.catchNo || record.sourceValue || record.targetField}`, "success");
      await fetchConflictReport();
      await fetchExistingData(projectId);
    } catch (error) {
      console.error('Error saving resolution:', error);
      showToast('Failed to resolve conflict', "error");
    }
  };
  // Update state when user selects a value from dropdown
  const handleSelectionChange = (conflictKey, value) => {
    setConflictSelections((prev) => ({
      ...prev,
      [conflictKey]: value,
    }));
  };

  const handleIgnoreConflict = async (conflict) => {
    try {
      const lotParam = selectedLot ? `&lotNo=${selectedLot}` : '';
      await API.put(`/NRDatas/conflicts/status?ProjectId=${projectId}${lotParam}`, {
        conflictType: conflict.conflictType,
        catchNo: conflict.catchNo,
        catchNos: conflict.catchNos || [],
        rowIds: conflict.rowIds || [],
        importRowNos: conflict.importRowNos || [],
        uniqueField: conflict.uniqueField,
        field: conflict.field,
        centreCode: conflict.centreCode,
        nodalCode: conflict.nodalCode,
        nodalCodeGroup: conflict.nodalCodeGroup,
        collegeName: conflict.collegeName,
        collegeCode: conflict.collegeCode,
        collegeKeyType: conflict.collegeKeyType,
        conflictingValues: conflict.conflictingValues || [],
        nodalCodes: conflict.nodalCodes || [],
        centerCodes: conflict.centerCodes || [],
        status: "ignored",
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setConflictSelections((prev) => {
        const updated = { ...prev };
        delete updated[conflict.key];
        return updated;
      });

      await fetchConflictReport();
      showToast("Conflict ignored", "success");
    } catch (error) {
      console.error("Error ignoring conflict:", error);
      showToast("Failed to ignore conflict", "error");
    }
  };

  const handleMergeSelectedRows = async (separator) => {
    if (selectedUploadedCatchNos.length !== 2) {
      showToast("Please select rows from exactly 2 catch numbers.", "warning");
      return;
    }

    try {
      setLoading(true);

      const selectedModule = (modules || []).find((m) => m?.id === mergeModuleId) || null;
      console.log("Merge payload module:", {
        moduleId: selectedModule?.id ?? null,
      });

      const lotParam = selectedLot ? `&lotNo=${selectedLot}` : '';
      const res = await API.post(`/NRDatas/merge-catchnos?ProjectId=${projectId}${lotParam}`, {
        catchNos: selectedUploadedCatchNos,
        separator: separator || "/",
        moduleId: selectedModule?.id ?? null
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      showToast(res.data?.message || "Selected rows merged successfully.", "success");
      setSelectedUploadedCatchNos([]);
      await fetchExistingData(projectId);
      await fetchConflictReport();
      setActiveTab("1");
    } catch (error) {
      console.error("Error merging catch numbers:", error);
      const errorMessage =
        error?.response?.data?.message ||
        error?.response?.data ||
        error?.message ||
        "Failed to merge selected rows";
      showToast(errorMessage, "error");
    } finally {
      setLoading(false);
    }
  };

  const openMergeModal = () => {
    if (activeTab !== "1") {
      setActiveTab("1");
    }

    if (selectedUploadedCatchNos.length !== 2) {
      showToast("Please select rows from exactly 2 catch numbers.", "warning");
      return;
    }

    setMergeModalSeparator("/");
    setMergeModuleId(null);
    setMergeModalOpen(true);
  };

  const confirmMerge = async () => {
    setMergeModalOpen(false);
    await handleMergeSelectedRows(mergeModalSeparator);
  };

  const loadModules = async () => {
    try {
      setLoadingModules(true);
      const res = await API.get(`/Modules`);
      setModules(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load modules:", err);
      setModules([]);
      showToast("Failed to load modules", "error");
    } finally {
      setLoadingModules(false);
    }
  };

  useEffect(() => {
    if (!mergeModalOpen) return;
    if ((modules || []).length > 0) return;
    loadModules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mergeModalOpen]);

  const selectedUploadedRowKeys = existingData
    .filter((row) => selectedUploadedCatchNos.includes(row.CatchNo))
    .map((row) => row.id);

  const handleUploadedTableChange = (nextPagination, filters, sorter) => {
    setPagination((prev) => ({
      ...prev,
      current: nextPagination.current,
      pageSize: nextPagination.pageSize,
    }));

    const normalizedSorter = Array.isArray(sorter) ? sorter[0] : sorter;
    setUploadedTableSorter({
      field: normalizedSorter?.field ?? null,
      order: normalizedSorter?.order ?? null,
    });
  };



  const renderConflicts = () => {
    if (!conflicts) return <Text type="secondary">Click "Load Conflict Report" to see conflicts.</Text>;

    const errors = conflicts?.errors || [];
    if (errors.length === 0) {
      return <Text type="success">No conflicts found</Text>;
    }
    return (
      <div>

        <DataImportConflictReport
          conflicts={{ errors }}
          conflictSelections={conflictSelections}
          onSelectionChange={handleSelectionChange}
          onResolve={handleSave}
          onIgnore={handleIgnoreConflict}
          loading={loading}
        />
      </div>
    );
  };

  const getConflictValue = (item, ...keys) => {
    for (const key of keys) {
      if (item?.[key] !== undefined && item?.[key] !== null) {
        return item[key];
      }
    }
    return undefined;
  };

  const toConflictArray = (value) => {
    if (Array.isArray(value)) return value.filter((item) => item !== undefined && item !== null && item !== "");
    if (value === undefined || value === null || value === "") return [];
    return [value];
  };

  const normalizeDataKey = (key) => {
    if (!key) return key;
    const normalized = String(key).replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    return normalized === "importrowno" ? "ImportRowNo" : key;
  };

  const shouldExcludeDataKey = (key) => {
    if (!key) return false;
    const normalized = String(key).replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    return (
      normalized === "a" ||
      normalized === "b" ||
      normalized === "c" ||
      normalized === "d" ||
      normalized === "ccsort" ||
      normalized === "importrowno" ||
      normalized === "routeno" ||
      normalized === "routesort" ||
      normalized === "centersort" ||
      normalized === "nodalsort" ||
      normalized === "quantity" ||
      normalized === "pages"
    );
  };

  const normalizeKey = (key) => String(key || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const highlightAliasGroups = [
    ["catchno", "catchnumber", "catch"],
    ["centercode", "centrecode", "center"],
    ["collegecode", "college"],
    ["collegename", "college"],
    ["nodalcode", "nodal"],
    ["examdate", "examdate"],
    ["examtime", "examtime"],
    ["nrquantity", "nrquantity", "nrqty"],
    ["papercode", "paper"],
    ["remark", "remarks", "remark"],
  ];

  const isHighlightedColumn = (headerKey, highlightKeySet) => {
    const normalized = normalizeKey(headerKey);
    if (highlightKeySet.has(normalized)) {
      return true;
    }
    for (const group of highlightAliasGroups) {
      if (group.includes(normalized)) {
        return group.some((alias) => highlightKeySet.has(alias));
      }
    }
    return false;
  };

  const getHighlightKeysForConflict = (conflictType, item) => {
    switch (normalizeKey(conflictType)) {
      case "catchuniquefield": {
        const uniqueField = getConflictValue(item, "uniqueField", "UniqueField");
        return ["CatchNo", uniqueField].filter(Boolean);
      }
      case "centermultiplenodals":
        return ["CenterCode", "CentreCode", "NodalCode"];
      case "collegemultiplenodals": {
        const collegeKeyType = getConflictValue(item, "collegeKeyType", "CollegeKeyType");
        const collegeKey = collegeKeyType === "CollegeCode" ? "CollegeCode" : "CollegeName";
        return [collegeKey, "NodalCode"];
      }
      case "collegemultiplecenters": {
        const collegeKeyType = getConflictValue(item, "collegeKeyType", "CollegeKeyType");
        const collegeKey = collegeKeyType === "CollegeCode" ? "CollegeCode" : "CollegeName";
        return [collegeKey, "CenterCode", "CentreCode"];
      }
      case "requiredfieldempty":
        return [getConflictValue(item, "field", "Field")].filter(Boolean);
      case "zeronrquantity":
        return ["NRQuantity"];
      case "nodalcodedigitmismatch":
        return ["NodalCode"];
      default:
        return [];
    }
  };

  const downloadConflictReport = () => {
    const rawErrors = Array.isArray(conflicts) ? conflicts : conflicts?.errors || conflicts?.Errors || [];

    if (!rawErrors.length) {
      showToast("No conflicts available to download.", "info");
      return;
    }

    const groupedByType = rawErrors.reduce((acc, item) => {
      const conflictType = getConflictValue(item, "conflictType", "ConflictType") || "unknown";
      if (!acc[conflictType]) {
        acc[conflictType] = [];
      }
      acc[conflictType].push(item);
      return acc;
    }, {});

    const sheetRows = [];
    const highlightCells = [];
    const headerHighlightCells = [];
    const sectionTitleCells = [];
    const groups = Object.entries(groupedByType);

    const getOrderedKeys = (dataKeys) => {
      const preferredOrder = [
        "CollegeCode",
        "CenterCode",
        "NodalCode",
        "CatchNo",
        "PaperCode",
        "ExamDate",
        "ExamTime",
        "NRQuantity",
        "Remark",
      ];
      const orderedKeys = preferredOrder
        .map((key) => dataKeys.find((item) => normalizeKey(item) === normalizeKey(key)))
        .filter(Boolean);
      const remainingKeys = dataKeys.filter(
        (key) => !orderedKeys.some((ordered) => normalizeKey(ordered) === normalizeKey(key))
      );
      return [...orderedKeys, ...remainingKeys];
    };

    groups.forEach(([conflictType, items], groupIndex) => {
      const dataKeySet = new Set();

      items.forEach((item) => {
        const conflictRows = toConflictArray(getConflictValue(item, "rows", "Rows"));
        conflictRows.forEach((row) => {
          const rowData = getConflictValue(row, "data", "Data") || {};
          Object.keys(rowData).forEach((key) => {
            if (shouldExcludeDataKey(key)) return;
            dataKeySet.add(normalizeDataKey(key));
          });
        });
      });

      const dataKeys = Array.from(dataKeySet);
      const headerKeys = getOrderedKeys(dataKeys);

      sheetRows.push([`Conflict Type: ${conflictType}`]);
      sectionTitleCells.push({ rowIndex: sheetRows.length - 1, colCount: headerKeys.length });
      const headerRowIndex = sheetRows.length;
      sheetRows.push(headerKeys);
      const headerIndexMap = headerKeys.reduce((acc, key, index) => {
        acc[normalizeKey(key)] = index;
        return acc;
      }, {});
      const headerHighlightSet = new Set();

      items.forEach((item) => {
        const conflictRows = toConflictArray(getConflictValue(item, "rows", "Rows"));

        if (conflictRows.length === 0) {
          sheetRows.push(headerKeys.map(() => ""));
          return;
        }

        conflictRows.forEach((row) => {
          const rowData = getConflictValue(row, "data", "Data") || {};
          const rowIndex = sheetRows.length;
          const rawHighlightKeys = getHighlightKeysForConflict(conflictType, item)
            .filter(Boolean)
            .map((key) => String(key));
          const highlightKeySet = new Set(rawHighlightKeys.map((key) => normalizeKey(key)));
          const rowValues = headerKeys.map((key) => {
            const value = rowData[key] ?? rowData[normalizeDataKey(key)] ?? "";
            return value;
          });
          sheetRows.push(rowValues);

          const highlightIndexes = headerKeys
            .map((key, index) => (isHighlightedColumn(key, highlightKeySet) ? index : -1))
            .filter((index) => index >= 0);

          if (highlightIndexes.length > 0) {
            const colorMap = {
              catch_unique_field: "FFF3CD",
              center_multiple_nodals: "D1ECF1",
              college_multiple_nodals: "D4EDDA",
              college_multiple_centers: "F8D7DA",
              required_field_empty: "E2E3E5",
              zero_nr_quantity: "CCE5FF",
              nodal_code_digit_mismatch: "FFE5B4",
            };
            const colorKey = normalizeKey(conflictType);
            const color = colorMap[colorKey] || "FFF2CC";
            highlightCells.push({ rowIndex, colIndexes: highlightIndexes, color });
            highlightIndexes.forEach((index) => headerHighlightSet.add(index));
          }
        });
      });
      if (headerHighlightSet.size > 0) {
        const colorKey = normalizeKey(conflictType);
        const headerColorMap = {
          catch_unique_field: "FFE8A1",
          center_multiple_nodals: "BFE7F2",
          college_multiple_nodals: "C8E6C9",
          college_multiple_centers: "F5C6CB",
          required_field_empty: "D6D8DB",
          zero_nr_quantity: "B8DAFF",
          nodal_code_digit_mismatch: "FFD59A",
        };
        const headerColor = headerColorMap[colorKey] || "FFE8A1";
        headerHighlightCells.push({
          rowIndex: headerRowIndex,
          colIndexes: Array.from(headerHighlightSet),
          color: headerColor,
        });
      }

      if (groupIndex < groups.length - 1) {
        sheetRows.push([]);
      }
    });

    const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
    const columnWidths = (sheetRows[1] || []).map((_, columnIndex) => {
      const maxLength = sheetRows.reduce((max, row) => {
        if (Array.isArray(row) && row[0] && String(row[0]).startsWith("Conflict Type:")) {
          return max;
        }
        const value = row[columnIndex];
        if (value === undefined || value === null) return max;
        return Math.max(max, String(value).length);
      }, 10);
      return { wch: Math.min(Math.max(maxLength + 2, 12), 40) };
    });
    worksheet["!cols"] = columnWidths;

    highlightCells.forEach(({ rowIndex, colIndexes, color }) => {
      colIndexes.forEach((colIndex) => {
        const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
        if (!worksheet[cellAddress]) {
          worksheet[cellAddress] = { t: "s", v: "" };
        }
        worksheet[cellAddress].s = {
          fill: {
            patternType: "solid",
            fgColor: { rgb: color || "FFF2CC" },
            bgColor: { rgb: color || "FFF2CC" },
          },
        };
      });
    });

    headerHighlightCells.forEach(({ rowIndex, colIndexes, color }) => {
      colIndexes.forEach((colIndex) => {
        const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
        if (!worksheet[cellAddress]) {
          worksheet[cellAddress] = { t: "s", v: "" };
        }
        worksheet[cellAddress].s = {
          font: { bold: true, color: { rgb: "000000" } },
          fill: {
            patternType: "solid",
            fgColor: { rgb: color || "FFE8A1" },
            bgColor: { rgb: color || "FFE8A1" },
          },
        };
      });
    });

    worksheet["!merges"] = worksheet["!merges"] || [];
    sectionTitleCells.forEach(({ rowIndex, colCount }) => {
      const lastCol = Math.max(0, colCount - 1);
      worksheet["!merges"].push({
        s: { r: rowIndex, c: 0 },
        e: { r: rowIndex, c: lastCol },
      });
      for (let c = 0; c <= lastCol; c += 1) {
        const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c });
        if (!worksheet[cellAddress]) {
          worksheet[cellAddress] = { t: "s", v: c === 0 ? sheetRows[rowIndex][0] : "" };
        }
        worksheet[cellAddress].s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: {
            patternType: "solid",
            fgColor: { rgb: "4B6CB7" },
            bgColor: { rgb: "4B6CB7" },
          },
          alignment: { horizontal: "left", vertical: "center" },
        };
      }
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Conflict Report");

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `conflict_report_${timestamp}.xlsx`;

    XLSX.writeFile(workbook, filename, { bookType: "xlsx", cellStyles: true, compression: true });
    showToast(`Downloaded conflict report with ${rawErrors.length} conflicts.`, "success");
  };

  const downloadConflictReportPdf = () => {
    const rawErrors = Array.isArray(conflicts) ? conflicts : conflicts?.errors || conflicts?.Errors || [];

    if (!rawErrors.length) {
      showToast("No conflicts available to download.", "info");
      return;
    }

    const groupedByType = rawErrors.reduce((acc, item) => {
      const conflictType = getConflictValue(item, "conflictType", "ConflictType") || "unknown";
      if (!acc[conflictType]) {
        acc[conflictType] = [];
      }
      acc[conflictType].push(item);
      return acc;
    }, {});

    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 28;
    let isFirstSection = true;

    const getOrderedKeys = (dataKeys) => {
      const preferredOrder = [
        "CollegeCode",
        "CenterCode",
        "NodalCode",
        "CatchNo",
        "PaperCode",
        "ExamDate",
        "ExamTime",
        "NRQuantity",
        "Remark",
      ];
      const orderedKeys = preferredOrder
        .map((key) => dataKeys.find((item) => normalizeKey(item) === normalizeKey(key)))
        .filter(Boolean);
      const remainingKeys = dataKeys.filter(
        (key) => !orderedKeys.some((ordered) => normalizeKey(ordered) === normalizeKey(key))
      );
      return [...orderedKeys, ...remainingKeys];
    };

    Object.entries(groupedByType).forEach(([conflictType, items], index) => {
      const dataKeySet = new Set();
      const rows = [];
      const rowHighlights = [];

      items.forEach((item) => {
        const conflictRows = toConflictArray(getConflictValue(item, "rows", "Rows"));
        conflictRows.forEach((row) => {
          const rowData = getConflictValue(row, "data", "Data") || {};
          Object.keys(rowData).forEach((key) => {
            if (shouldExcludeDataKey(key)) return;
            dataKeySet.add(normalizeDataKey(key));
          });
        });
      });

      const headerKeys = getOrderedKeys(Array.from(dataKeySet));

      items.forEach((item) => {
        const conflictRows = toConflictArray(getConflictValue(item, "rows", "Rows"));
        conflictRows.forEach((row) => {
          const rowData = getConflictValue(row, "data", "Data") || {};
          rows.push(
            headerKeys.map((key) => rowData[key] ?? rowData[normalizeDataKey(key)] ?? "")
          );

          const rawHighlightKeys = getHighlightKeysForConflict(conflictType, item)
            .filter(Boolean)
            .map((key) => String(key));
          const highlightKeySet = new Set(rawHighlightKeys.map((key) => normalizeKey(key)));
          const highlightIndexes = headerKeys
            .map((key, colIndex) => (isHighlightedColumn(key, highlightKeySet) ? colIndex : -1))
            .filter((colIndex) => colIndex >= 0);
          rowHighlights.push(highlightIndexes);
        });
      });

      if (!isFirstSection) {
        doc.addPage();
      }
      isFirstSection = false;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(`Conflict Type: ${conflictType}`, marginX, 40);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);

      autoTable(doc, {
        head: [headerKeys],
        body: rows.length ? rows : [["No rows"]],
        startY: 60,
        margin: { left: marginX, right: marginX },
        tableWidth: pageWidth - marginX * 2,
        styles: {
          font: "helvetica",
          fontSize: 8,
          cellPadding: 4,
          valign: "middle",
          lineColor: [220, 220, 220],
          lineWidth: 0.5,
        },
        headStyles: {
          fillColor: [22, 119, 255],
          textColor: 255,
          fontStyle: "bold",
        },
        alternateRowStyles: {
          fillColor: [245, 247, 250],
        },
        didParseCell: (data) => {
          if (data.section !== "body") return;
          const highlightCols = rowHighlights[data.row.index] || [];
          if (highlightCols.includes(data.column.index)) {
            data.cell.styles.fillColor = [255, 243, 205];
          }
        },
        didDrawPage: (data) => {
          doc.setFontSize(9);
          doc.text(
            `Page ${doc.internal.getNumberOfPages()}`,
            pageWidth - marginX,
            doc.internal.pageSize.getHeight() - 12,
            { align: "right" }
          );
        },
      });
    });

    const timestamp = new Date().toISOString().slice(0, 10);
    doc.save(`conflict_report_${timestamp}.pdf`);
    showToast(`Downloaded conflict report PDF (${rawErrors.length} conflicts).`, "success");
  };

  // Excel parsing
  const proceedWithReading = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      const headers = jsonData[0];
      const rows = jsonData.slice(1).map(row => {
        let rowData = {};
        headers.forEach((header, index) => {
          const value = row[index];  // Define the value variable based on the current row's data
          rowData[header] = value;

          if (header === "ExamDate" && value) {
            rowData[header] = parseDate(value); // Parse date if it's for "ExamDate"
          }
        });

        return rowData;
      });

      setFileHeaders(headers);
      setExcelData(rows);
      setShowData(true);

      // Auto-map fields once after reading the file
      if (expectedFields.length > 0) {
        autoMapFields(headers, expectedFields);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const beforeUpload = (file) => {
    setFileList([file]); // Show the selected file
    setFileHeaders([]);
    setFieldMappings({});
    setAddedFieldIds([]);
    proceedWithReading(file);
    return false; // prevent auto upload
  };

  const autoMapFields = (headers, expected) => {
    const newMappings = {};
    const normalize = (str) => str.trim().toLowerCase().replace(/\s+/g, "");

    const keywordMappings = {
      catchno: ["catch", "catch number"],
      nodalcode: ["nodal", "nodal code"],
      examdate: ["date", "exam date"],
      examtime: ["time", "exam time"],
      nrquantity: ["count", "Nr", "cnt"],
      centercode: ["centre", "centre code"]
    };

    expected.forEach((expectedField) => {
      const normalizedExpected = normalize(expectedField.name);

      // Step 1: Try exact match
      const exactMatch = headers.find(
        (header) => normalize(header) === normalizedExpected
      );

      if (exactMatch) {
        newMappings[expectedField.fieldId] = exactMatch;
        return;
      }

      // Step 2: Try keyword-based matching
      const possibleKeywords = keywordMappings[normalizedExpected] || [];
      const keywordMatch = headers.find((header) => {
        const normalizedHeader = normalize(header);
        return possibleKeywords.some((keyword) =>
          normalizedHeader.includes(normalize(keyword))
        );
      });

      if (keywordMatch) {
        newMappings[expectedField.fieldId] = keywordMatch;
      }
    });

    setFieldMappings(newMappings);
  };

  const handleRemove = (file) => {
    setFileList([]); // Since only one file is allowed
    setFileHeaders([]);
    setFieldMappings({});
    setAddedFieldIds([]);
  };

  const isAnyFieldMapped = () => {
    return expectedFields.some(field => fieldMappings[field.fieldId]);
  };
  const resetForm = () => {
    setFileHeaders([]);
    setFileList([]);
    setFieldMappings({});
    setAddedFieldIds([]);
    setExcelData([]);
    setConflicts(null);
    setSkipItems(false)
    setQuantity(0);
    setKeepZeroQuantity(false);
    setIsCorrectedNrdataReport(false);
    setIsChangedNR(false);
    setSkippedRows([]);
    setEditableSkippedRows([]);
  };

  const handleUpload = async () => {
    // Validate required fields mapping
    const missingRequiredFieldNames = requiredFieldNames.filter(fieldName => {
      const field = expectedFields.find(f => f.name === fieldName);
      return !field || !fieldMappings[field.fieldId];
    });

    if (missingRequiredFieldNames.length > 0) {
      showToast(`Please map all required fields: ${missingRequiredFieldNames.join(", ")}`, "error");
      return;
    }

    let mappedData = getMappedData();

    // Keep the original Excel row number in NRDatas JSON for conflict display.
    mappedData = mappedData.map(({ _rowIndex, _missingFields, ...cleanRow }) => ({
      ...cleanRow,
      ImportRowNo: String(Number(_rowIndex) + 2),
    }));

    if (mappedData.length === 0) {
      showToast("No valid rows to upload. Please map correctly and upload a file with data.", "error");
      return;
    }

    setLoading(true);
    setUploading(true);

    if (keepZeroQuantity) {
      mappedData = mappedData.map((row) => {
        if (row.NRQuantity === 0) row.NRQuantity = quantity;
        return row;
      });
    }
    if (skipItems) {
      mappedData = mappedData.filter((row) => row.NRQuantity !== 0);
    }
    const payload = {
      projectId: Number(projectId),
      isCorrectedNrdataReport,
      isChangedNR,
      data: mappedData.map(row => ({
        ...row,
        ExamDate: String(row.ExamDate),
      }))
    };

    try {
      let batchId = null;

      if (isCorrectedNrdataReport) {
        const changedRes = await API.post(`/ChangedNr`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Changed NRData full response:', JSON.stringify(changedRes.data, null, 2));
        batchId = changedRes?.data?.Batch || changedRes?.data?.batch;
        console.log('Extracted batchId from ChangedNr:', batchId);
        showToast(`Corrected NRData report uploaded (${mappedData.length} rows).`, "success");
      } else {
        const lotParam = selectedLot ? `?lotNo=${selectedLot}` : '';
        const res = await API.post(`/NRDatas${lotParam}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log('NRDatas full response:', JSON.stringify(res.data, null, 2));
        batchId = res?.data?.Batch || res?.data?.batch;
        console.log('Extracted batchId from NRDatas:', batchId);
        showToast(`Validation successful! ${mappedData.length} rows uploaded.`, "success");
      }

      // If it's a Changed NR upload, run duplicate processing
      if (isChangedNR) {
        try {
          console.log('Captured batchId from response:', batchId);
          console.log('Running duplicate processing for project:', projectId, 'batch:', batchId);

          if (!batchId || batchId <= 0) {
            showToast("Warning: Could not determine batch ID, processing entire project", "warning");
            console.warn('Batch ID is invalid, will process entire project');
          }

          showToast("Processing duplicates...", "info");

          // Call duplicate endpoint with batchId parameter
          const duplicateEndpoint = batchId && batchId > 0
            ? `/Duplicate?ProjectId=${projectId}&batchId=${batchId}`
            : `/Duplicate?ProjectId=${projectId}`;

          console.log('Calling duplicate endpoint:', duplicateEndpoint);

          const duplicateRes = await API.post(duplicateEndpoint, {}, {
            headers: { Authorization: `Bearer ${token}` }
          });

          console.log('Duplicate response:', duplicateRes.data);
          const duplicatesRemoved = duplicateRes?.data?.mergedRows ?? 0;
          showToast(`Duplicate processing completed for batch ${batchId || 'project'}. Duplicates removed: ${duplicatesRemoved}`, "success");
        } catch (dupErr) {
          console.error("Error running duplicate processing:", dupErr);
          const dupErrorMessage = dupErr?.response?.data?.message || dupErr?.response?.data || dupErr?.message || "Failed to run duplicate processing";
          showToast(dupErrorMessage, "error");
        }
      }

      resetForm();
      setIsChangedNR(false);
      fetchExistingData(projectId);
    } catch (err) {
      console.error("Validation failed", err);

      const errorMessage =
        err?.response?.data?.message ||
        err?.response?.data ||
        err?.message ||
        "Validation failed";

      showToast(errorMessage, "error");
      resetForm();
    } finally {
      setLoading(false);
      setUploading(false);
      setFileList([]);
    }
  };

  // const areRequiredFieldsMapped = () => {
  //   if (requiredFieldNames.length === 0) return true;
  //   return requiredFieldNames.every(fieldName => {
  //     const field = expectedFields.find(f => f.name === fieldName);
  //     return field && fieldMappings[field.fieldId];
  //   });
  // };

  const getMappedData = () => {
    if (!excelData.length || !fileHeaders.length) return [];
    const skipped = [];
    const mapped = excelData.map((row, rowIndex) => {
      const mappedRow = {};
      let isRowValid = true;
      const missingFields = [];

      expectedFields.forEach((field) => {
        const column = fieldMappings[field.fieldId];
        if (column) {
          let value = row[column] ?? null;
          if (field.name === "ExamDate" && value) {
            value = formatDateForBackend(parseDate(value));
          }
          if (requiredFieldNames.includes(field.name) && (value === null || value === undefined || value === "")) {
            isRowValid = false;
            missingFields.push(field.name);
          }
          mappedRow[field.name] = value;
        }
      });

      // Skip rows that are completely empty across all mapped columns
      const hasAnyValue = Object.values(mappedRow).some(v => v !== null && v !== undefined && v !== "");
      if (!hasAnyValue) return null;

      // If missing required fields, push to skipped to show in the UI table
      if (!isRowValid) {
        skipped.push({
          _rowIndex: rowIndex,
          _missingFields: missingFields,
          ...mappedRow,
        });
      }

      // ALWAYS return the row (with its index so we can merge edits later)
      return { _rowIndex: rowIndex, ...mappedRow };
    }).filter(row => row !== null);

    setSkippedRows(skipped);
    // Initialise editable state from the skipped rows (preserve any prior edits for the same row index)    
    setEditableSkippedRows(prev => {
      const prevByIndex = {};
      prev.forEach(r => { prevByIndex[r._rowIndex] = r; });
      return skipped.map(r => prevByIndex[r._rowIndex] ?? { ...r });
    });
    return mapped;
  };

  const formatDateForBackend = (date) => {
    if (date instanceof Date && !isNaN(date.getTime())) {
      const day = String(date.getDate()).padStart(2, '0'); // Ensure two-digit day
      const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-based, so add 1
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    }
    return date; // Return the original value if it's not a valid date
  };

  const handleColumnSearch = (selectedKeys, confirm, dataIndex) => {
    confirm?.();
    const value = (selectedKeys?.[0] ?? "").toString();
    setColumnFilters((prev) => {
      const nextFilters = { ...prev };
      if (value) {
        nextFilters[dataIndex] = value;
      } else {
        delete nextFilters[dataIndex];
      }
      return nextFilters;
    });
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const handleColumnReset = (clearFilters, dataIndex) => {
    clearFilters?.();
    setColumnFilters((prev) => {
      const nextFilters = { ...prev };
      delete nextFilters[dataIndex];
      return nextFilters;
    });
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const getColumnSearchProps = (dataIndex) => ({
    filterDropdown: ({
      setSelectedKeys,
      selectedKeys,
      confirm,
      clearFilters,
    }) => (
      <div style={{ padding: 8 }}>
        <Input
          autoFocus
          placeholder={`Search ${dataIndex}`}
          value={selectedKeys[0] || columnFilters[dataIndex] || ""}
          onChange={(e) => {
            const val = e.target.value;
            setSelectedKeys(val ? [val] : []);
          }}
          onPressEnter={() => handleColumnSearch(selectedKeys, confirm, dataIndex)}
          style={{ width: 188, marginBottom: 8, display: 'block' }}
        />
        <Space size={8}>
          <Button
            type="primary"
            size="small"
            onClick={() => handleColumnSearch(selectedKeys, confirm, dataIndex)}
            disabled={!selectedKeys?.[0] && !columnFilters[dataIndex]}
          >
            Search
          </Button>
          <Button
            size="small"
            onClick={() => handleColumnReset(clearFilters, dataIndex)}
            disabled={!columnFilters[dataIndex]}
          >
            Reset
          </Button>
        </Space>
      </div>
    ),
    filterIcon: () => (
      <SearchOutlined style={{ color: columnFilters[dataIndex] ? '#1890ff' : undefined }} />
    ),
    filteredValue: columnFilters[dataIndex] ? [columnFilters[dataIndex]] : null,
    render: text =>
      columnFilters[dataIndex] ? (
        <span style={{ color: '#1890ff' }}>{text}</span>
      ) : (
        text
      ),
  });

  const parseDateValue = (val) => {
    if (!val) return null;

    const d = dayjs(val, "DD-MM-YYYY", true); // <-- true enables strict parsing

    return d.isValid() ? d : null;
  };

  // Build a set of unique field names from master fields — these are NOT editable in the uploaded data tab
  const uniqueFieldNames = new Set(
    (expectedFields || [])
      .filter(f => f.isUnique === true)
      .map(f => f.name)
  );

  // columnsFromBackend = response.columns
  const enhancedColumns = [
    ...columns.map(col => ({
      title: col,
      dataIndex: col,
      key: col,
      fixed: col === 'CatchNo' ? 'left' : undefined,
      ellipsis: true,
      ...getColumnSearchProps(col),
      sorter: true,
      sortOrder: uploadedTableSorter.field === col ? uploadedTableSorter.order : null,
      render: (text, record) => {
        if (editingRowId === record.id) {
          // Unique fields, LotNo, and CatchNo are NOT editable
          if (uniqueFieldNames.has(col) || col.toLowerCase() === 'lotno' || col.toLowerCase() === 'catchno') {
            return <span style={{ color: '#8c8c8c', cursor: 'not-allowed' }} title={`${col} – cannot be edited`}>{text}</span>;
          }
          if (col === 'ExamDate') {
            return (
              <DatePicker
                size="small"
                format="DD-MM-YYYY"
                value={parseDateValue(editFormData[col] ?? text)}
                onChange={(date) => handleFieldChange(col, date ? date.format("DD-MM-YYYY") : "")}
                style={{ width: '100%' }}
              />
            );
          }
          return (
            <Input
              size="small"
              value={editFormData[col] ?? text}
              onChange={(e) => handleFieldChange(col, e.target.value)}
              style={{ width: '100%' }}
            />
          );
        }
        return text;
      }
    })),
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 80,
      render: (_, record) => {
        if (editingRowId === record.id) {
          return (
            <Space size="small">
              <Button
                type="link"
                size="small"
                onClick={handleSaveEdit}
                loading={loading}
                style={{ padding: 0, color: '#52c41a', fontSize: '16px' }}
                title="Save"
              >
                <CheckCircleOutlined />
              </Button>
              <Button
                type="link"
                size="small"
                onClick={handleCancelEdit}
                style={{ padding: 0, color: '#ff4d4f', fontSize: '16px' }}
                title="Cancel"
              >
                <CloseCircleOutlined />
              </Button>
            </Space>
          );
        }
        return (
          <Space size="small">
            <Button
              type="link"
              size="small"
              onClick={() => handleEditRow(record)}
              style={{ padding: 0, fontSize: '16px' }}
              title="Edit"
            >
              <EditOutlined />
            </Button>
            <Popconfirm
              title="Delete row"
              description={`Are you sure you want to delete this row?`}
              onConfirm={async () => {
                await handleDeleteRow(record);
              }}
              okText="Yes"
              cancelText="No"
              okButtonProps={{ danger: true }}
            >
              <Button
                type="link"
                size="small"
                style={{ padding: 0, color: '#ff4d4f', fontSize: '16px' }}
                title="Delete"
              >
                <DeleteOutlined />
              </Button>
            </Popconfirm>
          </Space>
        );
      }
    }
  ];

  const visibleEnhancedColumns = enhancedColumns.filter((column) => {
    if (column.key === 'actions') {
      return true;
    }

    return uploadedDisplayFields.includes(column.dataIndex);
  });

  const lockedUploadedFields = columns.filter((field) => requiredFieldNames.includes(field));

  const handleDeleteRow = async (record) => {
    if (!record?.id) return;
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      // Soft-delete this specific NRData row by setting Status = false
      // Before deleting, determine which EnvLot (if any) this catch belongs to so we can mark it stale
      const catchNo = record?.CatchNo ?? record?.catchNo ?? null;
      try {
        if (catchNo && projectId) {
          const envLotsRes = await API.get(`/NRDataLots/GetAssignedEnvLotCatches/${projectId}`, selectedLot ? { params: { lotNo: selectedLot } } : {});
          const assignedLot = (envLotsRes?.data || []).find(l => Array.isArray(l.catches) && l.catches.includes(String(catchNo)));
          if (assignedLot && assignedLot.envLotNo) {
            addStaleEnvLotIds([Number(assignedLot.envLotNo)]);
          }
        }
      } catch (err) {
        console.error("Failed to determine EnvLot before deletion", err);
      }

      const lotParam = selectedLot ? `?lotNo=${selectedLot}` : '';
      await API.put(`/NRDatas/UpdateSingle/${record.id}${lotParam}`, { Status: false }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Notify other parts of app that catches changed
      setHasDeactivatedCatches(true);

      showToast("Row deleted successfully", "success");
      // Refresh table
      await fetchExistingData(projectId);
    } catch (err) {
      console.error("Error deleting row:", err);
      const errorMsg = err?.response?.data || err?.message || "Failed to delete row";
      showToast(errorMsg, "error");
    } finally {
      setLoading(false);
    }
  };

  const [masterFields, setMasterFields] = useState([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [addRowOpen, setAddRowOpen] = useState(false);
  const [newRow, setNewRow] = useState({
    catchNo: "",
    fields: {},
    extraFields: [],
  });
  const [configuredFields, setConfiguredFields] = useState([]);
  const [editingRowId, setEditingRowId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [originalEditFormData, setOriginalEditFormData] = useState({});

  // const rerunDuplicateTool = async () => {
  //   try {
  //     await API.post(`/Duplicate?ProjectId=${projectId}`, null, {
  //       headers: { Authorization: `Bearer ${token}` },
  //     });
  //   } catch (err) {
  //     console.error("Duplicate tool rerun failed:", err);
  //     showToast("Data saved, but duplicate tool rerun failed", "warning");
  //   }
  // };

  // Runs envelope breaking + box breaking for a single lot only.
  // skipReset=true ensures global ReportStatus is NOT wiped for other lots.
  // const runTargetedPipelineForLot = async (lotNo, catchNo = null) => {
  //   if (!lotNo) return;

  //   try {
  //     // Envelope breaking for this lot only (picks up eligible-step rows naturally)
  //     // Now passing catchNo to support incremental sequence continuity
  //     const queryParams = new URLSearchParams({
  //         ProjectId: projectId,
  //         skipReset: 'true',
  //         lotNo: lotNo
  //     });
  //     if (catchNo) queryParams.append('catchNo', catchNo);

  //     await API.post(
  //       `/EnvelopeBreakageProcessing/ProcessEnvelopeBreaking?${queryParams.toString()}`,
  //       null,
  //       { headers: { Authorization: `Bearer ${token}` } }
  //     );
  //   } catch (err) {
  //     // Envelope breaking may not be configured for every project — log and continue
  //     console.warn("Targeted envelope breaking skipped or failed (may be expected):", err?.response?.data || err);
  //   }

  //   try {
  //     // Box breaking for this specific lot only (skip global reset)
  //     await API.post(
  //       `/BoxBreakingProcessing/ProcessBoxBreaking?ProjectId=${projectId}&LotNo=${lotNo}&skipReset=true`,
  //       null,
  //       { headers: { Authorization: `Bearer ${token}` } }
  //     );
  //     showToast(`Pipeline updated for lot ${lotNo}`, "success");

  //     // Trigger "Outer" template regeneration if a specific catch was added
  //     if (catchNo) {
  //         await triggerOuterTemplateRegeneration(catchNo);
  //     }
  //   } catch (err) {
  //     console.error("Targeted box breaking failed:", err?.response?.data || err);
  //     showToast("Catch added, but pipeline run for this lot failed. Please re-run manually.", "warning");
  //   }
  // };

  const triggerOuterTemplateRegeneration = async (catchNo) => {
    try {
      const groupId = localStorage.getItem("selectedGroup");
      const typeId = localStorage.getItem("selectedType");
      const rptApiUrl = import.meta.env.VITE_RPT_API_URL;
      const projectName = useStore.getState().projectName;

      if (!rptApiUrl) {
        console.warn("RPT API URL not configured, skipping auto-regeneration.");
        return;
      }

      // 1. Fetch templates to find "Outer" envelope template
      const templatesRes = await API.get("/RPTTemplates/by-group", {
        params: { groupId, typeId, projectId }
      });

      const templates = templatesRes.data || [];
      // Look for template with "Outer" and "Envelope" in name
      const outerTemplate = templates.find(t => {
        const name = (t.templateName || "").toLowerCase();
        return name.includes("outer") && name.includes("envelope");
      });

      if (!outerTemplate) {
        console.warn("Outer envelope template not found for auto-regeneration.");
        return;
      }

      const templateId = resolveTemplateId(outerTemplate);

      // 2. Trigger generation via RPT Microservice
      const payload = {
        projectId: Number(projectId),
        templateId: Number(templateId),
        CatchNos: catchNo // Map single catch to CatchNos filter
      };

      const res = await axios.post(`${rptApiUrl}/report/generate-dynamic`, payload, { responseType: 'blob' });

      // Extract file path from response headers
      const filePath = res.headers['x-generated-file-path'] ||
        res.headers['X-Generated-File-Path'] ||
        res.headers['X-GENERATED-FILE-PATH'] || null;

      const fileName = buildReportFileName({
        templateName: outerTemplate.templateName,
        projectName: projectName || (projectId ? `Project ${projectId}` : undefined),
        typeId: outerTemplate.typeId || typeId,
        envLotNumbers: [parseInt(catchNo)], // Store as single-item array for utility compatibility
      });

      // 3. Save the generated report info to database (EnvelopeLotReports table)
      let currentUserId = localStorage.getItem('userId');
      if (!currentUserId || currentUserId === 'undefined') {
        const userData = localStorage.getItem('userData');
        if (userData) {
          try {
            const parsed = JSON.parse(userData);
            currentUserId = parsed.userId ?? parsed.UserId ?? parsed.id ?? parsed.Id ?? null;
          } catch (e) {
            // ignore
          }
        }
      }
      if (currentUserId && currentUserId !== 'undefined') {
        currentUserId = Number(currentUserId);
        if (isNaN(currentUserId)) {
          currentUserId = null;
        }
      } else {
        currentUserId = null;
      }

      const reportData = {
        projectId: Number(projectId),
        templateId,
        templateName: outerTemplate.templateName,
        envLotNumbers: catchNo,
        fileName,
        generatedByUserId: currentUserId ? Number(currentUserId) : null,
        filePath: filePath,
        lotNo: null // Auto-generated reports don't have a specific lot number
      };

      await API.post('/EnvelopeLotReports', reportData);
      showToast("Outer template regenerated for catch " + catchNo, "success");

    } catch (err) {
      console.error("Failed to regenerate outer template:", err);
      // Don't show error toast to user if auto-generation fails, as the catch was already added successfully.
    }
  };

  const fetchMasterFields = async () => {
    try {
      setLoadingFields(true);

      const [fieldsRes, configRes] = await Promise.all([
        API.get("/Fields"),
        API.get(`/ProjectConfigs/ByProject/${projectId}`)
      ]);

      const allFields = fieldsRes.data || [];
      const config = configRes.data;

      // Collect all field IDs referenced in the project configuration
      const configuredFieldIds = new Set();
      (config.envelopeMakingCriteria || []).forEach(id => configuredFieldIds.add(id));
      (config.boxBreakingCriteria || []).forEach(id => configuredFieldIds.add(id));
      (config.duplicateRemoveFields || []).forEach(id => configuredFieldIds.add(id));
      (config.sortingBoxReport || []).forEach(id => configuredFieldIds.add(id));
      (config.innerBundlingCriteria || []).forEach(id => configuredFieldIds.add(id));

      const duplicateCriteria = Array.isArray(config.duplicateCriteria)
        ? config.duplicateCriteria
        : JSON.parse(config.duplicateCriteria || "[]");
      duplicateCriteria.forEach(id => configuredFieldIds.add(id));

      // Filter fields that are in the project configuration
      // Exclude CatchNo, NRQuantity, LotNo, Pages as they are hardcoded in the form
      const fieldsToShow = allFields.filter(f =>
        configuredFieldIds.has(f.fieldId) &&
        !["CatchNo", "NRQuantity", "LotNo", "Pages"].includes(f.name)
      );

      setMasterFields(allFields);
      setConfiguredFields(fieldsToShow);

    } catch (err) {
      console.error("Failed to load fields:", err);
      showToast("Failed to load fields", "error");
    } finally {
      setLoadingFields(false);
    }
  };

  const handleInlineSave = async () => {
    // Trim and validate CatchNo
    const catchNo = newRow.catchNo?.trim();

    if (!catchNo) {
      showToast("Catch No is required", "warning");
      return;
    }

    // Validate mandatory fields: NRQuantity, LotNo, Pages
    const mandatoryFields = ["NRQuantity", "LotNo", "Pages"];
    const missingMandatory = mandatoryFields.filter(fieldName => {
      const value = newRow.fields[fieldName];
      return !value || String(value).trim() === "";
    });

    if (missingMandatory.length > 0) {
      showToast(`Please fill mandatory fields: ${missingMandatory.join(", ")}`, "warning");
      return;
    }

    // Check if all other required fields from configuration are filled
    const missingRequired = requiredFieldNames.filter(fieldName => {
      // Skip CatchNo (already validated) and mandatory fields (already validated)
      if (fieldName === "CatchNo" || mandatoryFields.includes(fieldName)) {
        return false;
      }
      const value = newRow.fields[fieldName];
      return !value || String(value).trim() === "";
    });

    if (missingRequired.length > 0) {
      showToast(`Please fill required fields: ${missingRequired.join(", ")}`, "warning");
      return;
    }

    try {
      // Build the data object for the new row
      const rowData = {
        CatchNo: catchNo,
        ...newRow.fields
      };

      // Add extra fields to the row data
      (newRow.extraFields || []).forEach(f => {
        if (f.key && f.key.trim() !== "") {
          rowData[f.key] = f.value || "";
        }
      });

      // Verify if new values exist in the database (excluding catchno, quantity, nrquantity, lotno, pages)
      const fieldsToVerify = Object.keys(rowData).filter(
        (col) =>
          col.toLowerCase() !== "catchno" &&
          col.toLowerCase() !== "quantity" &&
          col.toLowerCase() !== "nrquantity" &&
          col.toLowerCase() !== "lotno" &&
          col.toLowerCase() !== "pages" &&
          rowData[col] !== null &&
          rowData[col] !== undefined &&
          String(rowData[col]).trim() !== ""
      );

      for (const col of fieldsToVerify) {
        const newValue = rowData[col];
        const checkRes = await API.get(`/NRDatas/CheckValueExists/${projectId}`, {
          params: {
            fieldName: col,
            value: newValue,
            ...(selectedLot ? { lotNo: selectedLot } : {})
          }
        });
        if (checkRes.data && checkRes.data.exists === false) {
          const confirmed = await MessageService.confirm(
            <span>
              Value <strong>{newValue}</strong> for field <strong>{col}</strong> does not exist in this project. Are you sure you want to add this row?
            </span>,
            {
              title: "Value does not exist",
              confirmText: "Yes, Add Row",
              cancelText: "No, Cancel",
              type: "warning"
            }
          );
          if (!confirmed) {
            return;
          }
        }
      }

      // Use the same endpoint as file upload
      const payload = {
        projectId: Number(projectId),
        data: [rowData]
      };

      console.log("Sending payload:", payload);

      const lotParam = selectedLot ? `?lotNo=${selectedLot}` : '';
      const response = await API.post(`/NRDatas/single${lotParam}`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log("Response:", response.data);

      showToast("Data added successfully", "success");

      setAddRowOpen(false);
      setNewRow({
        catchNo: "",
        fields: {},
        extraFields: []
      });

      fetchExistingData(projectId);
      // await rerunDuplicateTool();

      // Targeted pipeline: run envelope + box breaking only for the new catch's lot
      const newLotNo = response.data?.lotNo;
      const addedCatchNo = response.data?.catchNo;
      // if (newLotNo) {
      //   await runTargetedPipelineForLot(newLotNo, addedCatchNo);
      // }

    } catch (err) {
      console.error("Full error:", err);
      console.error("Error response:", err?.response);
      console.error("Error data:", err?.response?.data);

      let errorMsg = "Failed to add data";

      if (err?.response?.data) {
        if (typeof err.response.data === 'string') {
          errorMsg = err.response.data;
        } else if (err.response.data.message) {
          errorMsg = err.response.data.message;
        } else if (err.response.data.title) {
          errorMsg = err.response.data.title;
        }
      } else if (err?.message) {
        errorMsg = err.message;
      }

      showToast(errorMsg, "error");
    }
  };

  const handleEditRow = (record) => {
    setEditingRowId(record.id);
    setEditFormData({ ...record });
    setOriginalEditFormData({ ...record });
  };

  const handleCancelEdit = () => {
    setEditingRowId(null);
    setEditFormData({});
    setOriginalEditFormData({});
  };

  const handleSaveEdit = async () => {
    if (!editingRowId) return;

    try {
      setLoading(true);

      const changedPayload = {};
      columns.forEach((col) => {
        const oldValue = originalEditFormData?.[col] ?? null;
        const newValue = editFormData?.[col] ?? null;
        if (String(oldValue ?? "") !== String(newValue ?? "")) {
          changedPayload[col] = newValue;
        }
      });

      if (Object.keys(changedPayload).length === 0) {
        showToast("No changes to save", "info");
        setEditingRowId(null);
        setEditFormData({});
        setOriginalEditFormData({});
        return;
      }

      // Verify if new values exist in the database (excluding quantity & nrquantity)
      const fieldsToVerify = Object.keys(changedPayload).filter(
        (col) =>
          col.toLowerCase() !== "quantity" &&
          col.toLowerCase() !== "nrquantity" &&
          changedPayload[col] !== null &&
          changedPayload[col] !== undefined &&
          String(changedPayload[col]).trim() !== ""
      );

      for (const col of fieldsToVerify) {
        const newValue = changedPayload[col];
        const checkRes = await API.get(`/NRDatas/CheckValueExists/${projectId}`, {
          params: {
            fieldName: col,
            value: newValue,
            ...(selectedLot ? { lotNo: selectedLot } : {})
          }
        });
        if (checkRes.data && checkRes.data.exists === false) {
          const confirmed = await MessageService.confirm(
            <span>
              Value <strong>{newValue}</strong> for field <strong>{col}</strong> does not exist in this project. Are you sure you want to save?
            </span>,
            {
              title: "Value does not exist",
              confirmText: "Yes, Save",
              cancelText: "No, Cancel",
              type: "warning"
            }
          );
          if (!confirmed) {
            setLoading(false);
            return;
          }
        }
      }

      // Use the new UpdateSingle endpoint
      const lotParam = selectedLot ? `?lotNo=${selectedLot}` : '';
      await API.put(`/NRDatas/UpdateSingle/${editingRowId}${lotParam}`, changedPayload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      showToast("Data updated successfully", "success");
      setEditingRowId(null);
      setEditFormData({});
      setOriginalEditFormData({});
      await fetchExistingData(projectId);
      // await rerunDuplicateTool();
      // Determine affected catch number(s) and mark their EnvLot(s) stale so users know to regenerate
      try {
        const catchNo = originalEditFormData?.CatchNo ?? originalEditFormData?.catchNo ?? editFormData?.CatchNo ?? editFormData?.catchNo ?? null;
        if (catchNo && projectId) {
          const envLotsRes = await API.get(`/NRDataLots/GetAssignedEnvLotCatches/${projectId}`);
          const assignedLot = (envLotsRes?.data || []).find(l => Array.isArray(l.catches) && l.catches.includes(String(catchNo)));
          if (assignedLot && assignedLot.envLotNo) {
            addStaleEnvLotIds([Number(assignedLot.envLotNo)]);
            setHasDeactivatedCatches(true);
          }
        }
      } catch (err) {
        console.error("Failed to mark EnvLot stale after edit", err);
      }
    } catch (err) {
      console.error("Error updating data:", err);
      const errorMsg = err?.response?.data?.message || err?.response?.data || err?.message || "Failed to update data";
      showToast(errorMsg, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (fieldName, value) => {
    setEditFormData(prev => ({
      ...prev,
      [fieldName]: value
    }));
  };

  const deleteNRData = async (closeModal) => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");

      // Await the delete call
      await API.delete(`/NRDatas/DeleteByProject/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
        params: selectedLot ? { lotNo: selectedLot } : {}
      });

      // Success message only
      showToast("NR data deleted successfully!", "success");

      // Clear local state
      setExistingData([]);
      useStore.getState().setNrDataCount(0);
      setFileList([]);
      setFieldMappings({});
      setFileHeaders({});
      setUploadSectionCollapsed(false);

      // Close modal
      if (closeModal) closeModal();

    } catch (error) {
      console.error("Error deleting NRData:", error);

      // Safely check for response data
      const errorMsg = error?.response?.data || error?.message || "Failed to delete NR data";
      showToast(errorMsg, "error");
    } finally {
      setLoading(false);
    }
  };


  const handleKeepZeroQuantityChange = (e) => {
    setKeepZeroQuantity(e.target.checked);
    if (e.target.checked) {
      setSkipItems(false);  // Deselect skipItems if keepZeroQuantity is selected
    }
  };
  // Function to handle quantity change
  const handleQuantityChange = (e) => {
    let newQuantity = parseInt(e.target.value, 10);

    // Ensure quantity is a valid number and does not go below 0
    if (newQuantity < 0) {
      newQuantity = 0;
    }

    // Update the quantity state
    setQuantity(newQuantity);
  };


  const handleSkipItemsChange = (e) => {
    setSkipItems(e.target.checked);
    if (e.target.checked) {
      setKeepZeroQuantity(false);  // Deselect keepZeroQuantity if skipItems is selected
    }
  };
  const iconStyle = { color: PRIMARY_COLOR, marginRight: 6 };

  const parseDate = (value) => {
    // If the value is a number, it's a date stored as a number in Excel
    if (typeof value === 'number') {
      // Excel stores dates as serial numbers, so convert it to a Date object
      return new Date(Math.round((value - 25569) * 86400 * 1000)); // Convert Excel date to JS date
    }

    // If the value is a string, try to parse it as a date
    if (typeof value === 'string') {
      // Handle common formats like DD/MM/YYYY or DD-MM-YYYY
      const parts = value.split(/[-/.]/);
      if (parts.length === 3) {
        let day, month, year;
        if (parts[2].length === 4) {
          // DD/MM/YYYY
          day = parseInt(parts[0], 10);
          month = parseInt(parts[1], 10);
          year = parseInt(parts[2], 10);
        } else if (parts[0].length === 4) {
          // YYYY/MM/DD
          year = parseInt(parts[0], 10);
          month = parseInt(parts[1], 10);
          day = parseInt(parts[2], 10);
        }
        
        if (day && month && year) {
          const parsedDate = new Date(year, month - 1, day);
          if (parsedDate.getFullYear() === year && parsedDate.getMonth() === month - 1 && parsedDate.getDate() === day) {
            return parsedDate;
          }
        }
      }
      
      // Fallback to default Date.parse
      if (Date.parse(value)) {
        return new Date(value);  // If it's a valid date string, parse it
      }
    }

    // If it's neither, return the value as-is
    return value;
  };


  const downloadSkippedRowsReport = () => {
    if (skippedRows.length === 0) {
      showToast("No skipped rows to download", "info");
      return;
    }

    // Prepare data for Excel
    const reportData = skippedRows.map((item) => ({
      "Row Number": item.rowNumber,
      "Missing Fields": item.missingFields.join(", "),
      "Reason": item.reason,
      ...item.rowData, // Include all original row data
    }));

    // Create worksheet
    const worksheet = XLSX.utils.json_to_sheet(reportData);

    // Set column widths
    const columnWidths = [
      { wch: 12 }, // Row Number
      { wch: 30 }, // Missing Fields
      { wch: 40 }, // Reason
      ...fileHeaders.map(() => ({ wch: 15 })), // Original columns
    ];
    worksheet["!cols"] = columnWidths;

    // Create workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Skipped Rows");

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `skipped_rows_report_${timestamp}.xlsx`;

    // Download
    XLSX.writeFile(workbook, filename);
    showToast(`Downloaded report with ${skippedRows.length} skipped rows`, "success");
  };

  useEffect(() => {
    if (addRowOpen) {
      fetchMasterFields();
    }
  }, [addRowOpen]);

  const getMappedFieldsToDisplay = () => {
    return expectedFields.filter(f => {
      if (requiredFieldNames.includes(f.name)) return true;
      if (fieldMappings[f.fieldId]) return true;
      if (addedFieldIds.includes(f.fieldId)) return true;
      return false;
    });
  };

  const getRemainingFields = () => {
    const displayed = getMappedFieldsToDisplay();
    const displayedIds = new Set(displayed.map(d => d.fieldId));
    return expectedFields.filter(f => !displayedIds.has(f.fieldId));
  };

  return (
    <div style={{ padding: 0 }}>
      {/* === PAGE HEADER === */}
      <Typography.Title level={3} style={{ marginBottom: 8 }}>
        Data Import
      </Typography.Title>

      {/* === DATA IMPORT SECTION (collapsible) === */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card
          title={
            <div 
              style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}
              onClick={() => setUploadSectionCollapsed(prev => !prev)}
            >
              <ToolOutlined style={iconStyle} />
              <span>Data Import</span>
              {!uploadSectionCollapsed && (
                <Text type="secondary" style={{ fontWeight: 400, fontSize: 13, marginLeft: 4 }}>
                  — Upload and map your data files here
                </Text>
              )}
            </div>
          }
          extra={
            <Space size={6} onClick={e => e.stopPropagation()}>
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                style={{ minWidth: 110, height: 28, fontSize: 12 }}
                onClick={() => setAddRowOpen((prev) => !prev)}
              >
                Add Data
              </Button>

              <Button
                size="small"
                icon={<TriangleAlert size={14} />}
                style={{
                  minWidth: 110,
                  height: 28,
                  fontSize: 12,
                  backgroundColor: "#f0dc24ff",
                  borderColor: "#d4bc00",
                  color: "#000",
                }}
                onClick={fetchConflictReport}
              >
                Load Conflict
              </Button>

              <Button
                danger
                size="small"
                icon={<Trash2 size={14} />}
                style={{
                  minWidth: 110,
                  height: 28,
                  fontSize: 12,
                  backgroundColor: "#ff4d4f",
                  borderColor: "#ff4d4f",
                  color: "#fff",
                }}
                onClick={async () => {
                  const confirmed = await MessageService.confirm(
                    "Are you sure you want to delete NR data for this project?",
                    {
                      title: "Confirm Deletion",
                      confirmText: "Yes, Delete",
                      cancelText: "Cancel",
                      type: 'error',
                    }
                  );
                  if (confirmed) await deleteNRData();
                }}
              >
                Delete NR Data
              </Button>
            </Space>
          }
          bordered={true}
          styles={{ body: { paddingTop: uploadSectionCollapsed ? 0 : 12, paddingBottom: uploadSectionCollapsed ? 0 : 12, overflow: 'hidden', transition: 'all 0.3s ease' } }}
          style={{
            width: "100%",
            boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
            marginBottom: 2,
            paddingBottom: 0,
            backgroundColor: "#f5f5f5"
          }}
        >
          {!uploadSectionCollapsed && (
            <>
              <Row gutter={[16, 16]}>
                <Col xs={24} md={12}>
                  <div style={{ padding: 12, border: "1px solid #d9d9d9", borderRadius: 10, background: "#fff" }}>
                    <Space direction="vertical" size={10} style={{ width: "100%" }}>
                      <div>
                        <Text strong>File Upload</Text>
                        <Text type="secondary" style={{ display: "block", fontSize: 12, lineHeight: 1.3 }}>
                          Upload a corrected NRData report if you have already fixed your source file.
                        </Text>
                      </div>
                      <Upload.Dragger
                        name="file"
                        accept=".xls,.xlsx,.csv"
                        fileList={fileList}
                        beforeUpload={beforeUpload}
                        onRemove={handleRemove}
                        maxCount={1}
                      >
                        {/* <p className="ant-upload-drag-icon">📤</p> */}
                        <p className="ant-upload-text">Upload Excel or CSV file</p>
                        <Text type="secondary" style={{ display: "block" }}>
                          Drag and drop or click to choose a file.
                        </Text>
                        <Button icon={<UploadOutlined />}>Choose File</Button>
                      </Upload.Dragger>
                    </Space>
                  </div>
                </Col>

                <Col xs={24} md={12}>
                  <div style={{ padding: 12, border: "1px solid #d9d9d9", borderRadius: 10, background: "#fff" }}>


                    <Space direction="vertical" size={10} style={{ width: "100%", marginTop: 16 }}>
                      <div>
                        <Text strong>Zero Quantity Handling</Text>
                        <Text type="secondary" style={{ display: "block", fontSize: 12, lineHeight: 1.3 }}>
                          Choose how to handle rows where NRQuantity is 0 before upload.
                        </Text>
                      </div>

                      <Checkbox
                        checked={keepZeroQuantity}
                        onChange={handleKeepZeroQuantityChange}
                      >
                        Keep items with 0 quantity and change their quantity
                      </Checkbox>

                      {keepZeroQuantity && (
                        <Input
                          type="number"
                          value={quantity}
                          onChange={handleQuantityChange}
                          placeholder="Enter quantity to replace 0"
                          min={0}
                        />
                      )}

                      <Checkbox
                        checked={skipItems}
                        onChange={handleSkipItemsChange}
                      >
                        Skip items with 0 quantity
                      </Checkbox>
                    </Space>
                  </div>
                </Col>
              </Row>

              {/* === FIELD MAPPING SECTION === */}
              {fileHeaders.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{
                    scale: 1.01,
                    boxShadow: "0 10px 20px rgba(0, 0, 0, 0.1)",
                  }}
                  transition={{ duration: 0.3 }}
                >
                  <Card
                    title="Field Mapping"
                    extra={
                      getRemainingFields().length > 0 && (
                        <Select
                          style={{ width: 200 }}
                          placeholder="+ Add Field to Map"
                          value={null}
                          showSearch
                          filterOption={(input, option) =>
                            (option?.children ?? '').toLowerCase().includes(input.toLowerCase())
                          }
                          onChange={(value) => {
                            if (value) {
                              setAddedFieldIds(prev => [...prev, value]);
                            }
                          }}
                        >
                          {getRemainingFields().map(f => (
                            <Select.Option key={f.fieldId} value={f.fieldId}>
                              {f.name}
                            </Select.Option>
                          ))}
                        </Select>
                      )
                    }
                    styles={{ body: { paddingTop: 12, paddingBottom: 12 } }}
                    style={{
                      border: "1px solid #d9d9d9",
                      boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
                    }}
                  >
                    <Text
                      type="secondary"
                      style={{ display: "block", marginBottom: 16 }}
                    >
                      Map fields from your file to expected fields (Required fields are shown by default)
                    </Text>

                    <Row gutter={[16, 16]}>
                      {[...getMappedFieldsToDisplay()]
                        .sort((a, b) => {
                          const aReq = requiredFieldNames.includes(a.name);
                          const bReq = requiredFieldNames.includes(b.name);
                          if (aReq && !bReq) return -1;
                          if (!aReq && bReq) return 1;
                          return 0;
                        })
                        .map((expectedField) => {
                          return (
                            <Col key={expectedField.fieldId} xs={24} md={8}>
                              <div style={{ marginBottom: 12 }}>
                                <div style={{ display: "flex", alignItems: "center" }}>
                                  <Text
                                    style={{
                                      marginRight: 8,
                                      color: fieldMappings[expectedField.fieldId]
                                        ? "#006400"
                                        : "inherit",
                                    }}
                                  >
                                    {expectedField.name}
                                    {requiredFieldNames.includes(expectedField.name) && (
                                      <span style={{ color: "#ff4d4f", marginLeft: 2 }}>*</span>
                                    )}
                                  </Text>
                                  {fieldMappings[expectedField.fieldId] && (
                                    <CheckCircleOutlined
                                      style={{ color: "#006400", fontSize: 16 }}
                                    />
                                  )}
                                </div>
                                <Select
                                  style={{
                                    width: "100%",
                                    borderColor: fieldMappings[expectedField.fieldId]
                                      ? "#006400"
                                      : undefined,
                                    boxShadow: fieldMappings[expectedField.fieldId]
                                      ? "0 0 5px #006400"
                                      : undefined,
                                  }}
                                  placeholder="Select matching column from file"
                                  showSearch
                                  filterOption={(input, option) =>
                                    (option?.children ?? "")
                                      .toString()
                                      .toLowerCase()
                                      .includes(input.toLowerCase())
                                  }
                                  value={
                                    fieldMappings[expectedField.fieldId]
                                  }
                                  onChange={(value) => {
                                    setFieldMappings((prev) => ({
                                      ...prev,
                                      [expectedField.fieldId]: value,
                                    }));
                                  }}
                                  allowClear
                                  onClear={() => {
                                    setFieldMappings((prev) => {
                                      const updated = { ...prev };
                                      delete updated[expectedField.fieldId];
                                      return updated;
                                    });
                                    if (!requiredFieldNames.includes(expectedField.name)) {
                                      setAddedFieldIds(prev => prev.filter(id => id !== expectedField.fieldId));
                                    }
                                  }}
                                >
                                  {fileHeaders
                                    .filter(
                                      (header) =>
                                        !Object.values(fieldMappings).includes(header) ||
                                        fieldMappings[expectedField.fieldId] === header
                                    )
                                    .map((header, index) => (
                                      <Select.Option
                                        key={`${header}-${index}`}
                                        value={header}
                                      >
                                        {header}
                                      </Select.Option>
                                    ))}
                                </Select>
                              </div>
                            </Col>
                          );
                        })}
                    </Row>

                    {isAnyFieldMapped() && (
                      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ padding: 12, border: "1px solid #d9d9d9", borderRadius: 10, background: "#fafafa" }}>
                          <Space direction="vertical" size={10} style={{ width: "100%" }}>
                            <div>
                              <Text strong>Changed NR Data</Text>
                              <Text type="secondary" style={{ display: "block", fontSize: 12, lineHeight: 1.3 }}>
                                Enable this if you're uploading changed NR data to remove duplicates automatically.
                              </Text>
                            </div>
                            <Checkbox
                              checked={isChangedNR}
                              onChange={(e) => setIsChangedNR(e.target.checked)}
                            >
                              This is a Changed NR upload
                            </Checkbox>
                          </Space>
                        </div>
                        <Space style={{ width: "100%", justifyContent: "space-between" }}>
                          <Button
                            type="primary"
                            onClick={handleUpload}
                            loading={uploading}
                            disabled={uploading}
                          >
                            Upload Data
                          </Button>
                          {skippedRows.length > 0 && (
                            <Button
                              onClick={downloadSkippedRowsReport}
                              style={{ backgroundColor: "#faad14", borderColor: "#faad14", color: "#000" }}
                            >
                              📥 Download Missing Data Report ({skippedRows.length})
                            </Button>
                          )}
                        </Space>
                      </div>
                    )}
                  </Card>
                </motion.div>
              )}
            </>
          )}
        </Card>
      </motion.div>

      {/* === DATA AND CONFLICTS SECTION === */}
      <>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 24,
            marginBottom: 16,
          }}
        >
          {/* Left side: Title */}
          <Typography.Title level={4} style={{ margin: 0 }}>
            Data & Conflicts
          </Typography.Title>
        </div>

        {addRowOpen && (
          <Card
            size="small"
            style={{
              marginBottom: 12,
              border: "1px dashed #d9d9d9",
              background: "#fafafa",
            }}
          >
            {loadingFields ? (
              <Text type="secondary">Loading fields...</Text>
            ) : (
              <>
                {/* Configured Fields in Compact Grid */}
                <Row gutter={[8, 8]}>
                  {/* Catch No - Always First */}
                  <Col xs={24} sm={12} md={8} lg={6}>
                    <Text strong style={{ fontSize: 12 }}>
                      Catch No <span style={{ color: "#ff4d4f" }}>*</span>
                    </Text>
                    <Input
                      size="small"
                      placeholder="Catch No"
                      value={newRow.catchNo}
                      onChange={(e) => setNewRow({ ...newRow, catchNo: e.target.value })}
                    />
                  </Col>

                  {/* NRQuantity - Always Required */}
                  <Col xs={24} sm={12} md={8} lg={6}>
                    <Text strong style={{ fontSize: 12 }}>
                      NRQuantity <span style={{ color: "#ff4d4f" }}>*</span>
                    </Text>
                    <Input
                      size="small"
                      type="number"
                      placeholder="NRQuantity"
                      value={newRow.fields.NRQuantity || ""}
                      onChange={(e) => {
                        setNewRow((prev) => ({
                          ...prev,
                          fields: {
                            ...prev.fields,
                            NRQuantity: e.target.value,
                          },
                        }));
                      }}
                    />
                  </Col>

                  {/* LotNo - Always Required */}
                  <Col xs={24} sm={12} md={8} lg={6}>
                    <Text strong style={{ fontSize: 12 }}>
                      LotNo <span style={{ color: "#ff4d4f" }}>*</span>
                    </Text>
                    <Input
                      size="small"
                      type="number"
                      placeholder="LotNo"
                      value={newRow.fields.LotNo || ""}
                      onChange={(e) => {
                        setNewRow((prev) => ({
                          ...prev,
                          fields: {
                            ...prev.fields,
                            LotNo: e.target.value,
                          },
                        }));
                      }}
                    />
                  </Col>

                  {/* Pages - Always Required */}
                  <Col xs={24} sm={12} md={8} lg={6}>
                    <Text strong style={{ fontSize: 12 }}>
                      Pages <span style={{ color: "#ff4d4f" }}>*</span>
                    </Text>
                    <Input
                      size="small"
                      type="number"
                      placeholder="Pages"
                      value={newRow.fields.Pages || ""}
                      onChange={(e) => {
                        setNewRow((prev) => ({
                          ...prev,
                          fields: {
                            ...prev.fields,
                            Pages: e.target.value,
                          },
                        }));
                      }}
                    />
                  </Col>

                  {/* Dynamic Configured Fields */}
                  {configuredFields
                    .filter(field => !["CatchNo", "NRQuantity", "LotNo", "Pages"].includes(field.name)) // Exclude hardcoded fields
                    .map((field) => {
                      const isRequired = requiredFieldNames.includes(field.name);
                      return (
                        <Col key={field.fieldId} xs={24} sm={12} md={8} lg={6}>
                          <Text strong style={{ fontSize: 12 }}>
                            {field.name}
                            {isRequired && <span style={{ color: "#ff4d4f", marginLeft: 2 }}>*</span>}
                          </Text>
                          {field.name === 'ExamDate' ? (
                            <DatePicker
                              size="small"
                              format="DD-MM-YYYY"
                              placeholder={field.name}
                              value={parseDateValue(newRow.fields[field.name])}
                              style={{ width: '100%' }}
                              onChange={(date) => {
                                setNewRow((prev) => ({
                                  ...prev,
                                  fields: {
                                    ...prev.fields,
                                    [field.name]: date ? date.format("DD-MM-YYYY") : "",
                                  },
                                }));
                              }}
                            />
                          ) : (
                            <Input
                              size="small"
                              placeholder={field.name}
                              value={newRow.fields[field.name] || ""}
                              onChange={(e) => {
                                setNewRow((prev) => ({
                                  ...prev,
                                  fields: {
                                    ...prev.fields,
                                    [field.name]: e.target.value,
                                  },
                                }));
                              }}
                            />
                          )}
                        </Col>
                      );
                    })}
                </Row>

                {/* Extra Fields Section - Compact Inline */}
                {newRow.extraFields.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    {newRow.extraFields.map((field, index) => (
                      <Row key={index} gutter={4} style={{ marginBottom: 4 }}>
                        <Col span={7}>
                          <Select
                            size="small"
                            placeholder="Field"
                            value={field.key || undefined}
                            style={{ width: "100%" }}
                            onChange={(value) => {
                              setNewRow((prev) => {
                                const updated = [...prev.extraFields];
                                updated[index].key = value;
                                return { ...prev, extraFields: updated };
                              });
                            }}
                            options={masterFields
                              .filter(f =>
                                !configuredFields.some(cf => cf.name === f.name) && // Not in configured fields
                                !newRow.extraFields.some((ef, i) => i !== index && ef.key === f.name) // Not already selected
                              )
                              .map(f => ({
                                value: f.name,
                                label: f.name
                              }))
                            }
                          />
                        </Col>
                        <Col span={15}>
                          {field.key === 'ExamDate' ? (
                            <DatePicker
                              size="small"
                              format="DD-MM-YYYY"
                              placeholder="Value"
                              value={parseDateValue(field.value)}
                              style={{ width: "100%" }}
                              onChange={(date) => {
                                setNewRow((prev) => {
                                  const updated = [...prev.extraFields];
                                  updated[index].value = date ? date.format("DD-MM-YYYY") : "";
                                  return { ...prev, extraFields: updated };
                                });
                              }}
                            />
                          ) : (
                            <Input
                              size="small"
                              placeholder="Value"
                              value={field.value}
                              onChange={(e) => {
                                setNewRow((prev) => {
                                  const updated = [...prev.extraFields];
                                  updated[index].value = e.target.value;
                                  return { ...prev, extraFields: updated };
                                });
                              }}
                            />
                          )}
                        </Col>
                        <Col span={2}>
                          <Button
                            size="small"
                            danger
                            type="text"
                            icon={<span style={{ fontSize: 14 }}>✕</span>}
                            onClick={() => {
                              setNewRow((prev) => ({
                                ...prev,
                                extraFields: prev.extraFields.filter((_, i) => i !== index),
                              }));
                            }}
                            style={{ padding: "0 4px", height: 24 }}
                          />
                        </Col>
                      </Row>
                    ))}
                  </div>
                )}

                {/* Action Buttons */}
                <div style={{ display: "flex", gap: 6, justifyContent: "space-between", marginTop: 8 }}>
                  <Button
                    size="small"
                    type="dashed"
                    onClick={() =>
                      setNewRow((prev) => ({
                        ...prev,
                        extraFields: [...prev.extraFields, { key: "", value: "" }],
                      }))
                    }
                    style={{ height: 24, fontSize: 12 }}
                  >
                    + Field
                  </Button>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Button size="small" type="primary" onClick={handleInlineSave} loading={loading} style={{ height: 24 }}>
                      Save
                    </Button>
                    <Button size="small" onClick={() => {
                      setAddRowOpen(false);
                      setNewRow({ catchNo: "", fields: {}, extraFields: [] });
                    }} style={{ height: 24 }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </>
            )}
          </Card>
        )}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{
            scale: 1.01,
            boxShadow: "0 10px 20px rgba(0, 0, 0, 0.1)",
          }}
          transition={{ duration: 0.3 }}
        >
          <Card
            bordered
            styles={{ body: { paddingTop: 12, paddingBottom: 12 } }}
            style={{ border: "1px solid #d9d9d9", boxShadow: "0 4px 8px rgba(0,0,0,0.1)" }}
          >
            <Tabs
              activeKey={activeTab}
              onChange={handleTabChange}
              style={{ marginTop: 8 }}
              tabBarExtraContent={
                activeTab === "1" ? (
                  <Button
                    size="small"
                    onClick={() => setShowUploadedDisplayFieldsModal(true)}
                    disabled={!columns.length}
                  >
                    Display Fields
                  </Button>
                ) : activeTab === "2" ? (
                  <Space size={8}>
                    <Button
                      type="primary"
                      size="small"
                      onClick={downloadConflictReport}
                      disabled={!conflicts || !(conflicts?.errors || conflicts?.Errors || []).length}
                    >
                      Download Conflict Excel
                    </Button>
                    <Button
                      type="primary"
                      size="small"
                      onClick={downloadConflictReportPdf}
                      disabled={!conflicts || !(conflicts?.errors || conflicts?.Errors || []).length}
                      style={{ backgroundColor: "#52c41a", borderColor: "#52c41a" }}
                    >
                      Download Conflict PDF
                    </Button>
                  </Space>
                ) : activeTab === "4" ? (
                  <Button
                    type="primary"
                    size="small"
                    onClick={() => lotBifurcationRef.current?.openBifurcationModal?.()}
                  >
                    Bifurcate Lots
                  </Button>
                ) : activeTab === "5" ? (
                  <Button
                    size="small"
                    disabled={mergeSelectionCount < 2}
                    onClick={() => mergeCatchRef.current?.openMergeModal?.()}
                  >
                    Merge Selected
                  </Button>
                ) : null
              }
            >
              <TabPane tab="Uploaded Data" key="1">
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                  <Space wrap size={8} style={{ width: "100%", justifyContent: "space-between" }}>
                    <Space size={8}>
                      <Input.Search
                        placeholder="Search uploaded data"
                        allowClear
                        value={globalSearchText}
                        loading={loading && globalSearchText !== ""}
                        onChange={(e) => {
                          setGlobalSearchText(e.target.value);
                          // Top search is global search
                          setColumnFilters({});
                          setPagination((prev) => ({ ...prev, current: 1 }));
                        }}
                        onSearch={(value) => {
                          setGlobalSearchText(value);
                          // Top search is global search
                          setColumnFilters({});
                          setPagination((prev) => ({ ...prev, current: 1 }));
                        }}
                        style={{ width: 280 }}
                      />
                      {(globalSearchText || Object.keys(columnFilters).length > 0) && (
                        <Button
                          onClick={() => {
                            setGlobalSearchText("");
                            setColumnFilters({});
                            setPagination((prev) => ({ ...prev, current: 1 }));
                          }}
                        >
                          Reset Filters
                        </Button>
                      )}
                    </Space>
                  </Space>
                  {enhancedColumns.length > 0 ? (
                    <Table
                      dataSource={existingData}
                      columns={visibleEnhancedColumns}
                      pagination={{
                        ...pagination,
                        showSizeChanger: true,
                        pageSizeOptions: ['10', '20', '50', '100'],
                        showQuickJumper: true,
                      }}
                      locale={{
                        emptyText: (
                          <div style={{ padding: '24px 0', textAlign: 'center' }}>
                            <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: '15px' }}>
                              No data available matching your search criteria.
                            </Text>
                            {(globalSearchText || Object.keys(columnFilters).length > 0) && (
                              <Button
                                type="primary"
                                onClick={() => {
                                  setGlobalSearchText("");
                                  setColumnFilters({});
                                  setPagination((prev) => ({ ...prev, current: 1 }));
                                }}
                              >
                                Clear Search & Filters
                              </Button>
                            )}
                          </div>
                        )
                      }}
                      rowKey="id"
                      rowSelection={{
                        selectedRowKeys: selectedUploadedRowKeys,
                        onSelect: (record, selected) => {
                          const catchNo = record.CatchNo;
                          if (!catchNo) {
                            return;
                          }

                          setSelectedUploadedCatchNos((prev) => {
                            if (selected) {
                              if (prev.includes(catchNo)) {
                                return prev;
                              }

                              if (prev.length >= 2) {
                                showToast("You can select rows from only 2 catch numbers at a time.", "warning");
                                return prev;
                              }

                              return [...prev, catchNo];
                            }

                            return prev.filter((item) => item !== catchNo);
                          });
                        },
                        onSelectAll: (selected, selectedRows, changeRows) => {
                          setSelectedUploadedCatchNos((prev) => {
                            let next = [...prev];

                            changeRows.forEach((row) => {
                              const catchNo = row.CatchNo;
                              if (!catchNo) {
                                return;
                              }

                              if (selected) {
                                if (!next.includes(catchNo) && next.length < 2) {
                                  next.push(catchNo);
                                }
                              } else {
                                next = next.filter((item) => item !== catchNo);
                              }
                            });

                            const uniqueCatchNos = Array.from(new Set(next));
                            if (selected && uniqueCatchNos.length > 2) {
                              showToast("You can select rows from only 2 catch numbers at a time.", "warning");
                              return uniqueCatchNos.slice(0, 2);
                            }

                            return uniqueCatchNos;
                          });
                        },
                        getCheckboxProps: (record) => ({
                          disabled:
                            editingRowId !== null || // Disable selection when editing
                            (Boolean(record.CatchNo) &&
                              selectedUploadedCatchNos.length >= 2 &&
                              !selectedUploadedCatchNos.includes(record.CatchNo)),
                        }),
                      }}
                      scroll={{ x: "max-content" }}
                      loading={loading}
                      onChange={handleUploadedTableChange}
                    />
                  ) : (
                    <Typography.Text type="secondary">No data found</Typography.Text>
                  )}
                </Space>

              </TabPane>

              <TabPane tab="Conflict Report" key="2">
                {renderConflicts()}
              </TabPane>
              <TabPane tab="Fill Missing Data" key="3">
                {activeTab === "3" && <MissingData />}
              </TabPane>
              <TabPane tab="Lot Bifurcation" key="4">
                {activeTab === "4" && <LotsBifurcation ref={lotBifurcationRef} defaultOpenBifurcation={shouldOpenBifurcation} />}
              </TabPane>
              <TabPane tab="Merge Catch Numbers" key="5">
                {activeTab === "5" && (
                  <MergeCatchNumbers
                    ref={mergeCatchRef}
                    onSelectionCountChange={setMergeSelectionCount}
                  />
                )}
              </TabPane>
            </Tabs>


          </Card>
        </motion.div>

        <Modal
          title="Select Display Fields"
          open={showUploadedDisplayFieldsModal}
          onCancel={() => setShowUploadedDisplayFieldsModal(false)}
          footer={[
            <Button
              key="selectAll"
              size="small"
              onClick={() => {
                setUploadedDisplayFields([...columns]);
                localStorage.setItem(
                  `uploadedData_displayFields_${projectId || "default"}`,
                  JSON.stringify(columns)
                );
              }}
              disabled={columns.length === 0}
            >
              Select All
            </Button>,
            <Button
              key="clearAll"
              size="small"
              onClick={() => {
                setUploadedDisplayFields([...lockedUploadedFields]);
                localStorage.setItem(
                  `uploadedData_displayFields_${projectId || "default"}`,
                  JSON.stringify(lockedUploadedFields)
                );
              }}
              disabled={uploadedDisplayFields.length === lockedUploadedFields.length}
            >
              Clear All
            </Button>,
            <Button
              key="ok"
              type="primary"
              onClick={() => setShowUploadedDisplayFieldsModal(false)}
            >
              OK
            </Button>
          ]}
          width={500}
        >
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary">
              Select fields from the uploaded data table to show or hide columns.
            </Text>
          </div>
          <Checkbox.Group
            style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}
            value={uploadedDisplayFields}
            onChange={(checkedValues) => {
              const nextValues = Array.from(new Set([...lockedUploadedFields, ...checkedValues]));
              setUploadedDisplayFields(nextValues);
              localStorage.setItem(
                `uploadedData_displayFields_${projectId || "default"}`,
                JSON.stringify(nextValues)
              );
            }}
          >
            {columns.map((field) => (
              <Checkbox
                key={field}
                value={field}
                disabled={lockedUploadedFields.includes(field)}
              >
                {field}
                {lockedUploadedFields.includes(field) ? " (Configured)" : ""}
              </Checkbox>
            ))}
          </Checkbox.Group>
        </Modal>
      </>

    </div>
  );

};

export default DataImport;
