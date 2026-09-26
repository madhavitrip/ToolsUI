import React, { useState, useEffect, useMemo } from "react";
import { Typography, Card, Tabs, Upload, Button, Select, Table, Tag, Row, Col, Popover, Checkbox, Tooltip, Input, Form, Modal, Popconfirm, Space, InputNumber, Alert, Badge, Radio, Collapse } from "antd";
import { UploadOutlined, CheckCircleOutlined, SettingOutlined, SearchOutlined, DeleteOutlined, WarningOutlined } from "@ant-design/icons";
import * as XLSX from "xlsx-js-style";
import API from "../hooks/api";
import { useToast } from "../hooks/useToast";
import useStore from "../stores/ProjectData";
import DataImportConflictReport from "../components/DataImportConflictReport";

const { Title, Text } = Typography;
const { TabPane } = Tabs;

const EditableCell = ({
  editing,
  dataIndex,
  title,
  inputType,
  record,
  index,
  children,
  ...restProps
}) => {
  const inputNode = inputType === 'number' ? <InputNumber style={{ width: '100%' }} /> : <Input />;
  return (
    <td {...restProps}>
      {editing ? (
        <Form.Item
          name={dataIndex}
          style={{ margin: 0 }}
        >
          {inputNode}
        </Form.Item>
      ) : (
        children
      )}
    </td>
  );
};

export default function NodalCenterList() {
  const { showToast } = useToast();
  const projectId = useStore((state) => state.projectId);

  const [activeTab, setActiveTab] = useState("1");
  const [availableDbFields, setAvailableDbFields] = useState([]);
  const [fileList, setFileList] = useState([]);
  const [fileHeaders, setFileHeaders] = useState([]);
  const [fileData, setFileData] = useState([]);
  const [mapping, setMapping] = useState({});
  const [uploading, setUploading] = useState(false);

  const [existingData, setExistingData] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [isUploadSectionVisible, setIsUploadSectionVisible] = useState(false);
  const [dynamicFields, setDynamicFields] = useState([]);
  const [visibleColumns, setVisibleColumns] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [sorter, setSorter] = useState({ field: null, order: null });
  const [searchText, setSearchText] = useState("");
  const [localSearch, setLocalSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState({});

  const [level1Fields, setLevel1Fields] = useState([]);
  const [level2Fields, setLevel2Fields] = useState([]);
  const [level3Fields, setLevel3Fields] = useState([]);
  const [dynamicRuleLoading, setDynamicRuleLoading] = useState(false);

  const [form] = Form.useForm();
  const [addForm] = Form.useForm();
  const [editingKey, setEditingKey] = useState('');
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [addingRecord, setAddingRecord] = useState(false);

  const [addedFields, setAddedFields] = useState([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  const allTempColumnsList = [
    "CatchNo", "CollegeCode", "CollegeName", "CenterCode", "NodalCode", "NRQuantity", "CourseName", "SubjectName", "ExamDate", "ExamTime"
  ];

  const [tempData, setTempData] = useState([]);
  const [tempPagination, setTempPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [loadingTemp, setLoadingTemp] = useState(false);
  const [tempColumnFilters, setTempColumnFilters] = useState({});
  const [visibleTempColumns, setVisibleTempColumns] = useState(allTempColumnsList);
  const [reports, setReports] = useState(null);
  const [allNodalRecords, setAllNodalRecords] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [merging, setMerging] = useState(false);
  const [pushingToMain, setPushingToMain] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isGenderModalVisible, setIsGenderModalVisible] = useState(false);
  const [genderDetectedValues, setGenderDetectedValues] = useState([]);
  const [genderChoice, setGenderChoice] = useState("ALL");
  const [mergeBy, setMergeBy] = useState(() => {
    return localStorage.getItem(`mergeBy_${projectId}`) || "CollegeCode";
  });

  const handleLevel1Change = (vals) => {
    setLevel1Fields(vals);
    if (projectId) localStorage.setItem(`dynamicL1_${projectId}`, JSON.stringify(vals));
  };

  const handleLevel2Change = (vals) => {
    setLevel2Fields(vals);
    if (projectId) localStorage.setItem(`dynamicL2_${projectId}`, JSON.stringify(vals));
  };

  const handleLevel3Change = (vals) => {
    setLevel3Fields(vals);
    if (projectId) localStorage.setItem(`dynamicL3_${projectId}`, JSON.stringify(vals));
  };

  useEffect(() => {
    if (projectId) {
      const saved = localStorage.getItem(`mergeBy_${projectId}`);
      if (saved) setMergeBy(saved);

      try {
        const savedL1 = localStorage.getItem(`dynamicL1_${projectId}`);
        const savedL2 = localStorage.getItem(`dynamicL2_${projectId}`);
        const savedL3 = localStorage.getItem(`dynamicL3_${projectId}`);

        if (savedL1) setLevel1Fields(JSON.parse(savedL1));
        if (savedL2) setLevel2Fields(JSON.parse(savedL2));
        if (savedL3) setLevel3Fields(JSON.parse(savedL3));
      } catch {}
    }
  }, [projectId]);

  useEffect(() => {
    if (reports?.dynamicConflicts?.length > 0) {
      let extractedL1 = null;
      let extractedL2 = null;
      let extractedL3 = null;

      reports.dynamicConflicts.forEach((dc) => {
        try {
          const unique = JSON.parse(dc.uniqueField || dc.UniqueField);
          const conflict = JSON.parse(dc.conflictingField || dc.ConflictingField);
          if (unique?.fields && conflict?.fields) {
            const confStr = conflict.fields.join(",").toLowerCase();
            if (confStr.includes("examcentercode") || confStr.includes("center")) {
              extractedL1 = unique.fields;
              extractedL2 = conflict.fields;
            } else if (confStr.includes("nodalcode") || confStr.includes("nodal")) {
              extractedL2 = unique.fields;
              extractedL3 = conflict.fields;
            } else if (!extractedL1) {
              extractedL1 = unique.fields;
              extractedL2 = conflict.fields;
            }
          }
        } catch {}
      });

      if (extractedL1 && extractedL1.length > 0 && level1Fields.length === 0) {
        setLevel1Fields(extractedL1);
        if (projectId) localStorage.setItem(`dynamicL1_${projectId}`, JSON.stringify(extractedL1));
      }
      if (extractedL2 && extractedL2.length > 0 && level2Fields.length === 0) {
        setLevel2Fields(extractedL2);
        if (projectId) localStorage.setItem(`dynamicL2_${projectId}`, JSON.stringify(extractedL2));
      }
      if (extractedL3 && extractedL3.length > 0 && level3Fields.length === 0) {
        setLevel3Fields(extractedL3);
        if (projectId) localStorage.setItem(`dynamicL3_${projectId}`, JSON.stringify(extractedL3));
      }
    } else if (level1Fields.length === 0 && level2Fields.length === 0 && level3Fields.length === 0) {
      const defaultL1 = ["CollegeName", "Gender"];
      const defaultL2 = ["ExamCenterCode"];
      const defaultL3 = ["NodalCode"];
      setLevel1Fields(defaultL1);
      setLevel2Fields(defaultL2);
      setLevel3Fields(defaultL3);
      if (projectId) {
        localStorage.setItem(`dynamicL1_${projectId}`, JSON.stringify(defaultL1));
        localStorage.setItem(`dynamicL2_${projectId}`, JSON.stringify(defaultL2));
        localStorage.setItem(`dynamicL3_${projectId}`, JSON.stringify(defaultL3));
      }
    }
  }, [reports, projectId]);

  const handleMergeByChange = (val) => {
    setMergeBy(val);
    if (projectId) {
      localStorage.setItem(`mergeBy_${projectId}`, val);
    }
    setIsDirty(true);
  };

  const catchListFields = [
    "CatchNo", "CollegeCode", "CollegeName", "PaperCode", "CourseName", "SubjectName", "NRQuantity", "ExamDate", "ExamTime",
    "Transgender", "Male", "Female", "Semester", "CenterCode", "CenterName"
  ];
  const requiredCatchListFields = ["CatchNo", "CollegeName", "CenterCode", "CenterName"];

  const nodalListFields = [
    "CollegeCode", "CollegeName", "ExamCenterCode", "ExamCenterName",
    "Gender", "NodalCode", "NodalName"
  ];
  const requiredNodalListFields = ["NodalCode", "NodalName", "CollegeName", "ExamCenterCode", "ExamCenterName"];

  const currentFields = activeTab === "1" ? catchListFields : nodalListFields;
  const currentRequiredFields = activeTab === "1" ? requiredCatchListFields : requiredNodalListFields;

  useEffect(() => {
    if (projectId) {
      fetchAvailableDbFields();
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId && activeTab !== "3") {
      fetchExistingData();
    }
  }, [projectId, activeTab, pagination.current, pagination.pageSize, sorter.field, sorter.order, searchText, columnFilters]);

  useEffect(() => {
    if (projectId) {
      fetchTempData();
    }
  }, [projectId, activeTab, tempPagination.current, tempPagination.pageSize, sorter.field, sorter.order, searchText, tempColumnFilters]);

  useEffect(() => {
    setLocalSearch(searchText);
  }, [searchText]);

  useEffect(() => {
    if (projectId) {
      fetchReports(mergeBy);
    }
  }, [projectId, mergeBy]);

  const fetchAvailableDbFields = async () => {
    try {
      const res = await API.get("/Fields");
      // res.data is likely an array of { fieldId, name } or similar
      const fields = res.data.map(f => f.name || f.Name || f);
      setAvailableDbFields(fields);
    } catch (error) {
      console.error(error);
      showToast("Failed to fetch available fields", "error");
    }
  };

  useEffect(() => {
    // Reset added fields to just required fields when tab changes
    setAddedFields([...currentRequiredFields]);
    setSelectedRowKeys([]);
  }, [activeTab]);

  const fetchExistingData = async () => {
    setLoadingData(true);
    try {
      const endpoint = activeTab === "1" ? `/CatchLists/${projectId}` : `/NodalLists/${projectId}`;
      const params = {
        pageNo: pagination.current,
        pageSize: pagination.pageSize,
        search: searchText || null,
        sortField: sorter.field || null,
        sortOrder: sorter.order || null,
        columnFilters: Object.keys(columnFilters).length > 0 ? JSON.stringify(columnFilters) : null,
      };

      const res = await API.get(endpoint, { params });

      const data = res.data?.items || [];
      const totalCount = res.data?.totalCount || 0;

      let dynamicKeysSet = new Set();
      const processedData = data.map(item => {
        let parsedDynamic = {};
        const dynamicJsonStr = activeTab === "1" ? item.nrDatas : item.otherFields;
        if (dynamicJsonStr) {
          try {
            parsedDynamic = JSON.parse(dynamicJsonStr);
            Object.keys(parsedDynamic).forEach(k => dynamicKeysSet.add(k));
          } catch (e) { }
        }
        return { ...item, ...parsedDynamic };
      });

      const dynamicFieldsArr = Array.from(dynamicKeysSet);
      setDynamicFields(dynamicFieldsArr);

      // By default, dynamic fields are NOT visible, only standard fields are
      if (visibleColumns.length === 0) {
        const activeColumns = currentFields.filter(col => {
          const dataIndex = col === "NRQuantity" ? "nrQuantity" : (col.charAt(0).toLowerCase() + col.slice(1));
          return processedData.some(item => item[dataIndex] !== null && item[dataIndex] !== undefined && item[dataIndex] !== '');
        });
        setVisibleColumns(activeColumns.length > 0 ? activeColumns : currentFields);
      }

      setExistingData(processedData);
      setPagination(prev => ({ ...prev, total: totalCount }));
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingData(false);
    }
  };

  const fetchTempData = async () => {
    setLoadingTemp(true);
    try {
      const params = {
        pageNo: tempPagination.current,
        pageSize: tempPagination.pageSize,
        search: searchText || null,
        sortField: sorter.field || null,
        sortOrder: sorter.order || null,
        columnFilters: Object.keys(tempColumnFilters).length > 0 ? JSON.stringify(tempColumnFilters) : null,
      };
      const res = await API.get(`/TemporaryNrDatas/${projectId}`, { params });
      setTempData(res.data.items || []);
      setTempPagination(prev => ({ ...prev, total: res.data.totalCount || 0 }));
    } catch (err) {
      showToast("Failed to fetch temporary data", "error");
    } finally {
      setLoadingTemp(false);
    }
  };

  const fetchAllNodalRecords = async () => {
    if (!projectId) return;
    try {
      const res = await API.get(`/NodalLists/${projectId}?pageNo=1&pageSize=5000`);
      const items = res.data?.items || res.data || [];
      setAllNodalRecords(items);
    } catch (err) {
      console.error("Error fetching all nodal records:", err);
    }
  };

  const centerNodalOptions = useMemo(() => {
    const map = new Map();
    (allNodalRecords || []).forEach((r) => {
      const cCode = r.examCenterCode || r.centerCode;
      const cName = r.examCenterName || r.centerName || (cCode ? `Center ${cCode}` : "");
      const nCode = r.nodalCode;
      const nName = r.nodalName || (nCode ? `Nodal ${nCode}` : "");
      if (cCode || nCode) {
        const key = `${cCode}_${nCode}`;
        if (!map.has(key)) {
          map.set(key, {
            centerCode: cCode ? String(cCode) : "",
            centerName: cName,
            nodalCode: nCode ? String(nCode) : "",
            nodalName: nName,
            label: `Center: ${cCode || "-"} (${cName || "-"}) | Nodal: ${nCode || "-"} (${nName || "-"})`,
            value: key,
          });
        }
      }
    });
    return Array.from(map.values());
  }, [allNodalRecords]);

  const fetchReports = async (currentMergeBy = mergeBy) => {
    setLoadingReports(true);
    try {
      const res = await API.get(`/Merging/Reports/${projectId}`, {
        params: { mergeBy: currentMergeBy }
      });
      setReports(res.data);
      await fetchAllNodalRecords();
    } catch (err) {
      showToast("Failed to fetch reports", "error");
    } finally {
      setLoadingReports(false);
    }
  };

  const navigateToNodalListWithSearch = (searchVal) => {
    setActiveTab("2");
    setVisibleColumns([]);
    setPagination({ current: 1, pageSize: 10, total: 0 });
    setSorter({ field: null, order: null });
    setColumnFilters({});
    setSearchText(String(searchVal || ""));
    setLocalSearch(String(searchVal || ""));
  };

  const navigateToCatchListWithSearch = (searchVal) => {
    setActiveTab("1");
    setVisibleColumns([]);
    setPagination({ current: 1, pageSize: 10, total: 0 });
    setSorter({ field: null, order: null });
    setColumnFilters({});
    setSearchText(String(searchVal || ""));
    setLocalSearch(String(searchVal || ""));
  };

  const handleMergePreview = async () => {
    setMerging(true);
    try {
      await API.post(`/Merging/MergeToTemporary/${projectId}?mergeBy=${encodeURIComponent(mergeBy)}`);
      showToast("Merged to temporary data successfully", "success");
      setIsDirty(false);
      await Promise.all([fetchTempData(), fetchReports(mergeBy)]);
    } catch (err) {
      const errData = err.response?.data;
      const errErrors = errData?.errors || errData?.rule2Errors;
      const errMsg = errData?.message || (typeof err.response?.data === 'string' ? err.response?.data : "Merge failed");
      showToast(errMsg, "error");

      if (errData) {
        setReports(prev => ({
          ...prev,
          rule1Passed: errData.rule1Passed !== undefined ? errData.rule1Passed : prev?.rule1Passed,
          rule2Passed: errData.rule2Passed !== undefined ? errData.rule2Passed : prev?.rule2Passed,
          rule1Errors: errData.rule1Errors || prev?.rule1Errors,
          rule2Errors: errData.rule2Errors || prev?.rule2Errors,
          multiCenterDetails: errData.multiCenterDetails || prev?.multiCenterDetails,
          multiNodalDetails: errData.multiNodalDetails || prev?.multiNodalDetails,
          rule1CollegeCodes: errData.rule1CollegeCodes || prev?.rule1CollegeCodes,
          rule1CenterCodes: errData.rule1CenterCodes || prev?.rule1CenterCodes,
          rule2CollegeCodes: errData.rule2CollegeCodes || prev?.rule2CollegeCodes,
          unassignedDetails: errData.unassignedDetails || prev?.unassignedDetails,
          unassignedCount: errData.unassignedDetails?.length || prev?.unassignedCount,
        }));
      }
      setActiveTab("3");
    } finally {
      setMerging(false);
    }
  };

  const confirmPushToMain = () => {
    const hasCriticalErrors = reports?.rule1Passed === false || (reports?.rule1Errors && reports.rule1Errors.length > 0);
    const hasRule2Errors = reports?.rule2Passed === false || (reports?.rule2Errors && reports.rule2Errors.length > 0);

    if (hasCriticalErrors) {
      Modal.error({
        title: 'Rule 1 Validation Failed (Cannot Push)',
        content: (
          <div>
            <p>Pushing to main NR Data is strictly blocked because Rule 1 validation failed (one college must belong to one center, and one center to one nodal code).</p>
            <p className="mt-2 text-sm text-gray-600">Please review and resolve the conflicts in the Conflict Report tab first.</p>
            <div className="mt-4">
              <Button type="primary" danger onClick={() => { Modal.destroyAll(); setActiveTab("3"); }}>
                Open Conflict Report
              </Button>
            </div>
          </div>
        ),
        okText: 'Close',
      });
      return;
    }

    if (hasRule2Errors) {
      Modal.error({
        title: 'Rule 2 Validation Failed (Cannot Push)',
        content: (
          <div>
            <p className="font-semibold text-red-600">Pushing to main NR Data is strictly blocked because some colleges are not assigned to an exam center.</p>
            <p className="mt-2 text-sm text-gray-600">Every college must be assigned an exam center before pushing to main NR Data.</p>
            {reports?.rule2CollegeCodes && reports.rule2CollegeCodes.length > 0 && (
              <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800 max-h-32 overflow-y-auto">
                <strong>Unassigned Colleges ({reports.rule2CollegeCodes.length}):</strong>
                <div className="mt-1 flex flex-wrap gap-1">
                  {reports.rule2CollegeCodes.map(code => (
                    <span key={code} className="bg-red-100 text-red-800 px-1.5 py-0.5 rounded font-mono">
                      {code}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <Button type="primary" danger onClick={() => { Modal.destroyAll(); setActiveTab("3"); }}>
                Review in Conflict Report
              </Button>
              <Button onClick={() => { Modal.destroyAll(); setActiveTab("2"); }}>
                Go to Nodal List
              </Button>
            </div>
          </div>
        ),
        okText: 'Close',
      });
      return;
    }

    handlePushToMain();
  };

  const handlePushToMain = async () => {
    setPushingToMain(true);
    try {
      await API.post(`/Merging/PushToMain/${projectId}`);
      showToast("Successfully pushed to main NRDatas table", "success");
      setTempData([]);
      setReports(null);
      setIsDirty(false);
    } catch (err) {
      const errMsg = err.response?.data?.message || err.response?.data || "Push failed";
      showToast(errMsg, "error");
      if (err.response?.data?.rule2Passed === false || err.response?.data?.rule2Failed) {
        Modal.error({
          title: 'Rule 2 Validation Failed (Cannot Push)',
          content: (
            <div>
              <p className="text-red-600 font-semibold">{errMsg}</p>
              {err.response?.data?.errors && (
                <ul className="mt-2 text-xs text-gray-700 list-disc pl-4">
                  {err.response.data.errors.map((e, idx) => <li key={idx}>{e}</li>)}
                </ul>
              )}
            </div>
          ),
          okText: 'Close',
        });
      }
    } finally {
      setPushingToMain(false);
    }
  };

  const handleTabChange = (key) => {
    setActiveTab(key);
    setVisibleColumns([]);
    setPagination({ current: 1, pageSize: 10, total: 0 });
    setSorter({ field: null, order: null });
    setSearchText("");
    setColumnFilters({});
    resetUploadState();
  };

  const resetUploadState = () => {
    setFileList([]);
    setFileHeaders([]);
    setFileData([]);
    setMapping({});
    setAddedFields([...(activeTab === "1" ? requiredCatchListFields : requiredNodalListFields)]);
  };

  const beforeUpload = (file) => {
    setFileList([file]);
    handleFileUpload(file);
    return false;
  };

  const onRemove = () => {
    resetUploadState();
  };

  const handleFileUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (jsonData.length > 0) {
          const headers = jsonData[0];
          setFileHeaders(headers);

          const dataRows = XLSX.utils.sheet_to_json(worksheet);
          setFileData(dataRows);

          // Auto map exact matches and add them to addedFields
          const initialMapping = {};
          const matchedFields = new Set(currentRequiredFields);

          headers.forEach(header => {
            // Only auto-map standard fields (currentFields), NOT availableDbFields. 
            // This prevents unexpected dynamic fields from being auto-mapped.
            const matchedField = currentFields.find(f => f.toLowerCase() === header.toLowerCase().replace(/\s/g, ''));
            if (matchedField) {
              initialMapping[matchedField] = header;
              matchedFields.add(matchedField);
            }
          });
          setMapping(initialMapping);
          setAddedFields(Array.from(matchedFields));
        } else {
          showToast("File is empty", "error");
        }
      } catch (error) {
        showToast("Error reading file", "error");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleMappingChange = (modelField, fileHeader) => {
    setMapping(prev => {
      const updated = { ...prev };
      if (!fileHeader) {
        delete updated[modelField];
      } else {
        updated[modelField] = fileHeader;
      }
      return updated;
    });
  };

  const executeUpload = async (genderResolutionChoice = null) => {
    setUploading(true);

    try {
      const genderHeader = mapping["Gender"];
      const mappedData = fileData.map((row) => {
        const newRow = {};
        // Map ONLY fields explicitly added by user in the mapping UI
        Object.keys(mapping).forEach((modelField) => {
          const fileHeader = mapping[modelField];
          if (fileHeader && row[fileHeader] !== undefined) {
            newRow[modelField] = row[fileHeader];
          }
        });

        // Apply gender normalization when uploading Nodal List
        if (activeTab === "2") {
          const rawVal = genderHeader ? row[genderHeader] : newRow["Gender"];
          const strVal = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : "";
          const lower = strVal.toLowerCase();

          if (lower === "male" || lower === "m") {
            newRow["Gender"] = "MALE";
          } else if (lower === "female" || lower === "f") {
            newRow["Gender"] = "FEMALE";
          } else if (genderResolutionChoice) {
            newRow["Gender"] = genderResolutionChoice;
          } else if (!newRow["Gender"]) {
            newRow["Gender"] = "ALL";
          }
        }

        return newRow;
      });

      const endpoint = activeTab === "1" ? "/CatchLists/Upload" : "/NodalLists/Upload";

      const response = await API.post(endpoint, {
        projectId: projectId,
        data: mappedData,
      });

      showToast(response.data.message || "Upload successful", "success");
      resetUploadState();
      setIsUploadSectionVisible(false);
      fetchExistingData();
      setIsDirty(true);
    } catch (error) {
      console.error(error);
      showToast(error.response?.data?.message || "Upload failed", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async () => {
    if (!projectId) {
      showToast("Project ID is missing", "error");
      return;
    }

    if (fileData.length === 0) {
      showToast("No data to upload", "warning");
      return;
    }

    // Validate required fields
    for (let reqField of currentRequiredFields) {
      if (!mapping[reqField]) {
        showToast(`Please map the required field: ${reqField}`, "error");
        return;
      }
    }

    // When uploading Nodal List, check for non-standard gender values
    if (activeTab === "2") {
      const genderHeader = mapping["Gender"];
      const nonStandardMap = {};
      let nonStandardCount = 0;

      fileData.forEach((row) => {
        const rawVal = genderHeader ? row[genderHeader] : undefined;
        const strVal = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : "";
        const lower = strVal.toLowerCase();

        const isMale = lower === "male" || lower === "m";
        const isFemale = lower === "female" || lower === "f";

        if (!isMale && !isFemale) {
          const displayVal = strVal || "(Empty / Unspecified)";
          nonStandardMap[displayVal] = (nonStandardMap[displayVal] || 0) + 1;
          nonStandardCount++;
        }
      });

      if (nonStandardCount > 0) {
        const detected = Object.entries(nonStandardMap).map(([val, count]) => ({
          value: val,
          count,
        }));
        setGenderDetectedValues(detected);
        setGenderChoice("ALL");
        setIsGenderModalVisible(true);
        return;
      }
    }

    await executeUpload();
  };

  const allAvailableColumns = [...currentFields, ...dynamicFields];

  const baseColumns = allAvailableColumns
    .filter(col => visibleColumns.includes(col))
    .map(col => {
      const isStandardField = currentFields.includes(col);
      const dataIndex = isStandardField
        ? (col === "NRQuantity" ? "nrQuantity" : (col.charAt(0).toLowerCase() + col.slice(1)))
        : col;

      const colDef = {
        title: col,
        dataIndex: dataIndex,
        key: col,
        sorter: true,
        editable: isStandardField,
        filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
          <div style={{ padding: 8 }}>
            <Input
              placeholder={`Search ${col}`}
              value={selectedKeys[0]}
              onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
              onPressEnter={() => confirm()}
              style={{ width: 188, marginBottom: 8, display: 'block' }}
            />
            <Space>
              <Button
                type="primary"
                onClick={() => confirm()}
                icon={<SearchOutlined />}
                size="small"
                style={{ width: 90 }}
              >
                Search
              </Button>
              <Button onClick={() => clearFilters()} size="small" style={{ width: 90 }}>
                Reset
              </Button>
            </Space>
          </div>
        ),
        filterIcon: (filtered) => (
          <SearchOutlined style={{ color: filtered ? '#1890ff' : undefined }} />
        ),
      };

      if (["CourseName", "SubjectName", "CollegeName", "ExamCenterName", "NodalName"].includes(col)) {
        colDef.render = (text) => (
          <Tooltip title={text} placement="topLeft">
            <div style={{ maxWidth: 250, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {text}
            </div>
          </Tooltip>
        );
      }

      return colDef;
    });

  const handleAddRecord = async () => {
    try {
      const values = await addForm.validateFields();
      setAddingRecord(true);
      const endpoint = activeTab === "1" ? `/CatchLists` : `/NodalLists`;
      const payload = { ...values, projectId };

      await API.post(endpoint, payload);
      showToast("Record added successfully", "success");
      setIsAddModalVisible(false);
      addForm.resetFields();
      setIsDirty(true);
      fetchExistingData();
      fetchReports(mergeBy);
    } catch (err) {
      if (err.errorFields) return; // Validation failed
      showToast(err.response?.data || "Failed to add record", "error");
    } finally {
      setAddingRecord(false);
    }
  };

  const isEditing = (record) => record.id === editingKey;
  const edit = (record) => {
    form.setFieldsValue({
      ...record,
      nrQuantity: record.nrQuantity ?? record.nRQuantity ?? record.NRQuantity,
      nRQuantity: record.nrQuantity ?? record.nRQuantity ?? record.NRQuantity,
    });
    setEditingKey(record.id);
  };
  const cancel = () => {
    setEditingKey('');
  };
  const save = async (key) => {
    try {
      const row = await form.validateFields();
      if (row.nrQuantity !== undefined) {
        row.nRQuantity = row.nrQuantity;
        row.NRQuantity = row.nrQuantity;
      } else if (row.nRQuantity !== undefined) {
        row.nrQuantity = row.nRQuantity;
        row.NRQuantity = row.nRQuantity;
      }

      if (activeTab === "3") {
        const newData = [...tempData];
        const index = newData.findIndex((item) => key === item.id);
        if (index > -1) {
          const item = newData[index];
          const updatedItem = { ...item, ...row };
          await API.put(`/TemporaryNrDatas/${key}`, updatedItem);
          newData.splice(index, 1, updatedItem);
          setTempData(newData);
          setEditingKey('');
          showToast("Record updated successfully", "success");
        }
      } else {
        const newData = [...existingData];
        const index = newData.findIndex((item) => key === item.id);

        if (index > -1) {
          const item = newData[index];
          const updatedItem = { ...item, ...row };

          const endpoint = activeTab === "1" ? `/CatchLists/${key}` : `/NodalLists/${key}`;
          await API.put(endpoint, updatedItem);

          newData.splice(index, 1, updatedItem);
          setExistingData(newData);
          setEditingKey('');
          showToast("Data updated successfully", "success");
          setIsDirty(true);
          fetchReports(mergeBy);
        }
      }
    } catch (errInfo) {
      console.log('Validate/Save Failed:', errInfo);
      if (errInfo?.response?.data) {
        showToast(errInfo.response?.data?.message || errInfo.response?.data || "Failed to update record", "error");
      }
    }
  };

  const handleDelete = async (key) => {
    try {
      const endpoint = activeTab === "1"
        ? `/CatchLists/${key}`
        : activeTab === "2"
          ? `/NodalLists/${key}`
          : `/TemporaryNrDatas/${key}`;
      await API.delete(endpoint);
      showToast("Record deleted successfully", "success");
      setSelectedRowKeys(prev => prev.filter(k => k !== key));
      setIsDirty(true);
      if (activeTab === "3") {
        fetchTempData();
        fetchReports(mergeBy);
      } else {
        fetchExistingData();
        fetchReports(mergeBy);
      }
    } catch (error) {
      console.error(error);
      showToast(error.response?.data?.message || error.response?.data || "Failed to delete record", "error");
    }
  };

  const handleDeleteSelected = async () => {
    if (!selectedRowKeys.length) return;
    try {
      const endpoint = activeTab === "1"
        ? `/CatchLists/batch-delete`
        : activeTab === "2"
          ? `/NodalLists/batch-delete`
          : `/TemporaryNrDatas/batch-delete`;
      const res = await API.post(endpoint, selectedRowKeys);
      showToast(res.data?.message || `${selectedRowKeys.length} records deleted successfully`, "success");
      setSelectedRowKeys([]);
      setIsDirty(true);
      if (activeTab === "3") {
        fetchTempData();
        fetchReports();
      } else {
        fetchExistingData();
      }
    } catch (error) {
      console.error(error);
      showToast(error.response?.data?.message || error.response?.data || "Failed to delete selected records", "error");
    }
  };

  const handleDeleteAll = async () => {
    try {
      const endpoint = activeTab === "1"
        ? `/CatchLists/deleteAll/${projectId}`
        : activeTab === "2"
          ? `/NodalLists/deleteAll/${projectId}`
          : `/TemporaryNrDatas/deleteAll/${projectId}`;
      const res = await API.delete(endpoint);
      showToast(res.data?.message || "All records deleted successfully", "success");
      setSelectedRowKeys([]);
      setIsDirty(true);
      if (activeTab === "3") {
        fetchTempData();
        fetchReports();
      } else {
        fetchExistingData();
      }
    } catch (error) {
      console.error(error);
      showToast(error.response?.data?.message || error.response?.data || "Failed to delete records", "error");
    }
  };

  baseColumns.push({
    title: 'Action',
    dataIndex: 'operation',
    fixed: 'right',
    render: (_, record) => {
      const editable = isEditing(record);
      return editable ? (
        <Space size="middle">
          <Typography.Link onClick={() => save(record.id)}>Save</Typography.Link>
          <Popconfirm title="Sure to cancel?" onConfirm={cancel}>
            <a>Cancel</a>
          </Popconfirm>
        </Space>
      ) : (
        <Space size="middle">
          <Typography.Link
            disabled={editingKey !== '' || tempData.length > 0}
            onClick={() => edit(record)}
            title={tempData.length > 0 ? "Edit in Merge Preview instead" : ""}
          >
            Edit
          </Typography.Link>
          <Popconfirm
            title="Are you sure you want to delete this record?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
            disabled={editingKey !== '' || tempData.length > 0}
          >
            <Typography.Link
              type="danger"
              disabled={editingKey !== '' || tempData.length > 0}
            >
              Delete
            </Typography.Link>
          </Popconfirm>
        </Space>
      );
    },
  });

  const mergedColumns = baseColumns.map((col) => {
    if (!col.editable) {
      return col;
    }
    return {
      ...col,
      onCell: (record) => ({
        record,
        inputType: ['NRQuantity', 'Transgender', 'Male', 'Female', 'CollegeCode', 'NodalCode', 'ExamCenterCode'].includes(col.key) ? 'number' : 'text',
        dataIndex: col.dataIndex,
        title: col.title,
        editing: isEditing(record),
      }),
    };
  });

  const handleColumnVisibilityChange = (checkedValues) => {
    setVisibleColumns(checkedValues);
  };

  const columnVisibilityContent = (
    <Checkbox.Group
      options={allAvailableColumns.map(col => ({ label: col, value: col }))}
      value={visibleColumns}
      onChange={handleColumnVisibilityChange}
      className="flex flex-col gap-2 max-h-60 overflow-y-auto"
    />
  );

  const handleTableChange = (newPagination, filters, newSorter) => {
    const activeFilters = {};
    if (filters) {
      Object.keys(filters).forEach(key => {
        if (filters[key] && filters[key].length > 0) {
          activeFilters[key] = filters[key][0]; // Extract the first string value
        }
      });
    }
    setColumnFilters(activeFilters);

    setPagination(prev => ({
      ...prev,
      current: newPagination.current,
      pageSize: newPagination.pageSize
    }));
    setSorter({
      field: newSorter.field || null,
      order: newSorter.order || null
    });
  };

  const handleSearch = (value) => {
    setPagination(prev => ({ ...prev, current: 1 }));
    setTempPagination(prev => ({ ...prev, current: 1 }));
    setSearchText(value);
  };

  const getRemainingFields = () => {
    // Combine current model fields with DB fields to ensure we don't miss anything, then filter out already added
    const allPossibleFields = Array.from(new Set([...currentFields, ...availableDbFields]));
    return allPossibleFields.filter(f => !addedFields.includes(f));
  };

  const renderMappingSection = () => {
    return (
      <Card
        title="Field Mapping"
        className="mt-4"
        extra={
          // Allow user to add any field or custom field
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Select
              style={{ width: 220 }}
              placeholder="+ Add Field to Map"
              value={[]}
              mode="tags"
              showSearch
              filterOption={(input, option) =>
                (option?.children ?? '').toLowerCase().includes(input.toLowerCase())
              }
              onChange={(value) => {
                if (value && value.length > 0) {
                  const newField = value[value.length - 1]; // get the last added tag
                  if (newField) {
                    setAddedFields(prev => {
                      if (prev.includes(newField)) return prev;
                      return [...prev, newField];
                    });
                  }
                }
              }}
            >
              {getRemainingFields().map(f => (
                <Select.Option key={f} value={f}>
                  {f}
                </Select.Option>
              ))}
            </Select>
          </div>
        }
        styles={{ body: { paddingTop: 12, paddingBottom: 12 } }}
        style={{
          border: "1px solid #d9d9d9",
          boxShadow: "0 4px 8px rgba(0,0,0,0.05)",
        }}
      >
        <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
          Map fields from your file to expected fields (Required fields are shown by default)
        </Text>

        <Row gutter={[16, 16]}>
          {[...addedFields]
            .sort((a, b) => {
              const aReq = currentRequiredFields.includes(a);
              const bReq = currentRequiredFields.includes(b);
              if (aReq && !bReq) return -1;
              if (!aReq && bReq) return 1;
              return 0;
            })
            .map((field) => (
              <Col key={field} xs={24} md={8}>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <Text
                      style={{
                        marginRight: 8,
                        color: mapping[field] ? "#006400" : "inherit",
                      }}
                    >
                      {field}
                      {currentRequiredFields.includes(field) && (
                        <span style={{ color: "#ff4d4f", marginLeft: 2 }}>*</span>
                      )}
                    </Text>
                    {mapping[field] && (
                      <CheckCircleOutlined style={{ color: "#006400", fontSize: 16 }} />
                    )}
                  </div>
                  <Select
                    style={{
                      width: "100%",
                      borderColor: mapping[field] ? "#006400" : undefined,
                      boxShadow: mapping[field] ? "0 0 5px #006400" : undefined,
                    }}
                    placeholder="Select matching column from file"
                    value={mapping[field]}
                    onChange={(value) => handleMappingChange(field, value)}
                    allowClear
                    onClear={() => {
                      handleMappingChange(field, undefined);
                      if (!currentRequiredFields.includes(field)) {
                        setAddedFields(prev => prev.filter(f => f !== field));
                      }
                    }}
                  >
                    {fileHeaders
                      .filter(
                        (header) =>
                          !Object.values(mapping).includes(header) ||
                          mapping[field] === header
                      )
                      .map((header, index) => (
                        <Select.Option key={`${header}-${index}`} value={header}>
                          {header}
                        </Select.Option>
                      ))}
                  </Select>
                </div>
              </Col>
            ))}
        </Row>
      </Card>
    );
  };

  const renderUploadSection = (title) => (
    <div className="flex flex-col gap-4">
      {isUploadSectionVisible && (
        <Card
          className="shadow-sm border-gray-200"
          title={title}
          extra={<Button type="text" onClick={() => setIsUploadSectionVisible(false)}>Close</Button>}
        >
          <div className="flex flex-col gap-4">
            <Upload.Dragger
              fileList={fileList}
              beforeUpload={beforeUpload}
              onRemove={onRemove}
              accept=".xls,.xlsx,.csv"
              maxCount={1}
            >
              <p className="ant-upload-text">Upload Excel or CSV file</p>
              <Button icon={<UploadOutlined />}>Choose File</Button>
            </Upload.Dragger>

            {fileHeaders.length > 0 && (
              <div className="mt-4">
                {renderMappingSection()}
                <div className="mt-4 flex justify-end">
                  <Button
                    type="primary"
                    onClick={handleUpload}
                    loading={uploading}
                    disabled={uploading}
                  >
                    Upload Data
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Existing Data Table */}
      <Card className="shadow-sm border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Typography.Title level={5} className="mb-0">Uploaded Data</Typography.Title>
            <Tag color="blue">{pagination.total} Records</Tag>
          </div>
          <div className="flex gap-4 items-center">
            <Input.Search
              placeholder="Search table..."
              onSearch={handleSearch}
              value={localSearch}
              onChange={(e) => {
                setLocalSearch(e.target.value);
                if (!e.target.value) handleSearch('');
              }}
              style={{ width: 250 }}
              allowClear
            />
            {!isUploadSectionVisible && (
              <Button type="primary" onClick={() => setIsUploadSectionVisible(true)} disabled={tempData.length > 0}>
                {title}
              </Button>
            )}
            <Button onClick={() => setIsAddModalVisible(true)} disabled={tempData.length > 0}>
              + Add Record
            </Button>
            {selectedRowKeys.length > 0 && (
              <Popconfirm
                title={`Are you sure you want to delete ${selectedRowKeys.length} selected record(s)?`}
                onConfirm={handleDeleteSelected}
                okText="Yes, Delete"
                cancelText="Cancel"
                okButtonProps={{ danger: true }}
              >
                <Button danger icon={<DeleteOutlined />}>
                  Delete Selected ({selectedRowKeys.length})
                </Button>
              </Popconfirm>
            )}
            {pagination.total > 0 && (
              <Popconfirm
                title={`Are you sure you want to delete ALL (${pagination.total}) records for ${activeTab === "1" ? "Catch List" : "Nodal List"} in this project?`}
                onConfirm={handleDeleteAll}
                okText="Yes, Delete All"
                cancelText="Cancel"
                okButtonProps={{ danger: true }}
              >
                <Button danger type="primary" icon={<DeleteOutlined />}>
                  Delete All
                </Button>
              </Popconfirm>
            )}
            <Popover content={columnVisibilityContent} title="Column Visibility" trigger="click" placement="bottomRight">
              <Button icon={<SettingOutlined />}>Columns</Button>
            </Popover>
          </div>
        </div>
        <Form form={form} component={false}>
          <Table
            components={{
              body: {
                cell: EditableCell,
              },
            }}
            rowSelection={{
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys),
            }}
            dataSource={existingData}
            columns={mergedColumns}
            loading={loadingData}
            rowKey="id"
            size="small"
            scroll={{ x: 'max-content' }}
            pagination={pagination}
            onChange={handleTableChange}
            rowClassName="editable-row"
          />
        </Form>
      </Card>
    </div>
  );


  const handleTempTableChange = (newPagination, filters, newSorter) => {
    setTempPagination(newPagination);
    setSorter({
      field: newSorter.field,
      order: newSorter.order,
    });

    // Extract column filters
    const currentFilters = {};
    Object.keys(filters).forEach(key => {
      if (filters[key] && filters[key].length > 0) {
        currentFilters[key] = filters[key][0];
      }
    });
    setTempColumnFilters(currentFilters);
  };

  const renderMergeTab = () => {
    const tempColumns = allTempColumnsList
      .filter(col => visibleTempColumns.includes(col))
      .map(col => {
        const dataIndex = col === "NRQuantity" ? "nrQuantity" : (col.charAt(0).toLowerCase() + col.slice(1));
        const colDef = {
          title: col,
          dataIndex: dataIndex,
          key: col,
          sorter: true,
          filteredValue: tempColumnFilters[col] ? [tempColumnFilters[col]] : null,
          filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
            <div style={{ padding: 8 }}>
              <Input
                placeholder={`Search ${col}`}
                value={selectedKeys[0]}
                onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
                onPressEnter={() => confirm()}
                style={{ width: 188, marginBottom: 8, display: 'block' }}
              />
              <Space>
                <Button
                  type="primary"
                  onClick={() => confirm()}
                  icon={<SearchOutlined />}
                  size="small"
                  style={{ width: 90 }}
                >
                  Search
                </Button>
                <Button onClick={() => clearFilters()} size="small" style={{ width: 90 }}>
                  Reset
                </Button>
              </Space>
            </div>
          ),
          filterIcon: (filtered) => (
            <SearchOutlined style={{ color: filtered ? '#1890ff' : undefined }} />
          ),
          onCell: (record) => ({
            record,
            inputType: ['NRQuantity', 'CollegeCode'].includes(col) ? 'number' : 'text',
            dataIndex: dataIndex,
            title: col,
            editing: isEditing(record),
          }),
        };

        if (col === "NRQuantity") {
          colDef.render = (val, record) => <Tag color="blue">{val ?? record?.nrQuantity ?? record?.nRQuantity}</Tag>;
        }

        if (["CourseName", "SubjectName", "CollegeName"].includes(col)) {
          colDef.render = (text) => (
            <Tooltip title={text} placement="topLeft">
              <div style={{ maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {text}
              </div>
            </Tooltip>
          );
        }
        return colDef;
      });

    tempColumns.push({
      title: 'Action',
      dataIndex: 'operation',
      fixed: 'right',
      render: (_, record) => {
        const editable = isEditing(record);
        return editable ? (
          <Space size="middle">
            <Typography.Link onClick={() => save(record.id)}>Save</Typography.Link>
            <Popconfirm title="Sure to cancel?" onConfirm={cancel}>
              <a>Cancel</a>
            </Popconfirm>
          </Space>
        ) : (
          <Space size="middle">
            <Typography.Link disabled={editingKey !== ''} onClick={() => edit(record)}>
              Edit
            </Typography.Link>
            <Popconfirm
              title="Are you sure you want to delete this record?"
              onConfirm={() => handleDelete(record.id)}
              okText="Yes"
              cancelText="No"
              disabled={editingKey !== ''}
            >
              <Typography.Link
                type="danger"
                disabled={editingKey !== ''}
              >
                Delete
              </Typography.Link>
            </Popconfirm>
          </Space>
        );
      },
    });

    const handleRule1Click = () => {
      const searchTarget = reports?.rule1CenterCodes?.[0] || reports?.rule1CollegeCodes?.[0];
      if (searchTarget) {
        setActiveTab("2");
        setSearchText(searchTarget);
        setLocalSearch(searchTarget);
      }
    };

    const handleRule2Click = () => {
      if (!reports?.rule2Passed && reports?.rule2CollegeCodes?.length > 0) {
        setActiveTab("1");
        setSearchText(reports.rule2CollegeCodes[0]);
        setLocalSearch(reports.rule2CollegeCodes[0]);
      }
    };

    return (
      <div className="flex flex-col gap-4">
        <Card className="shadow-sm border-gray-200">
          {reports && reports.rule1Passed === false && (
            <Alert
              type="warning"
              showIcon
              message="Rule 1 Validation Conflicts Detected"
              description="One college code must belong to one center, and one center to one nodal code. Please review and correct values in the Conflict Report tab."
              action={
                <Button type="primary" size="small" onClick={() => setActiveTab("4")}>
                  View Conflict Report
                </Button>
              }
              className="mb-4"
            />
          )}
          {reports && reports.rule1Passed && reports.rule2Passed === false && (
            <Alert
              type="error"
              showIcon
              message="Rule 2 Error: Missing Exam Center Assignments"
              description="Every college must be assigned an exam center. Pushing to main NR Data is strictly blocked until all colleges are assigned an exam center."
              action={
                <Button type="primary" danger size="small" onClick={() => setActiveTab("3")}>
                  View Conflict Report
                </Button>
              }
              className="mb-4"
            />
          )}


          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <Typography.Title level={5} className="mb-0">Preview Data</Typography.Title>
              <Tag color="blue">{tempPagination.total} Records</Tag>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-md">
                <span className="text-xs font-semibold text-gray-600">Merge By:</span>
                <Select
                  value={mergeBy}
                  onChange={handleMergeByChange}
                  size="small"
                  style={{ width: 170 }}
                  options={[
                    { label: "College Code", value: "CollegeCode" },
                    { label: "College Name", value: "CollegeName" },
                  ]}
                />
              </div>

              <Tooltip title={reports?.dynamicConflicts?.length > 0 ? "Resolve all dynamic conflicts before generating a preview" : ""}>
                <span>
                  <Button type="primary" onClick={handleMergePreview} loading={merging} disabled={(!isDirty && tempData.length > 0) || (reports?.dynamicConflicts?.length > 0)}>
                    {tempData.length > 0 ? "Regenerate Preview" : "Generate Preview"}
                  </Button>
                </span>
              </Tooltip>

              <Popover
                content={
                  <Checkbox.Group
                    options={allTempColumnsList.map(col => ({ label: col, value: col }))}
                    value={visibleTempColumns}
                    onChange={(vals) => setVisibleTempColumns(vals)}
                    className="flex flex-col gap-2 max-h-60 overflow-y-auto"
                  />
                }
                title="Column Settings"
                trigger="click"
              >
                <Button icon={<SettingOutlined />}>Columns</Button>
              </Popover>

              <Input.Search
                placeholder="Search table..."
                onSearch={handleSearch}
                value={localSearch}
                onChange={(e) => {
                  setLocalSearch(e.target.value);
                  if (!e.target.value) handleSearch('');
                }}
                style={{ width: 250 }}
                allowClear
              />
              {selectedRowKeys.length > 0 && (
                <Popconfirm
                  title={`Are you sure you want to delete ${selectedRowKeys.length} selected preview record(s)?`}
                  onConfirm={handleDeleteSelected}
                  okText="Yes, Delete"
                  cancelText="Cancel"
                  okButtonProps={{ danger: true }}
                >
                  <Button danger icon={<DeleteOutlined />}>
                    Delete Selected ({selectedRowKeys.length})
                  </Button>
                </Popconfirm>
              )}
              {tempPagination.total > 0 && (
                <Popconfirm
                  title={`Are you sure you want to delete ALL (${tempPagination.total}) preview records for this project?`}
                  onConfirm={handleDeleteAll}
                  okText="Yes, Delete All"
                  cancelText="Cancel"
                  okButtonProps={{ danger: true }}
                >
                  <Button danger type="primary" icon={<DeleteOutlined />}>
                    Delete All
                  </Button>
                </Popconfirm>
              )}
              <Button
                type="primary"
                onClick={confirmPushToMain}
                loading={pushingToMain}
                disabled={tempData.length === 0}
              >
                Push into main NR Data
              </Button>
            </div>
          </div>
          <Form form={form} component={false}>
            <Table
              components={{
                body: {
                  cell: EditableCell,
                },
              }}
              rowSelection={{
                selectedRowKeys,
                onChange: (keys) => setSelectedRowKeys(keys),
              }}
              dataSource={tempData}
              columns={tempColumns}
              loading={loadingTemp}
              rowKey="id"
              size="small"
              scroll={{ x: 'max-content' }}
              pagination={tempPagination}
              onChange={handleTempTableChange}
              rowClassName="editable-row"
            />
          </Form>
        </Card>
      </div>
    );
  };

  const [conflictSelections, setConflictSelections] = useState({});
  const [resolvedKeys, setResolvedKeys] = useState(new Set());

  const handleConflictSelectionChange = (conflictKey, value) => {
    setConflictSelections((prev) => ({
      ...prev,
      [conflictKey]: value,
    }));
  };

  const handleResolveConflict = async (conflict, selectedValue) => {
    const isObj = typeof selectedValue === "object" && selectedValue !== null;

    const centerCodeStr = isObj ? String(selectedValue.centerCode ?? "").trim() : String(selectedValue ?? "").trim();
    let centerNameStr = isObj ? String(selectedValue.centerName ?? "").trim() : "";
    const nodalCodeStr = isObj ? String(selectedValue.nodalCode ?? "").trim() : centerCodeStr;
    let nodalNameStr = isObj ? String(selectedValue.nodalName ?? "").trim() : "";

    const centerCodeNum = Number(centerCodeStr) || 0;
    const nodalCodeNum = Number(nodalCodeStr) || centerCodeNum || 1;

    if (!centerCodeNum && !nodalCodeNum && (!selectedValue || String(selectedValue).trim() === "")) {
      showToast("Please enter or select a Center or Nodal code before saving.", "warning");
      return;
    }

    // Comprehensive resolution of centerNameStr if missing
    if (!centerNameStr && centerCodeNum > 0) {
      const recMatch = (conflict.records || []).find(
        (r) => Number(r.examCenterCode || r.ExamCenterCode || r.centerCode || 0) === centerCodeNum
      );
      if (recMatch && (recMatch.examCenterName || recMatch.ExamCenterName || recMatch.centerName)) {
        centerNameStr = recMatch.examCenterName || recMatch.ExamCenterName || recMatch.centerName;
      }
      if (!centerNameStr && conflict.centerCodes && conflict.centerNames) {
        const idx = conflict.centerCodes.findIndex((c) => Number(c) === centerCodeNum);
        if (idx !== -1 && conflict.centerNames[idx]) {
          centerNameStr = conflict.centerNames[idx];
        }
      }
      if (!centerNameStr && allNodalRecords && allNodalRecords.length > 0) {
        const nodalMatch = allNodalRecords.find(
          (n) => Number(n.examCenterCode || n.ExamCenterCode || 0) === centerCodeNum
        );
        if (nodalMatch && (nodalMatch.examCenterName || nodalMatch.ExamCenterName)) {
          centerNameStr = nodalMatch.examCenterName || nodalMatch.ExamCenterName;
        }
      }
    }

    // Comprehensive resolution of nodalNameStr if missing
    if (!nodalNameStr && nodalCodeNum > 0) {
      const recMatch = (conflict.records || []).find(
        (r) => Number(r.nodalCode || r.NodalCode || 0) === nodalCodeNum
      );
      if (recMatch && (recMatch.nodalName || recMatch.NodalName)) {
        nodalNameStr = recMatch.nodalName || recMatch.NodalName;
      }
      if (!nodalNameStr && conflict.nodalCodes && conflict.nodalNames) {
        const idx = conflict.nodalCodes.findIndex((n) => Number(n) === nodalCodeNum);
        if (idx !== -1 && conflict.nodalNames[idx]) {
          nodalNameStr = conflict.nodalNames[idx];
        }
      }
      if (!nodalNameStr && allNodalRecords && allNodalRecords.length > 0) {
        const nodalMatch = allNodalRecords.find(
          (n) => Number(n.nodalCode || n.NodalCode || 0) === nodalCodeNum
        );
        if (nodalMatch && (nodalMatch.nodalName || nodalMatch.NodalName)) {
          nodalNameStr = nodalMatch.nodalName || nodalMatch.NodalName;
        }
      }
    }

    const cKey = String(conflict.key || conflict.dcId || conflict.id || "");
    if (cKey) {
      setResolvedKeys((prev) => new Set([...prev, cKey]));
    }

    try {
      if (conflict.conflictType === "college_multiple_centers" || conflict.conflictType === "unassigned_catch_nodal") {
        const rawCodeStr = String(conflict.collegeCode || conflict.key || "").trim();
        const extractedCodeMatch = rawCodeStr.match(/^(\d+)/);
        const collegeCodeInt = extractedCodeMatch ? Number(extractedCodeMatch[1]) : (Number(rawCodeStr) || 0);

        const finalCenterName = centerNameStr || conflict.examCenterName || conflict.centerName || `Center ${centerCodeNum}`;
        const finalNodalName = nodalNameStr || conflict.nodalName || `Nodal ${nodalCodeNum}`;

        try {
          await API.post("/NodalLists/resolve-college-center", {
            projectId: Number(projectId),
            collegeCode: collegeCodeInt,
            collegeName: conflict.collegeName || (collegeCodeInt ? `College ${collegeCodeInt}` : "Unknown College"),
            gender: conflict.gender || "ALL",
            correctCenterCode: centerCodeNum,
            correctCenterName: finalCenterName,
            nodalCode: nodalCodeNum,
            nodalName: finalNodalName,
          });
        } catch (resolveErr) {
          // If resolve-college-center returns 404 because no record exists yet, create the NodalList record
          await API.post("/NodalLists", {
            projectId: Number(projectId),
            collegeCode: collegeCodeInt,
            collegeName: conflict.collegeName || (collegeCodeInt ? `College ${collegeCodeInt}` : "Unknown College"),
            examCenterCode: centerCodeNum,
            examCenterName: finalCenterName,
            nodalCode: nodalCodeNum,
            nodalName: finalNodalName,
            gender: conflict.gender || "ALL",
            status: true,
          });
        }
        showToast(`Assigned College ${collegeCodeInt || rawCodeStr} to Center ${centerCodeNum} & Nodal ${nodalCodeNum}`, "success");
      } else if (conflict.conflictType === "center_multiple_nodals") {
        const finalNodalName = nodalNameStr || `Nodal ${nodalCodeNum}`;
        try {
          await API.post("/NodalLists/resolve-center-nodal", {
            projectId: Number(projectId),
            centerCode: Number(conflict.centreCode),
            correctNodalCode: nodalCodeNum,
            correctNodalName: finalNodalName,
          });
        } catch {
          let rowsToUpdate = conflict.records || [];
          if (!rowsToUpdate.length) {
            const res = await API.get(`/NodalLists/${projectId}?pageNo=1&pageSize=5000&search=${conflict.centreCode}`);
            const items = res.data?.items || res.data || [];
            rowsToUpdate = items.filter((x) => String(x.examCenterCode) === String(conflict.centreCode));
          }
          await Promise.all(
            rowsToUpdate.map((r) =>
              API.put(`/NodalLists/${r.id}`, {
                ...r,
                nodalCode: nodalCodeNum,
                nodalName: finalNodalName || r.nodalName,
              })
            )
          );
        }
        showToast(`Resolved: Center ${conflict.centreCode} assigned to Nodal ${nodalCodeNum}`, "success");
      } else {
        // Fallback for dynamic / default conflicts
        const conflictId = conflict.dcId || conflict.id || conflict.rawItem?.dcId || conflict.rawItem?.id;
        const targetField = conflict.field || "NodalCode";
        const matchField = conflict.uniqueField || "ExamCenterCode";
        const matchValue = conflict.uniqueValue || conflict.summary || "";
        const targetValueStr = isObj
          ? String(selectedValue.nodalCode || selectedValue.centerCode || "")
          : String(selectedValue || "").trim();

        if (conflictId) {
          try {
            await API.post("/Merging/ResolveDynamicConflict", {
              projectId: Number(projectId),
              conflictId: Number(conflictId),
              targetField: String(targetField),
              targetValue: String(targetValueStr),
              matchField: String(matchField),
              matchValue: String(matchValue),
            });
            showToast(`Resolved conflict for ${matchValue}`, "success");
          } catch (e) {
            console.error("Failed to resolve dynamic conflict on backend", e);
            showToast("Failed to resolve dynamic conflict", "error");
          }
        } else {
          // Fallback legacy row update if no conflictId
          const codeMatch = (conflict.uniqueValue || conflict.summary || "").match(/(\d+)/);
          const targetCode = codeMatch ? Number(codeMatch[1]) : 0;
          const targetValNum = Number(targetValueStr) || 0;
          if (targetCode > 0 && targetValNum > 0) {
            const res = await API.get(`/NodalLists/${projectId}?pageNo=1&pageSize=5000&search=${targetCode}`);
            const items = res.data?.items || res.data || [];
            await Promise.all(
              items.map((r) =>
                API.put(`/NodalLists/${r.id ?? r.Id}`, {
                  ...r,
                  nodalCode: targetField.toLowerCase().includes("nodal") ? targetValNum : r.nodalCode,
                  examCenterCode: targetField.toLowerCase().includes("center") ? targetValNum : r.examCenterCode,
                })
              )
            );
          }
        }
      }

      setConflictSelections((prev) => {
        const updated = { ...prev };
        delete updated[conflict.key];
        return updated;
      });

      const statusRes = await API.get(`/Merging/CheckAllConflictsResolved/${projectId}`);
      if (statusRes.data?.allResolved) {
        if (level1Fields.length > 0 && level2Fields.length > 0) {
          console.log("Auto-running CheckDynamicRule1 from backend status...");
          try {
            await API.post(`/Merging/CheckDynamicRule1/${projectId}`, {
              level1: level1Fields,
              level2: level2Fields,
              level3: level3Fields
            });
            console.log("Auto-run successful");
          } catch (e) {
            console.error("Auto-run failed", e);
          }
        } else {
          console.log("Skipping auto-run: Level 1 and Level 2 fields are required but missing.");
          showToast("Could not auto-run validation: Level 1 and Level 2 fields are missing. Please run manually.", "info");
        }
      }

      await fetchReports(mergeBy);
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.message || "Failed to resolve conflict", "error");
    }
  };

  const handleIgnoreConflict = (conflict) => {
    const cKey = String(conflict.key || conflict.dcId || conflict.id || "");
    if (cKey) {
      setResolvedKeys((prev) => new Set([...prev, cKey]));
    }
    setConflictSelections((prev) => {
      const updated = { ...prev };
      delete updated[conflict.key];
      return updated;
    });
    showToast("Conflict ignored", "info");
  };

  const formattedConflictErrors = useMemo(() => {
    if (!reports) return [];
    const errors = [];

    // Rule 1: Multi-center details
    if (reports.multiCenterDetails && reports.multiCenterDetails.length > 0) {
      reports.multiCenterDetails.forEach((mc, idx) => {
        const key = `mc_${mc.collegeCode}_${idx}`;
        if (resolvedKeys.has(key)) return;
        errors.push({
          conflictType: "college_multiple_centers",
          summary: mc.description || `College ${mc.collegeCode} assigned to multiple exam centers`,
          collegeCode: mc.collegeCode,
          collegeName: mc.collegeNames?.join(", "),
          centerCodes: mc.centerCodes,
          centerNames: mc.centerNames || [],
          nodalCodes: mc.nodalCodes || [],
          nodalNames: mc.nodalNames || [],
          records: mc.records || [],
          conflictingValues: mc.centerCodes,
          key: key,
          id: key,
          status: "pending"
        });
      });
    }

    // Rule 1: Multi-nodal details
    if (reports.multiNodalDetails && reports.multiNodalDetails.length > 0) {
      reports.multiNodalDetails.forEach((mn, idx) => {
        const key = `mn_${mn.centerCode}_${idx}`;
        if (resolvedKeys.has(key)) return;
        errors.push({
          conflictType: "center_multiple_nodals",
          summary: mn.description || `Center ${mn.centerCode} assigned to multiple nodal codes`,
          centreCode: mn.centerCode,
          centerNames: mn.centerNames || [],
          nodalCodes: mn.nodalCodes || [],
          nodalNames: mn.nodalNames || [],
          records: mn.records || [],
          conflictingValues: mn.nodalCodes,
          key: key,
          id: key,
          status: "pending"
        });
      });
    }

    // Rule 2: Unassigned colleges missing exam center assignments
    if (reports.unassignedDetails && reports.unassignedDetails.length > 0) {
      reports.unassignedDetails.forEach((ud, idx) => {
        const key = `rule2_${ud.collegeCode}_${idx}`;
        if (resolvedKeys.has(key)) return;
        errors.push({
          conflictType: "unassigned_catch_nodal",
          summary: ud.description || `College ${ud.collegeCode} (${ud.collegeName}) is missing an Exam Center assignment in Nodal List.`,
          collegeCode: ud.collegeCode,
          collegeName: ud.collegeName,
          catchNos: ud.catchNos,
          centerCodes: ud.centerCodes || [],
          centerNames: ud.centerNames || [],
          conflictingValues: ud.centerCodes || [],
          key: key,
          id: key,
          status: "pending"
        });
      });
    } else if (reports.rule2CollegeCodes && reports.rule2CollegeCodes.length > 0 && reports.rule2Passed === false) {
      reports.rule2CollegeCodes.forEach((code, idx) => {
        const key = `rule2_code_${code}_${idx}`;
        if (resolvedKeys.has(key)) return;
        errors.push({
          conflictType: "unassigned_catch_nodal",
          summary: `College ${code} is missing an Exam Center assignment in Nodal List.`,
          collegeCode: code,
          key: key,
          id: key,
          status: "pending"
        });
      });
    }

    // Dynamic Rule 1 conflicts
    if (reports.dynamicConflicts && reports.dynamicConflicts.length > 0) {
      reports.dynamicConflicts.forEach((dc) => {
        const idKey = String(dc.id || dc.Id || "");
        if (idKey && resolvedKeys.has(idKey)) return;

        try {
          const unique = JSON.parse(dc.uniqueField || dc.UniqueField);
          const conflict = JSON.parse(dc.conflictingField || dc.ConflictingField);

          const uniqueKeys = unique.fields.join(", ");
          const conflictKeys = conflict.fields.join(", ");

          errors.push({
            conflictType: "default",
            summary: `${uniqueKeys} (${unique.value}) is linked with multiple ${conflictKeys} values (${conflict.values.join(", ")}).`,
            status: "pending",
            key: dc.id || dc.Id,
            dcId: dc.id || dc.Id,
            id: dc.id || dc.Id,
            uniqueField: uniqueKeys,
            field: conflictKeys,
            conflictingValues: conflict.values,
            valuesForSelection: conflict.values,
            uniqueValue: unique.value,
          });
        } catch (e) {
          // fallback if parsing fails
          errors.push({
            conflictType: "default",
            summary: `Dynamic Conflict: ${dc.uniqueField || dc.UniqueField} -> ${dc.conflictingField || dc.ConflictingField}`,
            status: "pending",
            key: dc.id,
          });
        }
      });
    }

    return errors;
  }, [reports, allNodalRecords, resolvedKeys]);

  const bothRulesPassed = useMemo(() => {
    if (!reports) return false;
    if (reports.rule1Passed === false) return false;
    if (reports.rule2Passed === false) return false;
    if (reports.rule1Errors && reports.rule1Errors.length > 0) return false;
    if (reports.rule2Errors && reports.rule2Errors.length > 0) return false;
    if (reports.rule2CollegeCodes && reports.rule2CollegeCodes.length > 0) return false;
    if (reports.unassignedDetails && reports.unassignedDetails.length > 0) return false;
    return true;
  }, [reports]);

  const handleCheckDynamicRule1 = async () => {
    if (!level1Fields.length || !level2Fields.length) {
      showToast("Please select at least Level 1 and Level 2 fields.", "warning");
      return;
    }
    setDynamicRuleLoading(true);
    try {
      await API.post(`/Merging/CheckDynamicRule1/${projectId}`, {
        level1: level1Fields,
        level2: level2Fields,
        level3: level3Fields
      });
      showToast("Dynamic Rule 1 validation completed.", "success");
      await fetchReports(mergeBy);
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.message || "Failed to run dynamic validation", "error");
    } finally {
      setDynamicRuleLoading(false);
    }
  };

  const renderConflicts = () => {
    const dynamicRuleContent = (
      <div className="flex gap-4 mt-2 items-end flex-wrap">
        <div>
          <div className="text-xs mb-1">Level 1 (e.g. College Code)</div>
          <Select
            mode="multiple"
            allowClear
            placeholder="Select Level 1 fields"
            style={{ minWidth: 200 }}
            value={level1Fields}
            onChange={handleLevel1Change}
            options={allAvailableColumns.map((c) => ({ label: c, value: c }))}
          />
        </div>
        <div>
          <div className="text-xs mb-1">Level 2 (e.g. Exam Center)</div>
          <Select
            mode="multiple"
            allowClear
            placeholder="Select Level 2 fields"
            style={{ minWidth: 200 }}
            value={level2Fields}
            onChange={handleLevel2Change}
            options={allAvailableColumns.map((c) => ({ label: c, value: c }))}
          />
        </div>
        <div>
          <div className="text-xs mb-1">Level 3 (Optional, e.g. Nodal Code)</div>
          <Select
            mode="multiple"
            allowClear
            placeholder="Select Level 3 fields"
            style={{ minWidth: 200 }}
            value={level3Fields}
            onChange={handleLevel3Change}
            options={allAvailableColumns.map((c) => ({ label: c, value: c }))}
          />
        </div>
        <Tooltip title={formattedConflictErrors.some(c => c.dcId !== undefined) ? "Resolve all dynamic conflicts first to run validation" : ""}>
          <span>
            <Button
              type="primary"
              loading={dynamicRuleLoading}
              onClick={handleCheckDynamicRule1}
              disabled={formattedConflictErrors.some(c => c.dcId !== undefined)}
            >
              Run Validation
            </Button>
          </span>
        </Tooltip>
      </div>
    );

    const dynamicRuleUiOpen = (
      <Card size="small" className="mb-4 shadow-sm">
        <Typography.Text strong>Dynamic 1:1:1 Validation</Typography.Text>
        {dynamicRuleContent}
      </Card>
    );

    const dynamicRuleUiCollapsible = (
      <Collapse
        size="small"
        className="mb-4 shadow-sm"
        items={[
          {
            key: "1",
            label: "Dynamic 1:1:1 Validation",
            children: dynamicRuleContent,
          },
        ]}
      />
    );

    if (!reports) {
      return (
        <div>
          {dynamicRuleUiOpen}
          <Typography.Text type="secondary">Click "Generate Preview" to check for standard conflicts.</Typography.Text>
        </div>
      );
    }

    if (formattedConflictErrors.length === 0) {
      return (
        <div>
          {dynamicRuleUiOpen}
          <Typography.Text type="success">No conflicts found</Typography.Text>
        </div>
      );
    }

    return (
      <div className="py-2">
        <DataImportConflictReport
          conflicts={{ errors: formattedConflictErrors }}
          conflictSelections={conflictSelections}
          onSelectionChange={handleConflictSelectionChange}
          onResolve={handleResolveConflict}
          onIgnore={handleIgnoreConflict}
          loading={loadingReports || dynamicRuleLoading}
          centerNodalOptions={centerNodalOptions}
          extraTabContent={{
            "Other Conflicts": dynamicRuleUiCollapsible,
          }}
        />
      </div>
    );
  };

  return (
    <div className="p-6">
      <Title level={4} className="mb-6">Nodal Center List</Title>

      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        className="bg-white p-4 rounded-lg shadow-sm border border-gray-200"
        tabBarStyle={{ paddingLeft: '16px', marginBottom: 0 }}
      >
        <TabPane tab="Add Catch List" key="1">
          {renderUploadSection("Upload Catch List")}
        </TabPane>
        <TabPane tab="Add Nodal List" key="2">
          {renderUploadSection("Upload Nodal List")}
        </TabPane>
        <TabPane
          tab={
            formattedConflictErrors.length > 0 ? (
              <Badge count={formattedConflictErrors.length} style={{ backgroundColor: "#faad14" }} offset={[10, 0]} size="small">
                <span>Conflict Report</span>
              </Badge>
            ) : (
              "Conflict Report"
            )
          }
          key="3"
        >
          {renderConflicts()}
        </TabPane>
        <TabPane tab="Merge & Preview" key="4">
          {renderMergeTab()}
        </TabPane>
      </Tabs>
      <Modal
        title={activeTab === "1" ? "Add Catch List Record" : "Add Nodal List Record"}
        open={isAddModalVisible}
        onOk={handleAddRecord}
        onCancel={() => { setIsAddModalVisible(false); addForm.resetFields(); }}
        confirmLoading={addingRecord}
        okText="Add Record"
      >
        <Form form={addForm} layout="vertical">
          {currentFields.map(field => {
            const isNumber = ['NRQuantity', 'Transgender', 'Male', 'Female', 'CollegeCode', 'NodalCode', 'ExamCenterCode'].includes(field);
            const isRequired = currentRequiredFields.includes(field);
            return (
              <Form.Item
                key={field}
                name={field === "NRQuantity" ? "nrQuantity" : (field.charAt(0).toLowerCase() + field.slice(1))}
                label={field}
                rules={[{ required: isRequired, message: `Please enter ${field}` }]}
              >
                {isNumber ? <InputNumber style={{ width: '100%' }} /> : <Input />}
              </Form.Item>
            );
          })}
        </Form>
      </Modal>
      <Modal
        title="Gender Values Detected in Upload"
        open={isGenderModalVisible}
        onCancel={() => setIsGenderModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setIsGenderModalVisible(false)}>
            Cancel
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={uploading}
            onClick={async () => {
              setIsGenderModalVisible(false);
              await executeUpload(genderChoice);
            }}
          >
            Apply & Upload
          </Button>,
        ]}
        width={540}
      >
        <div className="py-2">
          <p className="text-sm text-slate-600 mb-3">
            The uploaded Nodal List contains values in the <strong>Gender</strong> column that are not specifically <strong>Male</strong> or <strong>Female</strong>:
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded p-3 mb-4 max-h-36 overflow-y-auto">
            <div className="text-xs font-semibold text-slate-500 mb-2">Detected Values & Row Counts:</div>
            <Space wrap size={[6, 6]}>
              {genderDetectedValues.map((item, idx) => (
                <Tag key={idx} color="default" className="text-slate-700 bg-white border-slate-300">
                  <span className="font-medium">{item.value}</span>: {item.count} row(s)
                </Tag>
              ))}
            </Space>
          </div>

          <div className="text-sm font-semibold text-slate-700 mb-2">
            How would you like to treat these records?
          </div>

          <Radio.Group
            value={genderChoice}
            onChange={(e) => setGenderChoice(e.target.value)}
            className="flex flex-col gap-2.5"
          >
            <Radio value="ALL" className="items-start">
              <div>
                <span className="font-medium text-slate-800">Treat as Male + Female (ALL)</span>
                <div className="text-xs text-slate-500">
                  Both male and female candidates will be assigned to this center (recommended).
                </div>
              </div>
            </Radio>
            <Radio value="MALE" className="items-start">
              <div>
                <span className="font-medium text-slate-800">Change to Male (MALE)</span>
                <div className="text-xs text-slate-500">
                  Treat all these records as male candidates only.
                </div>
              </div>
            </Radio>
            <Radio value="FEMALE" className="items-start">
              <div>
                <span className="font-medium text-slate-800">Change to Female (FEMALE)</span>
                <div className="text-xs text-slate-500">
                  Treat all these records as female candidates only.
                </div>
              </div>
            </Radio>
          </Radio.Group>
        </div>
      </Modal>
    </div>
  );
}
