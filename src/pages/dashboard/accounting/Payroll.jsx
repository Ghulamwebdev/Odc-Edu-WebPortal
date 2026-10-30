import React, { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import dayjs from "dayjs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  getTeacherPayroll,
  getPaymentMethods,
  payTeacherPayroll,
  deleteTeacherPayroll,
  getAccountingTypes,
  getHeadsOfAccount,
  createHeadOfAccount,
} from "../../../services/accountingService";
import { DeleteOutlined } from "@ant-design/icons";

const { Text } = Typography;

const getDefaultPayrollMonth = () =>
  dayjs().startOf("month");
const formatCurrency = (value) =>
  `Rs ${Number(value || 0).toLocaleString("en-PK")}`;
const isSalaryHeadName = (name) => /^salary$/i.test(String(name || "").trim());
const isSalaryLikeHeadName = (name) =>
  /(salary|payroll|wages?)/i.test(String(name || "").trim());
const getMonthLabel = (year, month) =>
  dayjs(`${year}-${String(month).padStart(2, "0")}-01`).format("MMMM YYYY");

const Payroll = () => {
  const [payrollData, setPayrollData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [expenseTypeId, setExpenseTypeId] = useState(null);
  const [allHeads, setAllHeads] = useState([]);
  const [accountingTypes, setAccountingTypes] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(getDefaultPayrollMonth());
  const [selectedTeacherId, setSelectedTeacherId] = useState(null);
  const [selectedHeadTypeId, setSelectedHeadTypeId] = useState(null);
  const [form] = Form.useForm();
  const watchedBaseAmount = Form.useWatch("amount", form);
  const watchedDeductionAmount = Form.useWatch("deductionAmount", form);
  const watchedBonusAmount = Form.useWatch("bonusAmount", form);

  const computedFinalPaymentAmount = useMemo(() => {
    const baseAmount = Math.max(0, Number(watchedBaseAmount || 0));
    const deductionAmount = Math.max(0, Number(watchedDeductionAmount || 0));
    const bonusAmount = Math.max(0, Number(watchedBonusAmount || 0));
    return Math.max(0, baseAmount - deductionAmount + bonusAmount);
  }, [watchedBaseAmount, watchedDeductionAmount, watchedBonusAmount]);

  const getPreferredPaymentMethodId = (methods = paymentMethods) =>
    methods.find((m) => m.isDefault)?._id || methods[0]?._id || null;

  const getPreferredSalaryHead = (heads = allHeads) => {
    const exactSalaryHead = heads.find(
      (head) =>
        head.isActive !== false &&
        isSalaryHeadName(head.name) &&
        String(
          typeof head.type === "object" && head.type?._id
            ? head.type._id
            : head.type,
        ) === String(expenseTypeId),
    );
    if (exactSalaryHead) return exactSalaryHead;

    const salaryLikeHead = heads.find(
      (head) =>
        head.isActive !== false &&
        isSalaryLikeHeadName(head.name) &&
        String(
          typeof head.type === "object" && head.type?._id
            ? head.type._id
            : head.type,
        ) === String(expenseTypeId),
    );
    if (salaryLikeHead) return salaryLikeHead;

    return (
      heads.find(
        (head) =>
          head.isActive !== false &&
          String(
            typeof head.type === "object" && head.type?._id
              ? head.type._id
              : head.type,
          ) === String(expenseTypeId),
      ) ||
      heads.find((head) => head.isActive !== false) ||
      null
    );
  };

  const getVisibleHeadOptions = () => {
    const activeHeads = allHeads.filter((head) => head.isActive !== false);
    const filteredHeads = selectedHeadTypeId
      ? activeHeads.filter(
          (head) =>
            String(
              typeof head.type === "object" && head.type?._id
                ? head.type._id
                : head.type,
            ) === String(selectedHeadTypeId),
        )
      : activeHeads;

    const headsToShow = filteredHeads.length > 0 ? filteredHeads : activeHeads;

    return headsToShow.map((head) => {
      const typeLabel =
        typeof head.type === "object" ? head.type?.name : head.typeLabel || "";
      return {
        label: typeLabel ? `${head.name} (${typeLabel})` : head.name,
        value: head._id,
      };
    });
  };

  const loadAccountingReferences = async () => {
    const [paymentMethodsRes, typesRes, headsRes] = await Promise.all([
      getPaymentMethods(),
      getAccountingTypes(),
      getHeadsOfAccount(null, false),
    ]);

    if (paymentMethodsRes?.success) {
      setPaymentMethods(paymentMethodsRes.data || []);
    }

    const allTypes = typesRes?.success ? typesRes.data || [] : [];
    setAccountingTypes(allTypes);

    const expenseType = allTypes.find(
      (item) => String(item?.name || "").trim().toLowerCase() === "expense",
    );
    setExpenseTypeId(expenseType?._id || null);
    setAllHeads(headsRes?.success ? headsRes.data || [] : []);
  };

  const ensureSalaryHeadConfigured = async () => {
    const existingExactHead = allHeads.find(
      (head) => head.isActive !== false && isSalaryHeadName(head.name),
    );
    if (existingExactHead) {
      return existingExactHead;
    }

    if (!expenseTypeId) {
      throw new Error(
        "Expense accounting type is missing. Please configure accounting types first.",
      );
    }

    const createRes = await createHeadOfAccount({
      name: "Salary",
      type: expenseTypeId,
      description: "Staff and teacher salaries",
    });

    if (!createRes?.success) {
      throw new Error(
        createRes?.message ||
          "Failed to create the Salary expense head automatically.",
      );
    }

    const createdHead = createRes.data || {
      _id: createRes.head?._id,
      name: "Salary",
      type: expenseTypeId,
      isActive: true,
    };

    setAllHeads((prev) => [...prev, createdHead].filter(Boolean));
    return createdHead;
  };

  const fetchPayroll = async (monthValue = selectedMonth) => {
    setLoading(true);
    try {
      const res = await getTeacherPayroll({
        page: 1,
        limit: 50,
        year: monthValue.year(),
        month: monthValue.month() + 1,
      });
      if (res?.success) {
        setPayrollData(res.data || []);
      }
    } catch (error) {
      message.error(error.message || "Failed to load payroll data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayroll();
    loadAccountingReferences().catch((error) => {
      message.error(error.message || "Failed to load payroll payment options");
    });
  }, []);

  const openPaymentModal = async (record) => {
    let preferredSalaryHead = getPreferredSalaryHead();
    if (!preferredSalaryHead) {
      try {
        preferredSalaryHead = await ensureSalaryHeadConfigured();
      } catch (error) {
        console.error("Failed to auto-configure salary head:", error);
      }
    }

    const preferredHeadTypeId =
      (preferredSalaryHead &&
        (typeof preferredSalaryHead.type === "object"
          ? preferredSalaryHead.type?._id
          : preferredSalaryHead.type)) ||
      expenseTypeId ||
      null;

    setSelectedRecord(record);
    setSelectedHeadTypeId(preferredHeadTypeId);
    form.setFieldsValue({
      paymentDate: dayjs(),
      amount: record.payroll.remainingAmount || 0,
      deductionAmount: 0,
      deductionNote: "",
      bonusAmount: 0,
      bonusNote: "",
      paymentMethodId: getPreferredPaymentMethodId(),
      head: preferredSalaryHead?._id,
      headTypeId: preferredHeadTypeId,
      details: `Salary payout for ${record.month.displayLabel}`,
      year: record.month.year,
      month: record.month.month,
    });
    setPaymentModalVisible(true);
  };

  const openDetailsModal = (record) => {
    setSelectedRecord(record);
    setDetailsModalVisible(true);
  };

  const closeDetailsModal = () => {
    setDetailsModalVisible(false);
  };

  const handlePayment = async () => {
    try {
      const values = await form.validateFields();
      const baseAmount = Number(values.amount || 0);
      const deductionAmount = Math.max(0, Number(values.deductionAmount || 0));
      const bonusAmount = Math.max(0, Number(values.bonusAmount || 0));
      const paymentAmount = baseAmount - deductionAmount + bonusAmount;

      if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
        message.error("Please enter a valid salary payment amount.");
        return;
      }

      if (deductionAmount > baseAmount) {
        message.error("Deduction amount cannot be greater than base salary amount.");
        return;
      }

      if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
        message.error("Final salary amount must be greater than zero.");
        return;
      }

      if (baseAmount > Number(selectedRecord?.payroll?.remainingAmount || 0)) {
        message.error("Base salary amount cannot exceed the remaining amount.");
        return;
      }

      const selectedPaymentMethodId =
        values.paymentMethodId || getPreferredPaymentMethodId();
      if (!selectedPaymentMethodId) {
        message.error(
          "No academy account is available for salary payment. Please create Cash or Bank account first.",
        );
        return;
      }

      const salaryHead =
        allHeads.find((head) => String(head._id) === String(values.head || "")) ||
        (await ensureSalaryHeadConfigured());

      const payload = {
        ...values,
        amount: paymentAmount,
        baseAmount,
        deductionAmount,
        bonusAmount,
        head: salaryHead._id,
        headId: salaryHead._id,
        type:
          values.headTypeId ||
          (salaryHead.type && (salaryHead.type._id || salaryHead.type)),
        paymentMethodId: selectedPaymentMethodId,
        paymentDate: values.paymentDate.toISOString(),
      };

      const res = await payTeacherPayroll(selectedRecord.teacher._id, payload);
      if (res?.success) {
        message.success(res.message || "Payment successful");
        setPaymentModalVisible(false);
        await fetchPayroll(selectedMonth);
      }
    } catch (error) {
      message.error(error.message || "Failed to process salary payment");
    }
  };

  const handleDeletePayroll = async (record) => {
    try {
      const res = await deleteTeacherPayroll(record?._id, {
        teacherId: record?.teacher?._id,
        year: record?.month?.year,
        month: record?.month?.month,
      });
      if (res?.success) {
        message.success(res.message || "Payroll entry deleted successfully");
        await fetchPayroll(selectedMonth);
      }
    } catch (error) {
      message.error(error.message || "Failed to delete payroll record");
    }
  };

  const filteredPayrollData = useMemo(
    () =>
      selectedTeacherId
        ? payrollData.filter(
            (item) =>
              String(item.teacher?._id) === String(selectedTeacherId),
          )
        : payrollData,
    [payrollData, selectedTeacherId],
  );

  const teacherOptions = payrollData.map((item) => ({
    label: item.teacher?.fullName || "Unknown Teacher",
    value: item.teacher?._id,
  }));

  const exportPayrollDetailsPdf = (record) => {
    try {
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const title = `${record.teacher.fullName} Payroll Detail`;
      const monthLabel = record.month?.displayLabel || "Payroll";

      doc.setFillColor(20, 45, 120);
      doc.rect(0, 0, 210, 32, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(title, 14, 16);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(monthLabel, 14, 24);

      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.text(
        `Generated: ${dayjs().format("DD MMM YYYY hh:mm A")}`,
        14,
        40,
      );

      autoTable(doc, {
        startY: 46,
        theme: "grid",
        head: [["Field", "Value"]],
        body: [
          ["Teacher", record.teacher.fullName || "N/A"],
          ["Teacher ID", record.teacher.teacherId || "N/A"],
          [
            "Salary Type",
            record.salaryConfig?.salaryType === "per_student"
              ? "Per Student"
              : "Fixed",
          ],
          [
            "Current Month Salary",
            formatCurrency(record.payroll.baseDueAmount || 0),
          ],
          [
            "Carry From Previous Month",
            formatCurrency(record.payroll.carryForwardInAmount || 0),
          ],
          ["Total Due", formatCurrency(record.payroll.dueAmount || 0)],
          ["Paid", formatCurrency(record.payroll.paidAmount || 0)],
          ["Remaining", formatCurrency(record.payroll.remainingAmount || 0)],
          [
            "Next Month Carry",
            formatCurrency(record.payroll.carryForwardEligibleAmount || 0),
          ],
          [
            "Carry Source",
            record.payroll.carryForwardSourceMonth
              ? getMonthLabel(
                  record.payroll.carryForwardSourceMonth.year,
                  record.payroll.carryForwardSourceMonth.month,
                )
              : "None",
          ],
          ...(record.salaryConfig?.salaryType === "per_student"
            ? [
                ["Active Students", String(record.summary?.totalActiveStudents || 0)],
                ["Eligible Students", String(record.summary?.eligibleStudents || 0)],
              ]
            : []),
        ],
        headStyles: {
          fillColor: [20, 45, 120],
          textColor: [255, 255, 255],
        },
      });

      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 8,
        theme: "grid",
        head: [["Payment Date", "Account", "Final Amount", "Adjustments", "Details"]],
        body:
          (record.payroll.paymentEntries || []).map((entry) => [
            entry.paymentDate
              ? dayjs(entry.paymentDate).format("DD MMM YYYY")
              : "N/A",
            entry.paymentMethodName || "N/A",
            formatCurrency(entry.amount || 0),
            [
              `Base: ${formatCurrency(entry.baseAmount || entry.amount || 0)}`,
              Number(entry.deductionAmount || 0) > 0
                ? `Deduction: ${formatCurrency(entry.deductionAmount)}${entry.deductionNote ? ` (${entry.deductionNote})` : ""}`
                : null,
              Number(entry.bonusAmount || 0) > 0
                ? `Bonus: ${formatCurrency(entry.bonusAmount)}${entry.bonusNote ? ` (${entry.bonusNote})` : ""}`
                : null,
            ]
              .filter(Boolean)
              .join("\n"),
            entry.details || "-",
          ]) || [],
        headStyles: {
          fillColor: [15, 118, 110],
          textColor: [255, 255, 255],
        },
      });

      doc.save(
        `${record.teacher.fullName.replace(/\s+/g, "_")}_Payroll_${record.month.year}_${String(
          record.month.month,
        ).padStart(2, "0")}.pdf`,
      );
    } catch (error) {
      console.error("Payroll PDF error:", error);
      message.error("Failed to generate payroll PDF");
    }
  };

  const columns = [
    {
      title: "Teacher",
      dataIndex: ["teacher", "fullName"],
      key: "teacher",
      render: (_, record) => record.teacher.fullName,
    },
    {
      title: "Course Count",
      dataIndex: ["summary", "totalAssignedCourses"],
      key: "courses",
      render: (value, record) =>
        record.salaryConfig?.salaryType === "per_student" ? value : "—",
    },
    {
      title: "Active Students",
      dataIndex: ["summary", "totalActiveStudents"],
      key: "activeStudents",
      render: (value, record) =>
        record.salaryConfig?.salaryType === "per_student" ? value : "—",
    },
    {
      title: "Eligible Students",
      dataIndex: ["summary", "eligibleStudents"],
      key: "eligibleStudents",
      render: (value, record) =>
        record.salaryConfig?.salaryType === "per_student" ? value : "—",
    },
    {
      title: "Salary Type",
      dataIndex: ["salaryConfig", "salaryType"],
      key: "salaryType",
      render: (value) => (
        <Tag color={value === "per_student" ? "blue" : "green"}>
          {value === "per_student" ? "Per Student" : "Fixed"}
        </Tag>
      ),
    },
    {
      title: "Due",
      dataIndex: ["payroll", "dueAmount"],
      key: "dueAmount",
      render: (_, record) => (
        <div>
          <div>{formatCurrency(record.payroll.dueAmount)}</div>
          <div className="text-xs text-gray-500">
            Salary: {formatCurrency(record.payroll.baseDueAmount || 0)}
            {record.payroll.carryForwardInAmount > 0
              ? ` | Carry: ${formatCurrency(record.payroll.carryForwardInAmount)}`
              : ""}
          </div>
        </div>
      ),
    },
    {
      title: "Paid",
      dataIndex: ["payroll", "paidAmount"],
      key: "paidAmount",
      render: (value) => formatCurrency(value),
    },
    {
      title: "Remaining",
      dataIndex: ["payroll", "remainingAmount"],
      key: "remainingAmount",
      render: (_, record) => (
        <div>
          <div>{formatCurrency(record.payroll.remainingAmount)}</div>
          <div className="text-xs text-gray-500">
            Next carry:{" "}
            {formatCurrency(record.payroll.carryForwardEligibleAmount || 0)}
          </div>
        </div>
      ),
    },
    {
      title: "Status",
      dataIndex: ["payroll", "status"],
      key: "status",
      render: (value) => {
        const color =
          value === "paid" ? "green" : value === "partial" ? "orange" : "red";
        return <Tag color={color}>{String(value || "").toUpperCase()}</Tag>;
      },
    },
    {
      title: "Action",
      key: "action",
      render: (_, record) => (
        <Space wrap>
          <Button onClick={() => openDetailsModal(record)}>View</Button>
          <Button
            type="primary"
            onClick={() => openPaymentModal(record)}
            disabled={record.payroll.remainingAmount <= 0}
          >
            Pay
          </Button>
          <Popconfirm
            title="Delete payroll record?"
            description="This will remove the payroll entry from the table and reverse any linked payroll transactions."
            okText="Delete"
            cancelText="Cancel"
            onConfirm={() => handleDeletePayroll(record)}
          >
            <Button
              danger
              icon={<DeleteOutlined />}
            >
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card>
          <Statistic title="Total Teachers" value={filteredPayrollData.length} />
        </Card>
        <Card>
          <Statistic
            title="Total Remaining"
            value={filteredPayrollData.reduce(
              (sum, item) => sum + Number(item.payroll.remainingAmount || 0),
              0,
            )}
            precision={0}
          />
        </Card>
        <Card>
          <Statistic
            title="Total Paid"
            value={filteredPayrollData.reduce(
              (sum, item) => sum + Number(item.payroll.paidAmount || 0),
              0,
            )}
            precision={0}
          />
        </Card>
      </div>

      <Card
        title={`Teacher Payroll (${selectedMonth.format("MMMM YYYY")})`}
        extra={
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <Select
              allowClear
              placeholder="All teachers"
              value={selectedTeacherId}
              onChange={(value) => setSelectedTeacherId(value || null)}
              options={teacherOptions}
              className="min-w-[220px]"
              showSearch
              optionFilterProp="label"
            />
            <DatePicker
              picker="month"
              allowClear={false}
              value={selectedMonth}
              format="MMMM YYYY"
              onChange={(value) => {
                const nextMonth = value || getDefaultPayrollMonth();
                setSelectedMonth(nextMonth);
                fetchPayroll(nextMonth);
              }}
            />
          </div>
        }
      >
        <Table
          columns={columns}
          dataSource={filteredPayrollData}
          rowKey={(record) => record.teacher._id}
          loading={loading}
          pagination={false}
        />
      </Card>

      <Modal
        title={
          selectedRecord
            ? `Pay Salary - ${selectedRecord.teacher.fullName}`
            : "Pay Salary"
        }
        open={paymentModalVisible}
        onCancel={() => setPaymentModalVisible(false)}
        onOk={handlePayment}
        okText="Pay"
        cancelText="Cancel"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="Payment Date"
            name="paymentDate"
            rules={[{ required: true, message: "Select payment date" }]}
          >
            <DatePicker className="w-full" />
          </Form.Item>
          <Form.Item
            label="Base Salary Amount"
            name="amount"
            rules={[{ required: true, message: "Enter payment amount" }]}
          >
            <InputNumber
              className="w-full"
              min={0}
              max={selectedRecord?.payroll?.remainingAmount || 0}
            />
          </Form.Item>
          <Form.Item label="Deduction Amount" name="deductionAmount">
            <InputNumber className="w-full" min={0} />
          </Form.Item>
          <Form.Item label="Deduction Note / Reason" name="deductionNote">
            <Input.TextArea
              rows={2}
              placeholder="Optional reason for salary deduction"
            />
          </Form.Item>
          <Form.Item label="Bonus / Extra Amount" name="bonusAmount">
            <InputNumber className="w-full" min={0} />
          </Form.Item>
          <Form.Item label="Bonus / Extra Note" name="bonusNote">
            <Input.TextArea
              rows={2}
              placeholder="Optional note for bonus or extra amount"
            />
          </Form.Item>
          <Card size="small" className="mb-4 bg-slate-50">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Statistic
                title="Remaining Salary"
                value={Number(selectedRecord?.payroll?.remainingAmount || 0)}
                formatter={(value) => formatCurrency(value)}
              />
              <Statistic
                title="Base Salary"
                value={Number(watchedBaseAmount || 0)}
                formatter={(value) => formatCurrency(value)}
              />
              <Statistic
                title="Final Payable"
                value={computedFinalPaymentAmount}
                formatter={(value) => formatCurrency(value)}
              />
            </div>
          </Card>
          <Form.Item
            label="Pay From Account"
            name="paymentMethodId"
            rules={[{ required: true, message: "Select account" }]}
          >
            <Select
              placeholder="Select account"
              options={paymentMethods.map((method) => ({
                label: method.name,
                value: method._id,
              }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item
            label="Salary Head of Account"
            name="head"
            rules={
              allHeads.length > 0
                ? [{ required: true, message: "Select salary head" }]
                : []
            }
          >
            <Select
              placeholder="Select salary head"
              options={getVisibleHeadOptions()}
              showSearch
              allowClear
              optionFilterProp="label"
              onChange={(value) => {
                const head = allHeads.find((h) => String(h._id) === String(value));
                const typeId =
                  head &&
                  (typeof head.type === "object" ? head.type?._id : head.type);
                if (typeId) {
                  setSelectedHeadTypeId(typeId);
                  form.setFieldsValue({ headTypeId: typeId });
                }
              }}
            />
          </Form.Item>
          <Form.Item
            label="Income / Expense Type"
            name="headTypeId"
            rules={[{ required: true }]}
          >
            <Select
              placeholder="Select type"
              options={accountingTypes.map((t) => ({
                label: t.name,
                value: t._id,
              }))}
              showSearch
              optionFilterProp="label"
              onChange={(value) => {
                setSelectedHeadTypeId(value);
                form.setFieldsValue({ head: undefined });
              }}
            />
          </Form.Item>
          <Form.Item label="Details" name="details">
            <Input.TextArea rows={3} placeholder="Payment details" />
          </Form.Item>
          <Form.Item name="year" hidden>
            <InputNumber />
          </Form.Item>
          <Form.Item name="month" hidden>
            <InputNumber />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          selectedRecord
            ? `Payroll Detail - ${selectedRecord.teacher.fullName}`
            : "Payroll Detail"
        }
        open={detailsModalVisible}
        onCancel={closeDetailsModal}
        footer={
          selectedRecord
            ? [
                <Button key="close" onClick={closeDetailsModal}>
                  Close
                </Button>,
                <Button
                  key="pdf"
                  type="primary"
                  onClick={() => exportPayrollDetailsPdf(selectedRecord)}
                >
                  Download PDF
                </Button>,
              ]
            : null
        }
        width={980}
      >
        {selectedRecord ? (
          <div className="space-y-4">
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="Teacher">
                {selectedRecord.teacher.fullName}
              </Descriptions.Item>
              <Descriptions.Item label="Month">
                {selectedRecord.month.displayLabel}
              </Descriptions.Item>
              <Descriptions.Item label="Salary Type">
                {selectedRecord.salaryConfig?.salaryType === "per_student"
                  ? "Per Student"
                  : "Fixed"}
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag
                  color={
                    selectedRecord.payroll.status === "paid"
                      ? "green"
                      : selectedRecord.payroll.status === "partial"
                      ? "orange"
                      : "red"
                  }
                >
                  {String(selectedRecord.payroll.status).toUpperCase()}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Current Month Salary">
                {formatCurrency(selectedRecord.payroll.baseDueAmount || 0)}
              </Descriptions.Item>
              <Descriptions.Item label="Carry From Previous Month">
                {formatCurrency(selectedRecord.payroll.carryForwardInAmount || 0)}
              </Descriptions.Item>
              <Descriptions.Item label="Total Due">
                {formatCurrency(selectedRecord.payroll.dueAmount || 0)}
              </Descriptions.Item>
              <Descriptions.Item label="Paid">
                {formatCurrency(selectedRecord.payroll.paidAmount || 0)}
              </Descriptions.Item>
              <Descriptions.Item label="Remaining">
                {formatCurrency(selectedRecord.payroll.remainingAmount || 0)}
              </Descriptions.Item>
              <Descriptions.Item label="Next Month Carry">
                {formatCurrency(
                  selectedRecord.payroll.carryForwardEligibleAmount || 0,
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Carry Source">
                {selectedRecord.payroll.carryForwardSourceMonth
                  ? getMonthLabel(
                      selectedRecord.payroll.carryForwardSourceMonth.year,
                      selectedRecord.payroll.carryForwardSourceMonth.month,
                    )
                  : "None"}
              </Descriptions.Item>
              {selectedRecord.salaryConfig?.salaryType === "per_student" ? (
                <Descriptions.Item label="Eligible Students">
                  {selectedRecord.summary?.eligibleStudents || 0}
                </Descriptions.Item>
              ) : null}
            </Descriptions>

            {selectedRecord.salaryConfig?.salaryType === "per_student" ? (
              <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <Card size="small">
                    <Statistic
                      title="Carry Applied"
                      value={selectedRecord.payroll.appliedToCarry || 0}
                      formatter={(value) => formatCurrency(value)}
                    />
                  </Card>
                  <Card size="small">
                    <Statistic
                      title="Current Salary Applied"
                      value={selectedRecord.payroll.appliedToCurrent || 0}
                      formatter={(value) => formatCurrency(value)}
                    />
                  </Card>
                  <Card size="small">
                    <Statistic
                      title="Active Students"
                      value={selectedRecord.summary?.totalActiveStudents || 0}
                    />
                  </Card>
                  <Card size="small">
                    <Statistic
                      title="Courses"
                      value={selectedRecord.summary?.totalAssignedCourses || 0}
                    />
                  </Card>
                </div>

                <Card size="small" title="Assigned Courses">
                  <Space wrap>
                    {(selectedRecord.courses || []).map((course) => (
                      <Tag key={course._id} color="blue">
                        {course.courseName} ({course.activeStudents?.length || course.activeStudentCount || 0} students)
                      </Tag>
                    ))}
                  </Space>
                </Card>
              </>
            ) : null}

            <Card size="small" title="Payment History">
              <Table
                rowKey={(entry, index) =>
                  entry.transactionId || `${entry.paymentDate}-${index}`
                }
                pagination={false}
                dataSource={selectedRecord.payroll.paymentEntries || []}
                columns={[
                  {
                    title: "Date",
                    dataIndex: "paymentDate",
                    key: "paymentDate",
                    render: (value) =>
                      value ? dayjs(value).format("DD MMM YYYY") : "N/A",
                  },
                  {
                    title: "Account",
                    dataIndex: "paymentMethodName",
                    key: "paymentMethodName",
                    render: (value) => value || "N/A",
                  },
                  {
                    title: "Amount",
                    dataIndex: "amount",
                    key: "amount",
                    render: (value) => formatCurrency(value),
                  },
                  {
                    title: "Adjustments",
                    key: "adjustments",
                    render: (_, entry) => (
                      <div>
                        <div>
                          Base: {formatCurrency(entry.baseAmount || entry.amount || 0)}
                        </div>
                        {Number(entry.deductionAmount || 0) > 0 ? (
                          <div className="text-xs text-rose-600">
                            Deduction: {formatCurrency(entry.deductionAmount)}
                            {entry.deductionNote ? ` - ${entry.deductionNote}` : ""}
                          </div>
                        ) : null}
                        {Number(entry.bonusAmount || 0) > 0 ? (
                          <div className="text-xs text-emerald-600">
                            Bonus: {formatCurrency(entry.bonusAmount)}
                            {entry.bonusNote ? ` - ${entry.bonusNote}` : ""}
                          </div>
                        ) : null}
                      </div>
                    ),
                  },
                  {
                    title: "Details",
                    dataIndex: "details",
                    key: "details",
                    render: (value) => value || "-",
                  },
                ]}
              />
            </Card>

            {selectedRecord.salaryConfig?.salaryType === "per_student" ? (
              <Card size="small" title="Student Salary Breakdown">
                <Table
                  rowKey={(student) => student.studentId}
                  pagination={{ pageSize: 6 }}
                  dataSource={selectedRecord.studentsForSalary || []}
                  columns={[
                  {
                    title: "Student",
                    dataIndex: "studentName",
                    key: "studentName",
                  },
                  {
                    title: "Reg No",
                    dataIndex: "registrationNo",
                    key: "registrationNo",
                  },
                  {
                    title: "Attendance",
                    key: "attendanceCounts",
                    render: (_, student) =>
                      `${student.presentDays || 0}P + ${student.halfDays || 0}HD / ${student.totalWorkingDays || 0}`,
                  },
                  {
                    title: "Attendance %",
                    dataIndex: "monthlyAttendancePercentage",
                    key: "monthlyAttendancePercentage",
                    render: (value) => `${Number(value || 0).toFixed(1)}%`,
                  },
                  {
                    title: "Salary",
                    dataIndex: "calculatedSalaryAmount",
                    key: "calculatedSalaryAmount",
                    render: (value) => formatCurrency(value),
                  },
                  {
                    title: "Status",
                    dataIndex: "isSalaryEligible",
                    key: "isSalaryEligible",
                    render: (value) => (
                      <Tag color={value ? "green" : "orange"}>
                        {value ? "Eligible" : "Not Eligible"}
                      </Tag>
                    ),
                  },
                  ]}
                />
              </Card>
            ) : null}
          </div>
        ) : (
          <Text type="secondary">No payroll record selected.</Text>
        )}
      </Modal>
    </div>
  );
};

export default Payroll;
