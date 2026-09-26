import React, { useEffect, useMemo, useState } from "react";
import {
  Progress,
  Badge,
  Button,
  Card,
  Form,
  Input,
  Table,
  Tag,
  Typography,
  message,
  Checkbox,
  Alert,
  Modal,
  Space,
  Tabs,
  Tooltip,
  Divider,
  Select,
} from "antd";
import { HistoryOutlined, ExclamationCircleOutlined, SyncOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import axios from "axios";
import { getCurrentUserId } from "../hooks/useUserMap";
import API from "../hooks/api";
import useStore from "../stores/ProjectData";
import { buildReportFileName, getErrorMessageAsync, parseMappingJson, getErrorDetails,retryAsync } from "../utils/rptTemplateUtils";
import EnvLotReportsManager from "./EnvLotReportsManager";
import DependencyModal from "./components/DependencyModal";
import StaticVariablesModal from "./components/StaticVariablesModal";
import LotSelectionModal from "./components/LotSelectionModal";
import EnvLotSelectionModal from "./components/EnvLotSelectionModal";
import ExistingReportModal from "./components/ExistingReportModal";
import TemplatesPanel from "./components/TemplatesPanel";
import LotWisePanel from "./components/LotWisePanel";
import ReportTemplateManagement from './components/ReportTemplateManagement';

const { Text } = Typography;

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24 }}>
          <Alert
            message="An unexpected error occurred"
            description={this.state.error?.toString() || "Unknown error"}
            type="error"
            showIcon
          />
          <pre style={{ marginTop: 12, maxHeight: 300, overflow: "auto" }}>{this.state.error?.stack}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}

const url3 = import.meta.env.VITE_API_FILE_URL;

const ProcessingPipeline = () => {
  const navigate = useNavigate();
  const isConfigured = useStore((state) => state.isConfigured);
  const isLoadingData = useStore((state) => state.isLoadingData);
  const nrDataCount = useStore((state) => state.nrDataCount);
  const hasDeactivatedCatches = useStore((state) => state.hasDeactivatedCatches);
  const setHasDeactivatedCatches = useStore((state) => state.setHasDeactivatedCatches);
  const staleEnvLotIds = useStore((state) => state.staleEnvLotIds);
  const removeStaleEnvLotIds = useStore((state) => state.removeStaleEnvLotIds);
  const projectId = useStore((state) => state.projectId);
  const globalSelectedLot = useStore((state) => state.selectedLot);
  const selectedDropdownLot = globalSelectedLot !== null && globalSelectedLot !== undefined && globalSelectedLot !== "" ? String(globalSelectedLot) : "all";

  useEffect(() => {
    if (projectId && !isLoadingData) {
      if (!isConfigured) {
        message.warning("Please complete project configuration first");
        navigate("/projectdashboard");
      } else if (nrDataCount === 0) {
        message.warning("Please upload NR data (Data Import) first");
        navigate("/projectdashboard");
      }
    }
  }, [isConfigured, isLoadingData, nrDataCount, projectId, navigate]);

  const [enabledModuleNames, setEnabledModuleNames] = useState([]);
  const [loadingModules, setLoadingModules] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [steps, setSteps] = useState([]);
  const [selectedModules, setSelectedModules] = useState([]);
  const [allModules, setAllModules] = useState([]);
  const [projectConfig, setProjectConfig] = useState(null);
  
  // Batch states
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(1);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [dropdownLots, setDropdownLots] = useState([]);

  useEffect(() => {
    if (projectId) {
      loadBatches();
      loadDropdownLots();
    }
  }, [projectId]);

  const loadDropdownLots = async () => {
    try {
      const res = await API.get(`/NRDataLots/GetByProjectId/${projectId}`);
      const data = res.data || [];
      const validLots = data.filter(lot => lot.lotNo > 0).map(lot => lot.lotNo);
      setDropdownLots(validLots);
      window.dispatchEvent(new Event("refreshLots"));
    } catch (err) {
      console.error("Failed to fetch lots for dropdown", err);
    }
  };

  useEffect(() => {
    if (selectedDropdownLot !== "all" && selectedDropdownLot !== null) {
      setSelectedLotTab(Number(selectedDropdownLot));
    } else if (dropdownLots && dropdownLots.length > 0) {
      setSelectedLotTab(dropdownLots[0]);
    } else {
      setSelectedLotTab(null);
    }
  }, [selectedDropdownLot, dropdownLots]);

  const loadBatches = async () => {
    try {
      setLoadingBatches(true);
      const res = await API.get(`/NRDatas/active-batches/${projectId}`);
      const batchList = res.data?.activeBatches || [1];
      setBatches(batchList.length > 0 ? batchList : [1]);
      if (!batchList.includes(selectedBatch)) {
        setSelectedBatch(1);
      }
    } catch (error) {
      console.error("Failed to fetch batches", error);
      setBatches([1]);
    } finally {
      setLoadingBatches(false);
    }
  };
  const [extraConfigData, setExtraConfigData] = useState([]);
  const [configChanged, setConfigChanged] = useState(false);
  const [changedFieldsInfo, setChangedFieldsInfo] = useState([]);
  const [freshlyRunSteps, setFreshlyRunSteps] = useState(new Set());
  const [dependencyModal, setDependencyModal] = useState({ visible: false, unprocessedSteps: [], selectedStep: null });
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateOptions, setTemplateOptions] = useState([]);
  const [allTemplateOptions, setAllTemplateOptions] = useState([]);
  const [templatePanel, setTemplatePanel] = useState({ open: false, moduleKey: null });
  const [templateDownloads, setTemplateDownloads] = useState({});
  const [generatingTemplates, setGeneratingTemplates] = useState({});
  const [templateReportStatus, setTemplateReportStatus] = useState({});
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [mappingUpdateMap, setMappingUpdateMap] = useState({});
  const [staleTemplateIds, setStaleTemplateIds] = useState(new Set());
  const [lotWisePanel, setLotWisePanel] = useState({ open: false, moduleKey: null });
  const [availableLots, setAvailableLots] = useState([]);
  const [hasUnassignedCatches, setHasUnassignedCatches] = useState(false);
  const [selectedLotTab, setSelectedLotTab] = useState(null);
  const [loadingLots, setLoadingLots] = useState(false);
  const [generatingLotTemplates, setGeneratingLotTemplates] = useState({});
  const [downloadingLotTemplates, setDownloadingLotTemplates] = useState({});
  const [lotTemplateStatus, setLotTemplateStatus] = useState({});
  const [staleLotIds, setStaleLotIds] = useState(new Set());
  const [bulkGeneratingLots, setBulkGeneratingLots] = useState(false);
  const [bulkDownloadingLots, setBulkDownloadingLots] = useState(false);
  const [generatingLotReport, setGeneratingLotReport] = useState({});
  const [staticVarModal, setStaticVarModal] = useState({ open: false, template: null, variables: {}, values: {}, resolve: null });
  const [lotSelectionModal, setLotSelectionModal] = useState({
    visible: false,
    availableLots: [],
    selectedLots: [],
    description: "",
    okText: "",
    loading: false,
    resolve: null,
    isQuantitySheet: false
  });
  const [envLotSelectionModal, setEnvLotSelectionModal] = useState({
    visible: false,
    availableEnvLots: [],
    selectedEnvLots: [],
    loading: false,
    resolve: null,
    isRegenerate: false
  });
  const [existingReportModal, setExistingReportModal] = useState({
    visible: false,
    report: null,
    resolve: null
  });
  const [lotReportStatus, setLotReportStatus] = useState({});
  const [envLotReports, setEnvLotReports] = useState([]); // Store generated envelope lot reports
  const [reportsLoading, setReportsLoading] = useState(false);
  const [generatedTemplateReports, setGeneratedTemplateReports] = useState([]);
  const [reportVersions, setReportVersions] = useState({});
  const [excelReports, setExcelReports] = useState([]);

  const loadReportVersions = async () => {
    if (!projectId) return;
    try {
      const [allVerRes, excelRes] = await Promise.all([
        API.get(`/EnvelopeBreakages/Reports/AllVersions?projectId=${projectId}`).catch(() => ({ data: {} })),
        API.get(`/ExcelReports/ByProject/${projectId}`).catch(() => ({ data: [] }))
      ]);
      setReportVersions(allVerRes.data || {});
      setExcelReports(excelRes.data || []);
    } catch (err) {
      console.error("Failed to load report versions or excel reports", err);
    }
  };

  const getBoxVersionsForLot = (lotNo) => {
    const allBoxVersions = reportVersions["box"] || [];
    return allBoxVersions.filter(v =>
      String(v.lotNo) === String(lotNo) ||
      v.fileName.includes(`BoxBreaking_${lotNo}_v`) ||
      v.fileName === `BoxBreaking_${lotNo}.xlsx`
    );
  };

  const [expandedReportsTemplates, setExpandedReportsTemplates] = useState(new Set()); // Track which templates have expanded reports
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false);
  const [selectedModuleForDetails, setSelectedModuleForDetails] = useState(null);
  const [selectedItems, setSelectedItems] = useState({});
  const [detailGrouping, setDetailGrouping] = useState("lot");
  const [detailViewType, setDetailViewType] = useState("reports");
  const [hasPendingPipelineChanges, setHasPendingPipelineChanges] = useState(false);
  const [pipelineStepStatus, setPipelineStepStatus] = useState(null);
  const projectName = useStore((state) => state.projectName);
  const storedGroupId = localStorage.getItem("selectedGroup");
  const storedTypeId = localStorage.getItem("selectedType");
  const groupId = storedGroupId ? Number(storedGroupId) : null;
  const typeId = storedTypeId ? Number(storedTypeId) : null;
  const [envLotSearch, setEnvLotSearch] = useState("");
  const [errorDetailsModal, setErrorDetailsModal] = useState({ visible: false, error: null, retryFn: null, templateId: null });
  const currentStep = useMemo(
    () =>
      steps.findIndex((s) => s.status === "in-progress") + 1 ||
      steps.filter((s) => s.status === "completed").length,
    [steps]
  );

  const percent = useMemo(
    () =>
      steps.length
        ? (steps.filter((s) => s.status === "completed").length /
          steps.length) *
        100
        : 0,
    [steps]
  );

  const outdatedModules = useMemo(() => {
    if (!pipelineStepStatus) return [];
    const keyMap = {
      duplicate: { flag: "duplicatePending", name: "Duplicate Tool" },
      enhancement: { flag: "enhancementPending", name: "Envelope Setup and Enhancement" },
      extra: { flag: "extraPending", name: "Extra Configuration" },
      envelopebreaking: { flag: "envelopePending", name: "Envelope Breaking" },
      box: { flag: "boxPending", name: "Box Breaking" }
    };

    return Object.entries(keyMap)
      .filter(([key, config]) => {
        const hasPending = pipelineStepStatus[config.flag];
        if (!hasPending) return false;

        const step = steps.find(s => s.key === key);
        const hasExistingReport = step && (step.status === "completed" || step.fileUrl || (key === "box" && step.completedLots > 0));
        return hasExistingReport;
      })
      .map(([key, config]) => {
        if (key === "box" && pipelineStepStatus.pendingBoxLots && pipelineStepStatus.pendingBoxLots.length > 0) {
          return `${config.name} (Lot ${pipelineStepStatus.pendingBoxLots.join(", ")})`;
        }
        return config.name;
      });
  }, [pipelineStepStatus, steps, hasDeactivatedCatches]);

  const rptApiUrl = import.meta.env.VITE_RPT_API_URL;
  const mappingUpdateKey = "rptTemplateMappingUpdatedAt";

  const moduleKeyToNameMap = {
    duplicate: "Duplicate Tool",
    enhancement: "Envelope Setup and Enhancement",
    extra: "Extra Configuration",
    envelopebreaking: "Envelope Breaking",
    box: "Box Breaking",
    envelopeSummary: "Envelope Summary",
    catchSummary: "Catch Summary Report",
    catchOmrSerialing: "Catchomrserialingreport",
  };

  const checkReportExistence = async (projectId) => {
    loadReportVersions();
    const fileNames = {
      duplicate: "DuplicateTool.xlsx",
      extra: "ExtrasCalculation.xlsx",
      enhancement: "EnhancementReport.xlsx",
      envelopebreaking: "EnvelopeBreaking.xlsx",
      box: "BoxBreaking.xlsx",
      envelopeSummary: "EnvelopeSummary.xlsx",
      catchSummary: "CatchSummary.xlsx",
      catchOmrSerialing: "CatchWiseBookletAndOmrSerialing.xlsx",
};

    const results = {};

    await Promise.all(
      Object.entries(fileNames).map(async ([key, fileName]) => {
        try {
          if (key === "duplicate") {
            const [fileRes, rerunRes] = await Promise.all([
              API.get(`/EnvelopeBreakages/Reports/Exists?projectId=${projectId}&fileName=${fileName}`),
              API.get(`/NRDatas/DuplicateRerunStatus`, { params: { ProjectId: projectId } }),
            ]);

            const exists = Boolean(fileRes.data?.exists);
            const requiresDuplicateRerun = Boolean(rerunRes.data?.requiresDuplicateRerun);
            results[fileName] = exists;

            if (exists || !requiresDuplicateRerun) {
              const actualFileName = fileRes.data?.fileName || fileName;
              const fileUrl = exists
                ? `${url3}/${projectId}/${actualFileName}?DateTime=${new Date().toISOString()}`
                : null;

              updateStepStatus(key, {
                status: "completed",
                fileUrl,
                duration: "--:--",
              });
            }
            return;
          }

          // For box breaking, check if any lot-specific file exists
          if (key === "box") {
            try {
              const lots = await fetchLotsForSelection();
              if (lots && lots.length > 0) {
                // Check if at least one lot has a box breaking report
                const lotResults = await Promise.all(
                  lots.map(async (lot) => {
                    try {
                      const lotFileName = `BoxBreaking_${lot.lotNo}.xlsx`;
                      const res = await API.get(
                        `/EnvelopeBreakages/Reports/Exists?projectId=${projectId}&fileName=${lotFileName}`
                      );
                      return { lotNo: lot.lotNo, exists: Boolean(res.data?.exists) };
                    } catch (err) {
                      return { lotNo: lot.lotNo, exists: false };
                    }
                  })
                );
                const completedLotsCount = lotResults.filter(r => r.exists).length;
                const totalLotsCount = lots.length;
                const exists = completedLotsCount > 0;
                results[fileName] = exists; // Boolean for overall module status

                const allCompleted = completedLotsCount === totalLotsCount;
                console.log("Updating step", key, allCompleted && exists ? "to completed" : "with partial/pending status");
                updateStepStatus(key, {
                  status: allCompleted && exists ? "completed" : "pending",
                  completedLots: completedLotsCount,
                  totalLots: totalLotsCount,
                  fileUrl: null,
                  duration: "--:--",
                });

                // Also populate availableLots and lotReportStatus so the badge is
                // accurate without requiring the LotWisePanel to be opened first.
                setAvailableLots(lots);
                setLotReportStatus((prev) => {
                  const next = { ...prev };
                  lotResults.forEach(({ lotNo, exists: lotExists }) => {
                    next[lotNo] = lotExists;
                  });
                  return next;
                });
              }
            } catch (err) {
              console.error(`Failed to check lot files for box breaking`, err);
              results[fileName] = false;
            }
          } else {
            const res = await API.get(
              `/EnvelopeBreakages/Reports/Exists?projectId=${projectId}&fileName=${fileName}`
            );
            const exists = res.data.exists;
            results[fileName] = exists;

            if (exists) {
              const actualFileName = res.data?.fileName || fileName;
              const fileUrl = `${url3}/${projectId}/${actualFileName}?DateTime=${new Date().toISOString()}`;
              console.log("Updating step", key, "to completed");
              updateStepStatus(key, {
                status: "completed",
                fileUrl,
                duration: "--:--",
              });
            }
          }
        } catch (err) {
          console.error(`Failed to check file: ${fileName}`, err);
          results[fileName] = false;
        }
      })
    );
  };

  const fetchTemplates = async () => {
    if (!groupId || !typeId || !projectId) {
      setTemplateOptions([]);
      return;
    }
    setTemplatesLoading(true);
    try {
      const res = await API.get("/RPTTemplates/by-group", {
        params: {
          groupId,
          typeId,
          projectId,
        },
      });
      const fetchedTemplates = res.data || [];
      setAllTemplateOptions(fetchedTemplates);
      setTemplateOptions(
        fetchedTemplates.filter((t) => t.hasMapping !== false && !t.isDeleted)
      );
    } catch (err) {
      console.error("Failed to fetch templates", err);
      message.error("Failed to load templates for this project.");
    } finally {
      setTemplatesLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      fetchTemplates();
    } else {
      setTemplateOptions([]);
      setAllTemplateOptions([]);
    }
  }, [projectId, groupId, typeId]);

  useEffect(() => {
    setTemplatePanel({ open: false, moduleKey: null });
    setTemplateDownloads({});
    setGeneratingTemplates({});
    setTemplateReportStatus({});
    setStaleTemplateIds(new Set());
    // Clear envelope lot reports when project changes but don't clear if projectId is null (initial load)
    if (projectId) {
      setEnvLotReports([]);
    }
  }, [projectId]);

  // Cleanup blob URLs when component unmounts
  useEffect(() => {
    return () => {
      envLotReports.forEach(report => {
        if (report.url) {
          window.URL.revokeObjectURL(report.url);
        }
      });
    };
  }, []);

  const loadEnvLotReports = async () => {
    if (!projectId) {
      console.log('No projectId, skipping load');
      return;
    }

    setReportsLoading(true);
    try {
      console.log('Loading envelope lot reports for project:', projectId);

      // First test if the API is accessible
      try {
        await API.get('/EnvelopeLotReports/Test');
      } catch (err) {
        console.warn('EnvelopeLotReports API test failed, but continuing...');
      }

      const response = await API.get(`/EnvelopeLotReports/ByProject/${projectId}`);
      const reports = response.data || [];

      if (reports.length === 0) {
        setEnvLotReports([]);
        return;
      }

      // Transform API data to match our component format
      const transformedReports = reports.map((report) => ({
        id: `${report.templateId}_${report.envLotNumbers}_${report.id}`,
        templateId: report.templateId,
        templateName: report.templateName,
        envLotNumbers: report.envLotNumbers ? report.envLotNumbers.split(',').map(num => parseInt(num.trim())).filter(num => !isNaN(num)) : [],
        envLotKey: report.envLotNumbers,
        lotNumber: report.lotNo || report.lotNumber, // Use lotNo from database (the new field we added)
        fileName: report.fileName,
        generatedAt: report.generatedAt,
        generatedByUserId: report.generatedByUserId || report.GeneratedByUserId,
        downloadedByUserId: report.downloadedByUserId || report.DownloadedByUserId,
        filePath: report.filePath, // Include the server file path
        url: null, // Will be set when downloading
        dbId: report.id // Store the database ID for deletion
      }));

      setEnvLotReports(transformedReports);
    } catch (err) {
      console.error("Failed to load envelope lot reports from API", err);
      setEnvLotReports([]);
    } finally {
      setReportsLoading(false);
    }
  };

  // Load envelope lot reports from API on component mount
  useEffect(() => {
    loadEnvLotReports();
  }, [projectId]);

  // Remove localStorage save effect since we're using API now

  const loadMappingUpdates = () => {
    try {
      const raw = localStorage.getItem(mappingUpdateKey);
      const parsed = raw ? JSON.parse(raw) : {};
      setMappingUpdateMap(parsed && typeof parsed === "object" ? parsed : {});
    } catch (err) {
      setMappingUpdateMap({});
    }
  };

  const clearMappingUpdate = (templateId) => {
    if (!templateId) return;
    try {
      const raw = localStorage.getItem(mappingUpdateKey);
      const parsed = raw ? JSON.parse(raw) : {};
      if (parsed && typeof parsed === "object" && templateId in parsed) {
        const next = { ...parsed };
        delete next[templateId];
        localStorage.setItem(mappingUpdateKey, JSON.stringify(next));
        setMappingUpdateMap(next);
      }
    } catch (err) {
      // ignore storage cleanup errors
    }
  };

  const getMappingUpdateTime = (templateId) => mappingUpdateMap?.[templateId] || null;

  const isMappingNewerThanReport = (templateId) => {
    if (!templateId) return false;
    const updatedAt = getMappingUpdateTime(templateId);
    if (!updatedAt) return false;
    const updatedTime = Date.parse(updatedAt);
    if (!Number.isFinite(updatedTime)) return true;
    const generatedAt = templateReportStatus[templateId]?.generatedAt;
    if (!generatedAt) return true;
    const generatedTime = Date.parse(generatedAt);
    if (!Number.isFinite(generatedTime)) return true;
    return updatedTime > generatedTime;
  };

  useEffect(() => {
    loadMappingUpdates();
  }, [projectId]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event?.key === mappingUpdateKey) {
        loadMappingUpdates();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const computeRunOrder = (names = []) => {
    const lowerNames = names.map((n) => String(n).toLowerCase());
    console.log("Module names:", lowerNames);
    const order = [];

    // Real module-based steps — use specific substrings to avoid cross-matching
    if (lowerNames.some((n) => n.includes("duplicate")))
      order.push({ key: "duplicate", title: "Duplicate Processing" });
    if (lowerNames.includes("envelope setup and enhancement"))
      order.push({ key: "enhancement", title: "Enhancement Processing" });
    if (lowerNames.some((n) => n.includes("extra")))
      order.push({ key: "extra", title: "Extra Configuration" });
    // Use exact phrase "envelope breaking" to avoid matching "envelope summary"
    if (lowerNames.some((n) => n.includes("envelope breaking")))
      order.push({ key: "envelopebreaking", title: "Envelope Breaking" });
    if (lowerNames.some((n) => n.includes("box")))
      order.push({ key: "box", title: "Box Breaking" });

    // Summary steps — always run after box breaking (not dependent on module names)
    // Only add if explicitly enabled
    if (lowerNames.some((n) => n.includes("envelope summary")))
      order.push({ key: "envelopeSummary", title: "Envelope Summary" });
    if (lowerNames.some((n) => n.includes("catch summary")))
      order.push({ key: "catchSummary", title: "Catch Summary Report" });
    if (lowerNames.some((n) => n.includes("catchomrserialing") || n.includes("catch omr serialing")))
      order.push({ key: "catchOmrSerialing", title: "Catch OMR Serialing" });

    console.log("Final order:", order);
    return order;
  };

  const fetchPipelineRerunStatus = async (targetProjectId, selectedBatch) => {
    if (!targetProjectId) {
      setHasPendingPipelineChanges(false);
      setPipelineStepStatus(null);
      return;
    }
    try {
      const res = await API.get(`/NRDatas/PipelineRerunStatus`, {
        params: { ProjectId: targetProjectId, batch: selectedBatch },
      });
      setHasPendingPipelineChanges(Boolean(res.data?.hasPendingPipelineChanges));
      setPipelineStepStatus(res.data);
    } catch (err) {
      console.error("Failed to fetch pipeline rerun status", err);
      setHasPendingPipelineChanges(false);
      setPipelineStepStatus(null);
    }
  };
  // Load enabled modules when project changes
  useEffect(() => {
    if (!projectId) {
      setEnabledModuleNames([]);
      setProjectConfig(null);
      return;
    }
    const loadEnabled = async () => {
      try {
        setLoadingModules(true);
        const cfgRes = await API.get(`/ProjectConfigs/${projectId}`);
        const cfg = Array.isArray(cfgRes.data) ? cfgRes.data[0] : cfgRes.data;

        // Store full config for display
        setProjectConfig(cfg);

        // Fetch Extra Configuration
        const extrasRes = await API.get(`/ExtrasConfigurations/ByProject/${projectId}`).catch(() => ({ data: [] }));
        setExtraConfigData(Array.isArray(extrasRes.data) ? extrasRes.data : []);

        let moduleEntries = cfg?.modules || [];

        // If IDs, map to names
        if (moduleEntries.length && typeof moduleEntries[0] === "number") {
          const modsRes = await API.get(`/Modules`);
          const allMods = modsRes.data || [];
          setAllModules(allMods);
          const idToName = new Map(allMods.map((m) => [m.id, m.name]));
          moduleEntries = moduleEntries
            .sort((a, b) => a - b)                // Sort ascending
            .map((id) => idToName.get(id))       // Map ID to name
            .filter(Boolean);
        } else {
          // If already names, still fetch all modules once for dependency resolution
          const modsRes = await API.get(`/Modules`);
          setAllModules(modsRes.data || []);
        }
        setEnabledModuleNames(moduleEntries || []);
        const order = computeRunOrder(moduleEntries);
        const initialSteps = order.map((o) => ({
          key: o.key,
          title: o.title,
          status: "pending",
          duration: null,
          fileUrl: null,
        }));
        setSteps(initialSteps);
        setSelectedModules([]);
        await checkReportExistence(projectId);
        await fetchPipelineRerunStatus(projectId, selectedBatch);
      } catch (err) {
        console.error("Failed to load enabled modules", err);
        setEnabledModuleNames([]);
        setSteps([]);
        setProjectConfig(null);
      } finally {
        setLoadingModules(false);
      }
    };

    loadEnabled();
  }, [projectId]);

  // Listen for configuration changes from sessionStorage
  useEffect(() => {
    const configChangeData = sessionStorage.getItem("configChangeData");
    if (configChangeData) {
      try {
        const data = JSON.parse(configChangeData);
        if (data.projectId === projectId && data.affectedReports) {
          // Auto-select the affected reports
          setSelectedModules(data.affectedReports);
          setConfigChanged(true);
          setChangedFieldsInfo(data.changedModules || []);

          // Refresh pipeline rerun status to update pending flags
          fetchPipelineRerunStatus(projectId, selectedBatch);

          // Clear the sessionStorage
          sessionStorage.removeItem("configChangeData");

          message.info(`${data.affectedReports.length} report(s) selected for re-processing`);
        }
      } catch (err) {
        console.error("Failed to parse config change data", err);
      }
    }
  }, [projectId]);

  // Run order helper

  const runDuplicate = async (projectId) => {
    const queryParams = {
      ProjectId: projectId,
      batchId: selectedBatch,
    };
    if (selectedDropdownLot !== "all" && selectedDropdownLot !== null) {
      queryParams.lotNo = selectedDropdownLot;
    }
    const query = new URLSearchParams(queryParams).toString();
    const res = await API.post(`/Duplicate?${query}`);
    const data = res?.data || {};
    const duplicatesRemoved = data.mergedRows ?? data.mergedRows ?? 0;
    message.success(`Duplicate processing completed. Duplicates removed: ${duplicatesRemoved}`);
  };

  const runEnhancement = async (projectId) => {
    let url = `/Duplicate/Enhancement?ProjectId=${projectId}&batch=${selectedBatch}`;
    if (selectedDropdownLot !== "all" && selectedDropdownLot !== null) {
      url += `&lotNo=${selectedDropdownLot}`;
    }
    const res = await API.post(url);
    message.success(res?.data?.message || "Enhancement processing completed");
  };

  const runExtras = async (projectId) => {
    let url = `/ExtraEnvelopes?ProjectId=${projectId}&batchNo=${selectedBatch}`;
    if (selectedDropdownLot !== "all" && selectedDropdownLot !== null) {
      url += `&lotNo=${selectedDropdownLot}`;
    }
    const res = await API.post(url);
    message.success(res?.data?.message || "Extras calculation completed");
  };

  const runEnvelope = async (projectId) => {
    let url = `/EnvelopeBreakageProcessing/ProcessEnvelopeBreaking?ProjectId=${projectId}&batchNo=${selectedBatch}`;
    if (selectedDropdownLot !== "all" && selectedDropdownLot !== null) {
      url += `&lotNo=${selectedDropdownLot}`;
    }
    const res = await API.post(url);
    message.success(res?.data?.message || "Envelope breaking completed");
  };

  const runBoxBreaking = async (projectId, lotNumbers = null) => {
    // Build query string with lot numbers
    const params = new URLSearchParams();
    params.append('ProjectId', projectId);
    params.append('batchNo', selectedBatch);

    if (lotNumbers && lotNumbers.length > 0) {
      lotNumbers.forEach(lot => params.append('LotNo', lot));
    }

    const res = await API.post(`/BoxBreakingProcessing/ProcessBoxBreaking?${params.toString()}`);
    message.success(res?.data?.message || "Box breaking completed");
  };

  const runCatchSummary = async (projectId) => {
    const res = await API.get(`/EnvelopeBreakages/CatchEnvelopeSummaryWithExtras?ProjectId=${projectId}`);
    message.success(res?.data?.message || "Box breaking completed");
  };

  const runEnvelopeSummary = async (projectId) => {
    const res = await API.get(`/EnvelopeBreakages/EnvelopeSummaryReport?ProjectId=${projectId}`);
    message.success(res?.data?.message || "Box breaking completed");
  };

  const runCatchOmrSerialing = async (projectId) => {
    const res = await API.get(`/EnvelopeBreakageProcessing/CatchWithOmrSerialing?ProjectId=${projectId}`);
    message.success(res?.data?.message || "Catch OMR Serialing completed");
  };


  const updateStepStatus = (key, patch) => {
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  };

  const fetchLotsForSelection = async () => {
    try {
      // Use the endpoint provided by user
      const res = await API.get(`/NRDataLots/GetByProjectId/${projectId}`);
      const data = res.data || [];
      // Check if any catches are unassigned (lotNo <= 0)
      setHasUnassignedCatches(data.some(lot => (lot.lotNo ?? 0) <= 0 && (lot.catchCount ?? lot.catches ?? 1) > 0));
      // Transform to use hasPages directly from API
      return data.filter(lot => lot.lotNo > 0).map(lot => ({
        ...lot,
        hasPages: lot.hasPages !== undefined ? lot.hasPages : true
      }));
    } catch (err) {
      console.error("Failed to fetch lots for selection", err);
      // Fallback to internal route if NRDatas fails
      try {
        const res = await API.get(`/NRDataLots/by-project/${projectId}`);
        const allData = res.data || [];

        // Group by lot and count catches manually, and check pages
        const lotMap = new Map();
        allData.forEach(item => {
          if (item.lotNo > 0) {
            if (!lotMap.has(item.lotNo)) {
              lotMap.set(item.lotNo, { catches: new Set(), steps: [], hasPages: true, pageValues: [] });
            }
            if (item.catchNo) {
              lotMap.get(item.lotNo).catches.add(item.catchNo);
            }
            if (item.steps !== undefined) {
              lotMap.get(item.lotNo).steps.push(item.steps);
            }
            // Check if pages exist
            const pages = item.pages ?? item.Pages ?? null;
            const hasValidPages = pages !== 0 && pages !== null && pages !== undefined && pages !== '' && pages !== '-';
            if (!hasValidPages) {
              lotMap.get(item.lotNo).hasPages = false;
            }
            lotMap.get(item.lotNo).pageValues.push(pages);
          }
        });

        // Convert to expected format
        const lots = Array.from(lotMap.entries()).map(([lotNo, info]) => ({
          lotNo,
          catchCount: info.catches.size,
          minStep: info.steps.length > 0 ? Math.min(...info.steps) : 5,
          hasPages: info.hasPages,
          pageValues: info.pageValues
        })).sort((a, b) => a.lotNo - b.lotNo);

        return lots;
      } catch (fallbackErr) {
        return [];
      }
    }
  };

  // Helper function to check if a lot has pages
  const isLotMissingPages = (lot) => {
    // Check direct hasPages property
    if (lot.hasPages !== undefined) {
      return !lot.hasPages;
    }
    // Fallback: check if pages is missing/empty/zero
    const pages = lot.pages ?? lot.Pages ?? null;
    return pages === 0 || pages === null || pages === undefined || pages === '' || pages === '-' || pages === 'null';
  };

  const fetchMissingEnvLotCatchesForSelection = async (projectIdParam) => {
    console.log(projectIdParam)
    try {
      const res = await API.get(`/NRDataLots/GetMissingEnvLotCatches/${projectIdParam}`);
      const rawData = res.data || [];
      return rawData.map(item => ({
        catchNo: (item.catchNo ?? item.CatchNo ?? "").toString().trim(),
        count: item.count ?? item.Count ?? 0,
      })).filter(item => item.catchNo);
    } catch (err) {
      console.error("Failed to fetch missing EnvLot catches for selection", err);
      message.error("Failed to load catches missing envelope lot assignments.");
      return [];
    }
  };

  const fetchAssignedEnvLotCatchesForSelection = async (projectIdParam) => {
    try {
      const res = await API.get(`/NRDataLots/GetAssignedEnvLotCatches/${projectIdParam}`);
      const rawData = res.data || [];
      const grouped = rawData.reduce((acc, item) => {
        const envLotNo = item.envLotNo ?? item.EnvLotNo;
        const catchNo = (item.catchNo ?? item.CatchNo ?? "").toString().trim();
        if (envLotNo && catchNo) {
          if (!acc[envLotNo]) {
            acc[envLotNo] = [];
          }
          acc[envLotNo].push(catchNo);
        }
        return acc;
      }, {});
      
      return Object.entries(grouped).map(([envLotNo, catches]) => ({
        envLotNo: Number(envLotNo),
        catches
      })).sort((a, b) => a.envLotNo - b.envLotNo);
    } catch (err) {
      console.error("Failed to fetch assigned EnvLot catches for selection", err);
      message.error("Failed to load assigned envelope lots.");
      return [];
    }
  };

  const assignEnvLotByCatchNos = async (catchNos) => {
    try {
      const normalizedCatchNos = Array.from(
        new Set(
          (catchNos || [])
            .map((c) => (c ?? "").toString().trim())
            .filter((c) => c)
        )
      );

      if (normalizedCatchNos.length === 0) {
        return null;
      }

      const res = await API.post("/NRDataLots/AssignEnvLotByCatches", {
        projectId: Number(projectId),
        catchNos: normalizedCatchNos,
      });
      return res.data;
    } catch (err) {
      console.error("Failed to assign EnvLot by catches", err);
      const errorMessage = err?.response?.data?.message || "Failed to assign envelope lot.";
      message.error(errorMessage);
      return null;
    }
  };

  const revertEnvLotByCatchNos = async (catchNos) => {
    try {
      const normalizedCatchNos = Array.from(
        new Set(
          (catchNos || [])
            .map((c) => (c ?? "").toString().trim())
            .filter((c) => c)
        )
      );

      if (normalizedCatchNos.length === 0) {
        return false;
      }

      const res = await API.post("/NRDataLots/UnassignEnvLotByCatches", {
        projectId: Number(projectId),
        catchNos: normalizedCatchNos,
      });

      if (res?.status === 200) {
        message.warning("Report generation failed. Env lot assignment was reverted.");
        return true;
      }

      return false;
    } catch (err) {
      console.error("Failed to revert EnvLot assignment", err);
      return false;
    }
  };

  const showEnvLotSelectionModal = (envLots, isRegenerate = false, extraProps = {}) => {
    setEnvLotSearch("");
    return new Promise((resolve) => {
      setEnvLotSelectionModal({
        visible: true,
        availableEnvLots: envLots,
        selectedEnvLots: [],
        loading: false,
        resolve,
        isRegenerate,
        showAssigned: extraProps.showAssigned,
        assignedEnvLots: extraProps.assignedEnvLots,
        unassignedCatches: extraProps.unassignedCatches,
        ...extraProps
      });
    });
  };

  const handleEnvLotSelectionConfirm = () => {
    const { selectedEnvLots, resolve, isRegenerate } = envLotSelectionModal;

    if (selectedEnvLots.length === 0) {
      message.warning(`Please select at least one ${isRegenerate ? 'lot' : 'catch'} to process`);
      return;
    }

    setEnvLotSelectionModal(prev => ({
      ...prev,
      visible: false,
      resolve: null
    }));
    
    setEnvLotSearch("");
    if (resolve) {
      resolve(selectedEnvLots);
    }
  };

  const handleEnvLotSelectionCancel = () => {
    const { resolve } = envLotSelectionModal;

    setEnvLotSelectionModal({
      visible: false,
      availableEnvLots: [],
      selectedEnvLots: [],
      loading: false,
      resolve: null
    });
    setEnvLotSearch("")

    if (resolve) {
      resolve(null);
    }
  };

  const handleSelectAllEnvLots = (checked) => {
    if (checked) {
      setEnvLotSelectionModal(prev => {
        let ids = [];
        if (prev.showAssigned) {
          ids = (prev.assignedEnvLots || []).map(lot => lot.envLotNo);
        } else {
          ids = (prev.unassignedCatches || []).map(lot => lot.catchNo);
        }

        return {
          ...prev,
          selectedEnvLots: ids
        };
      });
    } else {
      setEnvLotSelectionModal(prev => ({
        ...prev,
        selectedEnvLots: []
      }));
    }
  };

  const handleEnvLotToggle = (itemId, checked) => {
    setEnvLotSelectionModal(prev => {
      const newSelectedEnvLots = checked
        ? [...prev.selectedEnvLots, itemId]
        : prev.selectedEnvLots.filter(l => l !== itemId);

      return {
        ...prev,
        selectedEnvLots: newSelectedEnvLots
      };
    });
  };

  const isQuantitySheetTemplate = (templateName) => {
    if (!templateName) return false;
    const n = templateName.toLowerCase().replace(/[^a-z0-9]/g, "");
    return n.includes("quantitysheet") || n.includes("qtysheet");
  };

  const isCompositeSummaryTemplate = (templateName) => {
    if (!templateName) return false;
    const n = templateName.toLowerCase().replace(/[^a-z0-9]/g, "");
    return n.includes("compositesummary");
  };

  const showExistingReportModal = (report) => {
    return new Promise((resolve) => {
      setExistingReportModal({
        visible: true,
        report,
        resolve
      });
    });
  };

  const handleExistingReportDownload = async () => {
    const { report, resolve } = existingReportModal;
    setExistingReportModal({ visible: false, report: null, resolve: null });

    // Automatically expand the reports section for this template when downloading
    if (report?.templateId) {
      setExpandedReportsTemplates(prev => {
        const newSet = new Set(prev);
        newSet.add(report.templateId);
        return newSet;
      });
    }

    if (resolve) {
      resolve('download');
    }
  };

  const handleExistingReportGenerate = () => {
    const { resolve } = existingReportModal;
    setExistingReportModal({ visible: false, report: null, resolve: null });
    if (resolve) {
      resolve('generate');
    }
  };

  const handleExistingReportCancel = () => {
    const { resolve } = existingReportModal;
    setExistingReportModal({ visible: false, report: null, resolve: null });
    if (resolve) {
      resolve('cancel');
    }
  };

  const handleReportsExpansion = (templateId, activeKey) => {
    setExpandedReportsTemplates(prev => {
      const newSet = new Set(prev);
      if (activeKey && activeKey.includes('reports')) {
        newSet.add(templateId);
      } else {
        newSet.delete(templateId);
      }
      return newSet;
    });
  };

  const showLotSelectionModal = (lots, options = {}) => {
    return new Promise((resolve) => {
      // For quantity sheet, select all lots including those without pages
      // For other templates, only select valid lots (those with pages) by default
      const validLots = lots.filter(lot => lot.hasPages);
      const defaultSelectedLots = options.isQuantitySheet 
        ? lots.map(lot => lot.lotNo)
        : validLots.map(lot => lot.lotNo);
      
      setLotSelectionModal({
        visible: true,
        availableLots: lots,
        selectedLots: defaultSelectedLots,
        loading: false,
        resolve,
        description: options.description || "Please select which lot(s) you want to process. You can select all lots or specific ones.",
        okText: options.okText || "Process Selected Lots",
        isQuantitySheet: options.isQuantitySheet || false
      });
    });
  };

  const handleLotSelectionConfirm = () => {
    const { selectedLots, resolve } = lotSelectionModal;

    if (selectedLots.length === 0) {
      message.warning("Please select at least one lot to process");
      return;
    }

    setLotSelectionModal({
      visible: false,
      availableLots: [],
      selectedLots: [],
      description: "",
      okText: "",
      loading: false,
      resolve: null,
      isQuantitySheet: false
    });

    if (resolve) {
      resolve(selectedLots);
    }
  };

  const handleLotSelectionCancel = () => {
    const { resolve } = lotSelectionModal;

    setLotSelectionModal({
      visible: false,
      availableLots: [],
      selectedLots: [],
      description: "",
      okText: "",
      loading: false,
      resolve: null,
      isQuantitySheet: false
    });

    if (resolve) {
      resolve(null); // Return null to indicate cancellation
    }
  };

  const handleSelectAllLots = (checked, lotsToSelect = null) => {
    if (checked) {
      const lotsToAdd = lotsToSelect || lotSelectionModal.availableLots.map(lot => lot.lotNo);
      setLotSelectionModal(prev => ({
        ...prev,
        selectedLots: lotsToAdd
      }));
    } else {
      setLotSelectionModal(prev => ({
        ...prev,
        selectedLots: []
      }));
    }
  };

  const handleLotToggle = (lotNo, checked) => {
    setLotSelectionModal(prev => {
      const newSelectedLots = checked
        ? [...prev.selectedLots, lotNo]
        : prev.selectedLots.filter(l => l !== lotNo);

      return {
        ...prev,
        selectedLots: newSelectedLots
      };
    });
  };

  const handleModuleSelection = (moduleKey, checked) => {
    if (!checked) {
      setSelectedModules((prev) => prev.filter((key) => key !== moduleKey));
      return;
    }

    // --- RECURSIVE DEPENDENCY RESOLUTION ---
    const getRecursiveAncestors = (key, memo = new Set()) => {
      if (memo.has(key)) return memo;
      memo.add(key);

      const name = moduleKeyToNameMap[key];
      if (!name) return memo;

      const module = allModules.find(m => m.name.toLowerCase() === name.toLowerCase());
      if (!module) return memo;

      const parentIds = module.parentModuleIds || (module.parentModuleId ? [module.parentModuleId] : []);

      parentIds.forEach(pid => {
        const parent = allModules.find(m => m.id === pid);
        if (parent) {
          // Map parent name back to key
          const parentKey = Object.keys(moduleKeyToNameMap).find(
            k => moduleKeyToNameMap[k].toLowerCase() === parent.name.toLowerCase()
          );
          if (parentKey) {
            getRecursiveAncestors(parentKey, memo);
          }
        }
      });

      return memo;
    };

    const ancestors = Array.from(getRecursiveAncestors(moduleKey));

    setSelectedModules((prev) => {
      // Filter ancestors to only include those NOT completed (except the clicked one)
      // If a step has pending changes (is outdated), it is treated as not completed.
      const keysToSelect = ancestors.filter(key => {
        const step = steps.find(s => s.key === key);
        const keyMap = {
          duplicate: "duplicatePending",
          enhancement: "enhancementPending",
          extra: "extraPending",
          envelopebreaking: "envelopePending",
          box: "boxPending"
        };
        const flag = keyMap[key];
        const isPending = flag && pipelineStepStatus && pipelineStepStatus[flag];
        return (step && (step.status !== "completed" || isPending)) || key === moduleKey;
      });

      // Merge with existing selections
      return Array.from(new Set([...prev, ...keysToSelect]));
    });
  };

  const normalizeModuleIds = (raw) => {
    if (raw == null) return [];
    if (Array.isArray(raw)) {
      return raw.map((val) => Number(val)).filter((id) => Number.isFinite(id));
    }
    if (typeof raw === "number") return [raw];
    if (typeof raw === "string") {
      return raw
        .split(",")
        .map((val) => Number(val.trim()))
        .filter((id) => Number.isFinite(id));
    }
    return [];
  };

  const resolveTemplateId = (template) => {
    const raw =
      template?.templateId ??
      template?.TemplateId ??
      template?.id ??
      template?.Id ??
      null;
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
  };

  const resolveTemplateName = (template) => {
    const name =
      template?.templateName ??
      template?.TemplateName ??
      template?.name ??
      template?.Name ??
      "";
    if (name) return name;
    const id = resolveTemplateId(template);
    return id ? `Template ${id}` : "Template";
  };

  const moduleKeyToIdMap = useMemo(() => {
    const map = {};
    Object.entries(moduleKeyToNameMap).forEach(([key, name]) => {
      const match = allModules.find(
        (m) => String(m.name || "").toLowerCase() === String(name).toLowerCase()
      );
      if (match?.id) map[key] = match.id;
    });
    return map;
  }, [allModules]);



  const templatesByModuleId = useMemo(() => {
    const map = new Map();
    (templateOptions || []).forEach((template) => {
      const ids = normalizeModuleIds(
        template?.moduleIds ?? template?.ModuleIds
      );
      ids.forEach((id) => {
        const list = map.get(id) || [];
        list.push(template);
        map.set(id, list);
      });
    });
    return map;
  }, [templateOptions]);

  const getTemplatesForModuleKey = (moduleKey) => {
    const moduleId = moduleKeyToIdMap[moduleKey];
    if (!moduleId) return [];
    return templatesByModuleId.get(moduleId) || [];
  };

const loadGeneratedTemplateReports = async () => {
  if (!rptApiUrl || !projectId) return;

  const results = [];

  for (const moduleKey of Object.keys(moduleKeyToIdMap)) {
    const moduleName =
      moduleKeyToNameMap[moduleKey] || moduleKey;

    // Only process Box Breaking module
    if (moduleName.toLowerCase() !== "box breaking") {
      continue;
    }

    const templates = getTemplatesForModuleKey(moduleKey);

    if (!templates.length) continue;

    const boxResults = await Promise.all(
      (availableLots || []).flatMap((lot) =>
        templates.map(async (template) => {
          const templateId = resolveTemplateId(template);

          if (!templateId) return null;

          try {
            const res = await axios.get(
              `${rptApiUrl}/report/generated-exists`,
              {
                params: {
                  templateId,
                  projectId: Number(projectId),
                  lotNumber: lot.lotNo,
                },
              }
            );

            if (!res?.data?.exists) return null;

            return {
              ...res.data,
              templateId,
              lotNo: lot.lotNo,
              module: moduleName,
              templateName:
                template.templateName ||
                template.name ||
                "-",
            };
          } catch (error) {
            console.error(
              "Failed to check Box Breaking template:",
              templateId,
              "Lot:",
              lot.lotNo,
              error
            );

            return null;
          }
        })
      )
    );

    results.push(...boxResults.filter(Boolean));
  }

  setGeneratedTemplateReports(results);
};


  useEffect(() => {
  if (
    !projectId ||
    !templateOptions.length ||
    !Object.keys(moduleKeyToIdMap).length
  ) {
    return;
  }

  loadGeneratedTemplateReports();
}, [
  projectId,
  templateOptions,
  moduleKeyToIdMap,
  availableLots,
]);
  const loadTemplateReportStatus = async (moduleKey) => {
    if (!rptApiUrl || !projectId) return;
    const templates = getTemplatesForModuleKey(moduleKey);
    if (!templates.length) return;
    try {
      const results = await Promise.all(
        templates.map(async (template) => {
          const templateId = resolveTemplateId(template);
          if (!templateId) return null;
          const res = await axios.get(`${rptApiUrl}/report/generated-exists`, {
            params: {
              templateId,
              projectId: Number(projectId),
            },
          });
          return { templateId, data: res?.data };
        })
      );

      setTemplateReportStatus((prev) => {
        const next = { ...prev };
        results.forEach((item) => {
          if (!item?.templateId) return;
          next[item.templateId] = {
            exists: Boolean(item?.data?.exists),
            fileName: item?.data?.fileName || null,
            generatedAt: item?.data?.generatedAt || null,
          };
        });
        return next;
      });
    } catch (err) {
      console.error("Failed to check generated reports", err);
    }
  };

  const openTemplatePanel = (moduleKey) => {
    setLotWisePanel({ open: false, moduleKey: null }); // Ensure lot-wise is closed
    setTemplatePanel({ open: true, moduleKey });
  };

  const closeTemplatePanel = () => {
    setTemplatePanel({ open: false, moduleKey: null });
  };

  useEffect(() => {
    if (!templatePanel.open || !templatePanel.moduleKey) return;
    loadTemplateReportStatus(templatePanel.moduleKey);
  }, [templatePanel.open, templatePanel.moduleKey, templateOptions, projectId]);

  // Fetch static variables defined in a template's mapping and prompt user to fill them
  const promptStaticVariables = (template, savedDefaults) => {
    return new Promise((resolve) => {
      const entries = Object.entries(savedDefaults || {});
      if (entries.length === 0) {
        resolve({});
        return;
      }
      const initialValues = Object.fromEntries(entries.map(([k, v]) => [k, v]));
      setStaticVarModal({ open: true, template, variables: savedDefaults, values: initialValues, resolve });
    });
  };

  const handleStaticVarConfirm = () => {
    const { resolve, values } = staticVarModal;
    setStaticVarModal({ open: false, template: null, variables: {}, values: {}, resolve: null });
    if (resolve) resolve(values);
  };

  const handleStaticVarCancel = () => {
    const { resolve } = staticVarModal;
    setStaticVarModal({ open: false, template: null, variables: {}, values: {}, resolve: null });
    if (resolve) resolve(null); // null = cancelled
  };

  const getTemplateStaticVariables = async (templateId) => {
    try {
      const APIURL = import.meta.env.VITE_API_URL;
      const res = await axios.get(`${APIURL}/RPTTemplates/${templateId}/mapping`);
      const raw = res?.data?.mappingJson ?? res?.data?.MappingJson ?? "";
      const parsed = parseMappingJson(raw);
      return parsed.staticVariables || {};
    } catch {
      return {};
    }
  };

  const handleGenerateTemplate = async (template, action = null) => {
    if (!projectId) {
      message.warning("Please select a project");
      return;
    }
    const templateId = resolveTemplateId(template);
    if (!templateId) {
      message.warning("Template not found.");
      return;
    }
    if (!rptApiUrl) {
      message.error("RPT API URL is not configured.");
      return;
    }

    // Check for static variables and prompt user
    const savedDefaults = await getTemplateStaticVariables(templateId);
    let staticVariables = {};
    if (Object.keys(savedDefaults).length > 0) {
      const userValues = await promptStaticVariables(template, savedDefaults);
      if (userValues === null) return; // user cancelled
      staticVariables = userValues;
    }

    let envLotNumbers = [];

    const isQS = isQuantitySheetTemplate(resolveTemplateName(template));
    const isComposite = isCompositeSummaryTemplate(resolveTemplateName(template));

    let selectedLotsForQS = [];
    if (isQS) {
      if (selectedDropdownLot !== "all" && selectedDropdownLot !== null) {
        selectedLotsForQS = [Number(selectedDropdownLot)];
      } else {
        const lots = await fetchLotsForSelection();
        const validLots = (lots || []).filter(lot => lot.lotNo > 0);

        if (validLots.length > 0) {
          const selectedLots = await showLotSelectionModal(validLots, {
            description: "Please select which lot(s) you want to generate for quantity sheet. You can select all lots or specific ones.",
            okText: "Generate",
            isQuantitySheet: true
          });
          if (selectedLots === null) {
            return;
          }
          selectedLotsForQS = selectedLots;
        } else {
          Modal.warning({
            title: "Lot Bifurcation Required",
            content: "Please complete lot bifurcation before generating Quantity Sheet.",
            okText: "OK"
          });
          return;
        }
      }
    }

    // Check if template depends on envelope breaking module
    const envelopeBreakingModuleId = moduleKeyToIdMap["envelopebreaking"];
    const templateModuleIds = normalizeModuleIds(template?.moduleIds ?? template?.ModuleIds);
    const isEnvelopeDependent = envelopeBreakingModuleId && templateModuleIds.includes(envelopeBreakingModuleId);

    // Check if template depends on box breaking module
    const boxBreakingModuleId = moduleKeyToIdMap["box"];
    const isBoxBreakingDependent = boxBreakingModuleId && templateModuleIds.includes(boxBreakingModuleId);

    // Only show env lot modal for reports dependent on envelope breakages (excluding QS)
    let assignedCatchNos = [];
    // Debug: log why the missing-catches branch may not run
    console.debug('handleGenerateTemplate: isQS=', isQS, 'isEnvelopeDependent=', isEnvelopeDependent, 'isBoxBreakingDependent=', isBoxBreakingDependent, 'action=', action, 'projectId=', projectId, 'envelopeBreakingModuleId=', envelopeBreakingModuleId, 'templateModuleIds=', templateModuleIds);
    
    // For box breaking dependent templates, show lot selection modal
    let selectedLotsForBoxBreaking = [];
    if (isBoxBreakingDependent && !isQS && !isComposite) {
      if (selectedDropdownLot !== "all" && selectedDropdownLot !== null) {
        selectedLotsForBoxBreaking = [Number(selectedDropdownLot)];
      } else {
        const lots = await fetchLotsForSelection();
        const validLots = (lots || []).filter(lot => lot.lotNo > 0);

        if (validLots.length > 0) {
          const selectedLots = await showLotSelectionModal(validLots, {
            description: "Please select which lot(s) you want to generate for box breaking template. You can select all lots or specific ones.",
            okText: "Generate",
            isQuantitySheet: false
          });
          if (selectedLots === null) {
            return;
          }
          selectedLotsForBoxBreaking = selectedLots;
          // Don't set envLotNumbers here - we'll set it per lot in the loop
        } else {
          Modal.warning({
            title: "Lot Bifurcation Required",
            content: "Please complete lot bifurcation before generating this template.",
            okText: "OK"
          });
          return;
        }
      }
    }
    
    if (!isQS && !isComposite && isEnvelopeDependent && !isBoxBreakingDependent) {
      if (action === "regenerate") {
        const assignedCatchItems = await fetchAssignedEnvLotCatchesForSelection(projectId);
        if (assignedCatchItems.length > 0) {
          const templateId = resolveTemplateId(template);
          
          let generatedEnvLots = [];
          if (templateId) {
             generatedEnvLots = envLotReports
               .filter(r => r.templateId === templateId)
               .flatMap(r => r.envLotNumbers);
          }
          
          const hasMappingUpdate = templateId ? isMappingNewerThanReport(templateId) : false;
          const isStale = templateId ? staleTemplateIds.has(templateId) : false;
          const templateIsOutdated = hasMappingUpdate || isStale;
          
          const selectedEnvLots = await showEnvLotSelectionModal([], true, {
             assignedEnvLots: assignedCatchItems,
             generatedEnvLots,
             templateIsOutdated,
             staleEnvLotIds,
             showAssigned: true
          });
          if (selectedEnvLots === null) return;
          if (selectedEnvLots.length > 0) {
            envLotNumbers = selectedEnvLots;
          }
        } else {
          message.info("No generated envelope lots available for regeneration.");
          return;
        }
      } else {
        const missingCatchItems = await fetchMissingEnvLotCatchesForSelection(projectId);
        // Fetch assigned env-lot items so user can optionally show them
        const assignedCatchItems = await fetchAssignedEnvLotCatchesForSelection(projectId);
        
        // Show modal even if all catches are assigned, allowing user to select from assigned envelopes for regeneration
        const selectedCatchNos = await showEnvLotSelectionModal([], false, { unassignedCatches: missingCatchItems, assignedEnvLots: assignedCatchItems, showAssigned: missingCatchItems.length === 0 });
        if (selectedCatchNos === null) {
          return; // user cancelled
        }
        if (selectedCatchNos.length > 0) {
          // Separate any selected envLotNos (when user toggled to show assigned) from pure catchNos
          const allAssignedEnvLotNos = (assignedCatchItems || []).map(a => Number(a.envLotNo));
          const selectedEnvLotNos = selectedCatchNos
            .map(s => (typeof s === 'number' ? Number(s) : (String(s).match(/^\d+$/) ? Number(s) : NaN)))
            .filter(n => !isNaN(n) && allAssignedEnvLotNos.includes(n));

          const selectedCatchOnly = selectedCatchNos.filter(s => !selectedEnvLotNos.includes(Number(s)));

          // If catch numbers selected, assign them to an EnvLot
          if (selectedCatchOnly.length > 0) {
            console.log('Assigning catches to EnvLot:', selectedCatchOnly);
            const assignResult = await assignEnvLotByCatchNos(selectedCatchOnly);
            console.log('Assign result:', assignResult);
            if (!assignResult || !assignResult.assignedEnvLotNo) {
              message.error("Failed to assign catches to envelope lot");
              return;
            }
            envLotNumbers.push(assignResult.assignedEnvLotNo);
            assignedCatchNos = selectedCatchOnly;
          }

          // Include any explicitly selected existing envLot numbers for regeneration
          if (selectedEnvLotNos.length > 0) {
            envLotNumbers = envLotNumbers.concat(selectedEnvLotNos);
          }
        }
      }
    }

    // Check if report already exists for this template and envelope lots combination
    const envLotKey = isQS 
      ? (selectedLotsForQS.length > 0 ? [...selectedLotsForQS].sort((a, b) => a - b).join(',') : "")
      : (envLotNumbers.length > 0 ? [...envLotNumbers].sort((a, b) => a - b).join(',') : (isComposite ? "" : null));

    if (envLotKey !== null) {
      const existingReport = envLotReports.find(report =>
        report.templateId === templateId && (report.envLotKey === envLotKey || (!report.envLotKey && envLotKey === ""))
      );

      if (existingReport) {
        // Show confirmation modal for existing report
        const shouldProceed = await showExistingReportModal(existingReport);
        if (shouldProceed === 'download') {
          // Download existing report
          await handleDownloadEnvLotReport(existingReport);
          return;
        } else if (shouldProceed === 'cancel') {
          return; // User cancelled
        }
        // If shouldProceed === 'generate', continue with generation
      }
    }

    // For quantity sheet, generate one template per lot
    // For other templates, generate one combined template
    // For box breaking templates, loop through selected lots
    const lotsToProcess = isQS ? selectedLotsForQS : (isBoxBreakingDependent ? selectedLotsForBoxBreaking : [null]);

    for (const currentLot of lotsToProcess) {
      const payload = {
        projectId: Number(projectId),
        templateId: Number(templateId),
        ...(Object.keys(staticVariables).length > 0 ? { staticVariables } : {}),
        ...(isQS && currentLot
          ? { LotNos: String(currentLot) }
          : (isBoxBreakingDependent && currentLot
            ? { LotNos: String(currentLot) }
            : (envLotNumbers.length > 0 && !isQS && !isComposite ? { LotNos: envLotNumbers.join(',') } : {}))),
      };
      const messageKey = `generate-report-${payload.templateId}-${Date.now()}`;
      setGeneratingTemplates((prev) => ({ ...prev, [templateId]: true }));
      message.loading({
        content: isQS ? `Generating report for Lot ${currentLot}...` : (isBoxBreakingDependent ? `Generating report for Lot ${currentLot}...` : "Generating report..."),
        key: messageKey,
        duration: 0,
      });

      try {
        // Wrap the API call with retry logic
        const res = await retryAsync(
          () => axios.post(
            `${rptApiUrl}/report/generate-dynamic`,
            payload,
            { responseType: "blob" }
          ),
          3, // max 3 attempts
          1000 // initial delay 1 second
        );

        // Extract file path from response headers (try different case variations)
        const filePath = res.headers['x-generated-file-path'] ||
          res.headers['X-Generated-File-Path'] ||
          res.headers['X-GENERATED-FILE-PATH'] || null;
        console.log('Generated file path:', filePath);
        console.log('All response headers:', res.headers);

        const fileName = buildReportFileName({
          templateName: template?.templateName,
          projectName: projectName || (projectId ? `Project ${projectId}` : undefined),
          typeId: template?.typeId ?? typeId,
          envLotNumbers: isQS ? [currentLot] : envLotNumbers, // Use current lot or envelope lot numbers
        });
        const fileBlob = new Blob([res.data], { type: "application/pdf" });
        const url = window.URL.createObjectURL(fileBlob);

        setTemplateDownloads((prev) => {
          const existing = prev[templateId];
          if (existing?.url) {
            window.URL.revokeObjectURL(existing.url);
          }
          return { ...prev, [templateId]: { url, fileName } };
        });
        setTemplateReportStatus((prev) => ({
          ...prev,
          [templateId]: {
            ...(prev[templateId] || {}),
            exists: true,
            fileName,
            generatedAt: new Date().toISOString(),
          },
        }));
        clearMappingUpdate(templateId);
        // Clear stale flag for this specific template once regenerated
        setStaleTemplateIds((prev) => {
          const next = new Set(prev);
          next.delete(templateId);
          return next;
        });

        // Save generated report to database (so that it's stored in history & available to download)
        try {
          const currentUserId = getCurrentUserId();
          const reportData = {
            projectId: Number(projectId),
            templateId: Number(templateId),
            templateName: template?.templateName || template?.TemplateName || "Template Report",
            envLotNumbers: isQS ? String(currentLot) : (envLotNumbers.length > 0 ? envLotNumbers.join(',') : "0"),
            lotNo: isQS ? Number(currentLot) : (isBoxBreakingDependent && currentLot ? Number(currentLot) : 0),
            fileName: fileName,
            generatedByUserId: currentUserId ? Number(currentUserId) : null,
            filePath: filePath
          };
          console.log('[handleGenerateTemplate] Saving report to database:', reportData);
          await API.post('/EnvelopeLotReports', reportData);
          console.log('[handleGenerateTemplate] Report metadata saved to database.');
        } catch (dbErr) {
          console.error('[handleGenerateTemplate] Failed to save report metadata to database:', dbErr);
        }

        message.success({ content: isQS ? `Report generated for Lot ${currentLot}.` : "Report generated.", key: messageKey });
      } catch (err) {
        console.error("Generate report failed", err);
        const msg = await getErrorMessageAsync(err, "Failed to generate report.");
        const errorDetails = getErrorDetails(err);

        // If we created a temporary envelope lot assignment, revert it on failure
        if (assignedCatchNos.length > 0) {
          await revertEnvLotByCatchNos(assignedCatchNos);
        }

        // Show error with details and retry option
        message.error({ content: msg, key: messageKey, duration: 6 });

        // Show error details modal if available
        if (errorDetails) {
          setErrorDetailsModal({
            visible: true,
            error: errorDetails,
            retryFn: () => {
              setErrorDetailsModal({ visible: false, error: null, retryFn: null, templateId: null });
              // Retry the report generation
              handleGenerateTemplate(template);
            },
            templateId
          });
        }
      } finally {
        setGeneratingTemplates((prev) => ({ ...prev, [templateId]: false }));
        // Refresh the envelope lot reports list, ensuring the newly generated report is present in state
        await loadEnvLotReports();
      }
    } // End of for loop for quantity sheet lots
  };

  const handleDownloadEnvLotReport = async (report) => {
    // Build filename with envelope lot numbers
    const fileName = buildReportFileName({
      templateName: report.templateName,
      projectName: projectName || (projectId ? `Project ${projectId}` : undefined),
      typeId: null, // We don't have typeId in report object
      envLotNumbers: report.envLotNumbers,
    });

    if (report.url) {
      // Use cached blob URL if available
      const link = document.createElement("a");
      link.href = report.url;
      link.download = fileName; // Use the filename with envelope lot numbers
      document.body.appendChild(link);
      link.click();
      link.remove();
      message.success("Download started.");
    } else if (report.filePath) {
      // Try to download from server file path if available
      try {
        message.loading({ content: "Downloading report from server...", key: `download-${report.id}` });

        // Create a download link to the server file
        const serverFileUrl = `${import.meta.env.VITE_RPT_API_URL}/files/${encodeURIComponent(report.filePath)}&fileName=${encodeURIComponent(fileName)}`;
        const link = document.createElement("a");
        link.href = serverFileUrl;
        link.download = fileName; // Use the filename with envelope lot numbers
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Track download in database
        const dbId = report.dbId || report.id;
        if (dbId && !isNaN(Number(dbId))) {
          try {
            const currentUserId = getCurrentUserId();
            await API.put(`/EnvelopeLotReports/${dbId}/track-download`, {
              downloadedByUserId: currentUserId
            });
            loadEnvLotReports();
          } catch (trackErr) {
            console.warn("Failed to track download:", trackErr);
          }
        }

        message.success({ content: "Download started.", key: `download-${report.id}` });
      } catch (err) {
        console.error("Failed to download from server path", err);
        // Fallback to API download
        await downloadFromApi(report, fileName);
      }
    } else {
      // Fallback to API download
      await downloadFromApi(report, fileName);
    }
  };

  const downloadFromApi = async (report, fileName) => {
    // Try to re-download from server if blob URL is not available (after page refresh)
    if (!rptApiUrl || !projectId) {
      message.error("Cannot download report. Please regenerate the report.");
      return;
    }

    try {
      message.loading({ content: "Downloading report...", key: `download-${report.id}` });

      // Check if this is a quantity sheet template
      const isQS = isQuantitySheetTemplate(report.templateName);

      const params = {
        templateId: report.templateId,
        projectId: Number(projectId),
        lotNumber: report.lotNumber || report.lotNo || report.extractedLotNumber || null,
        lotNos: (!isQS && report.envLotNumbers && report.envLotNumbers.length > 0) ? report.envLotNumbers.join(',') : null
      };

      const res = await axios.get(`${rptApiUrl}/report/generated-download`, {
        params,
        responseType: "blob",
      });

      const fileBlob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(fileBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName || report.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      message.success({ content: "Download started.", key: `download-${report.id}` });
    } catch (err) {
      console.error("Failed to download report", err);
      message.error({
        content: "Failed to download report. Please regenerate it.",
        key: `download-${report.id}`
      });
    }
  };

  const handleDeleteEnvLotReport = async (reportId) => {
    try {
      const report = envLotReports.find(r => r.id === reportId);
      if (!report) {
        message.error("Report not found.");
        return;
      }

      // Delete from database if it has a dbId
      if (report.dbId) {
        await API.delete(`/EnvelopeLotReports/${report.dbId}`);
      }

      // Remove from local state
      setEnvLotReports(prev => {
        const reportToRemove = prev.find(r => r.id === reportId);
        if (reportToRemove?.url) {
          window.URL.revokeObjectURL(reportToRemove.url);
        }
        return prev.filter(r => r.id !== reportId);
      });

      message.success("Report deleted successfully.");
    } catch (err) {
      console.error("Failed to delete report", err);
      message.error("Failed to delete report from database.");
    }
  };

  const handleDownloadTemplate = async (template) => {
    const templateId = resolveTemplateId(template);
    if (!templateId) {
      message.warning("Template not found.");
      return;
    }
    const cached = templateDownloads[templateId];
    if (cached?.url) {
      const link = document.createElement("a");
      link.href = cached.url;
      link.download = cached.fileName || "report.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      message.success("Download started.");
      return;
    }

    if (!rptApiUrl || !projectId) {
      message.warning("Please generate the report first.");
      return;
    }

    try {
      const res = await axios.get(`${base}/api/report/generated-download`, {
        params: {
          templateId,
          projectId: Number(projectId),
        },
        responseType: "blob",
      });
      const fileName = buildReportFileName({
        templateName: template?.templateName,
        projectName: projectName || (projectId ? `Project ${projectId}` : undefined),
        typeId: template?.typeId ?? typeId,
      });
      const fileBlob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(fileBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      message.success("Download started.");
    } catch (err) {
      console.error("Download failed", err);
      const msg = await getErrorMessageAsync(err, "Please generate the report first.");
      message.error(msg);
    }
  };

  const handleGenerateAllTemplates = async () => {
    if (!templatePanel.moduleKey) return;
    const templates = getTemplatesForModuleKey(templatePanel.moduleKey);
    const pending = templates.filter((template) => {
      const templateId = resolveTemplateId(template);
      if (!templateId) return false;
      const exists = templateReportStatus[templateId]?.exists;
      return !exists || isMappingNewerThanReport(templateId) || staleTemplateIds.has(templateId);
    });

    if (pending.length === 0) {
      message.info("All templates are already generated.");
      return;
    }

    setBulkGenerating(true);
    try {
      await Promise.all(pending.map((template) => handleGenerateTemplate(template)));
      await loadTemplateReportStatus(templatePanel.moduleKey);
    } finally {
      setBulkGenerating(false);
    }
  };

  const handleDownloadAllTemplates = async () => {
    if (!templatePanel.moduleKey) return;
    if (!rptApiUrl || !projectId) {
      message.warning("Please generate the report first.");
      return;
    }
    const templates = getTemplatesForModuleKey(templatePanel.moduleKey);
    const ids = templates
      .map((template) => resolveTemplateId(template))
      .filter(Boolean);

    if (!ids.length) {
      message.warning("No templates available.");
      return;
    }

    const missing = ids.filter((id) => !templateReportStatus[id]?.exists);
    if (missing.length > 0) {
      message.warning("Please generate all templates before downloading.");
      return;
    }

    // Build friendly file names in the same order as ids
    const fileNames = templates
      .filter((t) => resolveTemplateId(t))
      .map((t) =>
        buildReportFileName({
          templateName: t?.templateName,
          projectName: projectName || (projectId ? `Project ${projectId}` : undefined),
          typeId: t?.typeId ?? typeId,
        })
      );

    setBulkDownloading(true);
    try {
      const res = await axios.get(`${base}/api/report/generated-download-zip`, {
        params: {
          projectId: Number(projectId),
          templateIds: ids.join(","),
          fileNames: fileNames.join(","),
        },
        responseType: "blob",
      });
      const contentDisposition = res.headers["content-disposition"] || "";
      const fileNameMatch = contentDisposition.match(/filename="?([^\"]+)"?/i);
      const fileName =
        fileNameMatch?.[1] ||
        `reports_project${projectId}_${new Date().toISOString().slice(0, 10)}.zip`;
      const fileBlob = new Blob([res.data], { type: "application/zip" });
      const url = window.URL.createObjectURL(fileBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      message.success("Download started.");
    } catch (err) {
      console.error("Download all failed", err);
      const msg = await getErrorMessageAsync(err, "Failed to download all reports.");
      message.error(msg);
    } finally {
      setBulkDownloading(false);
    }
  };

  const openLotWisePanel = async (moduleKey) => {
    if (moduleKey !== "box") {
      message.info("Lot-wise templates are only available for Box Breaking");
      return;
    }

    // First check if there are templates for box breaking
    const boxTemplates = getTemplatesForModuleKey("box");
    if (boxTemplates.length === 0) {
      message.warning("No templates are linked to the Box Breaking module. Please configure templates first.");
      return;
    }

    setTemplatePanel({ open: false, moduleKey: null }); // Ensure standard panel is closed
    
    // Fetch data BEFORE opening the panel to avoid white screen
    const lots = await fetchAvailableLots();
    
    // Auto-select the tab based on the main dropdown
    if (selectedDropdownLot !== "all" && selectedDropdownLot !== null) {
      setSelectedLotTab(Number(selectedDropdownLot));
    } else if (lots && lots.length > 0) {
      setSelectedLotTab(lots[0].lotNo);
    } else {
      setSelectedLotTab(null);
    }
    
    // Open panel after data is loaded
    setLotWisePanel({ open: true, moduleKey });
  };

  const closeLotWisePanel = () => {
    setLotWisePanel({ open: false, moduleKey: null });
    // NOTE: intentionally NOT clearing availableLots or lotReportStatus here.
    // Those values drive the "X/Y lots completed" badge in the table and must persist
    // after the panel is closed. They will be refreshed next time the panel opens.
    setSelectedLotTab(null);
  };

  const fetchAvailableLots = async () => {
    if (!projectId) return;
    setLoadingLots(true);
    let lots = [];
    try {
      // Try the new endpoint first
      try {
        const res = await API.get(`/NRDataLots/GetByProjectId/${projectId}`);
        const data = res.data || [];
        lots = data.filter(lot => lot.lotNo > 0).map(lot => ({
          ...lot,
          hasPages: lot.hasPages !== undefined ? lot.hasPages : true
        }));
      } catch (err) {
        // Fallback to by-project endpoint if GetByProjectId doesn't exist
        console.log("Using fallback endpoint for lots");
        const res = await API.get(`/NRDataLots/by-project/${projectId}`);
        const allData = res.data || [];

        // Group by lot and count catches manually, and check pages
        const lotMap = new Map();
        allData.forEach(item => {
          if (item.lotNo > 0) {
            if (!lotMap.has(item.lotNo)) {
              lotMap.set(item.lotNo, { catches: new Set(), steps: [], hasPages: true, pageValues: [] });
            }
            if (item.catchNo) {
              lotMap.get(item.lotNo).catches.add(item.catchNo);
            }
            if (item.steps !== undefined) {
              lotMap.get(item.lotNo).steps.push(item.steps);
            }
            // Check if pages exist
            const pages = item.pages ?? item.Pages ?? null;
            const hasValidPages = pages !== 0 && pages !== null && pages !== undefined && pages !== '' && pages !== '-' && pages !== 'null';
            if (!hasValidPages) {
              lotMap.get(item.lotNo).hasPages = false;
            }
            lotMap.get(item.lotNo).pageValues.push(pages);
          }
        });

        // Convert to expected format
        lots = Array.from(lotMap.entries()).map(([lotNo, info]) => ({
          lotNo,
          catchCount: info.catches.size,
          minStep: info.steps.length > 0 ? Math.min(...info.steps) : 5,
          hasPages: info.hasPages,
          pageValues: info.pageValues
        })).sort((a, b) => a.lotNo - b.lotNo);
      }

      setAvailableLots(lots);
      window.dispatchEvent(new Event("refreshLots"));
      // Set first lot as default selected tab
      if (lots.length > 0) {
        setSelectedLotTab(lots[0].lotNo);
      }
      // Load template status for all lots
      await loadLotTemplateStatus(lots);
      // Check lot report existence
      await checkLotReportExistence(lots);
    } catch (err) {
      console.error("Failed to fetch lots", err);
      message.error("Failed to load lots for this project");
      setAvailableLots([]);
      return [];
    } finally {
      setLoadingLots(false);
    }
    return lots;
  };

  const checkLotReportExistence = async (lots) => {
    if (!projectId || !lots || lots.length === 0) return;

    try {
      const results = await Promise.all(
        lots.map(async (lot) => {
          try {
            const fileName = `BoxBreaking_${lot.lotNo}.xlsx`;
            const res = await API.get(
              `/EnvelopeBreakages/Reports/Exists?projectId=${projectId}&fileName=${fileName}`
            );
            return {
              lotNo: lot.lotNo,
              exists: res.data.exists || false,
            };
          } catch (err) {
            console.error(`Failed to check report for lot ${lot.lotNo}`, err);
            return {
              lotNo: lot.lotNo,
              exists: false,
            };
          }
        })
      );

      setLotReportStatus((prev) => {
        const next = { ...prev };
        results.forEach((item) => {
          next[item.lotNo] = item.exists;
        });
        return next;
      });
    } catch (err) {
      console.error("Failed to check lot report existence", err);
    }
  };

  const loadLotTemplateStatus = async (lots) => {
    if (!projectId || !lots || lots.length === 0) return;

    const boxTemplates = getTemplatesForModuleKey("box");
    if (boxTemplates.length === 0) return;

    try {
      const results = await Promise.all(
        lots.flatMap((lot) =>
          boxTemplates.map(async (template) => {
            const templateId = resolveTemplateId(template);
            if (!templateId) return null;

            try {
              const res = await axios.get(`${rptApiUrl}/report/generated-exists`, {
                params: {
                  templateId,
                  projectId: Number(projectId),
                  lotNumber: lot.lotNo,
                },
              });
              return {
                lotNo: lot.lotNo,
                templateId,
                data: res?.data
              };
            } catch (err) {
              return {
                lotNo: lot.lotNo,
                templateId,
                data: null
              };
            }
          })
        )
      );

      setLotTemplateStatus((prev) => {
        const next = { ...prev };
        results.forEach((item) => {
          if (!item?.lotNo || !item?.templateId) return;
          const statusKey = `${item.lotNo}_${item.templateId}`;
          next[statusKey] = {
            exists: Boolean(item?.data?.exists),
            fileName: item?.data?.fileName || null,
            generatedAt: item?.data?.generatedAt || null,
          };
        });
        return next;
      });
    } catch (err) {
      console.error("Failed to check lot template status", err);
    }
  };

  const handleGenerateLotTemplate = async (lotNo, template) => {
    if (!projectId) {
      message.warning("Please select a project");
      return;
    }

    const templateId = resolveTemplateId(template);
    if (!templateId) {
      message.warning("Template not found.");
      return;
    }

    if (!rptApiUrl) {
      message.error("RPT API URL is not configured.");
      return;
    }

    const statusKey = `${lotNo}_${templateId}`;
    const messageKey = `generate-lot-${statusKey}-${Date.now()}`;
    setGeneratingLotTemplates(prev => ({ ...prev, [statusKey]: true }));
    message.loading({
      content: `Generating ${resolveTemplateName(template)} for Lot ${lotNo}...`,
      key: messageKey,
      duration: 0,
    });

    try {
      const payload = {
        projectId: Number(projectId),
        templateId: Number(templateId),
        lotNumber: lotNo,
      };

      let generatedFilePath = null;
      await retryAsync(
        async () => {
          const res = await axios.post(
            `${rptApiUrl}/report/generate-dynamic`,
            payload,
            { responseType: "blob" }
          );
          generatedFilePath = res.headers['x-generated-file-path'] || 
                              res.headers['X-Generated-File-Path'] || 
                              null;
          return res;
        },
        3, // max 3 attempts
        1000 // initial delay 1 second
      );

      // Update status
      setLotTemplateStatus((prev) => ({
        ...prev,
        [statusKey]: {
          exists: true,
          fileName: buildReportFileName({
            templateName: template?.templateName,
            projectName: projectName || (projectId ? `Project ${projectId}` : undefined),
            typeId: template?.typeId ?? typeId,
            lotNumber: lotNo,
          }),
          generatedAt: new Date().toISOString(),
        },
      }));

      // Remove from stale list and clear mapping update flag
      setStaleLotIds((prev) => {
        const next = new Set(prev);
        next.delete(statusKey);
        return next;
      });
      clearMappingUpdate(templateId); // clears "Data updated - regeneration required" tag

      message.success({
        content: `Generated ${resolveTemplateName(template)} for Lot ${lotNo}`,
        key: messageKey,
      });

      // Save the generated report to database
      try {
        const currentUserId = getCurrentUserId();

        const templateId = resolveTemplateId(template);
        const reportData = {
          projectId: Number(projectId),
          templateId,
          templateName: template?.templateName || template?.TemplateName || `Box Breaking Template ${templateId}`,
          envLotNumbers: '0', // Always 0 for lot-based reports
          fileName: buildReportFileName({
            templateName: template?.templateName,
            projectName: projectName || (projectId ? `Project ${projectId}` : undefined),
            typeId: template?.typeId ?? typeId,
            lotNumber: lotNo,
          }),
          generatedBy: 'Current User',
          generatedByUserId: currentUserId,
          filePath: generatedFilePath,
          lotNo: lotNo // Send the actual lot number
        };

        console.log('[handleGenerateLotTemplate] Saving report to database:', reportData);
        console.log('[handleGenerateLotTemplate] Payload details:', {
          projectId: reportData.projectId,
          templateId: reportData.templateId,
          templateName: reportData.templateName,
          envLotNumbers: reportData.envLotNumbers,
          lotNo: reportData.lotNo,
          fileName: reportData.fileName
        });
        
        const saveResponse = await API.post('/EnvelopeLotReports', reportData);
        console.log('[handleGenerateLotTemplate] Report saved successfully:', saveResponse.data);
        await loadEnvLotReports(); // Refresh history immediately
      } catch (saveErr) {
        console.error('[handleGenerateLotTemplate] Failed to save report to database', saveErr);
        console.error("Error response status:", saveErr?.response?.status);
        console.error("Error response data:", saveErr?.response?.data);
        console.error("Error message:", saveErr?.message);
        // Don't block the flow - report was generated successfully
      }
    } catch (err) {
      console.error("Failed to generate lot template", err);
      const errorMsg = await getErrorMessageAsync(err, "Failed to generate template");
      const errorDetails = getErrorDetails(err);
      message.error({
        content: errorMsg,
        key: messageKey,
        duration: 6,
      });
       if (errorDetails) {
        setErrorDetailsModal({
          visible: true,
          error: errorDetails,
          retryFn: () => {
            setErrorDetailsModal({ visible: false, error: null, retryFn: null, templateId: null });
            handleGenerateLotTemplate(lotNo, template);
          },
          templateId
        });
      }
    } finally {
      setGeneratingLotTemplates(prev => ({ ...prev, [statusKey]: false }));
    }
  };

  const handleDownloadLotTemplate = async (lotNo, template) => {
    if (!projectId) {
      message.warning("Please select a project");
      return;
    }

    const templateId = resolveTemplateId(template);
    if (!templateId) {
      message.warning("Template not found.");
      return;
    }

    if (!rptApiUrl) {
      message.error("RPT API URL is not configured.");
      return;
    }

    const statusKey = `${lotNo}_${templateId}`;
    setDownloadingLotTemplates(prev => ({ ...prev, [statusKey]: true }));

    try {
      const res = await axios.get(`${base}/api/report/generated-download`, {
        params: {
          templateId,
          projectId: Number(projectId),
          lotNumber: lotNo,
        },
        responseType: "blob",
      });

      const fileName = buildReportFileName({
        templateName: template?.templateName,
        projectName: projectName || (projectId ? `Project ${projectId}` : undefined),
        typeId: template?.typeId ?? typeId,
        lotNumber: lotNo,
      });

      const fileBlob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(fileBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      message.success(`Downloaded ${resolveTemplateName(template)} for Lot ${lotNo}`);

      // Track download in database
      const matchingReport = envLotReports.find(r => r.templateId === templateId && Number(r.lotNumber) === Number(lotNo));
      const dbId = matchingReport?.dbId || matchingReport?.id;
      if (dbId && !isNaN(Number(dbId))) {
        try {
          const currentUserId = getCurrentUserId();
          await API.put(`/EnvelopeLotReports/${dbId}/track-download`, {
            downloadedByUserId: currentUserId,
            DownloadedByUserId: currentUserId,
          });
          loadEnvLotReports();
        } catch (trackErr) {
          console.warn("[handleDownloadLotTemplate] Failed to track download:", trackErr);
        }
      }
    } catch (err) {
      console.error("Failed to download lot template", err);
      const msg = await getErrorMessageAsync(err, "Please generate the template first.");
      message.error(msg);
    } finally {
      setDownloadingLotTemplates(prev => ({ ...prev, [statusKey]: false }));
    }
  };

  const handleGenerateAllLots = async (lotNo) => {
    if (!projectId) {
      message.warning("No project selected");
      return;
    }

    if (!lotNo) {
      message.warning("Please select a lot");
      return;
    }

    setGeneratingLotReport(prev => ({ ...prev, [lotNo]: true }));
    const messageKey = `generate-lot-report-${lotNo}-${Date.now()}`;
    message.loading({
      content: `Generating Box Breaking report for Lot ${lotNo}...`,
      key: messageKey,
      duration: 0,
    });

    try {
      // Call runBoxBreaking with the specific lot number
      await runBoxBreaking(projectId, [lotNo]);

      // After report generation, check lot report existence to update status
      const lots = await fetchLotsForSelection();
      await checkLotReportExistence(lots);

      message.success({
        content: `Successfully generated Box Breaking report for Lot ${lotNo}`,
        key: messageKey,
      });
    } catch (err) {
      console.error("Failed to generate lot report", err);
      message.error({
        content: err?.response?.data?.message || "Failed to generate report",
        key: messageKey,
        duration: 6,
      });
    } finally {
      setGeneratingLotReport(prev => ({ ...prev, [lotNo]: false }));
    }
  };

  const handleGenerateAllLotTemplates = async (lotNo) => {
    if (!projectId) {
      message.warning("No project selected");
      return;
    }

    if (!lotNo) {
      message.warning("Please select a lot");
      return;
    }

    // Get templates for the box breaking module
    const lotTemplates = getTemplatesForModuleKey("box");

    if (lotTemplates.length === 0) {
      message.warning("No templates available for this lot");
      return;
    }

    // Filter templates that need generation
    const templatesToGenerate = lotTemplates.filter((template) => {
      const templateId = resolveTemplateId(template);
      if (!templateId) return false;
      const statusKey = `${lotNo}_${templateId}`;
      const status = lotTemplateStatus[statusKey];
      const isStale = staleLotIds.has(statusKey);
      return !status?.exists || isStale;
    });

    if (templatesToGenerate.length === 0) {
      message.info("All templates for this lot are already generated.");
      return;
    }

    setBulkGeneratingLots(true);
    const messageKey = `generate-all-lot-templates-${lotNo}-${Date.now()}`;
    message.loading({
      content: `Generating ${templatesToGenerate.length} template(s) for Lot ${lotNo}...`,
      key: messageKey,
      duration: 0,
    });

    try {
      for (const template of templatesToGenerate) {
        await handleGenerateLotTemplate(lotNo, template);
      }
      message.success({
        content: `Successfully generated ${templatesToGenerate.length} template(s) for Lot ${lotNo}`,
        key: messageKey,
      });
    } catch (err) {
      message.error({
        content: "Failed to generate all templates",
        key: messageKey,
      });
    } finally {
      setBulkGeneratingLots(false);
    }
  };

  const handleDownloadAllLots = async (lotNo) => {
    if (!projectId) {
      message.warning("No project selected");
      return;
    }

    if (!lotNo) {
      message.warning("Please select a lot");
      return;
    }

    const lotTemplates = getTemplatesForModuleKey("box");
    const templateIds = lotTemplates
      .map((template) => resolveTemplateId(template))
      .filter(Boolean);

    if (templateIds.length === 0) {
      message.warning("No templates available for this lot");
      return;
    }

    // Check if all templates are generated
    const allGenerated = templateIds.every((templateId) => {
      const statusKey = `${lotNo}_${templateId}`;
      const status = lotTemplateStatus[statusKey];
      const isStale = staleLotIds.has(statusKey);
      return status?.exists && !isStale;
    });

    if (!allGenerated) {
      message.warning("Please generate all templates before downloading");
      return;
    }

    // Build friendly file names for lot-wise templates
    const fileNames = lotTemplates
      .filter((t) => resolveTemplateId(t))
      .map((t) =>
        buildReportFileName({
          templateName: t?.templateName,
          projectName: projectName || (projectId ? `Project ${projectId}` : undefined),
          typeId: t?.typeId ?? typeId,
          lotNumber: lotNo,
        })
      );

    setBulkDownloadingLots(true);
    const messageKey = `download-all-lot-${lotNo}-${Date.now()}`;
    message.loading({
      content: `Downloading templates for Lot ${lotNo}...`,
      key: messageKey,
      duration: 0,
    });

    try {
      const res = await axios.get(`${base}/api/report/generated-download-zip`, {
        params: {
          projectId: Number(projectId),
          templateIds: templateIds.join(","),
          lotNumber: lotNo,
          fileNames: fileNames.join(","),
        },
        responseType: "blob",
      });

      const contentDisposition = res.headers["content-disposition"] || "";
      const fileNameMatch = contentDisposition.match(/filename="?([^\"]+)"?/i);
      const zipFileName = fileNameMatch?.[1] || `Lot${lotNo}_Reports_${projectId}_${new Date().toISOString().slice(0, 10)}.zip`;

      const fileBlob = new Blob([res.data], { type: "application/zip" });
      const url = window.URL.createObjectURL(fileBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = zipFileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      message.success({
        content: `Downloaded all templates for Lot ${lotNo}`,
        key: messageKey,
      });
    } catch (err) {
      console.error("Failed to download all lot templates", err);
      const msg = await getErrorMessageAsync(err, "Failed to download all templates");
      message.error({
        content: msg,
        key: messageKey,
        duration: 6,
      });
    } finally {
      setBulkDownloadingLots(false);
    }
  };

  const handleDownloadLotReport = async (lotNo, reportType = "BoxBreaking") => {
    if (!projectId) {
      message.warning("Please select a project");
      return;
    }

    try {
      // Construct the expected filename pattern: BoxBreaking_lotNo.xlsx
      const fileName = `${reportType}_${lotNo}.xlsx`;

      // Validate that the lot number is in the filename
      // Extract lot numbers from filename (format: BoxBreaking_101_102_103.xlsx)
      const fileNamePattern = `${reportType}_`;
      if (!fileName.startsWith(fileNamePattern)) {
        message.error("Invalid file name format");
        return;
      }

      // Extract lot numbers from filename (everything between reportType_ and .xlsx)
      const lotNumbersStr = fileName
        .replace(`${reportType}_`, "")
        .replace(".xlsx", "");

      const lotNumbers = lotNumbersStr.split("_").map(num => Number(num));

      // Validate that the selected lot number is in the file
      if (!lotNumbers.includes(lotNo)) {
        message.error(`Lot ${lotNo} is not included in this file. File contains lots: ${lotNumbers.join(", ")}`);
        return;
      }

      const fileUrl = `${url3}/${projectId}/${fileName}?DateTime=${new Date().toISOString()}`;

      // Create a temporary link and trigger download
      const link = document.createElement("a");
      link.href = fileUrl;
      link.download = fileName;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      message.success(`Downloading ${reportType} report for Lot ${lotNo}`);
    } catch (err) {
      console.error("Failed to download lot report", err);
      message.error("Failed to download report");
    }
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      const keys = (data || []).filter(isStepSelectable).map((s) => s.key);
      setSelectedModules(keys);
    } else {
      setSelectedModules([]);
    }
  };

  const getConfigForModule = (moduleKey) => {
    if (!projectConfig) return null;

    const getNames = (criteria) => {
      if (!criteria) return ["Not configured"]; // return as array
      if (Array.isArray(criteria)) {
        return criteria.map(item => {
          // If item is an object with 'name' property, return the name
          if (typeof item === 'object' && item !== null && item.name) {
            return item.name;
          }
          // Otherwise return as string
          return String(item);
        });
      }
      if (criteria.names && Array.isArray(criteria.names)) return criteria.names.map(String);
      return [String(criteria)];
    };

    const configMap = {
      duplicate: {
        value: [`Duplicate Remove: ${getNames(projectConfig.duplicateCriteria).join(", ")}`],
      },
      enhancement: {
        value: projectConfig.enhancement
          ? [`Enhancement: ${projectConfig.enhancement}`]
          : ["Not configured"],
      },
      extra: {
        value: extraConfigData && extraConfigData.length > 0
          ? extraConfigData.map(ec => {
            const type = ec.extraType ?? ec.ExtraType;
            const mode = ec.mode ?? ec.Mode;
            const nodalValue = ec.nodalValue ?? ec.NodalValue;
            const typeName = type === 1 ? "Nodal" : type === 2 ? "University" : "Office";
            const isPerNodal = nodalValue ? " (Different per Nodal)" : " (Unified)";
            return `${typeName}: ${mode}${isPerNodal}`;
          })
          : ["Not configured"],
      },
      envelopebreaking: {
        value: [`Sorting: ${getNames(projectConfig.envelopeMakingCriteria)}`],
      },
      box: {
        value: [
          `Box Breaking: ${getNames(projectConfig.boxBreakingCriteria).join(", ")}`,
          `Sorting: ${getNames(projectConfig.sortingBoxReport).join(", ")}`,
          `Duplicate Removal: ${getNames(projectConfig.duplicateRemoveFields).join(", ")}`,
        ],
      },
      envelopeSummary: {
        value: ["Summary Report"],
      },
      catchSummary: {
        value: ["Summary Report"],
      },
      catchOmrSerialing: {
        value: ["Catch Wise Booklet & OMR Serialing"],
      },
    };

    return configMap[moduleKey];
  };

  const handleAudit = async () => {
    if (!projectId) {
      message.warning("Please select a project");
      return;
    }

    if (selectedModules.length === 0) {
      message.warning("Please select at least one module to run");
      return;
    }

    const hasAnyPendingStep = pipelineStepStatus && Object.values(pipelineStepStatus).some(v => v === true);
    if (!hasPendingPipelineChanges && !hasAnyPendingStep && !configChanged) {
      message.info("No new data changes found. Re-run is allowed only after changes (add/remove catch, upload, edit, etc.).");
      return;
    }

    const allOrder = computeRunOrder(enabledModuleNames);

    // Check for unprocessed dependencies
    const selectedIndices = selectedModules.map(key => allOrder.findIndex(s => s.key === key));
    const maxSelectedIndex = Math.max(...selectedIndices);

    const unprocessedSteps = [];
    for (let i = 0; i < maxSelectedIndex; i++) {
      const stepKey = allOrder[i].key;
      const isSelected = selectedModules.includes(stepKey);
      const isCompleted = steps.find(s => s.key === stepKey)?.status === "completed";

      if (!isSelected && !isCompleted) {
        unprocessedSteps.push(allOrder[i]);
      }
    }

    // If there are unprocessed dependencies, show modal
    if (unprocessedSteps.length > 0) {
      setDependencyModal({
        visible: true,
        unprocessedSteps,
        selectedStep: selectedModules[selectedModules.length - 1],
      });
      return;
    }

    // Proceed with processing
    await processModules(selectedModules);
  };

  const processModules = async (modulesToProcess) => {
    const allOrder = computeRunOrder(enabledModuleNames);
    // Only reset the steps being re-run to "pending"; preserve the status of steps NOT selected
    setSteps((prev) =>
      allOrder.map((o) => {
        const existing = prev.find((s) => s.key === o.key);
        if (modulesToProcess.includes(o.key)) {
          // This step is being re-run: reset it
          return { key: o.key, title: o.title, status: "pending", duration: null, fileUrl: null };
        }
        // Not being re-run: keep its existing status (may be "completed" etc.)
        return existing || { key: o.key, title: o.title, status: "pending", duration: null, fileUrl: null };
      })
    );
    setIsProcessing(true);
    const stepTimers = new Map();
    const completedSteps = new Set();
    const freshlyRunSteps = new Set();
    const fileNames = {
      duplicate: "DuplicateTool.xlsx",
      extra: "ExtrasCalculation.xlsx",
      enhancement: "EnhancementProcessing.xlsx",
      envelope: "EnvelopeBreaking.xlsx",
      box: "BoxBreaking.xlsx",
      envelopeSummary: "EnvelopeSummary.xlsx",
      catchSummary: "CatchSummary.xlsx",
      catchOmrSerialing: "CatchWiseBookletAndOmrSerialing.xlsx",
    };

    try {
      for (const step of allOrder) {
        // If this step is not selected, skip it
        if (!modulesToProcess.includes(step.key)) {
          continue;
        }

        // Check if all previous steps (in the sequence) are either completed or not selected
        const stepIndex = allOrder.findIndex((s) => s.key === step.key);
        let canRun = true;

        if (stepIndex > 0) {
          for (let i = 0; i < stepIndex; i++) {
            const prevStepKey = allOrder[i].key;
            const isPrevSelected = modulesToProcess.includes(prevStepKey);
            const isPrevCompleted = completedSteps.has(prevStepKey);

            // If previous step is selected but not completed, we can't run this step
            if (isPrevSelected && !isPrevCompleted) {
              canRun = false;
              break;
            }
          }
        }

        // If previous steps not completed, stop here
        if (!canRun) {
          message.warning(`Cannot run ${step.title}. Previous steps must be completed first.`);
          break;
        }

        // Check if report already exists — skip only if user did NOT explicitly select this module
        const fileName = fileNames[step.key];
        let reportExists = false;
        let actualFileName = fileName;

        if (fileName && !modulesToProcess.includes(step.key)) {
          try {
            const res = await API.get(
              `/EnvelopeBreakages/Reports/Exists?projectId=${projectId}&fileName=${fileName}`
            );
            reportExists = res.data.exists;
            if (res.data?.fileName) {
              actualFileName = res.data.fileName;
            }
          } catch (err) {
            console.error(`Failed to check file existence: ${fileName}`, err);
          }
        }

        // If report already exists and not explicitly selected, mark as completed and skip
        if (reportExists) {
          const fileUrl = `${url3}/${projectId}/${actualFileName}?DateTime=${new Date().toISOString()}`;
          updateStepStatus(step.key, {
            status: "completed",
            fileUrl,
            duration: "00:00",
          });
          completedSteps.add(step.key);
          continue;
        }

        // Process the step
        updateStepStatus(step.key, { status: "in-progress" });
        stepTimers.set(step.key, Date.now());

        try {
          if (step.key === "duplicate") await runDuplicate(projectId);
          else if (step.key === "enhancement") await runEnhancement(projectId);
          else if (step.key === "extra") await runExtras(projectId);
          else if (step.key === "envelopebreaking") await runEnvelope(projectId);
          else if (step.key === "box") {
            if (selectedDropdownLot !== "all" && selectedDropdownLot !== null) {
              // Specific lot selected: bypass lot selection and bifurcation modal completely
              const selectedLots = [Number(selectedDropdownLot)];
              await runBoxBreaking(projectId, selectedLots);
              setLotReportStatus((prev) => ({
                ...prev,
                [Number(selectedDropdownLot)]: true,
              }));
            } else {
              // "All Lots" selected: fetch available lots and show lot selection modal
              const lots = await fetchLotsForSelection();
              const validLots = (lots || []).filter(lot => lot.lotNo > 0);

              if (validLots.length > 0) {
                const selectedLots = await showLotSelectionModal(validLots);

                if (selectedLots === null) {
                  // User cancelled - stop processing
                  message.info("Box breaking cancelled by user");
                  updateStepStatus(step.key, { status: "pending" });
                  setSelectedModules(prev => prev.filter(m => m !== step.key));
                  break;
                }

                // Run box breaking with selected lots
                await runBoxBreaking(projectId, selectedLots);

                // Immediately update availableLots and mark selectedLots as completed
                setAvailableLots(validLots);
                setLotReportStatus((prev) => {
                  const next = { ...prev };
                  selectedLots.forEach((lotNo) => { next[lotNo] = true; });
                  return next;
                });
              } else {
                Modal.warning({
                  title: "Lot Bifurcation Required",
                  content: "Please complete lot bifurcation before running Box Breaking.",
                  okText: "OK"
                });
                updateStepStatus(step.key, { status: "pending" });
                setSelectedModules(prev => prev.filter(m => m !== step.key));
                return;
              }
            }
          }
          else if (step.key === "envelopeSummary") await runEnvelopeSummary(projectId);
          else if (step.key === "catchSummary") await runCatchSummary(projectId);
          else if (step.key === "catchOmrSerialing") await runCatchOmrSerialing(projectId);

          const durationMs = Date.now() - (stepTimers.get(step.key) || Date.now());
          const mm = String(Math.floor(durationMs / 60000)).padStart(2, "0");
          const ss = String(Math.floor((durationMs % 60000) / 1000)).padStart(2, "0");
          updateStepStatus(step.key, {
            status: "completed",
            duration: `${mm}:${ss}`,
            fileUrl: null,
          });
          completedSteps.add(step.key);

          // ✅ Reset hasDeactivatedCatches flag when envelope breaking or box breaking completes
          if ((step.key === "envelopebreaking" || step.key === "box") && hasDeactivatedCatches) {
            setHasDeactivatedCatches(false);
          }

          // Refresh status immediately after each step finishes to avoid "Outdated" flicker
          await fetchPipelineRerunStatus(projectId, selectedBatch
          );
          await checkReportExistence(projectId);
        } catch (stepErr) {
          console.error(`Step ${step.key} failed`, stepErr);
          updateStepStatus(step.key, { status: "failed" });
          throw stepErr;
        }
      }
      await checkReportExistence(projectId);
      await fetchPipelineRerunStatus(projectId,selectedBatch);
      message.success("Data processing completed");

      // Mark modules with templates as stale if their processing step was re-run
      // Also mark downstream modules (steps that come after a re-run step) as stale
      const freshlyRun = modulesToProcess.filter((key) => completedSteps.has(key));
      setFreshlyRunSteps(new Set(freshlyRun));
      
      // Clear the configChanged flag now that fresh run is complete
      setConfigChanged(false);
      const staleIds = new Set();
      freshlyRun.forEach((runKey) => {
        const runIndex = allOrder.findIndex((s) => s.key === runKey);
        allOrder.slice(runIndex).forEach((s) => {
          getTemplatesForModuleKey(s.key).forEach((t) => {
            const id = resolveTemplateId(t);
            if (id) staleIds.add(id);
          });
        });
      });
      if (staleIds.size > 0) {
        setStaleTemplateIds((prev) => new Set([...prev, ...staleIds]));
        // Reset report status for stale templates so Generate All re-enables
        setTemplateReportStatus((prev) => {
          const next = { ...prev };
          staleIds.forEach((id) => {
            if (next[id]) next[id] = { ...next[id], exists: false };
          });
          return next;
        });
      }

      // Mark lot-wise templates as stale if box breaking was re-run
      if (freshlyRun.includes("box")) {
        // Fetch lots to mark templates as stale
        const lots = await fetchLotsForSelection();
        const staleKeys = new Set();

        if (lots.length > 0) {
          const boxTemplates = getTemplatesForModuleKey("box");

          lots.forEach((lot) => {
            boxTemplates.forEach((template) => {
              const templateId = resolveTemplateId(template);
              if (templateId) {
                const statusKey = `${lot.lotNo}_${templateId}`;
                staleKeys.add(statusKey);
              }
            });
          });

          console.log("Marking lot templates as stale:", Array.from(staleKeys));

          // Mark all lot-template combinations as stale
          setStaleLotIds(staleKeys);

          // Reset lot template status to force regeneration
          setLotTemplateStatus((prev) => {
            const next = { ...prev };
            staleKeys.forEach((statusKey) => {
              // Mark as not existing to enable Generate button
              next[statusKey] = { exists: false, fileName: null, generatedAt: null };
            });
            console.log("Updated lot template status:", next);
            return next;
          });

          // Check lot report existence after box breaking completes
          await checkLotReportExistence(lots);

          // Also update availableLots if panel is open
          if (lotWisePanel.open) {
            setAvailableLots(lots);
          }
        }

        // Mark all lot-template combinations as stale
        setStaleLotIds(staleKeys);

        // Reset lot template status
        setLotTemplateStatus((prev) => {
          const next = { ...prev };
          staleKeys.forEach((statusKey) => {
            if (next[statusKey]) {
              next[statusKey] = { ...next[statusKey], exists: false };
            }
          });
          return next;
        });
      }

      // Refresh report history to include any newly generated reports or maintain existing history
      await loadEnvLotReports();

      // Clear selections and close alert after successful processing
      setSelectedModules([]);
      setConfigChanged(false);
    } catch (err) {
      console.error("Processing failed", err);
      message.error(err?.response?.data?.message || err?.message || "Processing failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDependencyModalOk = (includeDependent) => {
    setDependencyModal({ visible: false, unprocessedSteps: [], selectedStep: null });

    if (includeDependent) {
      // Add unprocessed steps to selected modules
      const allOrder = computeRunOrder(enabledModuleNames);
      const selectedStep = dependencyModal.selectedStep;
      const selectedIndex = allOrder.findIndex(s => s.key === selectedStep);

      const modulesToAdd = [];
      for (let i = 0; i < selectedIndex; i++) {
        const stepKey = allOrder[i].key;
        const isCompleted = steps.find(s => s.key === stepKey)?.status === "completed";

        if (!isCompleted && !selectedModules.includes(stepKey)) {
          modulesToAdd.push(stepKey);
        }
      }

      const newSelectedModules = [...selectedModules, ...modulesToAdd];
      setSelectedModules(newSelectedModules);

      // Process all modules including dependencies
      processModules(newSelectedModules);
    } else {
      // Process only the selected module
      processModules(selectedModules);
    }
  };

  // Build table data
  const data = steps.map((step) => {
    const moduleName = enabledModuleNames.find((name) => {
      const normalized = String(name).toLowerCase();
      // Exact matching for summary steps
      if (step.key === "envelopeSummary") return normalized.includes("envelope summary");
      if (step.key === "catchSummary") return normalized.includes("catch summary");
      // For other steps, use the key
      return normalized.includes(step.key);
    }) || step.title;

    // Default lot counts from step
    let completedLots = step.completedLots ?? 0;
    let totalLots = step.totalLots ?? 0;

    // For box breaking use actual available lots and lot report status
    if (step.key === "box") {
      const availableCount = (availableLots && availableLots.length) || 0;
      const reportedCount = Object.keys(lotReportStatus || {}).length || 0;
      totalLots = Math.max(availableCount, reportedCount, totalLots || 0);
      // `lotReportStatus` stores booleans per lotNo (true if exists)
      completedLots = Object.values(lotReportStatus || {}).filter(Boolean).length;
    }

    return {
      key: step.key,
      moduleName: moduleName,
      status: step.status || "pending",
      report: step.fileUrl,
      completedLots,
      totalLots,
    };
  });

  const showTemplatePanel = templatePanel.open;
  const showLotWisePanel = lotWisePanel.open;

  // Helper to determine if a step is outdated based on realtime flags and lot statuses
  const isStepOutdated = (step) => {
    let isOutdated = false;
    if (pipelineStepStatus) {
      const keyMap = {
        duplicate: "duplicatePending",
        enhancement: "enhancementPending",
        extra: "extraPending",
        envelopebreaking: "envelopePending",
        box: "boxPending",
      };
      const pendingFlag = keyMap[step.key];
      if (pendingFlag && pipelineStepStatus[pendingFlag]) {
        if (step.key === "box") {
          isOutdated = (availableLots || []).some(
            lot => lotReportStatus[lot.lotNo] && lot.minStep < 6
          );
        } else {
          isOutdated = step.status === "completed" || step.report;
        }
      }
    }

    return isOutdated;
  };

  const isStepSelectable = (step) => {
    const moduleToLotKey = {
      duplicate: { pending: "pendingDuplicateLots", completed: "completedDuplicateLots" },
      enhancement: { pending: "pendingEnhancementLots", completed: "completedEnhancementLots" },
      extra: { pending: "pendingExtraLots", completed: "completedExtraLots" },
      envelopebreaking: { pending: "pendingEnvelopeLots", completed: "completedEnvelopeLots" },
      box: { pending: "pendingBoxLots", completed: "completedBoxLots" },
    };

    if (selectedDropdownLot !== "all" && selectedDropdownLot !== null && moduleToLotKey[step.key] && pipelineStepStatus) {
      const keys = moduleToLotKey[step.key];
      const pendingLots = pipelineStepStatus[keys.pending] || [];
      const completedLots = pipelineStepStatus[keys.completed] || [];
      const lotNum = Number(selectedDropdownLot);
      
      const isLotPending = pendingLots.includes(lotNum);
      const isLotCompleted = completedLots.includes(lotNum) && !isLotPending;
      
      if (isLotCompleted) return false;
    }

    // Selectable if not completed, or completed but outdated (needs re-run)
    const outdated = isStepOutdated(step);
    
    const stepToNumMap = {
      duplicate: 1,
      enhancement: 2,
      extra: 4,
      envelopebreaking: 5,
      box: 6,
    };
    if (pipelineStepStatus && stepToNumMap[step.key] !== undefined) {
      const minStep = pipelineStepStatus.minStep ?? 0;
      const stepNum = stepToNumMap[step.key];
      if (stepNum < minStep) {
        return false;
      }
    }
    return !(step.status === "completed" && !outdated);
  };

  // Keep selectedModules in sync: remove any modules that are no longer selectable
  useEffect(() => {
    const selectableKeys = new Set((data || []).filter(isStepSelectable).map(s => s.key));
    setSelectedModules((prev) => {
      const next = prev.filter(k => selectableKeys.has(k));
      // Avoid updating state if nothing changed (prevents infinite re-renders)
      if (next.length === prev.length && next.every((v, i) => v === prev[i])) {
        return prev;
      }
      return next;
    });
  }, [data, pipelineStepStatus, availableLots, lotReportStatus, hasDeactivatedCatches]);

  const columns = [
    {
      title: () => {
        const selectable = (data || []).filter(isStepSelectable);
        const selectableKeys = new Set(selectable.map(s => s.key));
        const selectedSelectableCount = selectedModules.filter(k => selectableKeys.has(k)).length;
        const selectableCount = selectable.length;

        return (
          <Checkbox
            checked={selectedSelectableCount === selectableCount && selectableCount > 0}
            indeterminate={selectedSelectableCount > 0 && selectedSelectableCount < selectableCount}
            onChange={(e) => handleSelectAll(e.target.checked)}
            disabled={isProcessing || selectableCount === 0}
          >
            Select
          </Checkbox>
        );
      },
      dataIndex: "select",
      key: "select",
      width: 100,
      render: (_, record) => {
          if (!isStepSelectable(record)) {
            return <Text type="secondary">—</Text>;
          }

          let disabled = isProcessing;
          let isOutsideRange = false;
          if (pipelineStepStatus) {
            const stepToNumMap = {
              duplicate: 1,
              enhancement: 2,
              extra: 4,
              envelopebreaking: 5,
              box: 6,
            };
            const stepNum = stepToNumMap[record.key];
            if (stepNum !== undefined) {
              const minStep = pipelineStepStatus.minStep ?? 0;
              if (stepNum < minStep) {
                isOutsideRange = true;
                disabled = true;
              }
            }
          }

          if (isOutsideRange) {
            return <Text type="secondary">—</Text>;
          }



          return (
            <Checkbox
              checked={selectedModules.includes(record.key)}
              onChange={(e) => handleModuleSelection(record.key, e.target.checked)}
              disabled={disabled}
            />
          );
      },
    },
    {
      title: "Module Name",
      dataIndex: "moduleName",
      key: "moduleName",
      render: (text, record) => (
        <div>
          <b>{text}</b>
          {record.key === "box" && hasUnassignedCatches && (
            <div
              style={{ marginTop: 3, fontSize: 11, color: "#0871d4ff", cursor: "pointer" }}
              onClick={() => navigate("/dataimport", { state: { activeTab: "4", openBifurcationPanel: true } })}
            >
               Bifurcate Lot
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Configuration",
      dataIndex: "configuration",
      key: "configuration",
      render: (_, record) => {
        const config = getConfigForModule(record.key);
        if (!config) return <Text type="secondary">—</Text>;

        // For box breaking and duplicate, show each item on new line; for others, join on one line
        const isMultiLine = (record.key === "box" || record.key === "duplicate") && Array.isArray(config.value) && config.value.length > 1;

        return (
          <div style={{ fontSize: "12px" }}>
            {isMultiLine ? (
              config.value.map((item, idx) => (
                <div key={idx} style={{ color: "#666", marginBottom: idx < config.value.length - 1 ? 8 : 0 }}>
                  {item}
                </div>
              ))
            ) : (
              <div style={{ color: "#666" }}>
                {Array.isArray(config.value) ? config.value.join(", ") : config.value}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status, record) => {
        let displayStatus = status;
        let isOutdated = false;

        // Compute live box lot counts from availableLots and lotReportStatus to avoid stale record values
        let currentTotalLots = record.totalLots ?? 0;
        let currentCompletedLots = record.completedLots ?? 0;
        if (record.key === "box") {
          const availableCount = (availableLots && availableLots.length) || 0;
          const reportedCount = Object.keys(lotReportStatus || {}).length || 0;
          currentTotalLots = Math.max(availableCount, reportedCount, currentTotalLots || 0);
          currentCompletedLots = Object.values(lotReportStatus || {}).filter(Boolean).length;
        }

        // Determine if the backend has flagged pending changes for this step
        const isBoxPending = record.key === "box" && pipelineStepStatus?.boxPending === true;

        // "All lots completed" shortcut: only applies when there are NO pending data changes.
        // If boxPending=true the user must be able to re-run, so skip the shortcut.
        const boxComplete = record.key === "box" && currentTotalLots > 0 && currentCompletedLots >= currentTotalLots && !isBoxPending;
        if (boxComplete) {
          displayStatus = "completed";
          isOutdated = false;
        }

        // Use real-time DB state if available
        if (pipelineStepStatus) {
          const keyMap = {
            duplicate: "duplicatePending",
            enhancement: "enhancementPending",
            extra: "extraPending",
            envelopebreaking: "envelopePending",
            box: "boxPending",
          };
          const pendingFlag = keyMap[record.key];
          if (pendingFlag) {
            if (pipelineStepStatus[pendingFlag]) {
              if (record.key === "box") {
                // boxPending=true: data was modified. Show as outdated so user can re-run.
                // Keep lot-count display if some lots exist, but mark as outdated.
                isOutdated = (availableLots || []).some(
                  lot => lotReportStatus[lot.lotNo] && lot.minStep < 6
                );
                if (!isOutdated && status !== "in-progress") {
                  displayStatus = "pending";
                }
                // If some/all lots exist, displayStatus stays as-is (shows lot count tag or
                // completed tag below), but isOutdated=true makes the Outdated tag render instead.
              } else {
                if (status !== "in-progress") {
                  displayStatus = "pending";
                }
                if (record.status === "completed" || record.report) {
                  isOutdated = true;
                }
              }
            } else {
              // If not pending according to the API, mark it as completed
              if (displayStatus !== "in-progress") {
                displayStatus = "completed";
              }
            }
          }
        }

        const colorMap = {
          completed: "green",
          "in-progress": "blue",
          failed: "red",
          pending: "orange",
          skipped: "default",
        };

        const moduleToLotKey = {
          duplicate: { pending: "pendingDuplicateLots", completed: "completedDuplicateLots" },
          enhancement: { pending: "pendingEnhancementLots", completed: "completedEnhancementLots" },
          extra: { pending: "pendingExtraLots", completed: "completedExtraLots" },
          envelopebreaking: { pending: "pendingEnvelopeLots", completed: "completedEnvelopeLots" },
          box: { pending: "pendingBoxLots", completed: "completedBoxLots" },
        };

        if (moduleToLotKey[record.key] && pipelineStepStatus && status !== "in-progress") {
          const keys = moduleToLotKey[record.key];
          let pendingLots = pipelineStepStatus[keys.pending] || [];
          let completedLots = pipelineStepStatus[keys.completed] || [];
          
          const globalCompletedLots = completedLots; // Keep reference to check if lot has completed data
          
          if (selectedDropdownLot !== "all" && selectedDropdownLot !== null) {
            const lotNum = Number(selectedDropdownLot);
            pendingLots = pendingLots.filter(l => l === lotNum);
            completedLots = completedLots.filter(l => l === lotNum);
          }
          
          if (pendingLots.length > 0 || completedLots.length > 0) {
             const tags = [];
             if (completedLots.length > 0) {
               tags.push(<Tag color="green" key="completed">Completed Lots - {completedLots.join(", ")}</Tag>);
             }
             if (pendingLots.length > 0) {
               const truePending = [];
               const outdated = [];
               
               pendingLots.forEach(lot => {
                 if (record.key === "box") {
                   if (lotReportStatus && lotReportStatus[lot]) {
                     outdated.push(lot);
                   } else {
                     truePending.push(lot);
                   }
                 } else {
                   const lotInfo = (availableLots || []).find(l => l.lotNo === lot);
                   const isOldLot = lotInfo ? lotInfo.minStep > 0 : false;
                   
                   if (globalCompletedLots.includes(lot) || ((record.status === "completed" || record.report) && isOldLot)) {
                     outdated.push(lot);
                   } else {
                     truePending.push(lot);
                   }
                 }
               });

               if (outdated.length > 0) {
                 tags.push(<Tag color="orange" key="outdated" icon={<ExclamationCircleOutlined />}>Outdated Lots - {outdated.join(", ")}</Tag>);
               }
               if (truePending.length > 0) {
                 tags.push(<Tag color="processing" key="pending" >Pending Lots - {truePending.join(", ")}</Tag>);
               }
             }
             return <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>{tags}</div>;
          }
        }

        if (isOutdated && status !== "in-progress") {
          return (
            <Tooltip title="Recent updates require this step to be run again. The current report might be outdated.">
              <Tag color="orange" icon={<ExclamationCircleOutlined />}>Outdated</Tag>
            </Tooltip>
          );
        }


        return <Tag color={colorMap[displayStatus] || "default"}>{displayStatus}</Tag>;
      },
    },
    {
      title: "Templates",
      dataIndex: "templates",
      key: "templates",
      render: (_, record) => {
        const moduleTemplates = getTemplatesForModuleKey(record.key);
        const hasTemplates = moduleTemplates.length > 0;
        const isReady = record.status === "completed" || (record.key === "box" && record.completedLots > 0);
        const isBoxBreaking = record.key === "box";

        // Compute outdated info for Templates column badge
        // Returns: false (none) | true (non-box) | number[] (stale lot numbers for box)
        const outdatedInfo = (() => {
          if (!hasTemplates) return false;

          if (isBoxBreaking) {
            const boxTemplateIds = moduleTemplates.map((t) => resolveTemplateId(t)).filter(Boolean);
            if (boxTemplateIds.length === 0) return false;

            const staleLotNos = new Set();

            // 1️⃣ In-session: staleLotIds is set when box breaking runs this session
            if (staleLotIds.size > 0) {
              Array.from(staleLotIds).forEach((k) => {
                const parts = k.split("_");
                const lotNo = parts[0];
                const tid = parts.slice(1).join("_");
                if (boxTemplateIds.some((id) => String(id) === String(tid))) {
                  staleLotNos.add(Number(lotNo));
                }
              });
            }

            // 2️⃣ Cross-session: lot.minStep < 6 means box breaking report is "Outdated"
            //    for that lot (same signal LotWisePanel uses for its "Outdated" tag).
            //    Use generatedTemplateReports (fetched on page load) to check if any
            //    template was actually generated — avoids false positives for lots
            //    where nothing was ever generated.
            //    Do NOT use lotTemplateStatus here — it is only populated when
            //    LotWisePanel is opened, so it's empty on fresh page load.
            if (availableLots && availableLots.length > 0) {
              availableLots.forEach((lot) => {
                if (lotReportStatus[lot.lotNo] && lot.minStep < 6) {
                  const anyGenerated = generatedTemplateReports.some((r) =>
                    r.lotNo === lot.lotNo &&
                    boxTemplateIds.some((tid) => String(r.templateId) === String(tid))
                  );
                  if (anyGenerated) staleLotNos.add(lot.lotNo);
                }
              });
            }

            // 3️⃣ Mapping/file update: a box template's mapping or .rpt file was changed
            //    (recordMappingUpdate writes to localStorage on file upload or mapping save).
            //    Mark all lots that have a generated report for that template as stale.
            const staleMappingTemplateIds = boxTemplateIds.filter(
              (tid) => getMappingUpdateTime(tid) != null
            );
            if (staleMappingTemplateIds.length > 0 && availableLots && availableLots.length > 0) {
              availableLots.forEach((lot) => {
                if (lotReportStatus[lot.lotNo]) {
                  const anyGenerated = generatedTemplateReports.some((r) =>
                    r.lotNo === lot.lotNo &&
                    staleMappingTemplateIds.some((tid) => String(r.templateId) === String(tid))
                  );
                  if (anyGenerated) staleLotNos.add(lot.lotNo);
                }
              });
            }

            return staleLotNos.size > 0
              ? Array.from(staleLotNos).sort((a, b) => a - b)
              : false;
          }

          // Non-box modules: only show Outdated below Templates when a SPECIFIC
          // template is outdated — not just because the module step needs re-running.
          // (pipelineStepStatus pending flags drive the Status column "Outdated" tag;
          //  they must NOT bleed into the Templates column badge.)

          // Cross-session: mappingUpdateMap (localStorage) has an update entry for a
          // template in this module. This is set when the template mapping changes and
          // cleared when the template is regenerated — so if it's non-null, the mapping
          // is newer than the last generated report. Only applicable when the module has
          // been run (has reportVersions) so templates could have been generated.
          const moduleHasBeenRun = (reportVersions[record.key] && reportVersions[record.key].length > 0)
            || record.status === "completed" || !!record.report;

          const hasMappingStale = moduleHasBeenRun && moduleTemplates.some((t) => {
            const tid = resolveTemplateId(t);
            if (!tid) return false;
            return getMappingUpdateTime(tid) !== null;
          });
          if (hasMappingStale) return true;

          // In-session: staleTemplateIds set when a template just ran this session
          const hasInSessionStale = moduleTemplates.some((t) => {
            const tid = resolveTemplateId(t);
            if (!tid) return false;
            return staleTemplateIds.has(tid);
          });
          return hasInSessionStale ? true : false;
        })();

        const outdatedLabel = (() => {
          if (!outdatedInfo) return null;
          if (Array.isArray(outdatedInfo)) {
            // Box Breaking: show lot numbers
            return `Outdated - Lot ${outdatedInfo.join(", ")}`;
          }
          return "Outdated";
        })();

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
            <Button
              size="small"
              onClick={() =>
                isBoxBreaking
                  ? openLotWisePanel(record.key)
                  : openTemplatePanel(record.key)
              }
              disabled={!isReady || !hasTemplates}
            >
              Templates{hasTemplates ? ` (${moduleTemplates.length})` : ""}
            </Button>

            {outdatedLabel && (
              <span
                onClick={() => isBoxBreaking ? openLotWisePanel("box") : openTemplatePanel(record.key)}
                title="Some templates need regeneration — click to open"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  background: "#fff7e6",
                  border: "1px solid #ffd591",
                  borderRadius: 4,
                  padding: "1px 6px",
                  fontSize: 11,
                  color: "#d46b08",
                  cursor: "pointer",
                  fontWeight: 500,
                  userSelect: "none",
                }}
              >
                <ExclamationCircleOutlined style={{ fontSize: 11 }} />
                {outdatedLabel}
              </span>
            )}
          </div>
        );
      },
    },
  
  ];

  // Check if module has data
  const moduleHasData = (record) => {
    return record.report || record.status === "completed";
  };

  // Handle opening detail panel
  const handleOpenDetailPanel = (record) => {
    if (!moduleHasData(record)) return;

    setSelectedModuleForDetails(record);
    setIsDetailPanelOpen(true);



    const dataToUse = detailGrouping === "lot" ? mockLotData : mockCatchData;

    // Select all items by default
    const initialSelection = {};
    Object.entries(dataToUse).forEach(([groupName, items]) => {
      initialSelection[groupName] = items.map(item => item.id);
    });
    setSelectedItems(initialSelection);
  };

  // Handle closing detail panel
  const handleCloseDetailPanel = () => {
    setIsDetailPanelOpen(false);
    setSelectedModuleForDetails(null);
    setSelectedItems({});
  };

  // Handle row click
  const handleRowClick = (record) => {
    if (moduleHasData(record)) {
      handleOpenDetailPanel(record);
    }
  };

  // Handle item selection
  const handleItemToggle = (groupName, itemId) => {
    setSelectedItems(prev => {
      const groupItems = prev[groupName] || [];
      const isSelected = groupItems.includes(itemId);

      return {
        ...prev,
        [groupName]: isSelected
          ? groupItems.filter(id => id !== itemId)
          : [...groupItems, itemId]
      };
    });
  };

  // Handle group selection
  const handleGroupToggle = (groupName, allItemIds) => {
    setSelectedItems(prev => {
      const groupItems = prev[groupName] || [];
      const allSelected = allItemIds.every(id => groupItems.includes(id));

      return {
        ...prev,
        [groupName]: allSelected ? [] : allItemIds
      };
    });
  };

  // Get total selected count
  const getTotalSelectedCount = () => {
    return Object.values(selectedItems).reduce((sum, items) => sum + items.length, 0);
  };

  // Render detail panel content
  const renderDetailPanel = () => {
    if (!selectedModuleForDetails) {
      return (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "#999",
          fontSize: "14px"
        }}>
          Select a module to view details
        </div>
      );
    }

    const { moduleName, status, key: moduleKey } = selectedModuleForDetails;
    const config = getConfigForModule(moduleKey);

    // Mock data structure - replace with actual API data when available
    const mockLotData = {
      "LOT-001": [
        { id: "lot1-1", name: "report1.pdf", url: "#" },
        { id: "lot1-2", name: "report2.pdf", url: "#" },
      ],
      "LOT-002": [
        { id: "lot2-1", name: "report3.pdf", url: "#" },
      ],
    };

    const mockCatchData = {
      "CATCH-A": [
        { id: "catch-a-1", name: "report1.pdf", url: "#" },
      ],
      "CATCH-B": [
        { id: "catch-b-1", name: "report2.pdf", url: "#" },
      ],
    };

    const dataToDisplay = detailGrouping === "lot" ? mockLotData : mockCatchData;
    const totalSelected = getTotalSelectedCount();

    // Render data list with grouping
    const renderDataList = () => (
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "16px"
      }}>
        {Object.entries(dataToDisplay).map(([groupName, items]) => {
          const groupItemIds = items.map(item => item.id);
          const groupSelectedItems = selectedItems[groupName] || [];
          const allSelected = groupItemIds.every(id => groupSelectedItems.includes(id));
          const someSelected = groupSelectedItems.length > 0 && !allSelected;

          return (
            <div key={groupName} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={() => handleGroupToggle(groupName, groupItemIds)}
                />
                <Text strong style={{ fontSize: "13px" }}>
                  {groupName}
                </Text>
              </div>
              <div style={{ paddingLeft: 32 }}>
                {items.map((item, idx) => {
                  const isSelected = groupSelectedItems.includes(item.id);
                  return (
                    <div key={item.id} style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 0",
                      borderBottom: idx < items.length - 1 ? "1px solid #f5f5f5" : "none"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Checkbox
                          checked={isSelected}
                          onChange={() => handleItemToggle(groupName, item.id)}
                        />
                        <Text style={{ fontSize: "12px" }}>{item.name}</Text>
                      </div>
                      <Button type="link" size="small" style={{ fontSize: "12px" }}>
                        Download
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );

    // Tab items for Reports and Templates
    const tabItems = [
      {
        key: "reports",
        label: "Reports",
        children: (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {/* Grouping Toggle */}
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid #f0f0f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <Button.Group size="small">
                <Button
                  type={detailGrouping === "lot" ? "primary" : "default"}
                  onClick={() => setDetailGrouping("lot")}
                >
                  Lot-wise
                </Button>
                <Button
                  type={detailGrouping === "catch" ? "primary" : "default"}
                  onClick={() => setDetailGrouping("catch")}
                >
                  Catch-wise
                </Button>
              </Button.Group>

              <Button size="small" type="primary">
                Generate All
              </Button>
            </div>

            {/* Action Buttons */}
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0" }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>

                <Button size="small">Download All</Button>
                <Button size="small" disabled={totalSelected === 0}>
                  Download Selected ({totalSelected})
                </Button>
              </div>
            </div>

            {/* Data List */}
            {renderDataList()}
          </div>
        ),
      },
      {
        key: "templates",
        label: "Templates",
        children: (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {/* Grouping Toggle */}
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0" }}>
              <Button.Group size="small">
                <Button
                  type={detailGrouping === "lot" ? "primary" : "default"}
                  onClick={() => setDetailGrouping("lot")}
                >
                  Lot-wise
                </Button>
                <Button
                  type={detailGrouping === "catch" ? "primary" : "default"}
                  onClick={() => setDetailGrouping("catch")}
                >
                  Catch-wise
                </Button>
              </Button.Group>
            </div>

            {/* Action Buttons */}
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0" }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button size="small" type="primary">Generate All</Button>
                <Button size="small">Download All</Button>
                <Button size="small" disabled={totalSelected === 0}>
                  Download Selected ({totalSelected})
                </Button>
              </div>
            </div>

            {/* Data List */}
            {renderDataList()}
          </div>
        ),
      },
    ];

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Header */}
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid #f0f0f0",
          backgroundColor: "#fafafa",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <Text strong style={{ fontSize: "14px" }}>
            {moduleName} Details
          </Text>

          <Button
            type="text"
            size="small"
            onClick={handleCloseDetailPanel}
          >
            ✕
          </Button>
        </div>

        {/* Tabs for Reports/Templates */}
        <Tabs
          activeKey={detailViewType}
          onChange={setDetailViewType}
          items={tabItems}
          style={{ flex: 1, display: "flex", flexDirection: "column" }}
          tabBarStyle={{ margin: 0, paddingLeft: 16, paddingRight: 16 }}
        />
      </div>
    );
  }

  const combinedReportData = useMemo(() => {
    const list = [];
    let keyId = 0;

    const moduleIdToNameMap = {
      1: "Duplicate Tool",
      2: "Envelope Setup and Enhancement",
      3: "Extra Configuration",
      4: "Envelope Breaking",
      5: "Box Breaking",
      6: "Envelope Summary",
      7: "Catch Summary Report"
    };

    if (excelReports && excelReports.length > 0) {
      const groupedExcel = {};
      excelReports.forEach((er) => {
        const rawPath = er.filePath || er.FilePath || "";
        const fileName = rawPath ? rawPath.split(/[/\\]/).pop() : `Report_${er.id || er.Id}.xlsx`;
        const baseName = fileName.replace(/[_-]?v\d+(?=\.[^.]+$)/i, '');
        const fnLower = (fileName || rawPath).toLowerCase();
        let modId = er.moduleId || er.ModuleId;
        if (fnLower.includes("enhancement")) {
          modId = 2;
        } else if (fnLower.includes("extra")) {
          modId = 3;
        }
        const groupKey = `${modId}_${er.lot || er.Lot || 0}_${baseName}`;
        if (!groupedExcel[groupKey]) {
          groupedExcel[groupKey] = [];
        }
        groupedExcel[groupKey].push({ ...er, fileName, baseName, rawPath, normalizedModuleId: modId });
      });

      Object.keys(groupedExcel).forEach((groupKey) => {
        const sortedVers = [...groupedExcel[groupKey]].sort(
          (a, b) => Number(b.version || b.Version || 0) - Number(a.version || a.Version || 0) || new Date(b.generatedAt || b.GeneratedAt || 0) - new Date(a.generatedAt || a.GeneratedAt || 0)
        );
        const latestVer = Number(sortedVers[0]?.version || sortedVers[0]?.Version || 0);

        sortedVers.forEach((er) => {
          const curVer = Number(er.version || er.Version || 0);
          let modId = er.normalizedModuleId || er.moduleId || er.ModuleId;
          const fnLower = (er.fileName || er.rawPath || "").toLowerCase();
          if (fnLower.includes("enhancement")) {
            modId = 2;
          } else if (fnLower.includes("extra")) {
            modId = 3;
          }
          const lotVal = er.lot || er.Lot;
          const genAt = er.generatedAt || er.GeneratedAt;
          const genBy = er.generatedByUserId || er.GeneratedByUserId;
          const statusVal = er.status ?? er.Status;

          const formattedReportName = er.fileName
            ? (er.fileName.includes('_v')
                ? er.fileName
                : (curVer > 0 && er.fileName.includes('.')
                    ? `${er.fileName.substring(0, er.fileName.lastIndexOf('.'))}_v${curVer}${er.fileName.substring(er.fileName.lastIndexOf('.'))}`
                    : er.fileName))
            : `${er.baseName}_v${curVer}.xlsx`;

          list.push({
            key: `excel-report-${er.id || er.Id}`,
            type: "Report",
            id: er.id || er.Id,
            module: moduleIdToNameMap[modId] || "General Report",
            templateName: "-",
            reportName: formattedReportName,
            fileName: er.fileName,
            filePath: er.rawPath,
            lot: lotVal,
            versions: [
              {
                id: er.id || er.Id,
                version: curVer > 0 ? `v${curVer}` : "Latest",
                generatedOn: genAt,
                generatedByUserId: genBy,
                status: (curVer === latestVer || statusVal) ? "Latest" : "Previous",
                fileUrl: `${import.meta.env.VITE_API_URL}/ExcelReports/Download/${er.id || er.Id}`,
                filePath: er.rawPath
              }
            ]
          });
        });
      });
    } else {
      Object.keys(reportVersions || {}).forEach((moduleKey) => {
        const versions = reportVersions[moduleKey] || [];
        const grouped = {};
        versions.forEach((v) => {
          const baseName = v.fileName.replace(/[_-]?v\d+(?=\.[^.]+$)/i, '');
          if (!grouped[baseName]) grouped[baseName] = [];
          grouped[baseName].push(v);
        });

        Object.keys(grouped).forEach((baseName) => {
          const fileVersions = [...grouped[baseName]].sort(
            (a, b) => Number(b.version || 0) - Number(a.version || 0)
          );
          const latestVersion = Number(fileVersions[0]?.version || 0);

          fileVersions.forEach((fv) => {
            const currentVersion = Number(fv.version || 0);
            list.push({
              key: `report-${keyId++}`,
              type: "Report",
              module: moduleKeyToNameMap[moduleKey] || moduleKey,
              templateName: "-",
              reportName: fv.fileName || baseName,
              fileName: fv.fileName,
              versions: [
                {
                  version: currentVersion > 0 ? `v${currentVersion}` : "Latest",
                  generatedOn: fv.generatedAt,
                  generatedBy: fv.generatedBy || "-",
                  generatedByUserId: fv.generatedByUserId,
                  status: currentVersion === latestVersion ? "Latest" : "Previous",
                  fileUrl: `${url3}/${projectId}/${fv.fileName}`,
                },
              ],
            });
          });
        });
      });
    }
    const allTemplateReports = [
  ...(envLotReports || []),
  ...(generatedTemplateReports || []),
];

const groupedTpl = {};

allTemplateReports.forEach((rep) => {
  const templateId =
    rep.templateId ||
    rep.TemplateId ||
    null;

  const templateName =
    rep.templateName ||
    rep.TemplateName ||
    "-";

  /*
   * Use templateId as the primary grouping key.
   * This is safer than grouping only by name.
   */
  const key = templateId
    ? String(templateId)
    : templateName;

  if (!groupedTpl[key]) {
    groupedTpl[key] = [];
  }

  groupedTpl[key].push({
    ...rep,
    templateId,
    templateName,
  });
});

Object.keys(groupedTpl).forEach((templateKey) => {
  const reps = groupedTpl[templateKey].sort(
    (a, b) =>
      new Date(b.generatedAt || b.GeneratedAt || 0) -
      new Date(a.generatedAt || a.GeneratedAt || 0)
  );

  const firstRep = reps[0];

  let tpl = allTemplateOptions.find(
    (t) =>
      String(
        resolveTemplateId(t)
      ) === String(firstRep?.templateId)
  );

  // If exact template ID is not found (e.g. historical report from a superseded scope), match by name
  if (!tpl && firstRep?.templateName) {
    tpl = allTemplateOptions.find(
      (t) =>
        (t.templateName || t.TemplateName) === (firstRep.templateName || firstRep.TemplateName)
    );
  }

  /*
   * Resolve module name
   */
  let resolvedModuleName =
    firstRep?.module || null;

  if ((!resolvedModuleName || resolvedModuleName === "-") && tpl) {
    let mods = [];

    let mIds =
      tpl.moduleIds ||
      tpl.ModuleIds;

    if (typeof mIds === "string") {
      mIds = mIds
        .split(",")
        .map((m) => parseInt(m.trim()))
        .filter((n) => !isNaN(n));
    }

    if (
      Array.isArray(mIds) &&
      mIds.length > 0 &&
      allModules?.length > 0
    ) {
      mIds.forEach((mId) => {
        const mod = allModules.find(
          (am) =>
            am.id === mId ||
            String(am.id) === String(mId)
        );

        if (mod?.name) {
          mods.push(mod.name);
        }
      });
    }

    if (mods.length > 0) {
      resolvedModuleName =
        [...new Set(mods)].join(", ");
    }
  }

  if (!resolvedModuleName) {
    resolvedModuleName = "-";
  }

  /*
   * Create table rows
   */
  reps.forEach((r, idx) => {
    list.push({
      key: `template-${keyId++}`,

      type: "Template",

      module:
        (r.module && r.module !== "-") ? r.module : resolvedModuleName,

      templateName:
        r.templateName ||
        "-",

      reportName:
        r.fileName ||
        "-",

      templateId:
        r.templateId ||
        firstRep?.templateId,

      envLotNumbers:
        r.envLotNumbers ||
        r.envLotKey ||
        null,

      versions: [
        {
          version:
            r.version ||
            `v${reps.length - idx}`,

          generatedOn:
            r.generatedAt ||
            "-",

          generatedBy:
            r.generatedBy ||
            "-",

          generatedByUserId: r.generatedByUserId || r.GeneratedByUserId || null,
          downloadedByUserId: r.downloadedByUserId || r.DownloadedByUserId || null,
          downloadedAt: r.downloadedAt || r.DownloadedAt || null,

          status:
            idx === 0
              ? "Latest"
              : "Previous",

          fileUrl:
            r.url ||
            r.fileUrl ||
            (
              r.dbId
                ? `${
                    (import.meta.env.VITE_API_FILE_URL || "").replace(/\/api\/?$/i, "")
                  }/api/EnvelopeLotReports/Download/${r.dbId}`
                : null
            ),

          dbId: r.dbId || null,
        },
      ],
    });
  });
    });

    return list;
  }, [reportVersions, excelReports, envLotReports, generatedTemplateReports, projectId, templateOptions, allModules]);

  return (
    <ErrorBoundary>
      <div className="p-4">
      <StaticVariablesModal
        open={staticVarModal.open}
        template={staticVarModal.template}
        variables={staticVarModal.variables}
        values={staticVarModal.values}
        onChange={(fieldName, val) =>
          setStaticVarModal((prev) => ({
            ...prev,
            values: { ...prev.values, [fieldName]: val },
          }))
        }
        onConfirm={handleStaticVarConfirm}
        onCancel={handleStaticVarCancel}
      />

      {configChanged && (
        <Alert
          message="Configuration Updated"
          description={`The following settings have changed: ${changedFieldsInfo.join(", ")}. Please re-run the reports to ensure accuracy.`}
          type="warning"
          showIcon
          closable
          onClose={() => setConfigChanged(false)}
          style={{ marginBottom: 16 }}
        />
      )}

      {outdatedModules.length > 0 && (
        <Alert
          message="Outdated Reports Detected"
          description={
            <div>
              Recent updates have modified the pipeline. The following reports need to be re-run:{" "}
              <strong>{outdatedModules.join(", ")}</strong>.
            </div>
          }
          type="warning"
          showIcon
          icon={<ExclamationCircleOutlined />}
          style={{ marginBottom: 16 }}
        />
      )}

      <div className="flex justify-between items-center mb-4">
        <Typography.Title level={3} style={{ marginBottom: 6 }}>
          Processing Pipeline
        </Typography.Title>
        <div className="text-sm flex items-center gap-2">
          <Select
            value={selectedBatch}
            onChange={(val) => setSelectedBatch(val)}
            style={{ display: 'none' }}
            options={batches.map((b) => ({ label: `Batch ${b}`, value: b }))}
          />
          <span>Status:</span>
          {isProcessing ? (
            <Badge status="processing" text="Processing" color="blue" />
          ) : (
            <Badge status="default" text="Idle" color="gray" />
          )}
          {(() => {
            const hasAnyPendingStep = pipelineStepStatus && Object.values(pipelineStepStatus).some(v => v === true);
            const availableCount = (availableLots && availableLots.length) || 0;
            const completedCount = Object.values(lotReportStatus || {}).filter(Boolean).length;
            const boxHasRemaining = availableCount > 0 && completedCount < availableCount;
            const canStartByData = hasPendingPipelineChanges || hasAnyPendingStep || configChanged || boxHasRemaining;

            // First, filter the selected modules to only those that ACTUALLY have pending data
            const modulesWithPendingData = selectedModules.filter(m => {
              const listKey = {
                duplicate: "pendingDuplicateLots",
                enhancement: "pendingEnhancementLots",
                extra: "pendingExtraLots",
                envelopebreaking: "pendingEnvelopeLots",
                box: "pendingBoxLots"
              }[m];

              if (selectedDropdownLot !== "all" && selectedDropdownLot !== null) {
                return pipelineStepStatus?.[listKey]?.includes(Number(selectedDropdownLot));
              } else {
                if (m === "box") {
                  const avCount = (availableLots && availableLots.length) || 0;
                  const compCount = Object.values(lotReportStatus || {}).filter(Boolean).length;
                  return (avCount > 0 && compCount < avCount) || pipelineStepStatus?.boxPending;
                }
                return pipelineStepStatus?.[listKey]?.length > 0;
              }
            });

            // For the modules that DO have pending data, ensure they are all ready (or virtually ready)
            const hasModulePendingData = modulesWithPendingData.length > 0 && modulesWithPendingData.every(m => {
              const lotListKeyMap = {
                duplicate: "readyDuplicateLots",
                enhancement: "readyEnhancementLots",
                extra: "readyExtraLots",
                envelopebreaking: "readyEnvelopeLots",
                box: "readyBoxLots"
              };
              const listKey = lotListKeyMap[m];

              const dependencies = {
                enhancement: "duplicate",
                extra: "enhancement",
                envelopebreaking: "extra",
                box: "envelopebreaking"
              };

              const getEffectiveDependency = (mod) => {
                let currentDep = dependencies[mod];
                while (currentDep && allModules && !allModules.some(s => s.key === currentDep || s.name?.toLowerCase().includes(currentDep))) {
                  currentDep = dependencies[currentDep];
                }
                return currentDep;
              };

              const dep = getEffectiveDependency(m);
              const isDepSelected = dep && selectedModules.includes(dep);

              if (selectedDropdownLot !== "all" && selectedDropdownLot !== null) {
                const lotNum = Number(selectedDropdownLot);
                if (listKey && pipelineStepStatus) {
                  const readyLots = pipelineStepStatus[listKey] || [];
                  if (readyLots.includes(lotNum)) return true;
                  return isDepSelected;
                }
              } else {
                if (listKey && pipelineStepStatus) {
                  const pendingKey = listKey.replace("ready", "pending");
                  const pendingLots = pipelineStepStatus[pendingKey] || [];
                  const readyLots = pipelineStepStatus[listKey] || [];
                  
                  if (pendingLots.length > 0 && pendingLots.some(lot => {
                    if (readyLots.includes(lot)) return false;
                    if (isDepSelected) return false;
                    return true;
                  })) {
                    return false;
                  }
                  
                  return true;
                }
              }

              if (m === "box") {
                return true;
              }
              return true;
            });
            
            return (
          <Tooltip
            title={
              (!canStartByData)
                ? "No new data found for processing. All data is already processed."
                : (selectedModules.length === 0
                  ? "Please select at least one module"
                  : (!hasModulePendingData && !configChanged)
                    ? "Selected modules have no pending data to process for the chosen lot(s)."
                    : "")
            }
          >
            <span style={{ cursor: (!canStartByData) || selectedModules.length === 0 ? "not-allowed" : "default" }}>
              <Button
                type="primary"
                onClick={handleAudit}
                disabled={
                  !projectId ||
                  isProcessing ||
                  selectedModules.length === 0 ||
                  (!hasModulePendingData && !configChanged)
                }
              >
                Start {selectedModules.length > 0 && `(${selectedModules.length} selected)`}
              </Button>
            </span>
          </Tooltip>
          );
          })()}
        </div>
      </div>

      <div className="mb-2">
        <p className="text-sm font-medium mb-1">Overall Progress</p>
        <Progress percent={percent} showInfo={false} />
        <div className="text-right text-sm mt-1">
          Step {Math.max(currentStep, 0)} of {Math.max(steps.length, 0)}
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div
          className={showTemplatePanel || showLotWisePanel ? "pipeline-main pipeline-main--with-panel" : "pipeline-main pipeline-main--single"}
        >
          <Card
            size="small"
            title={<span>Enabled Modules Status & Reports</span>}
            className="pipeline-table-card"
            style={{
              marginBottom: 12,
              border: "1px solid #d9d9d9",
              boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
            }}
          >
            {enabledModuleNames.length === 0 ? (
              <p>No modules selected for this project</p>
            ) : (
              <Table
                columns={columns}
                dataSource={data}
                pagination={false}
                loading={loadingModules}
                rowKey="key"
                onRow={(record) => {
                  const moduleToLotKey = {
                    duplicate: { pending: "pendingDuplicateLots", completed: "completedDuplicateLots" },
                    enhancement: { pending: "pendingEnhancementLots", completed: "completedEnhancementLots" },
                    extra: { pending: "pendingExtraLots", completed: "completedExtraLots" },
                    envelopebreaking: { pending: "pendingEnvelopeLots", completed: "completedEnvelopeLots" },
                    box: { pending: "pendingBoxLots", completed: "completedBoxLots" },
                  };

                  if (selectedDropdownLot !== "all" && selectedDropdownLot !== null && moduleToLotKey[record.key] && pipelineStepStatus) {
                    const keys = moduleToLotKey[record.key];
                    const pendingLots = pipelineStepStatus[keys.pending] || [];
                    const lotNum = Number(selectedDropdownLot);
                    
                    let isLotOutdated = false;
                    
                    if (pendingLots.includes(lotNum)) {
                      if (record.key === "box") {
                        if (lotReportStatus && lotReportStatus[lotNum]) {
                          isLotOutdated = true;
                        }
                      } else {
                        const globalCompletedLots = pipelineStepStatus[keys.completed] || [];
                        const lotInfo = (availableLots || []).find(l => l.lotNo === lotNum);
                        const isOldLot = lotInfo ? lotInfo.minStep > 0 : false;
                        
                        if (globalCompletedLots.includes(lotNum) || ((record.status === "completed" || record.report) && isOldLot)) {
                          isLotOutdated = true;
                        }
                      }
                    }
                    
                    if (isLotOutdated) {
                      return { style: { background: "#fffbe6" } };
                    }
                  } 

                  return {};
                }}
              />
            )}
          </Card>

          <TemplatesPanel
            open={showTemplatePanel}
            moduleKey={templatePanel.moduleKey}
            moduleTitle={templatePanel.moduleKey ? (steps.find((s) => s.key === templatePanel.moduleKey)?.title || "Module") : ""}
            templates={getTemplatesForModuleKey(templatePanel.moduleKey || "")}
            templatesLoading={templatesLoading}
            generatingTemplates={generatingTemplates}
            templateReportStatus={templateReportStatus}
            templateDownloads={templateDownloads}
            staleTemplateIds={staleTemplateIds}
            staleEnvLotIds={staleEnvLotIds}
            envLotReports={envLotReports}
            expandedReportsTemplates={expandedReportsTemplates}
            bulkGenerating={bulkGenerating}
            bulkDownloading={bulkDownloading}
            isMappingNewerThanReport={isMappingNewerThanReport}
            resolveTemplateId={resolveTemplateId}
            resolveTemplateName={resolveTemplateName}
            handleGenerateTemplate={handleGenerateTemplate}
            handleDownloadEnvLotReport={handleDownloadEnvLotReport}
            handleDeleteEnvLotReport={handleDeleteEnvLotReport}
            handleReportsExpansion={handleReportsExpansion}
            handleGenerateAllTemplates={handleGenerateAllTemplates}
            handleDownloadAllTemplates={handleDownloadAllTemplates}
            onClose={closeTemplatePanel}
            checkIsEnvelopeDependent={(template) => {
              const envelopeBreakingModuleId = moduleKeyToIdMap["envelopebreaking"];
              const templateModuleIds = normalizeModuleIds(template?.moduleIds ?? template?.ModuleIds);
              return envelopeBreakingModuleId && templateModuleIds.includes(envelopeBreakingModuleId);
            }}
            isQuantitySheetTemplate={isQuantitySheetTemplate}
            isCompositeSummaryTemplate={isCompositeSummaryTemplate}
          />
          <Modal
            title="Report Generation Error"
            open={errorDetailsModal.visible}
            onCancel={() => setErrorDetailsModal({ visible: false, error: null, retryFn: null, templateId: null })}
            width={700}
            footer={[
              <Button key="close" onClick={() => setErrorDetailsModal({ visible: false, error: null, retryFn: null, templateId: null })}>
                Close
              </Button>,
              errorDetailsModal.retryFn && (
                <Button key="retry" type="primary" onClick={errorDetailsModal.retryFn}>
                  Retry Report Generation
                </Button>
              )
            ]}
          >
            {errorDetailsModal.error && (
              <div>
                <Alert
                  message="An error occurred while generating the report"
                  description="The error details are shown below. You can retry the generation or contact support if the problem persists."
                  type="error"
                  showIcon
                  style={{ marginBottom: 16 }}
                />

                <div style={{ marginBottom: 16 }}>
                  <Text strong style={{ fontSize: "16px" }}>Error Details:</Text>
                  <div style={{
                    backgroundColor: "#f5f5f5",
                    padding: "12px",
                    borderRadius: "4px",
                    marginTop: "8px",
                    fontFamily: "monospace",
                    fontSize: "12px",
                    maxHeight: "400px",
                    overflowY: "auto",
                    wordBreak: "break-word"
                  }}>
                    <p><strong>Type:</strong> {errorDetailsModal.error.type || 'Unknown'}</p>
                    <p><strong>Message:</strong> {errorDetailsModal.error.message || 'No message'}</p>
                    {errorDetailsModal.error.innerMessage && (
                      <p><strong>Inner Message:</strong> {errorDetailsModal.error.innerMessage}</p>
                    )}
                    {errorDetailsModal.error.templateId && (
                      <p><strong>Template ID:</strong> {errorDetailsModal.error.templateId}</p>
                    )}
                    {errorDetailsModal.error.projectId && (
                      <p><strong>Project ID:</strong> {errorDetailsModal.error.projectId}</p>
                    )}
                    {errorDetailsModal.error.lotNos && (
                      <p><strong>Lot Numbers:</strong> {errorDetailsModal.error.lotNos}</p>
                    )}
                    {errorDetailsModal.error.timestamp && (
                      <p><strong>Timestamp:</strong> {errorDetailsModal.error.timestamp}</p>
                    )}
                    {errorDetailsModal.error.stackTrace && (
                      <>
                        <p><strong>Stack Trace:</strong></p>
                        <pre style={{ margin: "8px 0", padding: "8px", backgroundColor: "#fff", borderLeft: "2px solid #f5222d" }}>
                          {errorDetailsModal.error.stackTrace}
                        </pre>
                      </>
                    )}
                  </div>
                </div>

                <Alert
                  message="Retry Tips"
                  description={
                    <ul style={{ margin: 0, paddingLeft: "20px" }}>
                      <li>Check if all required templates and data are available</li>
                      <li>Verify database connectivity</li>
                      <li>Try generating with fewer lots or simpler parameters</li>
                      <li>Contact system administrator if problem persists</li>
                    </ul>
                  }
                  type="info"
                  showIcon
                  style={{ marginTop: 16 }}
                />
              </div>
            )}
          </Modal>
          <LotWisePanel
            open={showLotWisePanel}
            projectId={projectId}
            url3={url3}
            loadingLots={loadingLots}
            availableLots={
              selectedDropdownLot !== "all" && selectedDropdownLot !== null
                ? availableLots.filter((lot) => Number(lot.lotNo) === Number(selectedDropdownLot))
                : availableLots
            }
            selectedLotTab={selectedLotTab}
            setSelectedLotTab={setSelectedLotTab}
            getTemplatesForModuleKey={getTemplatesForModuleKey}
            resolveTemplateId={resolveTemplateId}
            resolveTemplateName={resolveTemplateName}
            lotTemplateStatus={lotTemplateStatus}
            staleLotIds={staleLotIds}
            generatingLotReport={generatingLotReport}
            lotReportStatus={lotReportStatus}
            getBoxVersionsForLot={getBoxVersionsForLot}
            handleGenerateAllLots={handleGenerateAllLots}
            generatingLotTemplates={generatingLotTemplates}
            downloadingLotTemplates={downloadingLotTemplates}
            handleGenerateLotTemplate={handleGenerateLotTemplate}
            handleDownloadLotTemplate={handleDownloadLotTemplate}
            handleGenerateAllLotTemplates={handleGenerateAllLotTemplates}
            handleDownloadAllLots={handleDownloadAllLots}
            bulkGeneratingLots={bulkGeneratingLots}
            bulkDownloadingLots={bulkDownloadingLots}
            staleTemplateIds={staleTemplateIds}
            getMappingUpdateTime={getMappingUpdateTime}
            generatingTemplates={generatingTemplates}
            templateReportStatus={templateReportStatus}
            handleGenerateTemplate={handleGenerateTemplate}
            handleDownloadTemplate={handleDownloadTemplate}
            isQuantitySheetTemplate={isQuantitySheetTemplate}
            isCompositeSummaryTemplate={isCompositeSummaryTemplate}
            onClose={closeLotWisePanel}
          />
        </div>
      </motion.div>

      <DependencyModal
        visible={dependencyModal.visible}
        unprocessedSteps={dependencyModal.unprocessedSteps}
        onCancel={() => setDependencyModal({ visible: false, unprocessedSteps: [], selectedStep: null })}
        onConfirm={() => handleDependencyModalOk(true)}
      />

      <LotSelectionModal
        visible={lotSelectionModal.visible}
        availableLots={lotSelectionModal.availableLots}
        selectedLots={lotSelectionModal.selectedLots}
        description={lotSelectionModal.description}
        okText={lotSelectionModal.okText}
        isQuantitySheet={lotSelectionModal.isQuantitySheet}
        onToggle={handleLotToggle}
        onSelectAll={handleSelectAllLots}
        onConfirm={handleLotSelectionConfirm}
        onCancel={handleLotSelectionCancel}
      />

      <EnvLotSelectionModal
        visible={envLotSelectionModal.visible}
        projectId={projectId}
        availableEnvLots={envLotSelectionModal.availableEnvLots}
        selectedEnvLots={envLotSelectionModal.selectedEnvLots}
        onToggle={handleEnvLotToggle}
        onSelectAll={handleSelectAllEnvLots}
        onConfirm={handleEnvLotSelectionConfirm}
        onCancel={handleEnvLotSelectionCancel}
        isRegenerate={envLotSelectionModal.isRegenerate}
        generatedEnvLots={envLotSelectionModal.generatedEnvLots}
        templateIsOutdated={envLotSelectionModal.templateIsOutdated}
        staleEnvLotIds={envLotSelectionModal.staleEnvLotIds}
        assignedEnvLots={envLotSelectionModal.assignedEnvLots}
        unassignedCatches={envLotSelectionModal.unassignedCatches}
        showAssigned={envLotSelectionModal.showAssigned}
        onToggleShowAssigned={(val) => setEnvLotSelectionModal(prev => ({ ...prev, showAssigned: val }))}
      />
      <ReportTemplateManagement
        reports={combinedReportData}
        projectId={projectId}
        apiBaseUrl={import.meta.env.VITE_API_URL}
        rptApiUrl={import.meta.env.VITE_RPT_API_URL}
        envLotReports={envLotReports}
        availableLots={availableLots}
        onDownload={(version, report) => {
          if (version?.fileUrl) {
            const link = document.createElement("a");
            link.href = version.fileUrl;
            let dn = report?.reportName || 'Report';
            if (!dn.toLowerCase().endsWith('.xlsx')) dn += '.xlsx';
            link.download = dn;
            link.target = "_blank";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }
        }}
      />

      <ExistingReportModal
        visible={existingReportModal.visible}
        report={existingReportModal.report}
        onDownload={handleExistingReportDownload}
        onGenerate={handleExistingReportGenerate}
        onCancel={handleExistingReportCancel}
      />

      <style>{`
        .pipeline-main {
          display: grid;
          gap: 16px;
          align-items: start;
          width: 100%;
        }
        .pipeline-main--with-panel {
          grid-template-columns: 1fr 450px;
        }
        .pipeline-main--single {
          grid-template-columns: 1fr;
        }
        .pipeline-table-card {
          min-width: 0;
          overflow: hidden;
        }
        .pipeline-panel {
          position: sticky;
          top: 12px;
          min-width: 0;
        }
        .pipeline-panel-wide {
          /* Removed rigid min-width to allow fluid shrinking */
        }
        .pipeline-panel-body {
          padding: 12px;
          max-height: calc(100vh - 220px);
          overflow-y: auto;
        }
        .pipeline-panel-title {
          display: flex;
          flex-direction: row;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          width: 100%;
        }
        .pipeline-panel-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .pipeline-panel-actions .ant-btn {
          white-space: nowrap;
          flex: none;
        }
        .ant-tabs-tab.ant-tabs-tab-active {
          background-color: #f0f5ff !important;
          border-color: #91caff !important;
        }
        .ant-tabs-tab.ant-tabs-tab-active .ant-tabs-tab-btn {
          color: #1677ff !important;
          font-weight: 500 !important;
        }

        /* Large Desktop */
        @media (min-width: 1600px) {
          .pipeline-main--with-panel {
            grid-template-columns: 1fr 550px;
          }
        }

        /* Standard Desktop */
        @media (max-width: 1440px) {
          .pipeline-main--with-panel {
            grid-template-columns: 1fr 400px;
          }
        }

        /* Small Desktop / Tablet Landscape */
        @media (max-width: 1200px) {
          .pipeline-main--with-panel {
            grid-template-columns: 1fr 350px;
            gap: 12px;
          }
          .pipeline-panel-title {
            font-size: 13px;
          }
        }

        /* Tablet Portrait and below */
        @media (max-width: 992px) {
          .pipeline-main--with-panel {
            grid-template-columns: 1fr;
          }
          .pipeline-panel {
            position: static;
            width: 100%;
          }
        }

        /* Mobile */
        @media (max-width: 576px) {
           .p-4 { padding: 8px !important; }
           .ant-card-head-title { font-size: 14px; white-space: normal; }
           .pipeline-panel-actions { flex-direction: column; }
           .pipeline-panel-actions .ant-btn { width: 100%; }
        }
      `}</style>
      </div>
    </ErrorBoundary>
  );
};

export default ProcessingPipeline;