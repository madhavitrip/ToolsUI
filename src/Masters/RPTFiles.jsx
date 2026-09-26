import React, { useEffect, useMemo, useState } from "react";
import { Form, Modal, Select, message } from "antd";
import { MessageService } from "../services/MessageService";
import {
  extractParsedFields,
  getErrorMessage,
  getScopeLabel,
  normalizeId,
  normalizeKey,
  normalizeModuleIds,
  parseMappingJson,
  resolveTemplateId,
} from "../utils/rptTemplateUtils";
import {
  buildTemplateColumns,
  buildVersionsColumns,
  rptTemplatesStyles,
} from "../components/rpt/rptTemplatesShared";
import {
  fetchGroupOptions,
  fetchMappingOptions as fetchMappingOptionsService,
  fetchModuleOptions,
  fetchProjectOptions,
  fetchTemplateDetails,
  fetchTypeOptions,
  fetchUsers as fetchUsersService,
  importTemplatesFromGroup,
  fetchImportableTemplates,
  parseTemplateFields,
  updateTemplate,

  // Alias Master Templates
  activateMasterTemplateVersion as activateTemplateVersionService,
  downloadMasterTemplateBlob as downloadTemplateBlobService,
  fetchMasterTemplateMapping as fetchTemplateMapping,
  fetchMasterTemplateVersions as fetchTemplateVersionsService,
  fetchMasterTemplatesByGroup as fetchTemplatesByGroup,
  restoreMasterTemplate as restoreTemplate,
  saveMasterTemplateMapping as saveTemplateMapping,
  softDeleteMasterTemplate as softDeleteTemplate,
  uploadMasterTemplate as uploadTemplateService,
} from "../services/rptTemplatesService";
import RPTFilesHeader from "./components/RPTFiles/RPTFilesHeader";
import TemplatesCard from "../components/rpt/TemplatesCard";
import TemplatesSidePanel from "../components/rpt/TemplatesSidePanel";
import TemplatesMappingPanel from "../components/rpt/TemplatesMappingPanel";
import TemplatesVersionsModal from "../components/rpt/TemplatesVersionsModal";
import useMasterAuth from "../hooks/useMasterAuth";

const RPTFiles = () => {
  const url = import.meta.env.VITE_API_BASE_URL;
  const APIURL = import.meta.env.VITE_API_URL;
  const { requireAuth, authModalComponent } = useMasterAuth();
  const token = localStorage.getItem("token");
  const [useBoxLabelSP, setUseBoxLabelSP] = useState(false);
  const [staticVariables, setStaticVariables] = useState({});
  const [filterMode, setFilterMode] = useState(null);
  const [savingMapping, setSavingMapping] = useState(false);
  const [groupOptions, setGroupOptions] = useState([]);
  const [typeOptions, setTypeOptions] = useState([]);
  const [userOptions, setUserOptions] = useState([]);
  const [groupLabel, setGroupLabel] = useState("");
  const [typeLabel, setTypeLabel] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [templateScope, setTemplateScope] = useState("group");
  const [projectOptions, setProjectOptions] = useState([]);
  const [moduleOptions, setModuleOptions] = useState([]);

  const [availableRPTFiles, setAvailableRPTFiles] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [mappingTemplate, setMappingTemplate] = useState(null);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [mappingNotFound, setMappingNotFound] = useState(false);
  const [parsedFields, setParsedFields] = useState([]);
  const [parsedFieldsLoading, setParsedFieldsLoading] = useState(false);
  const [mappingOptions, setMappingOptions] = useState([]);
  const [mappingOptionsLoading, setMappingOptionsLoading] = useState(false);
  const [mappingSelections, setMappingSelections] = useState({});
  const [groupBySelections, setGroupBySelections] = useState([]);
  const [orderBySelections, setOrderBySelections] = useState([]);
  const [labelCopies, setLabelCopies] = useState(1);
  const [mappingPinnedFields, setMappingPinnedFields] = useState([]);
  const [qrConfiguration, setQrConfiguration] = useState({ enabled: false, qrFields: [], separator: "|" });

  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsData, setVersionsData] = useState([]);
  const [versionsTemplate, setVersionsTemplate] = useState(null);
  const [pendingGenerateTemplate, setPendingGenerateTemplate] = useState(null);
  const [activatingVersionId, setActivatingVersionId] = useState(null);

  const [addFileList, setAddFileList] = useState([]);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importAvailability, setImportAvailability] = useState({
    loading: false,
    standardTypes: [],
    groupTypes: {},
    projectTypes: {},
  });
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [editingTemplateName, setEditingTemplateName] = useState("");
  const [editingModuleIds, setEditingModuleIds] = useState([]);
  const [inlineEditSaving, setInlineEditSaving] = useState(false);
  const [editingVersionId, setEditingVersionId] = useState(null);
  const [editingVersionOptions, setEditingVersionOptions] = useState([]);
  const [editingVersionsLoading, setEditingVersionsLoading] = useState(false);

  const [addForm] = Form.useForm();
  const [importForm] = Form.useForm();
  const importScope = Form.useWatch("sourceScope", importForm);
  const importGroupId = Form.useWatch("sourceGroupId", importForm);
  const importProjectId = Form.useWatch("sourceProjectId", importForm);
  const importTypeId = Form.useWatch("sourceTypeId", importForm);

  const [importableTemplates, setImportableTemplates] = useState([]);
  const [importableTemplatesLoading, setImportableTemplatesLoading] = useState(false);

  useEffect(() => {
    if (!importModalOpen) {
      setImportableTemplates([]);
      return;
    }
    const fetchTemplates = async () => {
      if (!importScope) {
        setImportableTemplates([]);
        return;
      }
      if (importScope === "group" && !importGroupId) {
        setImportableTemplates([]);
        return;
      }
      if (importScope === "project" && (!importProjectId || !importTypeId)) {
        setImportableTemplates([]);
        return;
      }
      
      setImportableTemplatesLoading(true);
      try {
        const payload = { sourceScope: importScope };
        if (importScope === "group") payload.sourceGroupId = importGroupId;
        if (importScope === "project") payload.sourceProjectId = importProjectId;
        if (importTypeId) payload.sourceTypeId = importTypeId;
        
        const data = await fetchImportableTemplates(APIURL, payload);
        setImportableTemplates(data || []);
      } catch (err) {
        console.error("Failed to fetch importable templates", err);
        setImportableTemplates([]);
      } finally {
        setImportableTemplatesLoading(false);
      }
    };
    
    fetchTemplates();
  }, [importModalOpen, importScope, importGroupId, importProjectId, importTypeId, APIURL]);

  const selectionReady = Boolean(
    selectedType && (templateScope === "standard" || selectedGroup)
  );

  const showError = (err, fallback) => {
    message.error(getErrorMessage(err, fallback));
  };

  const onGroupChange = (value) => {
    setSelectedGroup(value || null);
  };

  const onTypeChange = (value) => {
    setSelectedType(value || null);
  };

  const onScopeChange = (value) => {
    setTemplateScope(value);
  };

  useEffect(() => {
    fetchGroup();
    fetchType();
    fetchProjects();
    fetchModules();
    fetchUsers();
  }, []);

  useEffect(() => {
    if (templateScope === "standard") {
      setSelectedGroup(null);
    }
  }, [templateScope]);

  const fetchGroup = async () => {
    try {
      const formatted = await fetchGroupOptions(url);
      setGroupOptions(formatted);
      if (selectedGroup) {
        const found = formatted.find((g) => g.value === selectedGroup);
        setGroupLabel(found?.label || selectedGroup);
      }
    } catch (err) {
      console.error("Failed to fetch groups", err);
    }
  };

  const fetchType = async () => {
    try {
      const formatted = await fetchTypeOptions(url);
      setTypeOptions(formatted);
      if (selectedType) {
        const found = formatted.find((t) => t.value === selectedType);
        setTypeLabel(found?.label || selectedType);
      }
    } catch (err) {
      console.error("Failed to fetch paper types", err);
    }
  };

  const fetchProjects = async () => {
    try {
      const formatted = await fetchProjectOptions({
        baseUrl: url,
        apiUrl: APIURL,
        normalizeId,
      });
      setProjectOptions(formatted);
    } catch (err) {
      console.error("Failed to fetch project names", err);
      setProjectOptions([]);
    }
  };

  const fetchModules = async () => {
    try {
      const formatted = await fetchModuleOptions(APIURL);
      setModuleOptions(formatted);
    } catch (err) {
      console.error("Failed to fetch modules", err);
      setModuleOptions([]);
    }
  };

  const fetchUsers = async () => {
    try {
      const data = await fetchUsersService({ baseUrl: url, token });
      setUserOptions(data);
    } catch (err) {
      console.error("Failed to fetch users", err);
      setUserOptions([]);
    }
  };


  useEffect(() => {
    if (selectedGroup && groupOptions.length > 0) {
      const found = groupOptions.find((g) => g.value === selectedGroup);
      setGroupLabel(found?.label || selectedGroup);
    } else {
      setGroupLabel("");
    }
  }, [selectedGroup, groupOptions]);

  useEffect(() => {
    if (selectedType && typeOptions.length > 0) {
      const found = typeOptions.find((t) => t.value === selectedType);
      setTypeLabel(found?.label || selectedType);
    } else {
      setTypeLabel("");
    }
  }, [selectedType, typeOptions]);

  const fetchAvailableRPTFiles = async () => {
    if (!selectionReady) return;
    setLoadingTemplates(true);
    try {
      const data = await fetchTemplatesByGroup(APIURL, {
        typeId: selectedType,
        groupId: templateScope === "group" ? selectedGroup : null,
      });
      setAvailableRPTFiles(data || []);
    } catch (err) {
      console.error("Failed to fetch available RPT files", err);
      showError(err, "Failed to fetch templates.");
    } finally {
      setLoadingTemplates(false);
    }
  };

  const loadImportAvailability = async () => {
    if (!importModalOpen || typeOptions.length === 0) return;
    setImportAvailability((prev) => ({ ...prev, loading: true }));

    const standardTypes = [];
    const groupTypes = {};
    const projectTypes = {};

    try {
      for (const type of typeOptions) {
        const data = await fetchTemplatesByGroup(APIURL, { typeId: type.value });
        const hasStandard = (data || []).some(
          (item) => !normalizeId(item?.groupId) && !normalizeId(item?.projectId),
        );
        if (hasStandard) {
          standardTypes.push(type.value);
        }
      }

      for (const group of groupOptions) {
        const typeIds = [];
        for (const type of typeOptions) {
          const data = await fetchTemplatesByGroup(APIURL, {
            typeId: type.value,
            groupId: group.value,
          });
          const hasGroupTemplate = (data || []).some(
            (item) =>
              normalizeId(item?.groupId) === normalizeId(group.value) &&
              !normalizeId(item?.projectId),
          );
          if (hasGroupTemplate) {
            typeIds.push(type.value);
          }
        }
        if (typeIds.length > 0) {
          groupTypes[group.value] = typeIds;
        }
      }

      for (const project of projectOptions) {
        const typeCandidates = project?.typeId
          ? [project.typeId]
          : typeOptions.map((type) => type.value);
        const typeIds = [];
        for (const typeId of typeCandidates) {
          const data = await fetchTemplatesByGroup(APIURL, {
            typeId,
            groupId: project?.groupId,
            projectId: project?.value,
          });
          const hasProjectTemplate = (data || []).some(
            (item) => normalizeId(item?.projectId) === normalizeId(project?.value),
          );
          if (hasProjectTemplate) {
            typeIds.push(typeId);
          }
        }
        if (typeIds.length > 0) {
          projectTypes[project.value] = typeIds;
        }
      }
    } catch (err) {
      console.error("Failed to load import availability", err);
    } finally {
      setImportAvailability({
        loading: false,
        standardTypes,
        groupTypes,
        projectTypes,
      });
    }
  };

  const fetchMappingOptions = async (template) => {
    setMappingOptionsLoading(true);
    try {
      const groupId =
        template?.groupId ??
        (templateScope === "group" ? selectedGroup : 0) ??
        0;
      const typeId = template?.typeId ?? selectedType ?? 0;
      const options = await fetchMappingOptionsService(APIURL, {
        groupId,
        typeId,
        templateId: normalizeId(template?.templateId) ?? undefined,
      });
      console.log("[MappingOptions] groupId:", groupId, "typeId:", typeId, "options:", options);
      setMappingOptions(options);
    } catch (err) {
      console.error("Failed to load mapping options", err);
      showError(err, "Failed to load mapping options.");
    } finally {
      setMappingOptionsLoading(false);
    }
  };

  useEffect(() => {
    if (selectionReady) {
      fetchAvailableRPTFiles();
    } else {
      setAvailableRPTFiles([]);
    }
  }, [selectedGroup, selectedType, templateScope]);

  useEffect(() => {
    if (!mappingModalOpen) {
      setParsedFields([]);
      setParsedFieldsLoading(false);
      setMappingNotFound(false);
      setMappingSelections({});
      setGroupBySelections([]);
      setOrderBySelections([]);
      setLabelCopies(1);
      setMappingPinnedFields([]);
    }
  }, [mappingModalOpen]);

  const showMappingPanel = Boolean(mappingModalOpen && mappingTemplate);
  const showSidePanel = Boolean(addModalOpen || importModalOpen);

  const filteredGroupOptions = useMemo(() => {
    if (importAvailability.loading) return groupOptions;
    return groupOptions.filter(
      (group) => (importAvailability.groupTypes[group.value] || []).length > 0,
    );
  }, [groupOptions, importAvailability]);

  const filteredProjectOptions = useMemo(() => {
    if (importAvailability.loading) return projectOptions;
    return projectOptions.filter(
      (project) =>
        (importAvailability.projectTypes[project.value] || []).length > 0,
    );
  }, [projectOptions, importAvailability]);

  const standardTypeOptions = useMemo(() => {
    if (importAvailability.loading) return typeOptions;
    return typeOptions.filter((type) =>
      importAvailability.standardTypes.includes(type.value),
    );
  }, [typeOptions, importAvailability]);

  const groupTypeOptions = useMemo(() => {
    if (!importGroupId) return [];
    if (importAvailability.loading) return typeOptions;
    const typesForGroup = importAvailability.groupTypes[importGroupId] || [];
    return typeOptions.filter((type) => typesForGroup.includes(type.value));
  }, [typeOptions, importAvailability, importGroupId]);

  const projectTypeOptions = useMemo(() => {
    if (!importProjectId) return [];
    if (importAvailability.loading) return typeOptions;
    const typesForProject = importAvailability.projectTypes[importProjectId] || [];
    return typeOptions.filter((type) => typesForProject.includes(type.value));
  }, [typeOptions, importAvailability, importProjectId]);

  const sourceTypeOptions = useMemo(() => {
    if (importScope === "standard") return standardTypeOptions;
    if (importScope === "group") return groupTypeOptions;
    if (importScope === "project") return projectTypeOptions;
    return typeOptions;
  }, [importScope, standardTypeOptions, groupTypeOptions, projectTypeOptions, typeOptions]);

  const disableSourceTypeSelect =
    (importScope === "group" && !importGroupId) ||
    (importScope === "project" && !importProjectId);

  const selectedImportProjectType = useMemo(() => {
    if (!importProjectId) return null;
    const match = projectOptions.find((project) => project.value === importProjectId);
    return match ? normalizeId(match.typeId) : null;
  }, [importProjectId, projectOptions]);

  useEffect(() => {
    if (importScope === "project") {
      if (selectedImportProjectType) {
        importForm.setFieldsValue({ sourceTypeId: selectedImportProjectType });
      } else {
        importForm.setFieldsValue({ sourceTypeId: undefined });
      }
    }
  }, [importScope, selectedImportProjectType, importForm]);

  const sourceScopeOptions = useMemo(() => {
    const allowAll = importAvailability.loading;
    const standardAvailable = allowAll ? true : standardTypeOptions.length > 0;
    const groupAvailable = allowAll ? true : filteredGroupOptions.length > 0;
    const projectAvailable = allowAll ? true : filteredProjectOptions.length > 0;
    return [
      { label: "Select import source", value: "", disabled: true },
      {
        label: "Standard Templates",
        value: "standard",
        disabled: !standardAvailable,
      },
      {
        label: "Group Templates (includes standard)",
        value: "group",
        disabled: !groupAvailable,
      },
      { label: "Project Templates", value: "project", disabled: !projectAvailable },
    ];
  }, [standardTypeOptions, filteredGroupOptions, filteredProjectOptions]);

  useEffect(() => {
    if (!importModalOpen) return;
    if (importScope === "group" && importGroupId) {
      if (!filteredGroupOptions.some((opt) => opt.value === importGroupId)) {
        importForm.setFieldsValue({ sourceGroupId: undefined });
      }
    }
    if (importScope === "project" && importProjectId) {
      if (!filteredProjectOptions.some((opt) => opt.value === importProjectId)) {
        importForm.setFieldsValue({ sourceProjectId: undefined });
      }
    }
    if (
      importTypeId &&
      !sourceTypeOptions.some((opt) => opt.value === importTypeId) &&
      importScope !== "project"
    ) {
      importForm.setFieldsValue({ sourceTypeId: undefined });
    }
  }, [
    importModalOpen,
    importScope,
    importGroupId,
    importProjectId,
    importTypeId,
    filteredGroupOptions,
    filteredProjectOptions,
    sourceTypeOptions,
    importForm,
    importScope,
  ]);

  useEffect(() => {
    if (mappingModalOpen) {
      fetchMappingOptions(mappingTemplate);
    }
  }, [mappingModalOpen, selectedGroup, selectedType, mappingTemplate]);

  useEffect(() => {
    if (selectedGroup) addForm.setFieldsValue({ groupId: selectedGroup });
    if (selectedType) addForm.setFieldsValue({ typeId: selectedType });
  }, [selectedGroup, selectedType, addForm]);

  useEffect(() => {
    if (!importModalOpen) return;
    importForm.resetFields();
    importForm.setFieldsValue({ copyMappings: true });
  }, [importModalOpen, importForm]);

  useEffect(() => {
    if (importModalOpen) {
      loadImportAvailability();
    }
  }, [importModalOpen, typeOptions, groupOptions, projectOptions]);

  const uploadTemplate = async ({
    groupId,
    typeId,
    templateName,
    subName,
    file,
    projectId,
    moduleIds,
    forceUpload,
    isUpdate = false,
    existingTemplateId = null,
  }) => {
    return new Promise((resolve, reject) => {
      requireAuth(
        async (passcode) => {
          try {
            const res = await uploadTemplateService(APIURL, {
              groupId,
              typeId,
              templateName,
              subName,
              file,
              projectId,
              moduleIds,
              forceUpload,
              passcode,
            });
            resolve(res);
          } catch (err) {
            reject(err);
            throw err;
          }
        },
        {
          moduleName: "MRPTTemplates",
          operationType: "SAVE MASTER",
          groupId: groupId || 0,
        }
      );
    });
  };

  const handleAddTemplate = async () => {
    try {
      const values = await addForm.validateFields();
      const file = addFileList[0]?.originFileObj || addFileList[0];
      if (!file) {
        message.warning("Please select a .rpt file.");
        return;
      }

      setAddSubmitting(true);
      const doUpload = async (forceUpload = false) =>
        uploadTemplate({
          groupId: templateScope === "group" ? values.groupId : null,
          typeId: values.typeId,
          templateName: values.templateName,
          subName: values.subName,
          file,
          moduleIds: values.moduleIds || [],
          forceUpload,
        });

      const onSuccess = (result) => {
        message.success("Template uploaded successfully.");
        setAddModalOpen(false);
        setAddFileList([]);
        addForm.resetFields(["templateName", "moduleIds", "subName"]);
        if (selectionReady) fetchAvailableRPTFiles();

        const uploadedTemplate = {
          templateId: result?.templateId,
          templateName: result?.templateName || values.templateName,
          groupId: templateScope === "group" ? values.groupId : null,
          typeId: values.typeId,
        };

        if (uploadedTemplate.templateId) {
          openMappingModal(uploadedTemplate);
        }
      };

      try {
        const result = await doUpload(false);
        onSuccess(result);
      } catch (err) {
        const data = err?.response?.data;
        const allowForce = (err?.response?.status === 409 && data?.allowForceUpload) || data?.DesignCheck || data?.designCheck;
        
        if (allowForce) {
          setAddSubmitting(false);
          
          if (data?.DesignCheck || data?.designCheck) {
            const check = data.DesignCheck || data.designCheck;
            if (check.changed || check.Changed) {
              setAddSubmitting(false);
              const changeList =
                Array.isArray(check.changes) && check.changes.length > 0
                  ? check.changes.map((c) => `- ${c}`).join("\n")
                  : "No specific field changes listed (check design snapshot).";

              const confirmed = await MessageService.confirm(
                `Design changes detected since last version:\n\n${changeList}\n\nDo you want to upload this version anyway?`,
                {
                  title: "Design Changes Detected",
                  confirmText: "Yes, Upload",
                  cancelText: "No, Cancel",
                  type: "warning",
                }
              );

              if (!confirmed) return;
              const forced = await doUpload(true);
              onSuccess(forced);
              return;
            } else {
              // Design is the same - ask user if they still want to upload
              const confirmed = await MessageService.confirm(
                check.message || check.Message || "No changes detected between this file and the latest version. Do you still want to upload it?",
                { title: "No Design Changes Detected", type: 'info', confirmText: 'Yes, Upload' }
              );
              if (confirmed) {
                const forced = await doUpload(true);
                onSuccess(forced);
              }
              return;
            }
          }

          await confirmForceUpload(async () => {
            const forced = await doUpload(true);
            onSuccess(forced);
          });
          return;
        }
        throw err;
      }
    } catch (err) {
      if (err?.errorFields) return;
      console.error("Failed to upload template", err);
      showError(err, "Failed to upload template. Please try again.");
    } finally {
      setAddSubmitting(false);
    }
  };

  const handleImportTemplates = async () => {
    try {
      const values = await importForm.validateFields();
      if (values.sourceScope === "project" && !selectedImportProjectType) {
        message.warning("Selected project has no type configured.");
        return;
      }
      setImportSubmitting(true);
      const sourceScope = values.sourceScope || "group";
      const payload = {
        sourceScope: sourceScope,
        targetGroupId: selectedGroup,
        targetTypeId: selectedType,
        targetScope: "master",
        copyMappings: values.copyMappings ?? true,
      };
      if (values.selectedTemplateIds && values.selectedTemplateIds.length > 0) {
        payload.SelectedTemplateIds = values.selectedTemplateIds;
      }
      if (sourceScope === "group") {
        payload.sourceGroupId = values.sourceGroupId;
        payload.includeStandard = true;
        payload.sourceTypeId = values.sourceTypeId;
      } else if (sourceScope === "standard") {
        payload.sourceTypeId = values.sourceTypeId;
      } else if (sourceScope === "project") {
        payload.sourceProjectId = values.sourceProjectId;
        payload.sourceTypeId = selectedImportProjectType;
      }
      try {
        setImportSubmitting(true);
        await importTemplatesFromGroup(APIURL, payload);
        message.success("Templates imported successfully.");
        setImportModalOpen(false);
        importForm.resetFields();
        fetchAvailableRPTFiles();
      } catch (err) {
        console.error("Failed to import templates", err);
        showError(err, "Failed to import templates. Please try again.");
      } finally {
        setImportSubmitting(false);
      }
    } catch (err) {
      if (err?.errorFields) return;
      console.error("Validation failed", err);
      setImportSubmitting(false);
    }
  };

  const confirmForceUpload = async (onConfirm) => {
    let confirmed = false;
    try {
      confirmed = await MessageService.confirm(
        "No changes detected between this file and the latest version. Do you still want to upload it?",
        {
          title: "No changes detected",
          confirmText: "Upload Anyway",
          cancelText: "Cancel",
          type: 'info'
        }
      );
    } catch {
      confirmed = window.confirm("No changes detected. Upload anyway?");
    }
    if (confirmed) await onConfirm();
  };

  const confirmMappingUpdate = async (template) => {
    const confirmed = await MessageService.confirm(
      "Do you want to update the mapping for this new template version?",
      {
        title: "Update mapping?",
        confirmText: "Update Mapping",
        cancelText: "Skip",
        type: 'confirm'
      }
    );
    if (confirmed) openMappingModal(template);
  };

  const openMappingModal = async (template) => {
    setAddModalOpen(false);
    setImportModalOpen(false);
    cancelInlineEdit();
    setMappingTemplate(template);
    setMappingModalOpen(true);
    setMappingLoading(true);
    setMappingNotFound(false);
    setParsedFields(extractParsedFields(template));
    
    fetchMappingOptions(template);
    try {
      const details = await fetchTemplateDetails(APIURL, template.templateId);
      let currentFields = details;

      const needsRefresh = !currentFields.requiredFieldsJson && 
                           !currentFields.RequiredFieldsJson &&
                           (!currentFields.parsedFieldsJson || currentFields.parsedFieldsJson === "[]") &&
                           (!currentFields.ParsedFieldsJson || currentFields.ParsedFieldsJson === "[]");

      if (needsRefresh) {
        setParsedFieldsLoading(true);
        try {
          const parsedRes = await parseTemplateFields(APIURL, template.templateId);
          currentFields = parsedRes || [];
        } catch (err) {
          console.error("Auto-parse failed", err);
        } finally {
          setParsedFieldsLoading(false);
        }
      }

      const richFields = extractParsedFields(currentFields);
      setParsedFields(richFields);

      const res = await fetchTemplateMapping(APIURL, template.templateId);
      const mapping = res?.mappingJson ?? res?.MappingJson ?? "";
      const parsed = parseMappingJson(mapping);
      
      setStaticVariables(parsed.staticVariables || {});
      setFilterMode(parsed.filterMode || null);
      setUseBoxLabelSP(parsed.useBoxLabelSP || false);

      setMappingSelections(parsed.mappings || {});
      setGroupBySelections(Array.isArray(parsed.groupBy) ? parsed.groupBy : []);
      setOrderBySelections(Array.isArray(parsed.orderBy) ? parsed.orderBy : []);
      setLabelCopies(Number.isFinite(parsed.labelCopies) && parsed.labelCopies >= 1 ? parsed.labelCopies : 1);
      setMappingPinnedFields(Object.keys(parsed.mappings || {}));
      setQrConfiguration(parsed.qrConfiguration || { enabled: false, qrFields: [], separator: "|" });
      const emptyMapping =
        Object.keys(parsed.mappings || {}).length === 0 &&
        (!parsed.groupBy || parsed.groupBy.length === 0);
      setMappingNotFound(emptyMapping);
    } catch (err) {
      if (err?.response?.status === 404) {
        setMappingSelections({});
        setGroupBySelections([]);
        setMappingNotFound(true);
        setMappingPinnedFields([]);
      } else {
        showError(err, "Failed to load mapping.");
      }
    } finally {
      setMappingLoading(false);
    }
  };

  const closeMappingPanel = () => {
    setMappingModalOpen(false);
    setMappingTemplate(null);
  };

  const recordMappingUpdate = (templateId) => {
    if (!templateId) return;
    const key = "rptTemplateMappingUpdatedAt";
    const now = new Date().toISOString();
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : {};
      const next = parsed && typeof parsed === "object" ? { ...parsed } : {};
      next[templateId] = now;
      localStorage.setItem(key, JSON.stringify(next));
    } catch (err) {
      localStorage.setItem(key, JSON.stringify({ [templateId]: now }));
    }
  };

  const handleSaveMapping = async () => {
    if (!mappingTemplate?.templateId) return;
    setSavingMapping(true);
    try {
      const mappingsPayload = parsedFields
        .map((f) => {
          const name = (typeof f === "string" ? f : f?.name ?? f?.Name) || "";
          return {
            rptField: name,
            source: mappingSelections[name],
          };
        })
        .filter((item) => item.source);
      const mappingPayload = {
        mappings: mappingsPayload,
        groupBy: groupBySelections || [],
        orderBy: orderBySelections || [],
        labelCopies: labelCopies ?? 1,
        staticVariables: staticVariables || {},
        filterMode: filterMode || null,
        useBoxLabelSP: useBoxLabelSP || false,
        qrConfiguration: qrConfiguration || { enabled: false, qrFields: [], separator: "|" },
      };
      const hasContent =
        mappingsPayload.length > 0 ||
        (groupBySelections || []).length > 0 ||
        (orderBySelections || []).length > 0 ||
        (labelCopies ?? 1) > 1 ||
        Object.keys(staticVariables || {}).length > 0 ||
        !!filterMode ||
        (qrConfiguration && qrConfiguration.enabled);
      const mappingJson = hasContent ? JSON.stringify(mappingPayload) : "";
      await saveTemplateMapping(
        APIURL,
        mappingTemplate.templateId,
        mappingJson,
      );
      message.success("Mapping saved.");
      setMappingNotFound(false);
      recordMappingUpdate(mappingTemplate.templateId);
      setAvailableRPTFiles((prev) =>
        prev.map((t) =>
          t.templateId === mappingTemplate.templateId
            ? { ...t, hasMapping: true, mappingWarning: null }
            : t
        )
      );
      closeMappingPanel();
    } catch (err) {
      console.error("Failed to save mapping", err);
      showError(err, "Failed to save mapping.");
    } finally {
    setSavingMapping(false);
    }
  };

  const handleAutoMap = () => {
    if (parsedFields.length === 0 || flatSourceOptions.length === 0) return;
    setMappingSelections((prev) => {
      let changed = false;
      const next = { ...prev };
      parsedFields.forEach((field) => {
        if (next[field]) return;
        const match = flatSourceOptions.find(
          (option) => option.normalized === normalizeKey(field),
        );
        if (match) {
          next[field] = match.value;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  };

  const userMap = useMemo(() => {
    const map = new Map();
    (userOptions || []).forEach((user) => {
      const id = user?.userId ?? user?.UserId;
      if (id) map.set(id, user);
    });
    return map;
  }, [userOptions]);

  const moduleMap = useMemo(() => {
    const map = new Map();
    (moduleOptions || []).forEach((m) => {
      if (m?.value) map.set(m.value, m.label);
    });
    return map;
  }, [moduleOptions]);

  const fetchTemplateVersions = async (template) => {
    if (!template?.templateName || !template?.typeId) return;
    setVersionsLoading(true);
    try {
      const data = await fetchTemplateVersionsService(APIURL, {
        templateName: template.templateName,
        typeId: template.typeId,
        groupId: template.groupId,
        projectId: template.projectId,
      });
      setVersionsData(data || []);
    } catch (err) {
      console.error("Failed to fetch template versions", err);
      showError(err, "Failed to load template history.");
      setVersionsData([]);
    } finally {
      setVersionsLoading(false);
    }
  };

  const openVersionsModal = (template) => {
    setVersionsTemplate(template);
    setVersionsOpen(true);
    fetchTemplateVersions(template);
  };

  const closeVersionsModal = () => {
    setVersionsOpen(false);
    setVersionsTemplate(null);
    setVersionsData([]);
    setActivatingVersionId(null);
  };

  const activateTemplateVersion = async (record) => {
    const templateId = resolveTemplateId(record);
    if (!templateId) {
      message.warning("Template not found.");
      return;
    }
    setActivatingVersionId(templateId);
    try {
      await activateTemplateVersionService(APIURL, templateId);
      message.success("Template activated.");
      if (versionsTemplate) {
        fetchTemplateVersions(versionsTemplate);
      }
      fetchAvailableRPTFiles();
    } catch (err) {
      console.error("Failed to activate template", err);
      showError(err, "Failed to activate template.");
    } finally {
      setActivatingVersionId(null);
    }
  };

  const confirmActivateVersion = async (record) => {
    const scopeLabel = getScopeLabel(record);
    const confirmed = await MessageService.confirm(
      `This will make v${record?.version} the active template for the ${scopeLabel.toLowerCase()} scope. All projects using this template in that scope will use this version.`,
      {
        title: "Set active version?",
        confirmText: "Set Active",
        cancelText: "Cancel",
        type: 'warning'
      }
    );
    if (confirmed) activateTemplateVersion(record);
  };

  const loadEditVersions = async (template) => {
    if (!template?.templateName || !template?.typeId) {
      setEditingVersionOptions([]);
      return;
    }
    setEditingVersionsLoading(true);
    try {
      const list = await fetchTemplateVersionsService(APIURL, {
        templateName: template.templateName,
        typeId: template.typeId,
        groupId: template.groupId,
        projectId: template.projectId,
      });
      const options = list.map((item) => ({
        value: resolveTemplateId(item),
        label: `v${item?.version}${item?.subName || item?.SubName ? ` (${item?.subName || item?.SubName})` : ""}${item?.isActive ? " (Active)" : ""}`,
      }));
      setEditingVersionOptions(options);
      const active = list.find((item) => item?.isActive);
      const activeId = resolveTemplateId(active) ?? resolveTemplateId(template);
      setEditingVersionId(activeId);
    } catch (err) {
      console.error("Failed to fetch template versions", err);
      setEditingVersionOptions([]);
      setEditingVersionId(resolveTemplateId(template));
    } finally {
      setEditingVersionsLoading(false);
    }
  };

  const startInlineEdit = (template) => {
    setEditingTemplateId(template?.templateId ?? null);
    setEditingTemplateName(template?.templateName || "");
    setEditingModuleIds(
      normalizeModuleIds(template?.moduleIds ?? template?.ModuleIds),
    );
    setEditingVersionId(resolveTemplateId(template));
    setEditingVersionOptions(
      template?.version
        ? [{ value: resolveTemplateId(template), label: `v${template.version}` }]
        : [],
    );
    loadEditVersions(template);
  };

  const cancelInlineEdit = () => {
    setEditingTemplateId(null);
    setEditingTemplateName("");
    setEditingModuleIds([]);
    setEditingVersionId(null);
    setEditingVersionOptions([]);
  };

  const saveInlineEdit = async () => {
    if (!editingTemplateId) return;
    const name = editingTemplateName.trim();
    if (!name) {
      message.warning("Template name is required.");
      return;
    }
    try {
      setInlineEditSaving(true);
      await updateTemplate(APIURL, editingTemplateId, {
        templateName: name,
        moduleIds: editingModuleIds || [],
        applyToAllVersions: true,
      });
      if (editingVersionId && editingVersionId !== editingTemplateId) {
        await activateTemplateVersionService(APIURL, editingVersionId);
      }
      message.success("Template updated.");
      cancelInlineEdit();
      fetchAvailableRPTFiles();
      if (versionsOpen && versionsTemplate?.templateId === editingTemplateId) {
        fetchTemplateVersions(versionsTemplate);
      }
    } catch (err) {
      console.error("Failed to update template", err);
      showError(err, "Failed to update template.");
    } finally {
      setInlineEditSaving(false);
    }
  };

  const handleRemoveTemplate = (record) => {
    const scope = record?.projectId ? "project" : record?.groupId ? "group" : "standard";

    if (record?.isDeleted) {
      Modal.confirm({
        title: "Restore template?",
        content: `This will restore "${record?.templateName}" and set it as active in the ${scope} scope.`,
        okText: "Restore",
        cancelText: "Cancel",
        onOk: async () => {
          try {
            await restoreTemplate(APIURL, record.templateId);
            message.success("Template restored.");
            setAvailableRPTFiles((prev) =>
              prev.map((t) =>
                t.templateId === record.templateId ? { ...t, isDeleted: false, isActive: true } : t
              )
            );
          } catch (err) {
            console.error("Failed to restore template", err);
            showError(err, "Failed to restore template.");
          }
        },
      });
      return;
    }

    Modal.confirm({
      title: "Remove template?",
      content: `This will mark "${record?.templateName}" as deleted in the ${scope} scope. It stays visible but marked deleted — you can restore it from the Versions panel.`,
      okText: "Remove",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: async () => {
        try {
          await softDeleteTemplate(APIURL, record.templateId, scope);
          message.success("Template marked as deleted.");
          setAvailableRPTFiles((prev) =>
            prev.map((t) =>
              t.templateId === record.templateId ? { ...t, isDeleted: true } : t
            )
          );
        } catch (err) {
          console.error("Failed to remove template", err);
          showError(err, "Failed to remove template.");
        }
      },
    });
  };

  const runReportGeneration = () => {
    message.warning("Report generation is available from Project Templates.");
  };

  const handleDownload = async (template) => {
    try {
      const { blob, fileName } = await downloadTemplateBlobService(
        APIURL,
        template,
      );
      const fileBlob = new Blob([blob], { type: "application/octet-stream" });
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
      showError(err, "Failed to download template.");
    }
  };

  const rowUploadProps = (record) => ({
    accept: ".rpt",
    multiple: false,
    showUploadList: false,
    customRequest: async ({ file, onSuccess, onError }) => {
      try {
        const doUpload = async (forceUpload = false) =>
          uploadTemplate({
            groupId: record.groupId,
            typeId: record.typeId,
            templateName: record.templateName,
            file,
            moduleIds: record.moduleIds ?? record.ModuleIds ?? [],
            forceUpload,
            isUpdate: true, // Mark as update
            existingTemplateId: record.templateId, // Pass existing template ID
          });

        const onUploadSuccess = (result) => {
          onSuccess?.("ok");
          message.success("New version uploaded.");
          fetchAvailableRPTFiles();

          const uploadedTemplate = {
            templateId: result?.templateId,
            templateName: result?.templateName || record.templateName,
            groupId: record.groupId,
            typeId: record.typeId,
          };

          if (uploadedTemplate.templateId) {
            confirmMappingUpdate(uploadedTemplate);
          }
        };

        try {
          const result = await doUpload(false);
          onUploadSuccess(result);
        } catch (err) {
          const allowForce =
            err?.response?.status === 409 && err?.response?.data?.allowForceUpload;
          if (allowForce) {
            await confirmForceUpload(async () => {
              const forced = await doUpload(true);
              onUploadSuccess(forced);
            });
            return;
          }
          throw err;
        }
      } catch (err) {
        onError?.(err);
        console.error("Upload failed", err);
        showError(err, "Upload failed.");
      }
    },
  });

  const columns = useMemo(
    () =>
      buildTemplateColumns({
        userMap,
        moduleMap,
        moduleOptions,
        editingTemplateId,
        editingTemplateName,
        setEditingTemplateName,
        editingModuleIds,
        setEditingModuleIds,
        editingVersionId,
        editingVersionOptions,
        editingVersionsLoading,
        setEditingVersionId,
        openMappingModal,
        openVersionsModal,
        handleDownload,
        rowUploadProps,
        startInlineEdit,
        saveInlineEdit,
        cancelInlineEdit,
        inlineEditSaving,
        onRemove: handleRemoveTemplate,
      }),
    [
      userMap,
      moduleMap,
      moduleOptions,
      editingTemplateId,
      editingTemplateName,
      editingModuleIds,
      editingVersionId,
      editingVersionOptions,
      editingVersionsLoading,
      inlineEditSaving,
      setEditingTemplateName,
      setEditingModuleIds,
      setEditingVersionId,
      openMappingModal,
      openVersionsModal,
      handleDownload,
      rowUploadProps,
      startInlineEdit,
      saveInlineEdit,
      cancelInlineEdit,
    ],
  );

  const versionsColumns = useMemo(
    () =>
      buildVersionsColumns({
        userMap,
        activatingVersionId,
        confirmActivateVersion,
        handleDownload,
      }),
    [userMap, activatingVersionId, confirmActivateVersion, handleDownload],
  );

  const sourceOptionGroups = useMemo(() => {
    const rawOptions = Array.isArray(mappingOptions) ? mappingOptions : [];
    const uniqueOptions = [];
    const seen = new Set();

    for (const opt of rawOptions) {
      if (opt.value === "calc:SRNO") continue; // Skip backend calc:SRNO to use frontend's label
      if (!seen.has(opt.value)) {
        seen.add(opt.value);
        uniqueOptions.push(opt);
      }
    }

    uniqueOptions.push({ value: "calc:SRNO", label: "Auto SR No.", raw: "SRNO" });
    return uniqueOptions;
  }, [mappingOptions]);

  const flatSourceOptions = useMemo(() => {
    return sourceOptionGroups.map((option) => ({
      value: option.value,
      label: option.label,
      normalized: normalizeKey(option.label ?? option.value),
    }));
  }, [sourceOptionGroups]);

  const mappingDisplayOrder = useMemo(() => {
    const getSortInfo = (f) => {
      const name = (typeof f === "string" ? f : f?.name ?? f?.Name) || "";
      const isReq = typeof f === "string" ? false : !!(f?.isRequired ?? f?.IsRequired ?? f?.required ?? f?.Required);
      return { name, isReq };
    };

    const pinnedFields = new Set(mappingPinnedFields || []);

    const complexSort = (list) => {
      return [...list].sort((a, b) => {
        const infoA = getSortInfo(a);
        const infoB = getSortInfo(b);
        const isPinnedA = pinnedFields.has(infoA.name);
        const isPinnedB = pinnedFields.has(infoB.name);

        if (infoA.isReq && !infoB.isReq) return -1;
        if (!infoA.isReq && infoB.isReq) return 1;

        if (isPinnedA && !isPinnedB) return -1;
        if (!isPinnedA && isPinnedB) return 1;

        return infoA.name.localeCompare(infoB.name);
      });
    };

    return complexSort(parsedFields);
  }, [parsedFields, mappingPinnedFields]);

  const mappingRows = useMemo(
    () =>
      mappingDisplayOrder.map((f, index) => {
        const name = (typeof f === "string" ? f : f?.name ?? f?.Name) || "";
        return {
          key: `${name}-${index}`,
          field: name,
          isRequired: typeof f === "string" ? false : !!(f?.isRequired ?? f?.IsRequired ?? f?.required ?? f?.Required),
          isMapped: Boolean(mappingSelections?.[name]),
        };
      }),
    [mappingDisplayOrder, mappingSelections],
  );
  const mappedFieldNames = useMemo(
    () =>
      parsedFields
        .map((f) => (typeof f === "string" ? f : f?.name ?? f?.Name) || "")
        .filter((name) => name && mappingSelections?.[name])
        .sort((a, b) => a.localeCompare(b)),
    [parsedFields, mappingSelections],
  );

  useEffect(() => {
    if (!mappingModalOpen) return;
    if (parsedFields.length === 0 || flatSourceOptions.length === 0) return;
    let autoMapped = [];
    setMappingSelections((prev) => {
      let changed = false;
      const next = { ...prev };
      parsedFields.forEach((f) => {
        const name = (typeof f === "string" ? f : f?.name ?? f?.Name) || "";
        if (!name || next[name]) return;
        const match = flatSourceOptions.find(
          (option) => option.normalized === normalizeKey(name),
        );
        if (match) {
          next[name] = match.value;
          changed = true;
          autoMapped.push(name);
        }
      });
      return changed ? next : prev;
    });
    if (autoMapped.length > 0) {
      setMappingPinnedFields((prev) => {
        const next = new Set(prev || []);
        autoMapped.forEach((field) => next.add(field));
        return Array.from(next);
      });
    }
  }, [mappingModalOpen, parsedFields, flatSourceOptions]);

  return (
    <div className="rpt-templates">
      {authModalComponent}
      <style>{rptTemplatesStyles}</style>
      <RPTFilesHeader
        templateScope={templateScope}
        onScopeChange={onScopeChange}
        selectedGroup={selectedGroup}
        onGroupChange={onGroupChange}
        groupOptions={groupOptions}
        selectedType={selectedType}
        onTypeChange={onTypeChange}
        typeOptions={typeOptions}
        groupLabel={groupLabel}
      />

      <div
        className={`rpt-main ${
          showMappingPanel || showSidePanel
            ? "rpt-main--with-panel"
            : "rpt-main--single"
        }`}
      >
        <TemplatesCard
          selectionReady={selectionReady}
          tags={[
            templateScope === "standard" ? "Standard" : groupLabel,
            typeLabel,
          ]}
          data={availableRPTFiles}
          columns={columns}
          loading={loadingTemplates}
          selectionEmptyText="Select a group and type to view templates."
          noTemplatesTitle="No templates found for this group and type."
          noTemplatesSubtitle="You can import from an existing group or add a new template."
          onRefresh={fetchAvailableRPTFiles}
          onAdd={() => {
            setAddModalOpen(true);
            setImportModalOpen(false);
            setMappingModalOpen(false);
            setMappingTemplate(null);
            cancelInlineEdit();
          }}
          onImport={() => {
            setImportModalOpen(true);
            setAddModalOpen(false);
            setMappingModalOpen(false);
            setMappingTemplate(null);
            cancelInlineEdit();
            importForm.resetFields();
            importForm.setFieldsValue({ copyMappings: true });
          }}
          disableAdd={false}
          disableImport={!selectionReady || templateScope !== "group"}
          showImportAction
        />

        {showSidePanel && (
          <TemplatesSidePanel
            addModalOpen={addModalOpen}
            importModalOpen={importModalOpen}
            onClose={() => {
              setAddModalOpen(false);
              setImportModalOpen(false);
            }}
            addFormProps={{
              form: addForm,
              addFileList,
              setAddFileList,
              onSubmit: handleAddTemplate,
              submitting: addSubmitting,
              moduleOptions,
              children: (
                <>
                  {templateScope === "group" && (
                    <Form.Item
                      label="Group"
                      name="groupId"
                      rules={[{ required: true, message: "Group is required" }]}
                    >
                      <Select 
                        showSearch
                        optionFilterProp="label"
                        allowClear
                        options={groupOptions} 
                        placeholder="Select group" 
                      />
                    </Form.Item>
                  )}
                  <Form.Item
                    label="Type"
                    name="typeId"
                    rules={[{ required: true, message: "Type is required" }]}
                  >
                    <Select options={typeOptions} placeholder="Select type" />
                  </Form.Item>
                </>
              ),
            }}
            importFormProps={{
              form: importForm,
              importScope,
              sourceScopeOptions,
              filteredGroupOptions,
              filteredProjectOptions,
              importAvailability,
              importGroupId,
              importProjectId,
              sourceTypeOptions,
              disableSourceTypeSelect,
              selectedImportProjectTypeLabel: typeOptions.find(
                (type) => type.value === selectedImportProjectType,
              )?.label,
              importSubmitting,
              onSubmit: handleImportTemplates,
              importableTemplates,
              importableTemplatesLoading,
            }}
          />
        )}

       <TemplatesMappingPanel
  showMappingPanel={showMappingPanel}
  mappingTemplate={mappingTemplate}
  mappingNotFound={mappingNotFound}
  mappingOptionsLoading={mappingOptionsLoading}
  parsedFields={parsedFields}
  mappingRows={mappingRows}
  sourceOptionGroups={sourceOptionGroups}
  mappingSelections={mappingSelections}
  setMappingSelections={setMappingSelections}
  mappedFieldNames={mappedFieldNames}
  groupBySelections={groupBySelections}
  setGroupBySelections={setGroupBySelections}
  orderBySelections={orderBySelections}
  setOrderBySelections={setOrderBySelections}
  qrConfiguration={qrConfiguration}
  setQrConfiguration={setQrConfiguration}
  labelCopies={labelCopies}
  setLabelCopies={setLabelCopies}
  staticVariables={staticVariables}
  setStaticVariables={setStaticVariables}
  filterMode={filterMode}
  setFilterMode={setFilterMode}
  useBoxLabelSP={useBoxLabelSP}
    savingMapping={savingMapping}
  setUseBoxLabelSP={setUseBoxLabelSP}
  handleSaveMapping={handleSaveMapping}
  mappingLoading={mappingLoading}
  closeMappingPanel={closeMappingPanel}
/>
      </div>

      <TemplatesVersionsModal
        versionsOpen={versionsOpen}
        versionsTemplate={versionsTemplate}
        closeVersionsModal={closeVersionsModal}
        pendingGenerateTemplate={pendingGenerateTemplate}
        setPendingGenerateTemplate={setPendingGenerateTemplate}
        runReportGeneration={runReportGeneration}
        versionsData={versionsData}
        versionsColumns={versionsColumns}
        versionsLoading={versionsLoading}
      />

    </div>
  );
};

export default RPTFiles;
