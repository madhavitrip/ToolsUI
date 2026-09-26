import React, { useState } from "react";
import { Button, Card, Checkbox, Input, InputNumber, Select, Space, Switch, Table, Typography } from "antd";
import { CloseOutlined, DeleteOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";

// Map raw SQL expressions or calc: values to friendly display labels
const RAW_EXPR_LABELS = {
  "calc:BOX_RANGE": "Box Range",
  "CONCAT(MIN(b.BoxNo),' to ',MAX(b.BoxNo))": "Box Range",
  "calc:TOTAL_BOXES": "Total Boxes",
  "COUNT(DISTINCT b.BoxNo)": "Total Boxes",
  "calc:BOX_NUMBERS": "Box Numbers",
  "calc:BOX_LABEL": "No of boxes",
  "calc:SRNO": "Serial No (Sr No)",
  "calc:PACKING_DENOMINATION": "Packing Denomination",
};

// Strip table prefix (n., e., eb., b., x., c.) from a saved value for display
const stripPrefix = (value) => {
  if (!value) return value;
  const str = String(value);
  if (RAW_EXPR_LABELS[str]) return RAW_EXPR_LABELS[str];
  return str.replace(/^(eb\.|n\.|e\.|b\.|x\.|c\.)/, "");
};


const TemplatesMappingPanel = ({
  showMappingPanel,
  mappingTemplate,
  mappingNotFound,
  mappingOptionsLoading,
  parsedFields,
  mappingRows,
  sourceOptionGroups,
  mappingSelections,
  setMappingSelections,
  mappedFieldNames,
  groupBySelections,
  setGroupBySelections,
  orderBySelections,
  setOrderBySelections,
  labelCopies,
  setLabelCopies,
  qrConfiguration,
  setQrConfiguration,
  staticVariables = {},
  setStaticVariables,
  filterMode,
  setFilterMode,
  showDuplicateToggle = false,
  duplicateLabelsEnabled = true,
  onDuplicateLabelsChange,
  handleSaveMapping,
  useBoxLabelSP,
  setUseBoxLabelSP,
  savingMapping = false,
  handleRefreshFields,
  parsedFieldsLoading,
  mappingLoading,
  closeMappingPanel,
}) => {
  if (!showMappingPanel) return null;

  // Normalize: orderBySelections can be [{column, direction}] (legacy) or plain string[]
  const orderByColumns = Array.isArray(orderBySelections)
    ? orderBySelections.map((item) =>
      typeof item === "string" ? item : item?.column
    ).filter(Boolean)
    : [];

  // labelRender: always show clean name without prefix, even for saved values not in current options
  const labelRender = (props) => {
    const label = props.label || stripPrefix(props.value);
    return <span>{label}</span>;
  };

  const optionRender = (option) => {
    const valStr = String(option.data.value || "");
    const match = valStr.match(/^(calc:|eb\.|n\.|e\.|b\.|x\.|c\.)/);
    const prefix = match ? match[1].replace(".", "") : "";
    return (
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
        <span>{option.data.label}</span>
        {prefix && (
          <Typography.Text type="secondary" style={{ fontSize: 10, marginLeft: 8, opacity: 0.6 }}>
            {prefix === "calc:" ? "calc" : prefix}
          </Typography.Text>
        )}
      </div>
    );
  };

  return (
    <Card
      style={{ borderRadius: 8 }}
      bodyStyle={{ padding: 0 }}
      headStyle={{ padding: "6px 12px" }}
      className="rpt-mapping-card"
      title={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography.Text strong style={{ fontSize: 13, lineHeight: "16px" }}>
            Template Mapping ({mappingTemplate?.templateName || "Selected template"})
          </Typography.Text>
          <Button size="small" icon={<CloseOutlined />} onClick={closeMappingPanel} />
        </div>
      }
    >
      <div className="rpt-mapping-card-body">
        {mappingNotFound && (
          <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
            No saved mapping found for this template yet.
          </Typography.Text>
        )}

        {showDuplicateToggle && (
          <Card size="small" style={{ marginBottom: 8 }} bodyStyle={{ padding: 8 }}>
            <Space style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <Typography.Text strong>Duplicate box labels</Typography.Text>
                <Typography.Text type="secondary" style={{ display: "block" }}>
                  Generates two identical labels for each box.
                </Typography.Text>
              </div>
              <Switch checked={duplicateLabelsEnabled} onChange={onDuplicateLabelsChange} />
            </Space>
          </Card>
        )}

        <Card size="small" style={{ marginBottom: 8 }} bodyStyle={{ padding: 8 }}>
          <div style={{ position: "sticky", top: -14, zIndex: 10, backgroundColor: "#fff", margin: "-8px -8px 8px -8px", padding: "8px 8px 4px 8px", borderBottom: "1px solid #f0f0f0" }}>
            <Space style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <Typography.Text strong>Field Mapping</Typography.Text>
              <Space size={8}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>Label Copies:</Typography.Text>
                <InputNumber
                  min={1}
                  max={20}
                  value={labelCopies ?? 1}
                  onChange={(val) => setLabelCopies && setLabelCopies(Number.isFinite(val) && val >= 1 ? Math.round(val) : 1)}
                  style={{ width: 60 }}
                  size="small"
                />
                <Button
                  type="primary"
                  onClick={handleSaveMapping}
                  htmlType="button"
                  loading={savingMapping}
                  disabled={!mappingTemplate?.templateId}
                >
                  Save Mapping
                </Button>
              </Space>
            </Space>
            <Typography.Text type="secondary" style={{ fontSize: 11, display: "block" }}>
              ☑ Check the box before a field name to enter a fixed text value instead of mapping to a column.
            </Typography.Text>
          </div>
          {mappingOptionsLoading ? (
            <Typography.Text type="secondary">Loading available columns...</Typography.Text>
          ) : parsedFields.length === 0 ? (
            <Typography.Text type="secondary">
              No parsed fields to map for this template.
            </Typography.Text>
          ) : (
            <Table
              dataSource={mappingRows}
              pagination={false}
              size="small"
              columns={[
                {
                  title: "RPT Field",
                  dataIndex: "field",
                  key: "field",
                  width: "45%",
                  render: (value, record) => {
                    const isStatic = Object.prototype.hasOwnProperty.call(
                      staticVariables || {},
                      value
                    );

                    return (
                      <Space size={6}>
                        <Checkbox
                          checked={isStatic}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setMappingSelections((prev) => {
                                const next = { ...prev };
                                delete next[value];
                                return next;
                              });

                              setStaticVariables?.((prev) => ({
                                ...prev,
                                [value]: "",
                              }));
                            } else {
                              setStaticVariables?.((prev) => {
                                const next = { ...prev };
                                delete next[value];
                                return next;
                              });
                            }
                          }}
                        />

                        <Typography.Text style={{ fontSize: 12 }}>
                          {value}{" "}
                          {record.isRequired ? (
                            <Typography.Text type="danger">*</Typography.Text>
                          ) : (
                            ""
                          )}
                        </Typography.Text>
                      </Space>
                    );
                  },
                },
                {
                  title: "Map To Column",
                  dataIndex: "mapTo",
                  key: "mapTo",
                  render: (_, record) => {
                    const isStatic = Object.prototype.hasOwnProperty.call(
                      staticVariables || {},
                      record.field
                    );

                    if (isStatic) {
                      return (
                        <Input
                          size="small"
                          placeholder="Enter fixed value..."
                          value={staticVariables[record.field] ?? ""}
                          onChange={(e) =>
                            setStaticVariables?.((prev) => ({
                              ...prev,
                              [record.field]: e.target.value,
                            }))
                          }
                        />
                      );
                    }

                    return (
                        <Select
                          showSearch
                          allowClear
                          placeholder="Select source column"
                          value={mappingSelections[record.field]}
                          options={sourceOptionGroups}
                          labelRender={labelRender}
                          optionRender={optionRender}
                        style={{ width: "100%" }}
                        filterOption={(input, option) =>
                          (option?.label ?? "")
                            .toString()
                            .toLowerCase()
                            .includes(input.toLowerCase())
                        }
                        onChange={(value) =>
                          setMappingSelections((prev) => ({
                            ...prev,
                            [record.field]: value,
                          }))
                        }
                      />
                    );
                  },
                },
              ]}
            />
          )}
        </Card>

        <div style={{ marginBottom: 8 }}>
          <Typography.Text strong>Mapped Fields:</Typography.Text>
          <Typography.Text
            type="secondary"
            style={{ display: "block", marginTop: 4, lineHeight: "1.4em" }}
          >
            {mappedFieldNames.length > 0 ? mappedFieldNames.join(", ") : "None"}
          </Typography.Text>
        </div>

        <Card size="small" style={{ marginBottom: 8 }} bodyStyle={{ padding: 8 }}>
          <Checkbox
            checked={useBoxLabelSP}
            onChange={(e) => setUseBoxLabelSP?.(e.target.checked)}
          >
            <Typography.Text strong>Use Box Label SP</Typography.Text>
            <Typography.Text type="secondary" style={{ display: "block", fontSize: 11 }}>
              Enable to fetch data via Box Label Stored Procedure.
            </Typography.Text>
          </Checkbox>
        </Card>

        {/* QR Code Settings Section */}
        <Card size="small" style={{ marginBottom: 8 }} bodyStyle={{ padding: 8 }}>
          <Space style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <Typography.Text strong>QR Code Settings</Typography.Text>
            <Switch
              checked={qrConfiguration?.enabled ?? false}
              onChange={(enabled) => setQrConfiguration?.({ ...(qrConfiguration || {}), enabled })}
              checkedChildren="Enabled"
              unCheckedChildren="Disabled"
            />
          </Space>

          {qrConfiguration?.enabled && (
            <>
              <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8, fontSize: 11 }}>
                Select fields to combine into the dynamically generated QrCodeImage.
              </Typography.Text>

              <div style={{ marginBottom: 8 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>Fields to Add:</Typography.Text>
                <Select
                  mode="multiple"
                  allowClear
                  placeholder="Choose fields for QR"
                  options={sourceOptionGroups}
                  labelRender={labelRender}
                  optionRender={optionRender}
                  value={qrConfiguration?.qrFields || []}
                  onChange={(fields) => setQrConfiguration?.({ ...(qrConfiguration || {}), qrFields: fields })}
                  style={{ width: "100%", marginTop: 4 }}
                  filterOption={(input, option) =>
                    (option?.label ?? "").toString().toLowerCase().includes(input.toLowerCase())
                  }
                />
              </div>

              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>Separator:</Typography.Text>
                <Input
                  size="small"
                  value={qrConfiguration?.separator ?? "|"}
                  onChange={(e) => setQrConfiguration?.({ ...(qrConfiguration || {}), separator: e.target.value })}
                  style={{ width: 60 }}
                />
              </div>
            </>
          )}
        </Card>

        <Card size="small" style={{ marginBottom: 8 }} bodyStyle={{ padding: 8 }}>
          <Checkbox
            checked={filterMode === "ExtrasOnly"}
            onChange={(e) => setFilterMode?.(e.target.checked ? "ExtrasOnly" : null)}
          >
            <Typography.Text strong>Extra center only</Typography.Text>
            <Typography.Text type="secondary" style={{ display: "block", fontSize: 11 }}>
              Print center codes where Extra ID is not null only.
            </Typography.Text>
          </Checkbox>
        </Card>

        <Card size="small" style={{ marginBottom: 8 }} bodyStyle={{ padding: 8 }}>
          <Typography.Text strong>Group By</Typography.Text>
          <Typography.Text type="secondary" style={{ display: "block" }}>
            Select one or more columns to group the report output.
          </Typography.Text>
          <Select
            mode="multiple"
            allowClear
            placeholder="Choose group by columns"
            options={sourceOptionGroups}
            labelRender={labelRender}
            optionRender={optionRender}
            value={groupBySelections}
            onChange={(values) => setGroupBySelections(values)}
            style={{ width: "100%", marginTop: 8 }}
            filterOption={(input, option) =>
              (option?.label ?? "").toString().toLowerCase().includes(input.toLowerCase())
            }
          />
        </Card>

        <Card size="small" style={{ marginBottom: 8 }} bodyStyle={{ padding: 8 }}>
          <Typography.Text strong>Order By</Typography.Text>
          <Typography.Text type="secondary" style={{ display: "block" }}>
            Select one or more columns to sort the report output (ascending).
          </Typography.Text>
          <Select
            mode="multiple"
            allowClear
            placeholder="Choose order by columns"
            options={sourceOptionGroups}
            labelRender={labelRender}
            optionRender={optionRender}
            value={orderByColumns}
            onChange={(values) => setOrderBySelections(values)}
            style={{ width: "100%", marginTop: 8 }}
            filterOption={(input, option) =>
              (option?.label ?? "").toString().toLowerCase().includes(input.toLowerCase())
            }
          />
        </Card>

        <div style={{ marginTop: 12 }} />
      </div>
    </Card>
  );
};

export default TemplatesMappingPanel;
