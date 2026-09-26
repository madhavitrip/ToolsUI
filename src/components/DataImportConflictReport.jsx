import React from "react";
import { AutoComplete, Button, Collapse, Empty, Input, Radio, Select, Space, Table, Tabs, Tag, Typography } from "antd";
import { CheckCircleOutlined } from "@ant-design/icons";
import {
  CONFLICT_STATUS,
  STATUS_TAG_CONFIG,
  getConflictTypeConfig,
} from "../utils/dataImportConflictConfig";

const { Text } = Typography;

const getValue = (item, ...keys) => {
  for (const key of keys) {
    if (item?.[key] !== undefined && item?.[key] !== null) {
      return item[key];
    }
  }
  return undefined;
};

const toArray = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return [value];
};

const formatCatchNosPreview = (catchNos) => {
  if (!catchNos?.length) {
    return "";
  }

  const preview = catchNos.slice(0, 5).join(", ");
  const remaining = catchNos.length - 5;

  return remaining > 0
    ? `${preview} +${remaining} more`
    : preview;
};

const formatCatchNosLabel = (catchNos) => {
  if (!catchNos?.length) {
    return "";
  }

  const preview = formatCatchNosPreview(catchNos);
  return catchNos.length === 1 ? preview : `${preview} (${catchNos.length})`;
};

const formatNumberPreview = (values) => {
  if (!values?.length) {
    return "";
  }

  const preview = values.slice(0, 5).join(", ");
  const remaining = values.length - 5;

  return remaining > 0 ? `${preview} +${remaining} more` : preview;
};

const formatNumberLabel = (values) => {
  if (!values?.length) {
    return "";
  }

  const preview = formatNumberPreview(values);
  return values.length === 1 ? preview : `${preview} (${values.length})`;
};

const cleanupConflictSummary = (summary, conflictType, uniqueField, catchNo, field, importRowNos) => {
  const normalizedSummary = summary || "";

  if (conflictType === "catch_unique_field") {
    const fallbackSummary = `Catch No ${catchNo} has multiple ${uniqueField}.`;
    return normalizedSummary.replace(/ has multiple (.+?) values\./i, " has multiple $1.") || fallbackSummary;
  }

  if (conflictType === "required_field_empty") {
    const catchSuffix = catchNo ? ` (Catch No ${catchNo})` : "";

    if (importRowNos?.length) {
      return `${field} is missing for row ${formatNumberLabel(importRowNos)}${catchSuffix}.`;
    }

    const withoutDbRow = normalizedSummary.replace(/\s*for row \d+/i, "");
    if (withoutDbRow) {
      return withoutDbRow;
    }

    return `${field} is missing${catchSuffix}.`;
  }

  return normalizedSummary;
};

const shouldShowCatchNos = (conflict) => {
  if (!conflict.catchNos?.length) {
    return false;
  }

  if (conflict.catchNos.length === 1 && conflict.catchNo && conflict.catchNos[0] === conflict.catchNo) {
    return false;
  }

  return true;
};

const getConflictKey = (item) => {
  const keyParts = [
    getValue(item, "conflictType", "ConflictType"),
    getValue(item, "catchNo", "CatchNo"),
    getValue(item, "centreCode", "CentreCode"),
    getValue(item, "nodalCode", "NodalCode"),
    getValue(item, "nodalCodeGroup", "NodalCodeGroup"),
    getValue(item, "collegeName", "CollegeName"),
    getValue(item, "collegeCode", "CollegeCode"),
    getValue(item, "collegeKeyType", "CollegeKeyType"),
    getValue(item, "gender", "Gender"),
    getValue(item, "field", "Field"),
    getValue(item, "uniqueField", "UniqueField"),
    ...toArray(getValue(item, "rowIds", "RowIds")),
    ...toArray(getValue(item, "conflictingValues", "ConflictingValues")),
  ];

  return keyParts.filter(Boolean).join("|");
};

const normalizeConflict = (item) => {
  const conflictType = getValue(item, "conflictType", "ConflictType") || "unknown";
  const meta = getConflictTypeConfig(conflictType);
  const uniqueField = getValue(item, "uniqueField", "UniqueField");
  const field = getValue(item, "field", "Field");
  const catchNo = getValue(item, "catchNo", "CatchNo");
  const centreCode = getValue(item, "centreCode", "CentreCode");
  const nodalCode = getValue(item, "nodalCode", "NodalCode");
  const nodalCodeGroup = getValue(item, "nodalCodeGroup", "NodalCodeGroup");
  const collegeName = getValue(item, "collegeName", "CollegeName");
  const collegeCode = getValue(item, "collegeCode", "CollegeCode");
  const collegeKeyType = getValue(item, "collegeKeyType", "CollegeKeyType");
  const conflictingValues = toArray(getValue(item, "conflictingValues", "ConflictingValues"));
  const catchNos = toArray(getValue(item, "catchNos", "CatchNos"));
  const rowIds = toArray(getValue(item, "rowIds", "RowIds"));
  const importRowNos = toArray(getValue(item, "importRowNos", "ImportRowNos"));
  const nodalCodes = toArray(getValue(item, "nodalCodes", "NodalCodes"));
  const centerCodes = toArray(getValue(item, "centerCodes", "CenterCodes"));
  const centerNames = toArray(getValue(item, "centerNames", "CenterNames"));
  const canIgnore = Boolean(getValue(item, "canIgnore", "CanIgnore"));
  const status = (getValue(item, "status", "Status") || CONFLICT_STATUS.PENDING).toLowerCase();
  const minNrQuantity = getValue(item, "minNrQuantity", "MinNrQuantity");
  const maxNrQuantity = getValue(item, "maxNrQuantity", "MaxNrQuantity");
  const dcId = getValue(item, "dcId", "DcId", "id", "Id");
  const uniqueValue = getValue(item, "uniqueValue", "UniqueValue");

  const details = {
    key: getConflictKey(item),
    dcId,
    id: getValue(item, "id", "Id"),
    uniqueValue,
    rawItem: item,
    conflictType,
    canIgnore,
    status,
    uniqueField,
    field,
    catchNo,
    centreCode,
    nodalCode,
    nodalCodeGroup,
    collegeName,
    collegeCode,
    collegeKeyType,
    conflictingValues,
    catchNos,
    rowIds,
    importRowNos,
    nodalCodes,
    centerCodes,
    centerNames,
    minNrQuantity,
    maxNrQuantity,
    meta,
    targetField: uniqueField || field,
    sourceField: null,
    sourceValue: null,
    valuesForSelection: conflictingValues,
    resolveKind: meta.resolveKind,
    summary: "",
    groupLabel: meta.groupLabel,
  };

  details.summary = cleanupConflictSummary(
    getValue(item, "summary", "Summary") || "",
    conflictType,
    uniqueField,
    catchNo,
    field,
    details.importRowNos
  );

  if (conflictType === "catch_unique_field") {
    details.sourceField = "CatchNo";
    details.sourceValue = catchNo;
    details.summary = details.summary || `Catch No ${catchNo} has multiple ${uniqueField}.`;
    return details;
  }

  if (conflictType === "center_multiple_nodals") {
    details.sourceField = "CenterCode";
    details.sourceValue = centreCode;
    details.valuesForSelection = (nodalCodes && nodalCodes.length > 0) ? nodalCodes : (conflictingValues && conflictingValues.length > 0 ? conflictingValues : []);
    details.summary = details.summary || `Centre ${centreCode} is linked with multiple nodal codes.`;
    return details;
  }

  if (conflictType === "college_multiple_nodals") {
    details.sourceField = collegeKeyType === "CollegeCode" ? "CollegeCode" : "CollegeName";
    details.sourceValue = collegeCode || collegeName;
    details.valuesForSelection = (nodalCodes && nodalCodes.length > 0) ? nodalCodes : (conflictingValues && conflictingValues.length > 0 ? conflictingValues : []);
    details.summary = details.summary || `College ${collegeCode || collegeName} is linked with multiple nodal codes.`;
    return details;
  }

  if (conflictType === "college_multiple_centers") {
    details.sourceField = collegeKeyType === "CollegeCode" ? "CollegeCode" : "CollegeName";
    details.sourceValue = collegeCode || collegeName;
    details.valuesForSelection = centerCodes.length ? centerCodes : (conflictingValues && conflictingValues.length > 0 ? conflictingValues : []);
    details.summary = details.summary || `College ${collegeCode || collegeName} is linked with multiple exam centres.`;
    return details;
  }

  if (conflictType === "unassigned_catch_nodal") {
    details.sourceField = collegeKeyType === "CollegeCode" ? "CollegeCode" : "CollegeName";
    details.sourceValue = collegeCode || collegeName;
    details.valuesForSelection = centerCodes.length ? centerCodes : (conflictingValues && conflictingValues.length > 0 ? conflictingValues : []);
    details.summary = details.summary || `College ${collegeCode || collegeName} is missing from Nodal List.`;
    return details;
  }

  if (conflictType === "nodal_code_digit_mismatch") {
    details.sourceField = "NodalCode";
    details.sourceValue = nodalCode;
    details.valuesForSelection = nodalCode ? [nodalCode] : conflictingValues;
    details.summary =
      details.summary || `Nodal code ${nodalCode} has a digit mismatch.`;
    return details;
  }

  if (conflictType === "required_field_empty") {
    details.summary = details.summary || `${field} is missing for ${catchNos.length} catch number(s).`;
    return details;
  }

  if (conflictType === "zero_nr_quantity") {
    details.valuesForSelection = Array.from(
      new Set(
        [minNrQuantity, maxNrQuantity]
          .filter((value) => value !== undefined && value !== null)
          .map((value) => String(value))
      )
    );
    const quantityRange =
      minNrQuantity !== undefined && minNrQuantity !== null && maxNrQuantity !== undefined && maxNrQuantity !== null
        ? ` Use a value between ${minNrQuantity} and ${maxNrQuantity}.`
        : "";
    details.summary = details.summary || `NRQuantity is 0 for ${catchNos.length} catch number(s).${quantityRange}`;
    return details;
  }

  details.resolveKind = "manual";
  details.summary = details.summary || getValue(item, "error", "Error") || "Review this conflict.";
  return details;
};

const renderMetaTags = (conflict) => {
  const metaItems = [
    conflict.catchNo ? `Catch No: ${conflict.catchNo}` : null,
    conflict.centreCode ? `Centre: ${conflict.centreCode}` : null,
    conflict.nodalCode ? `Nodal: ${conflict.nodalCode}` : null,
    conflict.collegeName ? `College: ${conflict.collegeName}` : null,
    conflict.collegeCode ? `College Code: ${conflict.collegeCode}` : null,
    conflict.field ? `Field: ${conflict.field}` : null,
    conflict.uniqueField ? `Resolve Field: ${conflict.uniqueField}` : null,
  ].filter(Boolean);

  if (!metaItems.length) {
    return <Text type="secondary">No extra details</Text>;
  }

  return (
    <Space wrap size={[4, 4]}>
      {metaItems.map((label) => (
        <Tag key={`${conflict.key}-${label}`} style={{ marginInlineEnd: 0, paddingInline: 5, lineHeight: "16px", fontSize: 11 }}>
          {label}
        </Tag>
      ))}
    </Space>
  );
};

const renderValueTags = (values, key) => {
  if (!values?.length) {
    return <Text type="secondary">-</Text>;
  }

  return (
    <Space wrap size={[4, 4]}>
      {values.map((value) => (
        <Tag key={`${key}-${value}`} bordered style={{ marginInlineEnd: 0, paddingInline: 5, lineHeight: "16px", fontSize: 11 }}>
          {value}
        </Tag>
      ))}
    </Space>
  );
};

const renderResolvedFieldValues = (conflict) => {
  if (conflict.conflictType === "zero_nr_quantity") {
    const currentValue = { label: "Current", value: "0" };
    const rangeValues = [
      conflict.minNrQuantity !== undefined && conflict.minNrQuantity !== null
        ? { label: "Min", value: String(conflict.minNrQuantity) }
        : null,
      conflict.maxNrQuantity !== undefined && conflict.maxNrQuantity !== null
        ? { label: "Max", value: String(conflict.maxNrQuantity) }
        : null,
    ].filter(Boolean);

    return (
      <Space direction="vertical" size={4}>
        <Tag key={`${conflict.key}-${currentValue.label}-${currentValue.value}`} bordered style={{ marginInlineEnd: 0, width: "fit-content", paddingInline: 5, lineHeight: "16px", fontSize: 11 }}>
          {currentValue.label}: {currentValue.value}
        </Tag>
        {rangeValues.length > 0 ? (
          <Space wrap size={[4, 4]}>
            {rangeValues.map((item) => (
              <Tag key={`${conflict.key}-${item.label}-${item.value}`} bordered style={{ marginInlineEnd: 0, paddingInline: 5, lineHeight: "16px", fontSize: 11 }}>
                {item.label}: {item.value}
              </Tag>
            ))}
          </Space>
        ) : null}
      </Space>
    );
  }

  const isCenterNodalConflict =
    conflict.conflictType === "unassigned_catch_nodal" ||
    conflict.conflictType === "college_multiple_centers" ||
    conflict.conflictType === "center_multiple_nodals";

  if (isCenterNodalConflict) {
    const catchCenterCodes = toArray(conflict.centerCodes || conflict.conflictingValues || []);
    const catchCenterNames = toArray(conflict.centerNames || []);

    return (
      <Space direction="vertical" size={4} style={{ width: "100%" }}>
        {catchCenterCodes.length > 0 ? (
          <div>
            <Text style={{ fontSize: 11, fontWeight: 600, color: "#334155", display: "block", marginBottom: 2 }}>
              Catch List Center Data:
            </Text>
            <Space wrap size={[2, 2]}>
              {catchCenterCodes.map((code, idx) => (
                <Tag key={idx} color="blue" style={{ fontSize: 11, padding: "2px 6px" }}>
                  Center {code} {catchCenterNames[idx] ? `- ${catchCenterNames[idx]}` : ""}
                </Tag>
              ))}
            </Space>
          </div>
        ) : (
          <Text type="secondary" style={{ fontSize: 11 }}>Missing in Nodal List</Text>
        )}
      </Space>
    );
  }

  const values = conflict.valuesForSelection;
  if (!values?.length) {
    return <Text type="secondary">-</Text>;
  }

  return (
    <Text style={{ fontSize: 11 }}>
      {conflict.field ? `${conflict.field}: ` : ""}{values.join(", ")}
    </Text>
  );
};

const renderActionCell = (conflict, selectedValue, loading, onSelectionChange, onResolve, centerNodalOptions = []) => {
  const isCenterNodalConflict =
    conflict.conflictType === "unassigned_catch_nodal" ||
    conflict.conflictType === "college_multiple_centers" ||
    conflict.conflictType === "center_multiple_nodals";

  if (isCenterNodalConflict) {
    const isCenterMultipleNodals = conflict.conflictType === "center_multiple_nodals";
    const catchCodes = toArray(conflict.centerCodes || (isCenterMultipleNodals ? [] : conflict.conflictingValues) || []);
    const catchNames = toArray(conflict.centerNames || []);

    const nodalCodesArr = toArray(conflict.nodalCodes || (isCenterMultipleNodals ? conflict.conflictingValues : []) || []);
    const nodalNamesArr = toArray(conflict.nodalNames || []);

    const defaultCenterCode = isCenterMultipleNodals
      ? String(conflict.centreCode || conflict.centerCode || "")
      : (catchCodes[0] ? String(catchCodes[0]) : "");
    const defaultCenterName = catchNames[0] || (defaultCenterCode ? `Center ${defaultCenterCode}` : "");

    const defaultNodalCode = isCenterMultipleNodals
      ? (nodalCodesArr[0] ? String(nodalCodesArr[0]) : "")
      : defaultCenterCode;
    const defaultNodalName = isCenterMultipleNodals
      ? (nodalNamesArr[0] || (defaultNodalCode ? `Nodal ${defaultNodalCode}` : ""))
      : (defaultCenterName ? `Nodal ${defaultCenterCode}` : "");

    const centerCodeVal =
      typeof selectedValue === "object" && selectedValue !== null && selectedValue.centerCode !== undefined
        ? selectedValue.centerCode
        : defaultCenterCode;

    const centerNameVal =
      typeof selectedValue === "object" && selectedValue !== null && selectedValue.centerName !== undefined
        ? selectedValue.centerName
        : defaultCenterName;

    const nodalCodeVal =
      typeof selectedValue === "object" && selectedValue !== null && selectedValue.nodalCode !== undefined
        ? selectedValue.nodalCode
        : defaultNodalCode;

    const nodalNameVal =
      typeof selectedValue === "object" && selectedValue !== null && selectedValue.nodalName !== undefined
        ? selectedValue.nodalName
        : defaultNodalName;

    // Options for Center AutoComplete
    const centerOptionsMap = new Map();

    if (conflict.records && conflict.records.length > 0) {
      conflict.records.forEach((r) => {
        const cCode = String(r.examCenterCode || r.ExamCenterCode || r.centerCode || "");
        const cName = r.examCenterName || r.ExamCenterName || r.centerName || "";
        if (cCode && !centerOptionsMap.has(cCode)) {
          centerOptionsMap.set(cCode, {
            value: cCode,
            label: cName ? `${cCode} - ${cName}` : cCode,
            centerName: cName,
          });
        }
      });
    }

    catchCodes.forEach((code, idx) => {
      const sCode = String(code);
      const name = catchNames[idx] || "";
      if (!centerOptionsMap.has(sCode)) {
        centerOptionsMap.set(sCode, {
          value: sCode,
          label: name ? `${sCode} - ${name} (Catch List)` : `${sCode} (Catch List)`,
          centerName: name,
        });
      }
    });
    (centerNodalOptions || []).forEach((opt) => {
      if (opt.centerCode && !centerOptionsMap.has(String(opt.centerCode))) {
        centerOptionsMap.set(String(opt.centerCode), {
          value: String(opt.centerCode),
          label: opt.centerName ? `${opt.centerCode} - ${opt.centerName}` : String(opt.centerCode),
          centerName: opt.centerName || "",
        });
      }
    });

    // Options for Nodal AutoComplete
    const nodalOptionsMap = new Map();
    if (conflict.records && conflict.records.length > 0) {
      conflict.records.forEach((r) => {
        const nCode = String(r.nodalCode || r.NodalCode || "");
        const nName = r.nodalName || r.NodalName || "";
        if (nCode && !nodalOptionsMap.has(nCode)) {
          nodalOptionsMap.set(nCode, {
            value: nCode,
            label: nName ? `${nCode} - ${nName}` : nCode,
            nodalName: nName,
          });
        }
      });
    }

    nodalCodesArr.forEach((code, idx) => {
      const sCode = String(code);
      const name = nodalNamesArr[idx] || "";
      if (!nodalOptionsMap.has(sCode)) {
        nodalOptionsMap.set(sCode, {
          value: sCode,
          label: name ? `${sCode} - ${name}` : sCode,
          nodalName: name,
        });
      }
    });

    (centerNodalOptions || []).forEach((opt) => {
      if (opt.nodalCode && !nodalOptionsMap.has(String(opt.nodalCode))) {
        nodalOptionsMap.set(String(opt.nodalCode), {
          value: String(opt.nodalCode),
          label: opt.nodalName ? `${opt.nodalCode} - ${opt.nodalName}` : String(opt.nodalCode),
          nodalName: opt.nodalName || "",
        });
      }
    });
    catchCodes.forEach((code) => {
      const sCode = String(code);
      if (!nodalOptionsMap.has(sCode)) {
        nodalOptionsMap.set(sCode, {
          value: sCode,
          label: `${sCode} (Catch List)`,
          nodalName: `Nodal ${sCode}`,
        });
      }
    });

    const isDisableResolve = isCenterMultipleNodals
      ? !String(nodalCodeVal).trim()
      : (!String(centerCodeVal).trim() && !String(nodalCodeVal).trim());

    const matchedCenterOpt = centerOptionsMap.get(String(centerCodeVal));
    const matchedNodalOpt = nodalOptionsMap.get(String(nodalCodeVal));

    const finalCenterNameVal = centerNameVal || matchedCenterOpt?.centerName || "";
    const finalNodalNameVal = nodalNameVal || matchedNodalOpt?.nodalName || "";

    const currentSelectionObj = {
      centerCode: centerCodeVal,
      centerName: finalCenterNameVal,
      nodalCode: nodalCodeVal,
      nodalName: finalNodalNameVal,
    };

    return (
      <Space direction="vertical" size={4} style={{ width: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Text style={{ fontSize: 10, color: "#475569", width: 42, flexShrink: 0, fontWeight: 600 }}>Center:</Text>
            {isCenterMultipleNodals ? (
              <Input
                size="small"
                style={{ width: "100%" }}
                value={centerCodeVal ? (finalCenterNameVal ? `${centerCodeVal} - ${finalCenterNameVal}` : centerCodeVal) : (conflict.centreCode ? `${conflict.centreCode}` : "")}
                disabled
              />
            ) : (
              <AutoComplete
                size="small"
                style={{ width: "100%" }}
                placeholder="Center Code"
                value={centerCodeVal}
                onChange={(val) => {
                  const opt = centerOptionsMap.get(String(val));
                  const newCenterName = opt ? opt.centerName : (String(val) === String(currentSelectionObj.centerCode) ? currentSelectionObj.centerName : "");
                  onSelectionChange(conflict.key, {
                    ...currentSelectionObj,
                    centerCode: val,
                    centerName: newCenterName,
                  });
                }}
                onSelect={(val, option) => {
                  const opt = centerOptionsMap.get(String(val));
                  const newCenterName = option?.centerName || opt?.centerName || currentSelectionObj.centerName || "";
                  onSelectionChange(conflict.key, {
                    ...currentSelectionObj,
                    centerCode: val,
                    centerName: newCenterName,
                  });
                }}
                options={Array.from(centerOptionsMap.values())}
                filterOption={(input, option) =>
                  String(option?.label ?? "").toLowerCase().includes(String(input || "").toLowerCase()) ||
                  String(option?.value ?? "").toLowerCase().includes(String(input || "").toLowerCase())
                }
                allowClear
              />
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Text style={{ fontSize: 10, color: "#475569", width: 42, flexShrink: 0, fontWeight: 600 }}>Nodal:</Text>
            <AutoComplete
              size="small"
              style={{ width: "100%" }}
              placeholder="Nodal Code"
              value={nodalCodeVal}
              onChange={(val) => {
                const opt = nodalOptionsMap.get(String(val));
                const newNodalName = opt ? opt.nodalName : (String(val) === String(currentSelectionObj.nodalCode) ? currentSelectionObj.nodalName : "");
                onSelectionChange(conflict.key, {
                  ...currentSelectionObj,
                  nodalCode: val,
                  nodalName: newNodalName,
                });
              }}
              onSelect={(val, option) => {
                const opt = nodalOptionsMap.get(String(val));
                const newNodalName = option?.nodalName || opt?.nodalName || currentSelectionObj.nodalName || "";
                onSelectionChange(conflict.key, {
                  ...currentSelectionObj,
                  nodalCode: val,
                  nodalName: newNodalName,
                });
              }}
              options={Array.from(nodalOptionsMap.values())}
              filterOption={(input, option) =>
                String(option?.label ?? "").toLowerCase().includes(String(input || "").toLowerCase()) ||
                String(option?.value ?? "").toLowerCase().includes(String(input || "").toLowerCase())
              }
              allowClear
            />
          </div>
        </div>

        <Button
          type="primary"
          size="small"
          icon={<CheckCircleOutlined />}
          disabled={isDisableResolve}
          loading={loading}
          onClick={() => onResolve(conflict, currentSelectionObj)}
          style={{ marginTop: 2, alignSelf: "flex-start" }}
        >
          Resolve
        </Button>
      </Space>
    );
  }

  const normalizedSelectedValue =
    selectedValue === undefined || selectedValue === null ? "" : String(selectedValue);
  const zeroQuantityHelp =
    conflict.conflictType === "zero_nr_quantity" &&
    conflict.minNrQuantity !== undefined &&
    conflict.minNrQuantity !== null &&
    conflict.maxNrQuantity !== undefined &&
    conflict.maxNrQuantity !== null
      ? `Min: ${conflict.minNrQuantity}, Max: ${conflict.maxNrQuantity}`
      : null;

  const rawOptions = [
    ...(conflict.valuesForSelection || []),
    ...(conflict.conflictingValues || []),
    ...(conflict.centerCodes || []),
    ...(conflict.nodalCodes || []),
  ];

  const options = Array.from(new Set(rawOptions.map(String).filter(Boolean))).map((value) => ({
    value,
    label: value,
  }));

  const placeholder =
    conflict.conflictType === "zero_nr_quantity"
      ? "Select or type NRQuantity"
      : conflict.conflictType === "center_multiple_nodals" || conflict.conflictType === "college_multiple_nodals"
      ? "Select or type Nodal"
      : conflict.conflictType === "college_multiple_centers" || conflict.conflictType === "unassigned_catch_nodal"
      ? "Select or type Center"
      : "Select or type value";

  return (
    <Space direction="vertical" size={4} style={{ width: "100%" }}>
      <Space wrap size={[4, 4]}>
        <AutoComplete
          size="small"
          style={{ width: 160 }}
          placeholder={placeholder}
          value={normalizedSelectedValue}
          onChange={(value) => onSelectionChange(conflict.key, value)}
          options={options}
          filterOption={(inputValue, option) =>
            String(option?.value ?? "").toLowerCase().includes(String(inputValue || "").toLowerCase())
          }
          allowClear
        />
        <Button
          type="primary"
          size="small"
          icon={<CheckCircleOutlined />}
          disabled={!normalizedSelectedValue || normalizedSelectedValue.trim() === ""}
          loading={loading}
          onClick={() => onResolve(conflict, normalizedSelectedValue.trim())}
        >
          Resolve
        </Button>
      </Space>
      {zeroQuantityHelp ? <Text type="secondary" style={{ fontSize: 11 }}>{zeroQuantityHelp}</Text> : null}
    </Space>
  );
};

const buildColumns = (conflictSelections, onSelectionChange, onResolve, onIgnore, loading, centerNodalOptions) => [
  {
    title: "Summary",
    key: "conflict",
    width: 320,
    render: (_, conflict) => {
      return (
        <Space direction="vertical" size={4}>
          <Text strong style={{ lineHeight: 1.2, fontSize: 13 }}>{conflict.summary}</Text>
          {shouldShowCatchNos(conflict) && (
            <Text style={{ fontSize: 11, lineHeight: 1.15, color: "rgba(0, 0, 0, 0.72)" }}>
              Catch Nos: {formatCatchNosLabel(conflict.catchNos)}
            </Text>
          )}
        </Space>
      );
    },
  },
  {
    title: "Status",
    key: "status",
    width: 90,
    render: (_, conflict) => {
      const statusConfig = STATUS_TAG_CONFIG[conflict.status] || STATUS_TAG_CONFIG[CONFLICT_STATUS.PENDING];

      return (
        <Tag color={statusConfig.color} style={{ marginInlineEnd: 0, paddingInline: 5, lineHeight: "16px", fontSize: 11 }}>
          {statusConfig.label}
        </Tag>
      );
    },
  },
  {
    title: "Details",
    key: "details",
    width: 260,
    render: (_, conflict) => renderMetaTags(conflict),
  },
  {
    title: "Conflicting Fields",
    key: "resolvedField",
    width: 260,
    render: (_, conflict) =>
      renderResolvedFieldValues(
        conflict,
        conflictSelections[conflict.key],
        onSelectionChange,
        centerNodalOptions
      ),
  },
  {
    title: "Action",
    key: "action",
    width: 270,
    render: (_, conflict) =>
      renderActionCell(
        conflict,
        conflictSelections[conflict.key],
        loading,
        onSelectionChange,
        onResolve,
        centerNodalOptions
      ),
  },
];

const DataImportConflictReport = ({
  conflicts,
  conflictSelections,
  onSelectionChange,
  onResolve,
  onIgnore,
  loading,
  extraTabContent,
  centerNodalOptions = [],
}) => {
  if (!conflicts) {
    return <Text type="secondary">Click "Load Conflict" to see conflicts.</Text>;
  }

  const rawErrors = Array.isArray(conflicts) ? conflicts : conflicts?.errors || conflicts?.Errors || [];

  if (!rawErrors.length) {
    return <Empty description="No conflicts found" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  const normalizedConflicts = rawErrors.map(normalizeConflict);
  const groupedConflicts = normalizedConflicts.reduce((acc, conflict) => {
    const groupKey = conflict.groupLabel;
    if (!acc[groupKey]) {
      acc[groupKey] = [];
    }
    acc[groupKey].push(conflict);
    return acc;
  }, {});

  if (extraTabContent) {
    Object.keys(extraTabContent).forEach((key) => {
      if (!groupedConflicts[key]) {
        groupedConflicts[key] = [];
      }
    });
  }

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Tabs
        items={Object.entries(groupedConflicts).map(([groupLabel, items]) => ({
          key: groupLabel,
          label: `${groupLabel} (${items.length})`,
          children: (
            <div className="flex flex-col gap-4">
              {extraTabContent && extraTabContent[groupLabel]}
              {items.length > 0 && (
                <Collapse
                  size="small"
                  activeKey={Array.from(new Set(items.map((item) => item.meta.title)))}
                  items={Object.entries(
                    items.reduce((acc, conflict) => {
                      const typeKey = conflict.meta.title;
                      if (!acc[typeKey]) {
                        acc[typeKey] = [];
                      }
                      acc[typeKey].push(conflict);
                      return acc;
                    }, {})
                  ).map(([typeLabel, typeItems]) => ({
                    key: typeLabel,
                    label: `${typeLabel} (${typeItems.length})`,
                    children: (
                      <Table
                        loading={loading}
                        columns={buildColumns(
                          conflictSelections,
                          onSelectionChange,
                          onResolve,
                          onIgnore,
                          loading,
                          centerNodalOptions
                        )}
                        dataSource={typeItems}
                        rowKey="key"
                        pagination={false}
                        size="small"
                        scroll={{ x: 1230 }}
                        rowClassName={() => "compact-conflict-row"}
                        style={{ width: "100%" }}
                      />
                    ),
                  }))}
                />
              )}
            </div>
          ),
        }))}
      />
      <style>
        {`
          .ant-collapse-small > .ant-collapse-item > .ant-collapse-header {
            padding: 8px 10px !important;
            font-size: 12px;
          }

          .ant-collapse-small > .ant-collapse-item > .ant-collapse-content > .ant-collapse-content-box {
            padding: 6px 0 0 0 !important;
          }

          .compact-conflict-row > td {
            padding: 6px 8px !important;
            vertical-align: top;
          }

          .compact-conflict-row .ant-space-vertical {
            gap: 2px !important;
          }

          .compact-conflict-row .ant-typography {
            margin-bottom: 0;
          }

          .compact-conflict-row .ant-btn-sm {
            height: 22px;
            padding: 0 7px;
            font-size: 11px;
          }

          .compact-conflict-row .ant-select-sm,
          .compact-conflict-row .ant-input-sm {
            font-size: 11px;
          }
        `}
      </style>
    </Space>
  );
};

export default DataImportConflictReport;
