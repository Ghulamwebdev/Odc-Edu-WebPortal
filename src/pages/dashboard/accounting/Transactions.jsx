import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  AutoComplete,
  Table,
  Tag,
  Button,
  Dropdown,
  Select,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  DatePicker,
  Popconfirm,
  message,
  Tooltip,
  Row,
  Col,
  Statistic,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  RollbackOutlined,
  TransactionOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  DollarOutlined,
  DownloadOutlined,
  EyeOutlined,
  FilePdfOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import { ScaleLoader } from "react-spinners";
import dayjs from "dayjs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import academyConfig from "../../../config/academyConfig";
import odysseyLogo from "../../../assets/images/logos/LOGO.png";
import { formatDateOnlyForApi } from "../../../utils/date";
import {
  getAccountingTypes,
  getHeadsOfAccount,
  getPaymentMethods,
  getTransactions,
  getTransactionSummary,
  getReceiptDuesOverview,
  getExpenseHeadEntries,
  getTeacherPayroll,
  createTransaction,
  payTeacherPayroll,
  updateTransaction,
  deleteTransaction,
  revertTransactionById,
} from "../../../services/accountingService";
import {
  recordFeePayment,
  getNextVoucherNumber,
} from "../../../services/feeService";
import useZustandStore from "../../../stores/zustandStore";
import { canViewAccountingBalances } from "../../../utils/accountingAccess";

const { Option } = Select;
const { TextArea } = Input;
const { RangePicker } = DatePicker;

const formatCurrency = (v) =>
  new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    minimumFractionDigits: 0,
  }).format(v || 0);

const getSinglePositiveFeeHeadName = (feeComponents = {}) => {
  const headCandidates = [
    { key: "admissionFee", label: "Admission Fee" },
    { key: "courseFee", label: "Course Fees" },
    { key: "certificateFee", label: "Certificate Fee" },
    { key: "examFee", label: "Exam Fee" },
    { key: "registrationFee", label: "Registration Fee" },
    { key: "practicalFee", label: "Practical Fee" },
    { key: "otherFee", label: "Other Fee" },
  ].filter((item) => Number(feeComponents?.[item.key] || 0) > 0);

  return headCandidates.length === 1 ? headCandidates[0].label : null;
};

const inferIncomeHeadName = (dueRow) => {
  const componentHead = getSinglePositiveFeeHeadName(
    dueRow?.selectedInstallment?.feeComponents,
  );
  if (componentHead) return componentHead;

  const description = String(dueRow?.description || "").toLowerCase();
  if (description.includes("admission")) return "Admission Fee";
  if (description.includes("certificate")) return "Certificate Fee";
  if (description.includes("exam")) return "Exam Fee";
  if (description.includes("registration")) return "Registration Fee";
  if (description.includes("practical")) return "Practical Fee";
  if (description.includes("other")) return "Other Fee";
  return "Course Fees";
};

const Transactions = () => {
  // ── State ──────────────────────────────────────────────────
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0,
  });
  const [summary, setSummary] = useState({
    totalIncome: 0,
    totalExpense: 0,
    netBalance: 0,
  });

  // Filter state
  const [filterType, setFilterType] = useState(null);
  const [filterHead, setFilterHead] = useState(null);
  const [filterMethods, setFilterMethods] = useState([]);
  const [filterDates, setFilterDates] = useState(null);
  const [filterSearch, setFilterSearch] = useState("");

  // Reference data
  const [types, setTypes] = useState([]);
  const [heads, setHeads] = useState([]);
  const [methods, setMethods] = useState([]);
  const [incomePartyOptions, setIncomePartyOptions] = useState([]);
  const [expensePartyOptions, setExpensePartyOptions] = useState([]);
  const [selectedPartyMeta, setSelectedPartyMeta] = useState(null);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTxn, setEditingTxn] = useState(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [formHeads, setFormHeads] = useState([]); // heads filtered by selected type in form

  const [form] = Form.useForm();
  const watchedFormType = Form.useWatch("type", form);

  // Detail modal state
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null);

  // Export / preview state
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewTitle, setPreviewTitle] = useState("");
  const [exportData, setExportData] = useState([]);
  const [exportLoading, setExportLoading] = useState(false);
  const fetchRequestIdRef = useRef(0);
  const { appSettings, isSuperAdmin, adminInfo } = useZustandStore();
  const balancesVisible = canViewAccountingBalances({
    appSettings,
    isSuperAdmin,
    adminInfo,
  });

  const getTypeNameById = useCallback(
    (typeId) =>
      types.find((item) => String(item._id) === String(typeId || ""))?.name || "",
    [types],
  );

  const buildPartyOptionMap = useCallback((records, config) => {
    const map = new Map();

    records.forEach((record) => {
      const name = String(config.getName(record) || "").trim();
      if (!name) return;

      const paymentDateValue = config.getDate(record);
      const paymentDate = paymentDateValue ? new Date(paymentDateValue) : null;
      const nextMeta = {
        value: name,
        label: name,
        amount: Number(config.getAmount(record) || 0),
        headId: config.getHeadId(record),
        paymentMethodId: config.getPaymentMethodId(record),
        billReference: config.getBillReference(record),
        details: config.getDetails(record),
        paymentDate,
      };

      const existingMeta = map.get(name);
      const nextTime = paymentDate?.getTime?.() || 0;
      const existingTime = existingMeta?.paymentDate?.getTime?.() || 0;

      if (!existingMeta || nextTime >= existingTime) {
        map.set(name, nextMeta);
      }
    });

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, []);

  const loadPartyReferenceData = useCallback(
    async (typeList = types) => {
      try {
        const incomeTypeId = typeList.find(
          (item) => String(item?.name || "").toLowerCase() === "income",
        )?._id;
        const expenseTypeId = typeList.find(
          (item) => String(item?.name || "").toLowerCase() === "expense",
        )?._id;
        const [
          incomeDuesRes,
          expenseRes,
          payrollRes,
          incomeTransactionsRes,
          expenseTransactionsRes,
        ] = await Promise.all([
          getReceiptDuesOverview({
            status: "unpaid",
            page: 1,
            limit: 10000,
            sortOrder: "asc",
          }),
          getExpenseHeadEntries(),
          getTeacherPayroll({
            page: 1,
            limit: 1000,
          }),
          incomeTypeId
            ? getTransactions({ type: incomeTypeId, page: 1, limit: 10000 })
            : Promise.resolve({ success: true, data: [] }),
          expenseTypeId
            ? getTransactions({ type: expenseTypeId, page: 1, limit: 10000 })
            : Promise.resolve({ success: true, data: [] }),
        ]);

        const incomeTransactions = buildPartyOptionMap(
          incomeTransactionsRes?.success ? incomeTransactionsRes.data || [] : [],
          {
            getName: (record) => record?.name,
            getDate: (record) => record?.paymentDate,
            getAmount: (record) => record?.amount,
            getHeadId: (record) => record?.head?._id || record?.head,
            getPaymentMethodId: (record) =>
              record?.paymentMethod?._id || record?.paymentMethod,
            getBillReference: (record) => record?.billReference,
            getDetails: (record) => record?.details,
          },
        );
        const expenseTransactions = buildPartyOptionMap(
          expenseTransactionsRes?.success
            ? expenseTransactionsRes.data || []
            : [],
          {
            getName: (record) => record?.name,
            getDate: (record) => record?.paymentDate,
            getAmount: (record) => record?.amount,
            getHeadId: (record) => record?.head?._id || record?.head,
            getPaymentMethodId: (record) =>
              record?.paymentMethod?._id || record?.paymentMethod,
            getBillReference: (record) => record?.billReference,
            getDetails: (record) => record?.details,
          },
        );

        setIncomePartyOptions(
          [
            ...incomeTransactions,
            ...(incomeDuesRes?.success
              ? (incomeDuesRes.data || []).map((row) => {
                const studentName = row?.student?.studentName || "Unknown";
                const installmentSuffix = row?.installmentNumber
                  ? `Inst. #${row.installmentNumber}`
                  : row?.description || "Fee Due";
                const courseName = row?.course?.courseName || "Course";
                const headLabel = inferIncomeHeadName(row);

                return {
                  value: `Fee Payment — ${studentName} (${installmentSuffix})`,
                  label: `Fee Payment — ${studentName} (${installmentSuffix})`,
                  amount: Number(row?.remainingAmount || row?.amount || 0),
                  headId: null,
                  headLabel,
                  paymentMethodId: null,
                  billReference: row?.voucherNo || row?.receiptNo || "",
                  details: `Student : ${studentName}${row?.student?.registrationNo ? ` (${row.student.registrationNo})` : ""}${row?.student?.mobileNumber ? ` | Mobile: ${row.student.mobileNumber}` : ""}\nCourse  : ${courseName}\nDue Item: ${row?.description || installmentSuffix}`,
                  paymentDate: row?.dueDate || null,
                  sourceType: "fee_due",
                  feeStructureId: row?.feeStructureId,
                  studentId: row?.student?._id,
                  courseId: row?.course?._id,
                  installmentNumber: row?.installmentNumber || null,
                  paymentType: row?.installmentNumber ? "Installment" : "Partial",
                  dueRow: row,
                };
              })
              : []),
          ].filter(
            (option, index, options) =>
              options.findIndex((item) => item.value === option.value) === index,
          ),
        );

        setExpensePartyOptions(
          [
            ...expenseTransactions,
            ...((expenseRes?.success ? expenseRes.data || [] : []).map((record) => {
              const payeeName = String(record?.payeeName || "").trim();
              const expenseHead =
                record?.expenseCategoryLabel ||
                record?.expenseCategory?.name ||
                "Expense";

              return {
                value: `${payeeName} — ${expenseHead}`,
                label: `${payeeName} — ${expenseHead}`,
                amount: Number(record?.amount || 0),
                headId: record?.expenseCategory?._id || record?.expenseCategory,
                headLabel: expenseHead,
                paymentMethodId:
                  record?.paymentMethod?._id || record?.paymentMethod || null,
                billReference: record?.voucherNo || "",
                details:
                  record?.description || record?.paymentPurpose || "",
                paymentDate: record?.date || null,
                sourceType: "expense_entry",
                expenseEntryId: record?._id,
              };
            })),
            ...((payrollRes?.success ? payrollRes.data || [] : [])
              .filter((item) => Number(item?.payroll?.remainingAmount || 0) > 0)
              .map((item) => ({
                value: `Teacher Salary — ${item?.teacher?.fullName || "Teacher"} (${item?.month?.displayLabel || `${item?.month?.month}/${item?.month?.year}`})`,
                label: `Teacher Salary — ${item?.teacher?.fullName || "Teacher"} (${item?.month?.displayLabel || `${item?.month?.month}/${item?.month?.year}`})`,
                amount: Number(item?.payroll?.remainingAmount || 0),
                headId: null,
                headLabel: "Salary",
                paymentMethodId: null,
                billReference: "",
                details: `Salary payout for ${item?.month?.displayLabel || "selected month"}`,
                paymentDate: new Date(),
                sourceType: "teacher_payroll",
                teacherId: item?.teacher?._id,
                year: item?.month?.year,
                month: item?.month?.month,
              }))),
          ].filter(
            (option, index, options) =>
              options.findIndex((item) => item.value === option.value) === index,
          ),
        );
      } catch (error) {
        console.error("Failed to load transaction party references:", error);
      }
    },
    [types, buildPartyOptionMap],
  );

  const getPartyOptionsForType = useCallback(
    (typeId) => {
      const typeName = getTypeNameById(typeId);
      if (typeName === "Income") return incomePartyOptions;
      if (typeName === "Expense") return expensePartyOptions;
      return [];
    },
    [getTypeNameById, incomePartyOptions, expensePartyOptions],
  );

  const getDefaultCashMethodId = useCallback(() => {
    const preferredCashMethod = methods.find((method) =>
      String(method?.name || "").trim().toLowerCase().includes("cash"),
    );

    return (
      preferredCashMethod?._id ||
      methods.find((method) => method.isDefault)?._id ||
      methods[0]?._id ||
      undefined
    );
  }, [methods]);

  const resolveHeadIdForMeta = useCallback(
    (partyMeta, typeId) => {
      if (partyMeta?.headId) return partyMeta.headId;

      const targetHeadLabel = String(partyMeta?.headLabel || "").trim().toLowerCase();
      if (!targetHeadLabel) return undefined;

      return heads.find((head) => {
        const sameType =
          String(head?.type?._id || head?.type || "") === String(typeId || "");
        const sameName =
          String(head?.name || "").trim().toLowerCase() === targetHeadLabel;
        return sameType && sameName;
      })?._id;
    },
    [heads],
  );

  const applyPartySelection = useCallback(
    (partyMeta) => {
      if (!partyMeta) return;

      const currentTypeId = form.getFieldValue("type");
      const resolvedHeadId = resolveHeadIdForMeta(partyMeta, currentTypeId);

      const nextFields = {
        name: partyMeta.value,
        amount: partyMeta.amount,
        paymentMethod: getDefaultCashMethodId() || partyMeta.paymentMethodId,
        paymentDate: partyMeta.paymentDate ? dayjs(partyMeta.paymentDate) : dayjs(),
        head: resolvedHeadId,
      };

      if (!editingTxn) {
        nextFields.billReference = partyMeta.billReference || "";
        nextFields.details = partyMeta.details || "";
      }

      setSelectedPartyMeta(partyMeta);
      form.setFieldsValue(nextFields);
    },
    [form, editingTxn, getDefaultCashMethodId, resolveHeadIdForMeta],
  );

  const handlePartySelection = useCallback(
    (selectedName) => {
      const matchedParty = getPartyOptionsForType(form.getFieldValue("type")).find(
        (item) => item.value === selectedName,
      );

      if (matchedParty) {
        applyPartySelection(matchedParty);
      }
    },
    [form, getPartyOptionsForType, applyPartySelection],
  );

  const upsertTransactionRow = useCallback(
    (nextRow, fallbackPage = 1) => {
      if (!nextRow?._id) return;

      setTransactions((currentRows) => {
        const existingIndex = currentRows.findIndex(
          (row) => String(row?._id) === String(nextRow._id),
        );

        if (existingIndex === -1) {
          if (fallbackPage !== 1) return currentRows;
          return [nextRow, ...currentRows].slice(0, pagination.pageSize);
        }

        return currentRows.map((row) =>
          String(row?._id) === String(nextRow._id) ? nextRow : row,
        );
      });
    },
    [pagination.pageSize],
  );

  const buildUpdatedTransactionRow = useCallback(
    (existingRow, submittedValues, serverRow) => {
      const resolvedType =
        types.find(
          (item) => String(item?._id || "") === String(submittedValues?.type || ""),
        ) ||
        serverRow?.type ||
        existingRow?.type ||
        null;

      const resolvedHead =
        heads.find(
          (item) => String(item?._id || "") === String(submittedValues?.head || ""),
        ) ||
        serverRow?.head ||
        existingRow?.head ||
        null;

      const resolvedMethod =
        methods.find(
          (item) =>
            String(item?._id || "") === String(submittedValues?.paymentMethod || ""),
        ) ||
        serverRow?.paymentMethod ||
        existingRow?.paymentMethod ||
        null;

      return {
        ...existingRow,
        ...serverRow,
        name: submittedValues?.name ?? serverRow?.name ?? existingRow?.name,
        type: resolvedType,
        head: resolvedHead,
        headLabel:
          resolvedHead?.name ||
          serverRow?.headLabel ||
          existingRow?.headLabel ||
          "",
        paymentMethod: resolvedMethod,
        paymentMethodLabel:
          resolvedMethod?.name ||
          serverRow?.paymentMethodLabel ||
          existingRow?.paymentMethodLabel ||
          "",
        paymentDate:
          submittedValues?.paymentDate?.toDate?.() ||
          serverRow?.paymentDate ||
          existingRow?.paymentDate,
        amount: Number(
          submittedValues?.amount ?? serverRow?.amount ?? existingRow?.amount ?? 0,
        ),
        billReference:
          submittedValues?.billReference ??
          serverRow?.billReference ??
          existingRow?.billReference ??
          "",
        details:
          submittedValues?.details ??
          serverRow?.details ??
          existingRow?.details ??
          "",
      };
    },
    [types, heads, methods],
  );

  // ── Load reference data on mount ──────────────────────────
  useEffect(() => {
    Promise.all([
      getAccountingTypes(),
      getHeadsOfAccount(null, false),
      getPaymentMethods(),
    ])
      .then(([t, h, m]) => {
        if (t?.success) setTypes(t.data);
        if (h?.success) setHeads(h.data);
        if (m?.success) setMethods(m.data);
        if (t?.success) loadPartyReferenceData(t.data || []);
      })
      .catch(console.error);
  }, [loadPartyReferenceData]);

  // ── Fetch transactions ─────────────────────────────────────
  const fetchTransactions = useCallback(
    async (page = 1) => {
      const requestId = fetchRequestIdRef.current + 1;
      fetchRequestIdRef.current = requestId;
      setLoading(true);
      try {
        const params = { page, limit: pagination.pageSize };
        if (filterType) params.type = filterType;
        if (filterHead) params.head = filterHead;
        if (filterMethods.length)
          params.paymentMethod = filterMethods.join(",");
        if (filterDates?.[0]) params.dateFrom = filterDates[0].toISOString();
        if (filterDates?.[1]) params.dateTo = filterDates[1].toISOString();
        if (String(filterSearch || "").trim()) params.search = filterSearch.trim();

        const txnPromise = getTransactions(params);
        const sumPromise = balancesVisible
          ? getTransactionSummary({
              ...(filterMethods.length && {
                paymentMethod: filterMethods.join(","),
              }),
              ...(filterDates?.[0] && { dateFrom: filterDates[0].toISOString() }),
              ...(filterDates?.[1] && { dateTo: filterDates[1].toISOString() }),
            })
          : Promise.resolve({
              success: true,
              data: { totalIncome: 0, totalExpense: 0, netBalance: 0 },
            });

        const [txnRes, sumRes] = await Promise.all([txnPromise, sumPromise]);

        if (requestId !== fetchRequestIdRef.current) return;

        if (txnRes?.success) {
          setTransactions(txnRes.data);
          setPagination((p) => ({
            ...p,
            current: page,
            total: txnRes.pagination.total,
          }));
        }
        if (sumRes?.success) setSummary(sumRes.data);
      } catch (err) {
        if (requestId !== fetchRequestIdRef.current) return;
        console.error(err);
        message.error(err?.message || "Failed to load transactions");
      } finally {
        if (requestId === fetchRequestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [filterType, filterHead, filterMethods, filterDates, filterSearch, pagination.pageSize, balancesVisible],
  );

  useEffect(() => {
    fetchTransactions(1);
  }, [filterType, filterHead, filterMethods, filterDates, filterSearch]);

  // ── Form type change → filter heads ───────────────────────
  const handleFormTypeChange = (typeId) => {
    setSelectedPartyMeta(null);
    form.setFieldsValue({
      name: undefined,
      head: undefined,
      amount: undefined,
      billReference: undefined,
      details: undefined,
    });
    const filtered = heads.filter(
      (h) => h.type?._id === typeId || h.type === typeId,
    );
    setFormHeads(filtered);
  };

  // ── Modal helpers ──────────────────────────────────────────
  const openCreateModal = () => {
    setEditingTxn(null);
    setFormHeads([]);
    setSelectedPartyMeta(null);
    form.resetFields();
    form.setFieldsValue({
      paymentMethod: getDefaultCashMethodId(),
      paymentDate: dayjs(),
    });
    setModalVisible(true);
  };

  const openEditModal = (record) => {
    setEditingTxn(record);
    setSelectedPartyMeta(null);
    const typeId = record.type?._id;
    const filtered = heads.filter(
      (h) => h.type?._id === typeId || h.type === typeId,
    );
    setFormHeads(filtered);
    form.setFieldsValue({
      name: record.name,
      type: typeId,
      head: record.head?._id,
      paymentMethod: record.paymentMethod?._id,
      paymentDate: dayjs(record.paymentDate),
      amount: record.amount,
      billReference: record.billReference,
      details: record.details,
    });
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingTxn(null);
    setFormHeads([]);
    setSelectedPartyMeta(null);
    form.resetFields();
  };

  // ── Submit ─────────────────────────────────────────────────
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitLoading(true);

      if (!editingTxn && selectedPartyMeta?.sourceType === "fee_due") {
        const resolvedStudentId = String(
          selectedPartyMeta.studentId ||
            selectedPartyMeta.dueRow?.student?._id ||
            "",
        ).trim();
        const resolvedCourseId = String(
          selectedPartyMeta.courseId ||
            selectedPartyMeta.dueRow?.course?._id ||
            "",
        ).trim();
        const resolvedFeeStructureId = String(
          selectedPartyMeta.feeStructureId ||
            selectedPartyMeta.dueRow?.feeStructureId ||
            "",
        ).trim();

        if (!resolvedStudentId || !resolvedCourseId || !resolvedFeeStructureId) {
          message.error("Selected due entry is missing student/course data");
          return;
        }

        const voucherResponse = await getNextVoucherNumber();
        const voucherNo = voucherResponse?.success
          ? voucherResponse.data?.voucherNo
          : values.billReference || "";
        const selectedMethod = methods.find(
          (method) => String(method._id) === String(values.paymentMethod || ""),
        );

        const feePaymentPayload = {
          studentId: resolvedStudentId,
          courseId: resolvedCourseId,
          feeStructureId: resolvedFeeStructureId,
          amount: Number(values.amount || 0),
          paymentDate: values.paymentDate?.toDate?.() || new Date(),
          paymentMethod: selectedMethod?.name || "Cash",
          accountingPaymentMethodId: values.paymentMethod
            ? String(values.paymentMethod)
            : null,
          voucherNo,
          installmentNumber: selectedPartyMeta.installmentNumber
            ? Number(selectedPartyMeta.installmentNumber)
            : null,
          paymentType:
            selectedPartyMeta.installmentNumber ? "Installment" : "Partial",
          remarks: values.details || "",
        };

        const feePaymentRes = await recordFeePayment(feePaymentPayload);
        if (feePaymentRes?.success) {
          message.success("Fee payment recorded successfully");
          closeModal();
          loadPartyReferenceData();
          fetchTransactions(1);
        } else {
          message.error(feePaymentRes?.message || "Fee payment failed");
        }
        return;
      }

      if (!editingTxn && selectedPartyMeta?.sourceType === "teacher_payroll") {
        const resolvedTeacherId = String(selectedPartyMeta.teacherId || "").trim();
        if (!resolvedTeacherId) {
          message.error("Selected payroll entry is missing teacher data");
          return;
        }

        const payrollPayload = {
          amount: Number(values.amount || 0),
          paymentDate: values.paymentDate?.toISOString?.() || new Date().toISOString(),
          details: values.details || "",
          paymentMethodId: values.paymentMethod || null,
          head: values.head || null,
          headId: values.head || null,
          year: selectedPartyMeta.year,
          month: selectedPartyMeta.month,
        };

        const payrollRes = await payTeacherPayroll(resolvedTeacherId, payrollPayload);
        if (payrollRes?.success) {
          message.success(payrollRes.message || "Salary payment recorded successfully");
          closeModal();
          loadPartyReferenceData();
          fetchTransactions(1);
        } else {
          message.error(payrollRes?.message || "Salary payment failed");
        }
        return;
      }

      const payload = {
        ...values,
        paymentDate: formatDateOnlyForApi(values.paymentDate),
      };

      if (editingTxn) {
        const res = await updateTransaction(editingTxn._id, payload);
        if (res?.success) {
          const nextRow = buildUpdatedTransactionRow(editingTxn, values, res.data);
          upsertTransactionRow(nextRow, pagination.current);
          message.success("Transaction updated");
          closeModal();
          loadPartyReferenceData();
        } else message.error(res?.message || "Update failed");
      } else {
        const res = await createTransaction(payload);
        if (res?.success) {
          upsertTransactionRow(res.data, 1);
          message.success("Transaction created");
          closeModal();
          loadPartyReferenceData();
          fetchTransactions(1);
        } else message.error(res?.message || "Creation failed");
      }
    } catch (err) {
      console.error("Transaction quick-pay error:", err);
      message.error(err?.error || err?.message || "Payment failed");
    } finally {
      setSubmitLoading(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────
  const handleDelete = async (id) => {
    try {
      const res = await deleteTransaction(id);
      if (res?.success) {
        message.success("Transaction deleted and balance reversed");
        loadPartyReferenceData();
        fetchTransactions(pagination.current);
      } else message.error(res?.message || "Delete failed");
    } catch (err) {
      message.error(err?.message || "Delete failed");
    }
  };

  const handleRevert = async (id) => {
    try {
      const res = await revertTransactionById(id);
      if (res?.success) {
        message.success(res.message || "Transaction reverted successfully");
        loadPartyReferenceData();
        fetchTransactions(pagination.current);
      } else {
        message.error(res?.message || "Revert failed");
      }
    } catch (err) {
      message.error(err?.message || "Revert failed");
    }
  };
  // ── Export helpers ───────────────────────────────────────────
  const openExportAction = async (action, typeKey) => {
    const typeLabel =
      typeKey === "all" ? "All" : typeKey === "income" ? "Income" : "Expense";
    setExportLoading(true);
    try {
      const params = { page: 1, limit: 10000 };
      if (filterHead) params.head = filterHead;
      if (filterMethods.length) params.paymentMethod = filterMethods.join(",");
      if (filterDates?.[0]) params.dateFrom = filterDates[0].toISOString();
      if (filterDates?.[1]) params.dateTo = filterDates[1].toISOString();
      if (String(filterSearch || "").trim()) params.search = filterSearch.trim();
      if (typeKey === "income") {
        const t = types.find((x) => x.name === "Income");
        if (t) params.type = t._id;
      } else if (typeKey === "expense") {
        const t = types.find((x) => x.name === "Expense");
        if (t) params.type = t._id;
      } else if (filterType) {
        params.type = filterType;
      }
      const res = await getTransactions(params);
      const rows = res?.success ? res.data : [];
      if (action === "preview") {
        setExportData(rows);
        setPreviewTitle(`Transactions — ${typeLabel}`);
        setPreviewVisible(true);
      } else if (action === "csv") {
        doExportCSV(rows, typeLabel);
      } else {
        doExportPDF(rows, typeLabel);
      }
    } catch {
      message.error("Export failed");
    } finally {
      setExportLoading(false);
    }
  };

  const doExportCSV = (rows, typeLabel) => {
    const header = [
      "Txn No",
      "Name",
      "Type",
      "Head",
      "Account",
      "Date",
      "Amount",
      "Bill Ref",
    ];
    const body = rows.map((r) => [
      r.transactionNo || "",
      `"${r.name || ""}"
`,
      r.type?.name || "",
      r.head?.name || "",
      r.paymentMethod?.name || "",
      r.paymentDate ? dayjs(r.paymentDate).format("DD MMM YYYY") : "",
      r.amount || 0,
      r.billReference || "",
    ]);
    const totalIn = rows
      .filter((r) => r.type?.name === "Income")
      .reduce((s, r) => s + r.amount, 0);
    const totalOut = rows
      .filter((r) => r.type?.name === "Expense")
      .reduce((s, r) => s + r.amount, 0);
    const csv = [
      header,
      ...body,
      [],
      ["", "", "", "", "", "Total Income", totalIn, ""],
      ["", "", "", "", "", "Total Expense", totalOut, ""],
      ["", "", "", "", "", "Net Balance", totalIn - totalOut, ""],
    ]
      .map((r) => r.join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Transactions_${typeLabel}_${dayjs().format("YYYY-MM-DD")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doExportPDF = async (rows, typeLabel) => {
    try {
      // Load logo
      let logoDataUrl = null;
      try {
        const response = await fetch(odysseyLogo);
        const blob = await response.blob();
        logoDataUrl = await new Promise((res) => {
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = () => res(reader.result);
        });
      } catch (err) {
        console.warn("Could not load academy logo:", err);
      }

      const doc = new jsPDF({ orientation: "landscape" });
      const pageWidth = doc.internal.pageSize.width;

      // Header with Institution Branding
      doc.setFillColor(20, 45, 120);
      doc.rect(0, 0, pageWidth, 50, "F");

      // Add logo
      if (logoDataUrl) {
        const logoSize = 20;
        const logoX = 14;
        const logoY = 15;
        doc.addImage(logoDataUrl, "PNG", logoX, logoY, logoSize, logoSize);
      }

      // Academy info
      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.text("ODYSSEY ACADEMY KHIPRO", pageWidth / 2, 20, { align: "center" });

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("Transactions Report", pageWidth / 2, 28, { align: "center" });

      doc.setFontSize(8);
      doc.text(
        `Filter: ${typeLabel} | Generated: ${dayjs().format("DD MMM YYYY")}`,
        pageWidth / 2,
        35,
        { align: "center" }
      );

      const totalIn = rows
        .filter((r) => r.type?.name === "Income")
        .reduce((s, r) => s + r.amount, 0);
      const totalOut = rows
        .filter((r) => r.type?.name === "Expense")
        .reduce((s, r) => s + r.amount, 0);
      autoTable(doc, {
        startY: 40,
        head: [
          [
            "Txn No",
            "Name",
            "Type",
            "Head",
          "Account",
          "Date",
          "Amount (PKR)",
          "Bill Ref",
        ],
      ],
      body: rows.map((r) => [
        r.transactionNo || "",
        r.name || "",
        r.type?.name || "",
        r.head?.name || "",
        r.paymentMethod?.name || "",
        r.paymentDate ? dayjs(r.paymentDate).format("DD MMM YYYY") : "",
        formatCurrency(r.amount),
        r.billReference || "",
      ]),
      foot: [
        ["", "", "", "", "", "Total Income", formatCurrency(totalIn), ""],
        ["", "", "", "", "", "Total Expense", formatCurrency(totalOut), ""],
        [
          "",
          "",
          "",
          "",
          "",
          "Net Balance",
          formatCurrency(totalIn - totalOut),
          "",
        ],
      ],
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [1, 19, 76], textColor: [232, 252, 10] },
      footStyles: {
        fillColor: [240, 244, 255],
        textColor: [17, 24, 39],
        fontStyle: "bold",
      },
      didParseCell: (data) => {
        if (data.section === "body") {
          const row = rows[data.row.index];
          if (row?.type?.name === "Income")
            data.cell.styles.fillColor = [240, 253, 244];
          else data.cell.styles.fillColor = [255, 241, 242];
        }
      },
      columnStyles: { 6: { halign: "right" } },
    });
    doc.save(`Transactions_${typeLabel}_${dayjs().format("YYYY-MM-DD")}.pdf`);
    } catch (err) {
      console.error("Error generating PDF:", err);
      message.error("Failed to generate PDF report");
    }
  };
  // ── Table columns ──────────────────────────────────────────
  const columns = [
    {
      title: "Txn No",
      dataIndex: "transactionNo",
      key: "transactionNo",
      width: 140,
      render: (v) => <span className="font-mono text-xs text-muted">{v}</span>,
    },
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      render: (v) => <span className="font-semibold text-dark">{v}</span>,
    },
    {
      title: "Type",
      dataIndex: "type",
      key: "type",
      width: 100,
      render: (t) =>
        t?.name === "Income" ? (
          <Tag color="green" icon={<ArrowUpOutlined />}>
            Income
          </Tag>
        ) : (
          <Tag color="red" icon={<ArrowDownOutlined />}>
            Expense
          </Tag>
        ),
    },
    {
      title: "Head",
      dataIndex: "head",
      key: "head",
      render: (h) => <span className="text-sm">{h?.name || "—"}</span>,
    },
    {
      title: "Payment Method",
      dataIndex: "paymentMethod",
      key: "paymentMethod",
      render: (m) => <span className="text-sm">{m?.name || "—"}</span>,
    },
    {
      title: "Date",
      dataIndex: "paymentDate",
      key: "paymentDate",
      width: 110,
      render: (d) => (
        <span className="text-sm">
          {d ? dayjs(d).format("DD MMM YYYY") : "—"}
        </span>
      ),
    },
    {
      title: "Amount",
      dataIndex: "amount",
      key: "amount",
      width: 130,
      align: "right",
      render: (a, record) => (
        <span
          className={`font-bold ${
            record.type?.name === "Income" ? "text-green-600" : "text-red-600"
          }`}
        >
          {formatCurrency(a)}
        </span>
      ),
    },
    {
      title: "Bill Ref",
      dataIndex: "billReference",
      key: "billReference",
      render: (v) => <span className="text-muted text-xs">{v || "—"}</span>,
    },
    {
      title: "Actions",
      key: "actions",
      width: 170,
      render: (_, record) => (
        <Space>
          <Tooltip title="View Details">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => {
                setDetailRecord(record);
                setDetailVisible(true);
              }}
              style={{ borderColor: "#01134C", color: "#01134C" }}
            />
          </Tooltip>
          <Tooltip title="Edit">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEditModal(record)}
              style={{ borderColor: "#01134C", color: "#01134C" }}
            />
          </Tooltip>
          <Tooltip title="Revert">
            <Popconfirm
              title="Revert this transaction?"
              description="This will undo the original payment/expense where possible and remove this transaction from the list."
              onConfirm={() => handleRevert(record._id)}
              okText="Revert"
              okButtonProps={{ danger: true }}
              cancelText="Cancel"
            >
              <Button
                size="small"
                icon={<RollbackOutlined />}
                style={{ borderColor: "#d97706", color: "#d97706" }}
              />
            </Popconfirm>
          </Tooltip>
          <Tooltip title="Delete">
            <Popconfirm
              title="Delete this transaction?"
              description="This will reverse the balance on the payment method."
              onConfirm={() => handleDelete(record._id)}
              okText="Delete"
              okButtonProps={{ danger: true }}
              cancelText="Cancel"
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  // ── Row color by type ──────────────────────────────────────
  const rowBg = (record) =>
    record.type?.name === "Income" ? "#f0fdf4" : "#fff1f2";

  return (
    <div className="p-6">
      {/* ── Page Header ───────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <TransactionOutlined style={{ color: "#E8FC0A", fontSize: 20 }} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-dark m-0">Transactions</h2>
            <p className="text-muted text-sm m-0">Income & Expense entries</p>
          </div>
        </div>
        <Space>
          <Dropdown
            loading={exportLoading}
            menu={{
              items: [
                {
                  key: "preview-all",
                  label: "Preview All",
                  icon: <EyeOutlined />,
                },
                {
                  key: "preview-income",
                  label: "Preview Income Only",
                  icon: <EyeOutlined />,
                },
                {
                  key: "preview-expense",
                  label: "Preview Expense Only",
                  icon: <EyeOutlined />,
                },
                { type: "divider" },
                {
                  key: "csv-all",
                  label: "Export CSV — All",
                  icon: <FileTextOutlined />,
                },
                {
                  key: "csv-income",
                  label: "Export CSV — Income",
                  icon: <FileTextOutlined />,
                },
                {
                  key: "csv-expense",
                  label: "Export CSV — Expense",
                  icon: <FileTextOutlined />,
                },
                { type: "divider" },
                {
                  key: "pdf-all",
                  label: "Export PDF — All",
                  icon: <FilePdfOutlined />,
                },
                {
                  key: "pdf-income",
                  label: "Export PDF — Income",
                  icon: <FilePdfOutlined />,
                },
                {
                  key: "pdf-expense",
                  label: "Export PDF — Expense",
                  icon: <FilePdfOutlined />,
                },
              ],
              onClick: ({ key }) => {
                const [action, typeKey] = key.split("-");
                openExportAction(action, typeKey);
              },
            }}
          >
            <Button
              icon={<DownloadOutlined />}
              loading={exportLoading}
              style={{ borderColor: "#01134C", color: "#01134C" }}
            >
              Export
            </Button>
          </Dropdown>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreateModal}
            style={{ backgroundColor: "#01134C", borderColor: "#01134C" }}
          >
            Add Transaction
          </Button>
        </Space>
      </div>

      {/* ── Summary Cards ─────────────────────────────────── */}
      {balancesVisible ? (
        <Row gutter={16} className="mb-5">
          <Col xs={24} sm={8}>
            <div className="bg-white rounded-xl shadow-soft p-5">
              <Statistic
                title={<span className="text-muted text-xs font-semibold">TOTAL INCOME</span>}
                value={summary.totalIncome}
                precision={0}
                prefix={<ArrowUpOutlined className="text-green-500" />}
                valueStyle={{ color: "#16a34a", fontWeight: 700 }}
                formatter={(v) => formatCurrency(v)}
              />
            </div>
          </Col>
          <Col xs={24} sm={8}>
            <div className="bg-white rounded-xl shadow-soft p-5">
              <Statistic
                title={<span className="text-muted text-xs font-semibold">TOTAL EXPENSE</span>}
                value={summary.totalExpense}
                precision={0}
                prefix={<ArrowDownOutlined className="text-red-500" />}
                valueStyle={{ color: "#dc2626", fontWeight: 700 }}
                formatter={(v) => formatCurrency(v)}
              />
            </div>
          </Col>
          <Col xs={24} sm={8}>
            <div className="rounded-xl p-5" style={{ backgroundColor: "#01134C" }}>
              <Statistic
                title={<span style={{ color: "#E8FC0A", fontSize: 12, fontWeight: 600 }}>NET BALANCE</span>}
                value={summary.netBalance}
                precision={0}
                prefix={<DollarOutlined style={{ color: "#fff" }} />}
                valueStyle={{ color: summary.netBalance >= 0 ? "#fff" : "#fca5a5", fontWeight: 700 }}
                formatter={(v) => formatCurrency(v)}
              />
            </div>
          </Col>
        </Row>
      ) : null}

      {/* ── Filters ───────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-soft p-4 mb-4 flex flex-wrap gap-3 items-center">
        <Input
          allowClear
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
          placeholder="Search name or Txn No"
          style={{ width: 240 }}
        />

        <Select
          placeholder="All Types"
          allowClear
          style={{ width: 140 }}
          value={filterType}
          onChange={(v) => {
            setFilterType(v || null);
            setFilterHead(null);
          }}
        >
          {types.map((t) => (
            <Option key={t._id} value={t._id}>
              <Tag color={t.name === "Income" ? "green" : "red"}>{t.name}</Tag>
            </Option>
          ))}
        </Select>

        <Select
          placeholder="All Heads"
          allowClear
          style={{ width: 200 }}
          value={filterHead}
          onChange={(v) => setFilterHead(v || null)}
        >
          {heads
            .filter((h) => !filterType || h.type?._id === filterType)
            .map((h) => (
              <Option key={h._id} value={h._id}>
                {h.name}
              </Option>
            ))}
        </Select>

        <Select
          mode="multiple"
          placeholder="All Accounts"
          allowClear
          maxTagCount="responsive"
          style={{ minWidth: 180 }}
          value={filterMethods}
          onChange={(v) => setFilterMethods(v || [])}
        >
          {methods.map((m) => (
            <Option key={m._id} value={m._id}>
              {m.name}
            </Option>
          ))}
        </Select>

        <RangePicker
          onChange={(dates) =>
            setFilterDates(
              dates ? [dates[0].toDate(), dates[1].toDate()] : null,
            )
          }
          format="DD MMM YYYY"
        />

        <span className="text-muted text-sm ml-auto">
          {pagination.total} record{pagination.total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Table ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-soft overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <ScaleLoader color="#01134C" />
          </div>
        ) : (
          <Table
            dataSource={transactions}
            columns={columns}
            rowKey="_id"
            onRow={(record) => ({
              style: { backgroundColor: rowBg(record) },
            })}
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: pagination.total,
              onChange: (page) => fetchTransactions(page),
              showSizeChanger: false,
            }}
          />
        )}
      </div>
      {/* ── Print Preview Modal ────────────────────────────────── */}
      <Modal
        title={
          <span style={{ color: "#01134C", fontWeight: 700 }}>
            {previewTitle}
          </span>
        }
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        width="92vw"
        footer={[
          <Button key="close" onClick={() => setPreviewVisible(false)}>
            Close
          </Button>,
          <Button
            key="csv"
            icon={<FileTextOutlined />}
            onClick={() =>
              doExportCSV(
                exportData,
                previewTitle.split("—")[1]?.trim() || "All",
              )
            }
            style={{ borderColor: "#01134C", color: "#01134C" }}
          >
            Export CSV
          </Button>,
          <Button
            key="pdf"
            type="primary"
            icon={<FilePdfOutlined />}
            onClick={() =>
              doExportPDF(
                exportData,
                previewTitle.split("—")[1]?.trim() || "All",
              )
            }
            style={{ backgroundColor: "#01134C", borderColor: "#01134C" }}
          >
            Download PDF
          </Button>,
        ]}
        destroyOnClose
      >
        <Row gutter={12} className="mb-4">
          <Col span={8}>
            <div
              className="rounded-lg p-3 text-center"
              style={{ background: "#f0fdf4" }}
            >
              <div className="text-muted text-xs mb-1">Total Income</div>
              <div className="font-bold text-green-600 text-base">
                {formatCurrency(
                  exportData
                    .filter((r) => r.type?.name === "Income")
                    .reduce((s, r) => s + r.amount, 0),
                )}
              </div>
            </div>
          </Col>
          <Col span={8}>
            <div
              className="rounded-lg p-3 text-center"
              style={{ background: "#fff1f2" }}
            >
              <div className="text-muted text-xs mb-1">Total Expense</div>
              <div className="font-bold text-red-600 text-base">
                {formatCurrency(
                  exportData
                    .filter((r) => r.type?.name === "Expense")
                    .reduce((s, r) => s + r.amount, 0),
                )}
              </div>
            </div>
          </Col>
          <Col span={8}>
            <div
              className="rounded-lg p-3 text-center"
              style={{ background: "#01134C" }}
            >
              <div className="text-xs mb-1" style={{ color: "#E8FC0A" }}>
                Net Balance
              </div>
              <div className="font-bold text-white text-base">
                {formatCurrency(
                  exportData
                    .filter((r) => r.type?.name === "Income")
                    .reduce((s, r) => s + r.amount, 0) -
                    exportData
                      .filter((r) => r.type?.name === "Expense")
                      .reduce((s, r) => s + r.amount, 0),
                )}
              </div>
            </div>
          </Col>
        </Row>
        <Table
          dataSource={exportData}
          columns={columns}
          rowKey="_id"
          size="small"
          onRow={(record) => ({
            style: {
              backgroundColor:
                record.type?.name === "Income" ? "#f0fdf4" : "#fff1f2",
            },
          })}
          pagination={{
            pageSize: 20,
            showSizeChanger: false,
            showTotal: (t, r) => `${r[0]}–${r[1]} of ${t}`,
          }}
          scroll={{ x: 900, y: 420 }}
        />
      </Modal>
      {/* ── Add / Edit Modal ──────────────────────────────── */}
      <Modal
        title={
          <div className="flex items-center gap-2" style={{ color: "#01134C" }}>
            <TransactionOutlined />
            <span>{editingTxn ? "Edit Transaction" : "Add Transaction"}</span>
          </div>
        }
        open={modalVisible}
        onCancel={closeModal}
        onOk={handleSubmit}
        okText={editingTxn ? "Update" : "Create"}
        confirmLoading={submitLoading}
        okButtonProps={{
          style: { backgroundColor: "#01134C", borderColor: "#01134C" },
        }}
        destroyOnClose
        width={560}
      >
        <Form form={form} layout="vertical" className="mt-4">
          <Form.Item
            label="Name / Party"
            name="name"
            rules={[{ required: true, message: "Please enter a name" }]}
          >
            <AutoComplete
              placeholder="e.g. Ahmed Khan - Tuition Fee"
              options={getPartyOptionsForType(watchedFormType).map((option) => ({
                value: option.value,
                label: option.label,
                headId: option.headId,
                amount: option.amount,
              }))}
              disabled={!watchedFormType}
              onSelect={handlePartySelection}
              onChange={(value) => {
                if (!value || value !== selectedPartyMeta?.value) {
                  setSelectedPartyMeta(null);
                }
              }}
              filterOption={(inputValue, option) =>
                String(option?.value || "")
                  .toLowerCase()
                  .includes(String(inputValue || "").toLowerCase())
              }
            />
          </Form.Item>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                label="Type"
                name="type"
                rules={[{ required: true, message: "Select type" }]}
              >
                <Select
                  placeholder="Income or Expense"
                  onChange={handleFormTypeChange}
                >
                  {types.map((t) => (
                    <Option key={t._id} value={t._id}>
                      <Tag color={t.name === "Income" ? "green" : "red"}>
                        {t.name}
                      </Tag>
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Head of Account"
                name="head"
                rules={[{ required: true, message: "Select head" }]}
              >
                <Select
                  placeholder="Select head"
                  disabled={formHeads.length === 0}
                >
                  {formHeads.map((h) => (
                    <Option key={h._id} value={h._id}>
                      {h.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                label="Payment Method"
                name="paymentMethod"
                rules={[{ required: true, message: "Select account" }]}
              >
                <Select placeholder="Cash / Bank">
                  {methods.map((m) => (
                    <Option key={m._id} value={m._id}>
                      {m.name}{" "}
                      {balancesVisible && m.currentBalance !== null ? (
                        <span className="text-muted text-xs">
                          ({formatCurrency(m.currentBalance)})
                        </span>
                      ) : null}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Payment Date"
                name="paymentDate"
                rules={[{ required: true, message: "Select date" }]}
              >
                <DatePicker style={{ width: "100%" }} format="DD MMM YYYY" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                label="Amount (PKR)"
                name="amount"
                rules={[{ required: true, message: "Enter amount" }]}
              >
                <InputNumber
                  style={{ width: "100%" }}
                  min={0}
                  placeholder="0"
                  formatter={(value) =>
                    value === undefined || value === null || value === ""
                      ? ""
                      : String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
                  }
                  parser={(value) => String(value || "").replace(/,/g, "")}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Bill / Voucher No" name="billReference">
                <Input placeholder="Optional reference" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Details / Notes" name="details">
            <TextArea
              rows={2}
              placeholder="Optional notes"
              maxLength={300}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* ─── Transaction Detail Modal ─────────────────────────── */}
      <Modal
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailVisible(false)}>
            Close
          </Button>,
          <Button
            key="edit"
            icon={<EditOutlined />}
            onClick={() => {
              setDetailVisible(false);
              openEditModal(detailRecord);
            }}
            style={{
              background: "#01134C",
              borderColor: "#01134C",
              color: "#E8FC0A",
            }}
          >
            Edit
          </Button>,
        ]}
        title={
          <div className="flex items-center gap-2">
            <TransactionOutlined style={{ color: "#01134C", fontSize: 18 }} />
            <span style={{ color: "#01134C", fontWeight: 700 }}>
              Transaction Details
            </span>
            {detailRecord?.type?.name === "Income" ? (
              <Tag color="green" icon={<ArrowUpOutlined />}>
                Income
              </Tag>
            ) : (
              <Tag color="red" icon={<ArrowDownOutlined />}>
                Expense
              </Tag>
            )}
          </div>
        }
        width={560}
      >
        {detailRecord && (
          <div
            style={{
              background:
                detailRecord.type?.name === "Income" ? "#f0fdf4" : "#fff1f2",
              borderRadius: 8,
              padding: 16,
            }}
          >
            {/* Amount hero */}
            <div className="text-center mb-4">
              <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">
                Amount
              </div>
              <div
                className="text-3xl font-bold"
                style={{
                  color:
                    detailRecord.type?.name === "Income"
                      ? "#16a34a"
                      : "#dc2626",
                }}
              >
                {formatCurrency(detailRecord.amount)}
              </div>
            </div>

            {/* Detail rows */}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {[
                  { label: "Txn No", value: detailRecord.transactionNo },
                  { label: "Name", value: detailRecord.name },
                  { label: "Type", value: detailRecord.type?.name },
                  { label: "Head of Account", value: detailRecord.head?.name },
                  {
                    label: "Payment Method",
                    value: detailRecord.paymentMethod?.name,
                  },
                  {
                    label: "Payment Date",
                    value: detailRecord.paymentDate
                      ? dayjs(detailRecord.paymentDate).format("DD MMM YYYY")
                      : "—",
                  },
                  {
                    label: "Bill / Voucher No",
                    value: detailRecord.billReference || "—",
                  },
                  {
                    label: "Details / Notes",
                    value: detailRecord.details || "—",
                  },
                  {
                    label: "Created At",
                    value: detailRecord.createdAt
                      ? dayjs(detailRecord.createdAt).format(
                          "DD MMM YYYY, hh:mm A",
                        )
                      : "—",
                  },
                ].map(({ label, value }) => (
                  <tr key={label} style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <td
                      style={{
                        padding: "8px 4px",
                        width: 150,
                        color: "#6b7280",
                        fontSize: 12,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {label}
                    </td>
                    <td
                      style={{
                        padding: "8px 4px",
                        fontSize: 13,
                        color: "#111827",
                      }}
                    >
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Transactions;
