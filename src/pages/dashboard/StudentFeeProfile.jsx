import React, { useState, useEffect, useMemo } from "react";
import {
  Card,
  Tabs,
  Table,
  Tag,
  Button,
  Modal,
  Space,
  message,
  Descriptions,
  Divider,
  Row,
  Col,
  Statistic,
  Timeline,
  Collapse,
  Popconfirm,
  Typography,
  Form,
  Input,
  Select,
  DatePicker,
} from "antd";
import {
  DollarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  HistoryOutlined,
  PrinterOutlined,
  MoneyCollectOutlined,
  CalendarOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  EditOutlined,
  LeftOutlined,
  RightOutlined,
} from "@ant-design/icons";
import {
  getStudentFeeStructures,
  getStudentPaymentHistory,
  getStudentEnrollments,
  getPaymentReceipt,
  processRefund,
  updatePaymentStatus,
} from "../../services/feeService";
import FeePaymentFormEnhanced from "../../components/forms/FeePaymentFormEnhanced";
import PaymentReceipt from "../../components/forms/PaymentReceipt";
import {
  recordFeePayment,
  createOrUpdateFeeStructure,
} from "../../services/feeService";
import api from "../../api/axiosInstance";
import dayjs from "dayjs";

const { Panel } = Collapse;
const { Text, Title } = Typography;

const getTimeValue = (value) => {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
};

const getInstallmentSortDate = (installment) => {
  if (
    installment?.paidAmount > 0 &&
    installment?.paidDate
  ) {
    return installment.paidDate;
  }

  return installment?.dueDate;
};

const getEnrollmentStartDate = (record) =>
  record?.enrollment?.batch?.startDate ||
  record?.enrollment?.enrollmentDate ||
  record?.enrollment?.createdAt ||
  record?.createdAt ||
  null;

const getRecordTotalFee = (record) => {
  const additionalFeeTotal = (record?.additionalFees || []).reduce(
    (acc, fee) => acc + Number(fee?.amount || 0),
    0,
  );

  return (
    Number(record?.admissionFee || 0) +
    Number(record?.courseFee || 0) +
    Number(record?.certificateFee || 0) +
    Number(record?.examFee || 0) +
    Number(record?.registrationFee || 0) +
    Number(record?.practicalFee || 0) +
    Number(record?.otherFee || 0) +
    additionalFeeTotal -
    Number(record?.discount || 0)
  );
};

const getRecordDurationMonths = (record) => {
  const duration = Number(
    record?.numberOfInstallments ||
      record?.installments?.length ||
      record?.course?.duration ||
      1,
  );

  return Number.isFinite(duration) && duration > 0 ? duration : 1;
};

const getMonthKey = (value) => {
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("YYYY-MM") : null;
};

const getInstallmentBalance = (installment) =>
  Math.max(
    0,
    Number(installment?.amount || 0) - Number(installment?.paidAmount || 0),
  );

const StudentFeeProfile = ({ studentId, studentInfo, onEnrollmentChanged }) => {
  const [feeStructures, setFeeStructures] = useState([]);
  const [payments, setPayments] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("1");

  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [selectedFeeStructure, setSelectedFeeStructure] = useState(null);
  const [selectedInstallment, setSelectedInstallment] = useState(null);
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [editAmount, setEditAmount] = useState("");
  const [editPaymentMethod, setEditPaymentMethod] = useState("Cash");
  const [editPaymentDate, setEditPaymentDate] = useState(null);
  const [editNotes, setEditNotes] = useState("");
  const [installmentsView, setInstallmentsView] = useState("list");
  const [trackerCourseFilter, setTrackerCourseFilter] = useState("all");
  const [trackerMonth, setTrackerMonth] = useState(null);
  const [selectedTrackerRowKeys, setSelectedTrackerRowKeys] = useState([]);

  useEffect(() => {
    if (studentId) {
      fetchStudentData();
    }
  }, [studentId]);

  const fetchStudentData = async () => {
    setLoading(true);
    try {
      const [feeResponse, paymentResponse, enrollmentResponse] =
        await Promise.all([
          getStudentFeeStructures(studentId),
          getStudentPaymentHistory(studentId),
          getStudentEnrollments(studentId),
        ]);

      if (feeResponse.success) setFeeStructures(feeResponse.data);
      if (paymentResponse.success) setPayments(paymentResponse.data.payments);
      if (enrollmentResponse.success) setEnrollments(enrollmentResponse.data);
    } catch (error) {
      message.error("Failed to fetch student fee data");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleRecordPayment = (feeStructure, installment = null) => {
    setSelectedFeeStructure(feeStructure);
    setSelectedInstallment(installment);
    setPaymentModalVisible(true);
  };

  const handleBulkTrackerPayment = () => {
    const selectedRows = trackerTableRows.filter((row) =>
      selectedTrackerRowKeys.includes(row.key),
    );

    if (!selectedRows.length) {
      message.warning("Please select one or more installments to pay.");
      return;
    }

    const firstRow = selectedRows[0];
    setSelectedFeeStructure(firstRow.feeStructureRecord);
    setSelectedInstallment(null);
    setPaymentModalVisible(true);
  };

  const handleEditPayment = (feeStructure, installment) => {
    const payment = payments.find(
      (p) => p.installmentNumber === installment.installmentNumber &&
            (p.feeStructure === feeStructure._id || p.feeStructure?._id === feeStructure._id)
    );
    if (payment) {
      setEditingPayment(payment);
      setEditAmount(payment.amount?.toString() || "");
      setEditPaymentMethod(payment.paymentMethod || "Cash");
      setEditPaymentDate(payment.paymentDate ? new Date(payment.paymentDate) : null);
      setEditNotes(payment.notes || "");
      setEditModalVisible(true);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingPayment || !editAmount) return;
    setProcessing(true);
    try {
      const updateData = {
        amount: Number(editAmount),
        paymentMethod: editPaymentMethod,
        notes: editNotes,
      };
      
      if (editPaymentDate) {
        updateData.paymentDate = editPaymentDate;
      }

      const response = await updatePaymentStatus(editingPayment._id, updateData);
      if (response.success) {
        message.success("Payment updated successfully!");
        setEditModalVisible(false);
        fetchStudentData();
      } else {
        message.error(response.message || "Failed to update payment");
      }
    } catch (error) {
      message.error(error.message || "Failed to update payment");
    } finally {
      setProcessing(false);
    }
  };

  const handleRefund = async (paymentId, amount) => {
    Modal.confirm({
      title: "Process Refund",
      icon: <ExclamationCircleOutlined />,
      content: `Are you sure you want to process a refund of Rs. ${amount?.toLocaleString()}? This action cannot be undone.`,
      okText: "Yes, Refund",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        setProcessing(true);
        try {
          const refundData = {
            refundAmount: amount,
            refundReason: "Manual refund request",
          };
          const response = await processRefund(paymentId, refundData);
          if (response.success) {
            message.success("Refund processed successfully!");
            fetchStudentData();
          } else {
            message.error(response.message || "Failed to process refund");
          }
        } catch (error) {
          message.error(error.message || "Failed to process refund");
          console.error("Refund error:", error);
        } finally {
          setProcessing(false);
        }
      },
    });
  };

  const handleViewReceipt = async (paymentId) => {
    try {
      console.log("Fetching receipt for payment ID:", paymentId);
      const response = await getPaymentReceipt(paymentId);
      console.log("Receipt response:", response);
      if (response.success) {
        const payment = response.data;
        const feeStructure = feeStructures.find(
          (fs) =>
            fs._id === payment.feeStructure ||
            (fs.student?._id === payment.student?._id &&
              fs.course?._id === payment.course?._id),
        );

        const enrichedData = {
          ...payment,
          feeStructure: feeStructure
            ? {
                totalFee: feeStructure.totalFee,
                paidAmount: feeStructure.paidAmount,
                remainingAmount: feeStructure.remainingAmount,
                feeStatus: feeStructure.feeStatus,
              }
            : null,
        };

        console.log("Enriched receipt data:", enrichedData);
        setReceiptData(enrichedData);
        setReceiptVisible(true);
      } else {
        message.error(response.message || "Failed to load receipt");
      }
    } catch (error) {
      console.error("Receipt error:", error);
      message.error(error.message || "Failed to load receipt");
    }
  };

  const handleViewReceiptByNumber = (receiptNumber) => {
    const payment = payments.find((p) => p.receiptNo === receiptNumber);
    if (payment && payment._id) {
      handleViewReceipt(payment._id);
    } else {
      message.error("Payment not found for this receipt");
    }
  };

  const handlePaymentSubmit = async (paymentData) => {
    setProcessing(true);
    try {
      const response = await recordFeePayment(paymentData);
      if (response.success) {
        message.success("Payment recorded successfully!");
        setPaymentModalVisible(false);
        setSelectedFeeStructure(null);
        fetchStudentData();
      }
    } catch (error) {
      message.error(error.message || "Failed to record payment");
    } finally {
      setProcessing(false);
    }
  };

  const handleUnlinkCourse = async (feeStructure) => {
    try {
      const enrollmentId =
        feeStructure.enrollment?._id || feeStructure.enrollment;

      if (!enrollmentId) {
        message.error("Invalid enrollment ID");
        return;
      }

      const response = await api.delete(`/enrollment/${enrollmentId}`);
      if (response.data.success) {
        message.success(
          `Course "${feeStructure.course?.courseName}" unlinked successfully!`,
        );
        fetchStudentData();
        if (typeof onEnrollmentChanged === "function") {
          onEnrollmentChanged();
        }
      }
    } catch (error) {
      console.error("Error unlinking course:", error);
      message.error(error.response?.data?.message || "Failed to unlink course");
    }
  };

  const feeStructureRows = useMemo(() => {
    const mapByEnrollmentId = new Map();
    const mapByStudentCourse = new Map();
    feeStructures.forEach((fs) => {
      const enrollmentId = fs.enrollment?._id || fs.enrollment;
      if (enrollmentId && !mapByEnrollmentId.has(String(enrollmentId))) {
        mapByEnrollmentId.set(String(enrollmentId), fs);
      }
      const courseId = fs.course?._id || fs.course;
      const studentCourseKey = `${fs.student?._id || fs.student}:${courseId}`;
      if (!mapByStudentCourse.has(studentCourseKey)) {
        mapByStudentCourse.set(studentCourseKey, fs);
      }
    });

    const rowsFromEnrollments = enrollments.map((enrollment) => {
      const enrollmentId = String(enrollment._id);
      const courseId = enrollment.course?._id || enrollment.course;
      const linkedFee =
        mapByEnrollmentId.get(enrollmentId) ||
        mapByStudentCourse.get(`${studentId}:${courseId}`);

      if (linkedFee) {
        return {
          ...linkedFee,
          enrollment: linkedFee.enrollment || enrollment,
          course: linkedFee.course || enrollment.course,
          hasFeeStructure: true,
          rowKey: linkedFee._id,
        };
      }

      return {
        _id: `enrollment-${enrollmentId}`,
        enrollment,
        course: enrollment.course,
        admissionFee: 0,
        courseFee: 0,
        certificateFee: 0,
        examFee: 0,
        registrationFee: 0,
        practicalFee: 0,
        otherFee: 0,
        additionalFees: [],
        discount: 0,
        paidAmount: 0,
        remainingAmount: 0,
        feeStatus: "Unpaid",
        installmentEnabled: false,
        numberOfInstallments: 0,
        installments: [],
        hasFeeStructure: false,
        rowKey: `enrollment-${enrollmentId}`,
      };
    });

    const orphanFeeStructures = feeStructures
      .filter((fs) => {
        const enrollmentId = fs.enrollment?._id || fs.enrollment;
        if (enrollmentId && mapByEnrollmentId.has(String(enrollmentId))) {
          return false;
        }
        const studentCourseKey = `${fs.student?._id || fs.student}:${
          fs.course?._id || fs.course
        }`;
        return !mapByStudentCourse.has(studentCourseKey);
      })
      .map((fs) => ({
        ...fs,
        hasFeeStructure: true,
        rowKey: fs._id,
      }));

    return [...rowsFromEnrollments, ...orphanFeeStructures];
  }, [enrollments, feeStructures, studentId]);

  const sortedPayments = useMemo(() => {
    return [...payments].sort((a, b) => {
      const paymentDateDiff =
        getTimeValue(b.paymentDate) - getTimeValue(a.paymentDate);

      if (paymentDateDiff !== 0) return paymentDateDiff;

      return getTimeValue(b.createdAt) - getTimeValue(a.createdAt);
    });
  }, [payments]);

  const getSortedInstallments = (installments = []) => {
    return [...installments].sort(
      (left, right) =>
        Number(left.installmentNumber || 0) -
        Number(right.installmentNumber || 0),
    );
  };

  const totalFee = feeStructureRows.reduce((sum, fs) => {
    return sum + getRecordTotalFee(fs);
  }, 0);
  const totalPaid = feeStructureRows.reduce(
    (sum, fs) => sum + (fs.paidAmount || 0),
    0,
  );
  const totalRemaining = feeStructureRows.reduce((sum, fs) => {
    const remaining = getRecordTotalFee(fs) - (fs.paidAmount || 0);
    return sum + Math.max(0, remaining);
  }, 0);

  const trackerBaseRows = useMemo(() => {
    return feeStructureRows
      .filter((record) => record?.course?._id || record?.course?.courseName)
      .map((record) => {
        const startDate = getEnrollmentStartDate(record);
        const startMonth = startDate ? dayjs(startDate).startOf("month") : null;
        const durationMonths = getRecordDurationMonths(record);
        const endMonth = startMonth
          ? startMonth.add(durationMonths - 1, "month")
          : null;

        const normalizedInstallments =
          record.installmentEnabled && record.installments?.length
            ? record.installments
            : [
                {
                  installmentNumber: 1,
                  description: "Full payment",
                  amount: getRecordTotalFee(record),
                  paidAmount: record.paidAmount || 0,
                  dueDate: startDate,
                  paidDate: sortedPayments.find(
                    (payment) =>
                      (payment.feeStructure === record._id ||
                        payment.feeStructure?._id === record._id) &&
                      payment.status !== "Refunded",
                  )?.paymentDate,
                  status:
                    record.feeStatus === "Unpaid"
                      ? "Pending"
                      : record.feeStatus || "Pending",
                  receiptNumber: sortedPayments.find(
                    (payment) =>
                      (payment.feeStructure === record._id ||
                        payment.feeStructure?._id === record._id) &&
                      payment.status !== "Refunded",
                  )?.receiptNo,
                  voucherNo: sortedPayments.find(
                    (payment) =>
                      (payment.feeStructure === record._id ||
                        payment.feeStructure?._id === record._id) &&
                      payment.status !== "Refunded",
                  )?.voucherNo,
                },
              ];

        return {
          ...record,
          trackerStartDate: startDate,
          trackerStartMonth: startMonth,
          trackerEndMonth: endMonth,
          trackerDurationMonths: durationMonths,
          trackerInstallments: normalizedInstallments,
        };
      })
      .filter((record) => record.trackerStartMonth && record.trackerEndMonth);
  }, [feeStructureRows, sortedPayments]);

  const trackerCourseOptions = useMemo(() => {
    return trackerBaseRows.map((record) => ({
      value: record._id,
      label: record.course?.courseName || "Course",
    }));
  }, [trackerBaseRows]);

  const trackerAvailableMonths = useMemo(() => {
    const monthMap = new Map();
    const filteredRows =
      trackerCourseFilter === "all"
        ? trackerBaseRows
        : trackerBaseRows.filter((record) => record._id === trackerCourseFilter);

    filteredRows.forEach((record) => {
      let cursor = record.trackerStartMonth;
      while (cursor.isBefore(record.trackerEndMonth) || cursor.isSame(record.trackerEndMonth, "month")) {
        monthMap.set(cursor.format("YYYY-MM"), cursor.format("MMMM YYYY"));
        cursor = cursor.add(1, "month");
      }
    });

    return [...monthMap.entries()]
      .sort(([a], [b]) => (a > b ? 1 : -1))
      .map(([value, label]) => ({ value, label }));
  }, [trackerBaseRows, trackerCourseFilter]);

  useEffect(() => {
    if (!trackerAvailableMonths.length) {
      setTrackerMonth(null);
      return;
    }

    const todayMonth = dayjs().format("YYYY-MM");
    const existingMonth = trackerAvailableMonths.find(
      (item) => item.value === trackerMonth,
    );

    if (existingMonth) return;

    const defaultMonth =
      trackerAvailableMonths.find((item) => item.value === todayMonth)?.value ||
      trackerAvailableMonths[trackerAvailableMonths.length - 1]?.value ||
      null;

    setTrackerMonth(defaultMonth);
  }, [trackerAvailableMonths, trackerMonth]);

  const trackerMonthIndex = trackerAvailableMonths.findIndex(
    (item) => item.value === trackerMonth,
  );
  const selectedTrackerMonthLabel =
    trackerAvailableMonths.find((item) => item.value === trackerMonth)?.label ||
    "Select month";

  const trackerVisibleRows = useMemo(() => {
    if (!trackerMonth) return [];

    const monthStart = dayjs(`${trackerMonth}-01`).startOf("month");
    const filteredRows =
      trackerCourseFilter === "all"
        ? trackerBaseRows
        : trackerBaseRows.filter((record) => record._id === trackerCourseFilter);

    return filteredRows
      .filter(
        (record) =>
          (monthStart.isAfter(record.trackerStartMonth) ||
            monthStart.isSame(record.trackerStartMonth, "month")) &&
          (monthStart.isBefore(record.trackerEndMonth) ||
            monthStart.isSame(record.trackerEndMonth, "month")),
      )
      .map((record) => {
        const monthInstallments = record.trackerInstallments
          .filter((installment) => getMonthKey(installment.dueDate) === trackerMonth)
          .sort((a, b) => {
            const dateDiff =
              getTimeValue(getInstallmentSortDate(a)) -
              getTimeValue(getInstallmentSortDate(b));

            if (dateDiff !== 0) return dateDiff;
            return (a.installmentNumber || 0) - (b.installmentNumber || 0);
          });

        return {
          ...record,
          trackerMonthInstallments: monthInstallments,
          trackerMonthScheduled: monthInstallments.reduce(
            (sum, installment) => sum + Number(installment.amount || 0),
            0,
          ),
          trackerMonthPaid: monthInstallments.reduce(
            (sum, installment) => sum + Number(installment.paidAmount || 0),
            0,
          ),
          trackerMonthRemaining: monthInstallments.reduce(
            (sum, installment) => sum + getInstallmentBalance(installment),
            0,
          ),
        };
      });
  }, [trackerBaseRows, trackerCourseFilter, trackerMonth]);

  const trackerSummary = useMemo(() => {
    const installmentRows = trackerVisibleRows.flatMap((record) =>
      record.trackerMonthInstallments.map((installment) => ({
        ...installment,
        courseName: record.course?.courseName || "Course",
      })),
    );

    return {
      coursesInMonth: trackerVisibleRows.length,
      scheduledAmount: installmentRows.reduce(
        (sum, installment) => sum + Number(installment.amount || 0),
        0,
      ),
      paidAmount: installmentRows.reduce(
        (sum, installment) => sum + Number(installment.paidAmount || 0),
        0,
      ),
      remainingAmount: installmentRows.reduce(
        (sum, installment) => sum + getInstallmentBalance(installment),
        0,
      ),
      paidCount: installmentRows.filter((installment) => installment.status === "Paid")
        .length,
      partialCount: installmentRows.filter(
        (installment) => installment.status === "Partial",
      ).length,
      pendingCount: installmentRows.filter(
        (installment) => installment.status === "Pending",
      ).length,
      overdueCount: installmentRows.filter(
        (installment) => installment.status === "Overdue",
      ).length,
    };
  }, [trackerVisibleRows]);

  const trackerTableRows = useMemo(() => {
    return trackerVisibleRows
      .flatMap((record) =>
        record.trackerMonthInstallments.map((installment) => ({
          ...installment,
          key: `${record._id}-${installment._id || installment.installmentNumber}`,
          feeStructureRecord: record,
          courseName: record.course?.courseName || "Course",
          courseCode: record.course?.courseId || "-",
          durationMonths: record.trackerDurationMonths,
          balance: getInstallmentBalance(installment),
          monthPaidAmount: Number(installment.paidAmount || 0),
          monthAmount: Number(installment.amount || 0),
          remainingAmount: getInstallmentBalance(installment),
          rowId: `${record._id}-${installment._id || installment.installmentNumber}`,
          studentId: record.student?._id || record.student,
          courseId: record.course?._id || record.course,
          feeStructureId: record._id,
        })),
      )
      .sort((a, b) => {
        const dueDateDiff = getTimeValue(a.dueDate) - getTimeValue(b.dueDate);
        if (dueDateDiff !== 0) return dueDateDiff;

        const courseDiff = String(a.courseName).localeCompare(String(b.courseName));
        if (courseDiff !== 0) return courseDiff;

        return (a.installmentNumber || 0) - (b.installmentNumber || 0);
      });
  }, [trackerVisibleRows]);

  const selectedTrackerRows = useMemo(
    () =>
      trackerTableRows.filter((row) => selectedTrackerRowKeys.includes(row.key)),
    [trackerTableRows, selectedTrackerRowKeys],
  );

  useEffect(() => {
    setSelectedTrackerRowKeys((current) =>
      current.filter((key) => trackerTableRows.some((row) => row.key === key)),
    );
  }, [trackerTableRows]);

  const trackerPaymentActivity = useMemo(() => {
    if (!trackerMonth) return [];

    return sortedPayments.filter((payment) => {
      const paymentMonth = getMonthKey(payment.paymentDate);
      if (paymentMonth !== trackerMonth) return false;
      if (trackerCourseFilter === "all") return true;

      const paymentFeeStructureId = payment.feeStructure?._id || payment.feeStructure;
      return paymentFeeStructureId === trackerCourseFilter;
    });
  }, [sortedPayments, trackerMonth, trackerCourseFilter]);

  const renderInstallmentTrackerContent = () => (
    <Card size="small">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Title level={5} style={{ marginBottom: 4 }}>
              Month-wise installment tracking
            </Title>
            <Text type="secondary">
              Track previous and upcoming month installments by course duration, including paid, unpaid, pending, and partial amounts.
            </Text>
          </div>

          <Space wrap>
            <Select
              value={trackerCourseFilter}
              onChange={setTrackerCourseFilter}
              style={{ minWidth: 240 }}
              options={[
                { value: "all", label: "All enrolled courses" },
                ...trackerCourseOptions,
              ]}
            />
            <Button
              icon={<LeftOutlined />}
              onClick={() =>
                trackerMonthIndex > 0 &&
                setTrackerMonth(
                  trackerAvailableMonths[trackerMonthIndex - 1].value,
                )
              }
              disabled={trackerMonthIndex <= 0}
            >
              Previous
            </Button>
            <Select
              value={trackerMonth}
              onChange={setTrackerMonth}
              style={{ minWidth: 180 }}
              options={trackerAvailableMonths}
              placeholder="Select month"
            />
            <Button
              icon={<RightOutlined />}
              onClick={() =>
                trackerMonthIndex >= 0 &&
                trackerMonthIndex < trackerAvailableMonths.length - 1 &&
                setTrackerMonth(
                  trackerAvailableMonths[trackerMonthIndex + 1].value,
                )
              }
              disabled={
                trackerMonthIndex < 0 ||
                trackerMonthIndex >= trackerAvailableMonths.length - 1
              }
            >
              Next
            </Button>
          </Space>
        </div>

        <Row gutter={16}>
          <Col xs={24} md={12} xl={6}>
            <Statistic
              title={`Scheduled In ${selectedTrackerMonthLabel}`}
              value={trackerSummary.scheduledAmount}
              prefix="Rs"
              styles={{ content: { color: "#1677ff" } }}
            />
          </Col>
          <Col xs={24} md={12} xl={6}>
            <Statistic
              title="Paid Portion"
              value={trackerSummary.paidAmount}
              prefix="Rs"
              styles={{ content: { color: "#52c41a" } }}
            />
          </Col>
          <Col xs={24} md={12} xl={6}>
            <Statistic
              title="Remaining Portion"
              value={trackerSummary.remainingAmount}
              prefix="Rs"
              styles={{ content: { color: "#ff4d4f" } }}
            />
          </Col>
          <Col xs={24} md={12} xl={6}>
            <Statistic
              title="Courses In View"
              value={trackerSummary.coursesInMonth}
              styles={{ content: { color: "#722ed1" } }}
            />
          </Col>
        </Row>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card size="small">
            <div className="text-xs text-gray-500">Paid installments</div>
            <div className="text-xl font-semibold text-green-600">
              {trackerSummary.paidCount}
            </div>
          </Card>
          <Card size="small">
            <div className="text-xs text-gray-500">Partial installments</div>
            <div className="text-xl font-semibold text-orange-500">
              {trackerSummary.partialCount}
            </div>
          </Card>
          <Card size="small">
            <div className="text-xs text-gray-500">Pending installments</div>
            <div className="text-xl font-semibold text-gray-700">
              {trackerSummary.pendingCount}
            </div>
          </Card>
          <Card size="small">
            <div className="text-xs text-gray-500">Overdue installments</div>
            <div className="text-xl font-semibold text-red-600">
              {trackerSummary.overdueCount}
            </div>
          </Card>
        </div>

        {trackerTableRows.length === 0 ? (
          <Card size="small" className="text-center">
            <Text type="secondary">
              No installment record is scheduled for {selectedTrackerMonthLabel}.
            </Text>
          </Card>
        ) : (
          <Card
            size="small"
            title={
              trackerCourseFilter === "all"
                ? `All course installments for ${selectedTrackerMonthLabel}`
                : `Selected course installments for ${selectedTrackerMonthLabel}`
            }
            extra={
              <Space wrap>
                <Text type="secondary">
                  {selectedTrackerRows.length} selected
                </Text>
                <Button
                  type="primary"
                  disabled={!selectedTrackerRows.length}
                  onClick={handleBulkTrackerPayment}
                >
                  Pay Selected
                </Button>
              </Space>
            }
          >
            <Table
              size="small"
              pagination={false}
              rowKey="key"
              dataSource={trackerTableRows}
              rowSelection={{
                selectedRowKeys: selectedTrackerRowKeys,
                onChange: (keys, rows) => {
                  const payableRows = rows.filter(
                    (row) => row.status !== "Paid" && Number(row.remainingAmount || 0) > 0,
                  );
                  setSelectedTrackerRowKeys(payableRows.map((row) => row.key));
                },
                getCheckboxProps: (record) => ({
                  disabled:
                    record.status === "Paid" ||
                    Number(record.remainingAmount || 0) <= 0,
                }),
              }}
              columns={[
                {
                  title: "Course",
                  dataIndex: "courseName",
                  key: "courseName",
                  render: (_, row) => (
                    <div>
                      <div className="font-medium">{row.courseName}</div>
                      <div className="text-xs text-gray-500">
                        {row.courseCode} • Duration: {row.durationMonths} month
                        {row.durationMonths > 1 ? "s" : ""}
                      </div>
                    </div>
                  ),
                },
                {
                  title: "#",
                  dataIndex: "installmentNumber",
                  key: "installmentNumber",
                  render: (value) => <Tag color="blue">#{value}</Tag>,
                },
                {
                  title: "Description",
                  dataIndex: "description",
                  key: "description",
                  render: (value) => value || "Installment",
                },
                {
                  title: "Due Date",
                  dataIndex: "dueDate",
                  key: "dueDate",
                  render: (value) =>
                    value ? dayjs(value).format("DD MMM YYYY") : "-",
                },
                {
                  title: "Amount",
                  dataIndex: "monthAmount",
                  key: "monthAmount",
                  render: (value) =>
                    `Rs ${Number(value || 0).toLocaleString()}`,
                },
                {
                  title: "Paid",
                  dataIndex: "monthPaidAmount",
                  key: "monthPaidAmount",
                  render: (value) => (
                    <span className="text-green-600 font-medium">
                      Rs {Number(value || 0).toLocaleString()}
                    </span>
                  ),
                },
                {
                  title: "Unpaid",
                  dataIndex: "balance",
                  key: "balance",
                  render: (value) => (
                    <span className="text-red-600 font-medium">
                      Rs {Number(value || 0).toLocaleString()}
                    </span>
                  ),
                },
                {
                  title: "Status",
                  dataIndex: "status",
                  key: "status",
                  render: (status) => {
                    const colors = {
                      Paid: "green",
                      Partial: "orange",
                      Pending: "default",
                      Overdue: "red",
                    };
                    return <Tag color={colors[status]}>{status}</Tag>;
                  },
                },
                {
                  title: "Receipt",
                  dataIndex: "receiptNumber",
                  key: "receiptNumber",
                  render: (value) => value || "-",
                },
                {
                  title: "Action",
                  key: "action",
                  render: (_, installment) => (
                    <Space size="small">
                      {installment.status !== "Paid" && (
                        <Button
                          type="primary"
                          size="small"
                          onClick={() => {
                            setSelectedTrackerRowKeys([]);
                            handleRecordPayment(
                              installment.feeStructureRecord,
                              installment,
                            );
                          }}
                        >
                          Pay
                        </Button>
                      )}
                      {installment.receiptNumber && (
                        <Button
                          size="small"
                          onClick={() =>
                            handleViewReceiptByNumber(
                              installment.receiptNumber,
                            )
                          }
                        >
                          Receipt
                        </Button>
                      )}
                    </Space>
                  ),
                },
                ]}
            />
          </Card>
        )}

        <Card
          size="small"
          title={`Payment activity in ${selectedTrackerMonthLabel}`}
        >
          <Table
            size="small"
            rowKey="_id"
            pagination={false}
            dataSource={trackerPaymentActivity}
            locale={{
              emptyText: "No payment activity recorded in this month.",
            }}
            columns={[
              {
                title: "Receipt No",
                dataIndex: "receiptNo",
                key: "receiptNo",
                render: (value) => value || "-",
              },
              {
                title: "Course",
                dataIndex: ["course", "courseName"],
                key: "course",
                render: (value) => value || "Course",
              },
              {
                title: "Installment",
                dataIndex: "installmentNumber",
                key: "installmentNumber",
                render: (value) =>
                  value ? `#${value}` : "Full payment",
              },
              {
                title: "Amount",
                dataIndex: "amount",
                key: "amount",
                render: (value) =>
                  `Rs ${Number(value || 0).toLocaleString()}`,
              },
              {
                title: "Payment Date",
                dataIndex: "paymentDate",
                key: "paymentDate",
                render: (value) =>
                  value ? dayjs(value).format("DD MMM YYYY") : "-",
              },
              {
                title: "Status",
                dataIndex: "status",
                key: "status",
                render: (value) => <Tag>{value || "Completed"}</Tag>,
              },
            ]}
          />
        </Card>
      </div>
    </Card>
  );

  const feeStructureColumns = [
    {
      title: "Course",
      dataIndex: ["course", "courseName"],
      key: "course",
      render: (text, record) => (
        <div>
          <div className="font-semibold">{text}</div>
          <div className="text-xs opacity-50">{record.course?.courseId}</div>
        </div>
      ),
    },
    {
      title: "Total Fee",
      dataIndex: "totalFee",
      key: "totalFee",
      render: (fee, record) => {
        const additionalFeeTotal = (record.additionalFees || []).reduce(
          (acc, item) => acc + (item.amount || 0),
          0,
        );
        const correctTotal =
          (record.admissionFee || 0) +
          (record.courseFee || 0) +
          (record.certificateFee || 0) +
          (record.examFee || 0) +
          (record.registrationFee || 0) +
          (record.practicalFee || 0) +
          (record.otherFee || 0) +
          additionalFeeTotal -
          (record.discount || 0);
        return (
          <span className="font-semibold">
            Rs {correctTotal.toLocaleString()}
          </span>
        );
      },
    },
    {
      title: "Paid",
      dataIndex: "paidAmount",
      key: "paidAmount",
      render: (amount) => (
        <span className="text-green-600 font-semibold">
          Rs {amount?.toLocaleString()}
        </span>
      ),
    },
    {
      title: "Remaining",
      dataIndex: "remainingAmount",
      key: "remainingAmount",
      render: (amount, record) => {
        const additionalFeeTotal = (record.additionalFees || []).reduce(
          (acc, item) => acc + (item.amount || 0),
          0,
        );
        const correctTotal =
          (record.admissionFee || 0) +
          (record.courseFee || 0) +
          (record.certificateFee || 0) +
          (record.examFee || 0) +
          (record.registrationFee || 0) +
          (record.practicalFee || 0) +
          (record.otherFee || 0) +
          additionalFeeTotal -
          (record.discount || 0);
        const correctRemaining = Math.max(
          0,
          correctTotal - (record.paidAmount || 0),
        );
        return (
          <span className="text-red-600 font-semibold">
            Rs {correctRemaining.toLocaleString()}
          </span>
        );
      },
    },
    {
      title: "Status",
      dataIndex: "feeStatus",
      key: "feeStatus",
      render: (status) => {
        const colors = {
          Paid: "green",
          Partial: "orange",
          Unpaid: "red",
          Overdue: "volcano",
        };
        return <Tag color={colors[status]}>{status}</Tag>;
      },
    },
    {
      title: "Installments",
      key: "installments",
      render: (_, record) => {
        if (!record.installmentEnabled) return <Tag>No</Tag>;

        const paid =
          record.installments?.filter((i) => i.status === "Paid").length || 0;
        const total =
          record.installments?.length || record.numberOfInstallments || 0;

        const amounts = record.installments?.map((i) => i.amount) || [];
        const hasVaryingAmounts =
          amounts.length > 0 && !amounts.every((amt) => amt === amounts[0]);

        return (
          <div>
            <Tag color="blue">
              {paid}/{total} Paid
            </Tag>
            <div className="text-xs mt-1">
              {hasVaryingAmounts ? (
                <span className="text-gray-600">Varying amounts</span>
              ) : (
                <span>Rs {(amounts[0] || 0).toLocaleString()} each</span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      title: "Actions",
      key: "actions",
      render: (_, record) => (
        <Space direction="vertical" size="small">
          <Button
            type="primary"
            size="small"
            icon={<DollarOutlined />}
            onClick={() => handleRecordPayment(record)}
            disabled={!record.hasFeeStructure || record.feeStatus === "Paid"}
            block
          >
            Pay
          </Button>
          <Popconfirm
            title="Unlink Course"
            description={`Are you sure you want to unlink "${record.course?.courseName}"? This will remove all fee records and enrollment.`}
            onConfirm={() => handleUnlinkCourse(record)}
            okText="Yes, Unlink"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
            icon={<ExclamationCircleOutlined style={{ color: "red" }} />}
          >
            <Button danger size="small" icon={<DeleteOutlined />} block>
              Unlink
            </Button>
          </Popconfirm>
          {!record.hasFeeStructure && (
            <Text type="secondary" className="text-xs">
              Fee structure missing
            </Text>
          )}
        </Space>
      ),
    },
  ];

  const paymentColumns = [
    {
      title: "Receipt No",
      dataIndex: "receiptNo",
      key: "receiptNo",
      render: (text) => <span className="font-mono text-xs">{text}</span>,
    },
    {
      title: "Course",
      dataIndex: ["course", "courseName"],
      key: "course",
    },
    {
      title: "Amount",
      dataIndex: "amount",
      key: "amount",
      render: (amount) => (
        <span className="font-semibold text-green-600">
          Rs {amount?.toLocaleString()}
        </span>
      ),
    },
    {
      title: "Payment Date",
      dataIndex: "paymentDate",
      key: "paymentDate",
      render: (date) => new Date(date).toLocaleDateString(),
    },
    {
      title: "Method",
      dataIndex: "paymentMethod",
      key: "paymentMethod",
      render: (method) => <Tag>{method}</Tag>,
    },
    {
      title: "Installment",
      dataIndex: "installmentNumber",
      key: "installmentNumber",
      render: (installmentNumber, record) => {
        if (!installmentNumber) return <Tag>Full Payment</Tag>;

        const feeStructure = feeStructures.find(
          (fs) =>
            fs._id === record.feeStructure ||
            (fs.student?._id === record.student?._id &&
              fs.course?._id === record.course?._id),
        );

        let installmentStatus = null;
        if (installmentNumber && feeStructure?.installments) {
          const installment = feeStructure.installments.find(
            (inst) => inst.installmentNumber === installmentNumber,
          );
          installmentStatus = installment?.status || null;
        }

        return (
          <Space direction="vertical" size="small">
            <Tag color={installmentStatus === "Paid" ? "green" : installmentStatus === "Partial" ? "orange" : "default"}>
              Installment #{installmentNumber}
            </Tag>
            {installmentStatus === "Partial" && record.amount && (
              <Text type="secondary" className="text-xs">
                Partial: Rs {record.amount?.toLocaleString()}
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: "Voucher No",
      dataIndex: "voucherNo",
      key: "voucherNo",
      render: (text) => <span className="font-mono text-xs">{text || "-"}</span>,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status) => {
        const colors = {
          Completed: "green",
          Pending: "orange",
          Failed: "red",
          Refunded: "purple",
        };
        return <Tag color={colors[status]}>{status}</Tag>;
      },
    },
    {
      title: "Actions",
      key: "actions",
      render: (_, record) => (
        <Space size="small">
          <Button
            size="small"
            type="link"
            icon={<PrinterOutlined />}
            onClick={() => handleViewReceipt(record._id)}
          >
            Receipt
          </Button>
          {record.status !== "Refunded" && (
            <Popconfirm
              title="Refund Payment"
              description={`Refund Rs. ${record.amount?.toLocaleString()}?`}
              onConfirm={() => handleRefund(record._id, record.amount)}
              okText="Yes"
              cancelText="No"
              okButtonProps={{ danger: true, loading: processing }}
            >
              <Button
                size="small"
                type="link"
                danger
                icon={<MoneyCollectOutlined />}
                disabled={processing}
              >
                Refund
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="student-fee-profile">
      <Card className="mb-4">
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="Total Fee"
              value={totalFee}
              prefix="Rs"
              styles={{ content: { color: "#1890ff" } }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Total Paid"
              value={totalPaid}
              prefix="Rs"
              styles={{ content: { color: "#52c41a" } }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Total Remaining"
              value={totalRemaining}
              prefix="Rs"
              styles={{ content: { color: "#ff4d4f" } }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Enrolled Courses"
              value={enrollments.length}
              styles={{ content: { color: "#722ed1" } }}
            />
          </Col>
        </Row>
      </Card>

      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <Tabs.TabPane
            tab={
              <span>
                <CalendarOutlined />
                Installment Tracker
              </span>
            }
            key="4"
          >
            {renderInstallmentTrackerContent()}
          </Tabs.TabPane>

          <Tabs.TabPane
            tab={
              <span>
                <FileTextOutlined />
                Fee Structures
              </span>
            }
            key="1"
          >
            <Card size="small">
              <Table
                columns={feeStructureColumns}
                dataSource={feeStructureRows}
                rowKey={(record) => record.rowKey || record._id}
                loading={loading}
                pagination={{ pageSize: 10 }}
                expandable={{
                  expandedRowRender: (record) => {
                    return (
                      <div className="p-4 bg-gray-50">
                        <h4 className="font-semibold mb-4 text-lg flex items-center gap-2">
                          <MoneyCollectOutlined />
                          {record.installmentEnabled &&
                          record.installments?.length
                            ? "Installment Payment Plan"
                            : "Fee Details"}
                        </h4>

                        <div className="mb-4 border border-gray-200 rounded-lg overflow-hidden">
                          <div className="bg-gray-100 px-4 py-3 border-b border-gray-200">
                            <Typography.Text strong className="text-gray-800">
                              Fee Breakdown
                            </Typography.Text>
                          </div>
                          <div className="p-4 bg-white">
                            <div className="grid grid-cols-3 gap-4 mb-4">
                              <div className="border border-gray-200 rounded p-3">
                                <div className="text-xs text-gray-500 mb-1">Admission Fee</div>
                                {record.discountOnAdmission > 0 ? (
                                  <div>
                                    <div className="text-sm text-gray-400 line-through">
                                      Rs {record.admissionFee?.toLocaleString()}
                                    </div>
                                    <div className="text-sm text-green-600 font-medium">
                                      -Rs {record.discountOnAdmission?.toLocaleString()} discount
                                    </div>
                                    <div className="text-lg font-semibold text-gray-800 mt-1">
                                      Rs {(record.admissionFee - record.discountOnAdmission || 0).toLocaleString()}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-lg font-semibold text-gray-800">
                                    Rs {record.admissionFee?.toLocaleString()}
                                  </div>
                                )}
                              </div>

                              <div className="border border-gray-200 rounded p-3">
                                <div className="text-xs text-gray-500 mb-1">
                                  Course Fee
                                  {record.numberOfInstallments > 1 && (
                                    <span className="ml-1">({record.numberOfInstallments} months)</span>
                                  )}
                                </div>
                                {record.discountOnCourseFee > 0 ? (
                                  <div>
                                    <div className="text-sm text-gray-400 line-through">
                                      Rs {record.courseFee?.toLocaleString()}
                                    </div>
                                    <div className="text-sm text-green-600 font-medium">
                                      -Rs {record.discountOnCourseFee?.toLocaleString()} discount
                                    </div>
                                    <div className="text-lg font-semibold text-gray-800 mt-1">
                                      Rs {(record.courseFee - record.discountOnCourseFee || 0).toLocaleString()}
                                    </div>
                                    {record.numberOfInstallments > 1 && (
                                      <div className="text-xs text-blue-600 mt-1">
                                        {record.numberOfInstallments} × Rs {(((record.courseFee - record.discountOnCourseFee) / record.numberOfInstallments) || 0).toFixed(0)}/month
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div>
                                    <div className="text-lg font-semibold text-gray-800">
                                      Rs {record.courseFee?.toLocaleString()}
                                    </div>
                                    {record.numberOfInstallments > 1 && (
                                      <div className="text-xs text-blue-600 mt-1">
                                        {record.numberOfInstallments} × Rs {(record.courseFee / record.numberOfInstallments || 0).toFixed(0)}/month
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="border border-gray-200 rounded p-3">
                                <div className="text-xs text-gray-500 mb-1">Certificate Fee</div>
                                <div className="text-lg font-semibold text-gray-800">
                                  Rs {record.certificateFee?.toLocaleString()}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">Due on completion</div>
                              </div>
                            </div>

                            <div className="border-t border-gray-200 pt-4">
                              <div className="flex justify-between items-center">
                                <div>
                                  <div className="text-sm text-gray-500">Original Total</div>
                                  <div className="text-lg text-gray-400 line-through">
                                    Rs {(record.admissionFee + record.courseFee + record.certificateFee + (record.examFee || 0) + (record.registrationFee || 0) + (record.practicalFee || 0) + (record.otherFee || 0) + ((record.additionalFees || []).reduce((acc, fee) => acc + (fee.amount || 0), 0))).toLocaleString()}
                                  </div>
                                </div>
                                
                                {(record.discountOnAdmission > 0 || record.discountOnCourseFee > 0) && (
                                  <div className="text-center">
                                    <div className="text-sm text-gray-500">Total Discount</div>
                                    <div className="text-lg font-semibold text-green-600">
                                      -Rs {((record.discountOnAdmission || 0) + (record.discountOnCourseFee || 0)).toLocaleString()}
                                    </div>
                                  </div>
                                )}
                                
                                <div className="text-right">
                                  <div className="text-sm text-gray-500">Final Total</div>
                                  <div className="text-xl font-bold text-gray-800">
                                    Rs {(record.admissionFee + record.courseFee + record.certificateFee + (record.examFee || 0) + (record.registrationFee || 0) + (record.practicalFee || 0) + (record.otherFee || 0) + ((record.additionalFees || []).reduce((acc, fee) => acc + (fee.amount || 0), 0)) - (record.discount || 0)).toLocaleString()}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {record.installmentEnabled &&
                        record.installments?.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                              <thead>
                                <tr className="bg-gray-100 border-b border-gray-200">
                                  <th className="text-left p-3 text-sm font-semibold text-gray-700">#</th>
                                  <th className="text-left p-3 text-sm font-semibold text-gray-700">Description</th>
                                  <th className="text-left p-3 text-sm font-semibold text-gray-700">Amount</th>
                                  <th className="text-left p-3 text-sm font-semibold text-gray-700">Paid</th>
                                  <th className="text-left p-3 text-sm font-semibold text-gray-700">Due Date</th>
                                  <th className="text-left p-3 text-sm font-semibold text-gray-700">Status</th>
                                  <th className="text-left p-3 text-sm font-semibold text-gray-700">Voucher No</th>
                                  <th className="text-left p-3 text-sm font-semibold text-gray-700">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {getSortedInstallments(record.installments).map((inst) => {
                                  const isPaid = inst.status === "Paid";
                                  const isPartial = inst.status === "Partial";
                                  const isOverdue = inst.status === "Overdue";
                                  const displayDate = getInstallmentSortDate(inst);
                                  
                                  return (
                                    <tr 
                                      key={inst._id || inst.installmentNumber}
                                      className={`border-b border-gray-100 hover:bg-gray-50 ${isPaid ? 'bg-green-50' : ''}`}
                                    >
                                      <td className="p-3 text-sm">
                                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${
                                          isPaid ? 'bg-green-100 text-green-700' :
                                          isPartial ? 'bg-orange-100 text-orange-700' :
                                          isOverdue ? 'bg-red-100 text-red-700' :
                                          'bg-gray-100 text-gray-700'
                                        }`}>
                                          {inst.installmentNumber}
                                        </span>
                                      </td>
                                      <td className="p-3 text-sm">
                                        <div className="font-medium text-gray-800">
                                          {inst.description || `Installment ${inst.installmentNumber}`}
                                        </div>
                                        {inst.feeComponents && (
                                          <div className="text-xs text-gray-500 mt-1">
                                            Admission: Rs {inst.feeComponents.admissionFee?.toLocaleString() || 0} | 
                                            Course: Rs {inst.feeComponents.courseFee?.toLocaleString() || 0}
                                            {inst.feeComponents.certificateFee > 0 && ` | Certificate: Rs ${inst.feeComponents.certificateFee?.toLocaleString()}`}
                                            {inst.feeComponents.examFee > 0 && ` | Exam: Rs ${inst.feeComponents.examFee?.toLocaleString()}`}
                                            {inst.feeComponents.registrationFee > 0 && ` | Registration: Rs ${inst.feeComponents.registrationFee?.toLocaleString()}`}
                                            {inst.feeComponents.practicalFee > 0 && ` | Practical: Rs ${inst.feeComponents.practicalFee?.toLocaleString()}`}
                                            {inst.feeComponents.otherFee > 0 && ` | Other: Rs ${inst.feeComponents.otherFee?.toLocaleString()}`}
                                          </div>
                                        )}
                                      </td>
                                      <td className="p-3 text-sm font-semibold text-gray-800">
                                        Rs {inst.amount?.toLocaleString()}
                                      </td>
                                      <td className="p-3 text-sm">
                                        <span className={isPaid ? 'text-green-600 font-semibold' : 'text-gray-600'}>
                                          Rs {(inst.paidAmount || 0).toLocaleString()}
                                        </span>
                                        {isPartial && (
                                          <span className="text-xs text-orange-600 ml-1">
                                            (Partial)
                                          </span>
                                        )}
                                      </td>
                                      <td className="p-3 text-sm text-gray-600">
                                        {new Date(displayDate).toLocaleDateString()}
                                        {(isPaid || isPartial) && inst.paidDate ? (
                                          <span className="ml-1 text-xs text-green-600">
                                            (Paid Date)
                                          </span>
                                        ) : (
                                          <span className="ml-1 text-xs text-gray-400">
                                            (Due Date)
                                          </span>
                                        )}
                                      </td>
                                      <td className="p-3 text-sm">
                                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                                          isPaid ? 'bg-green-100 text-green-700' :
                                          isPartial ? 'bg-orange-100 text-orange-700' :
                                          isOverdue ? 'bg-red-100 text-red-700' :
                                          'bg-gray-100 text-gray-600'
                                        }`}>
                                          {inst.status}
                                        </span>
                                      </td>
                                      <td className="p-3 text-sm">
                                        <span className="font-mono text-blue-600 font-medium">
                                          {inst.voucherNo || '-'}
                                        </span>
                                      </td>
                                      <td className="p-3 text-sm">
                                        <Space size="small">
                                          {inst.status !== "Paid" && (
                                            <Button
                                              type="primary"
                                              size="small"
                                              icon={<DollarOutlined />}
                                              onClick={() => handleRecordPayment(record, inst)}
                                              className="btn-sm"
                                            >
                                              Pay
                                            </Button>
                                          )}
                                          {(inst.status === "Paid" || inst.status === "Partial") && (
                                            <Button
                                              size="small"
                                              icon={<EditOutlined />}
                                              onClick={() => handleEditPayment(record, inst)}
                                              className="btn-sm"
                                            >
                                              Edit
                                            </Button>
                                          )}
                                          {inst.receiptNumber && (
                                            <Button
                                              size="small"
                                              icon={<FileTextOutlined />}
                                              onClick={() => handleViewReceiptByNumber(inst.receiptNumber)}
                                              className="btn-sm"
                                            >
                                              Receipt
                                            </Button>
                                          )}
                                        </Space>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <Card size="small" className="text-center">
                            <p className="text-gray-500 mb-2">
                              <FileTextOutlined className="text-2xl mb-2" />
                            </p>
                            <p className="text-gray-600">
                              No installment plan configured for this fee structure.
                            </p>
                            <p className="text-sm text-gray-400 mt-1">
                              Full payment mode is active.
                            </p>
                          </Card>
                        )}
                      </div>
                    );
                  },
                }}
              />
            </Card>
          </Tabs.TabPane>

          <Tabs.TabPane
            tab={
              <span>
                <HistoryOutlined />
                Payment History
              </span>
            }
            key="2"
          >
            <Table
              columns={paymentColumns}
              dataSource={sortedPayments}
              rowKey="_id"
              loading={loading}
              pagination={{ pageSize: 10 }}
              expandable={{
                expandedRowRender: (record) => {
                  const feeStructure = feeStructures.find(
                    (fs) =>
                      fs._id === record.feeStructure ||
                      (fs.student?._id === record.student?._id &&
                        fs.course?._id === record.course?._id),
                  );

                  let installmentDetails = null;
                  if (
                    record.installmentNumber &&
                    feeStructure &&
                    feeStructure.installments
                  ) {
                    const installment = feeStructure.installments.find(
                      (inst) =>
                        inst.installmentNumber === record.installmentNumber,
                    );
                    if (installment) {
                      installmentDetails = installment;
                    }
                  }

                  return (
                    <div>
                      <Descriptions bordered size="small">
                        {record.transactionId && (
                          <Descriptions.Item label="Transaction ID">
                            {record.transactionId}
                          </Descriptions.Item>
                        )}
                        {record.chequeNo && (
                          <Descriptions.Item label="Cheque No">
                            {record.chequeNo}
                          </Descriptions.Item>
                        )}
                        {record.bankName && (
                          <Descriptions.Item label="Bank">
                            {record.bankName}
                          </Descriptions.Item>
                        )}
                        {record.remarks && (
                          <Descriptions.Item label="Remarks" span={3}>
                            {record.remarks}
                          </Descriptions.Item>
                        )}
                      </Descriptions>

                      {installmentDetails &&
                        installmentDetails.status === "Partial" && (
                          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-300 rounded">
                            <div className="flex items-center gap-2 mb-2">
                              <ClockCircleOutlined className="text-yellow-600" />
                              <Text strong className="text-yellow-800">
                                Partial Payment Details
                              </Text>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Text type="secondary">Installment Amount:</Text>
                                <Text strong className="ml-2">
                                  Rs {installmentDetails.amount?.toLocaleString()}
                                </Text>
                              </div>
                              <div>
                                <Text type="secondary">Already Paid:</Text>
                                <Text strong className="ml-2 text-green-600">
                                  Rs {installmentDetails.paidAmount?.toLocaleString()}
                                </Text>
                              </div>
                              <div>
                                <Text type="secondary">This Payment:</Text>
                                <Text strong className="ml-2">
                                  Rs {record.amount?.toLocaleString()}
                                </Text>
                              </div>
                              <div>
                                <Text type="secondary">Remaining Balance:</Text>
                                <Text strong className="ml-2 text-red-600">
                                  Rs{" "}
                                  {(
                                    (installmentDetails.amount || 0) -
                                    (installmentDetails.paidAmount || 0)
                                  ).toLocaleString()}
                                </Text>
                              </div>
                            </div>
                          </div>
                        )}
                    </div>
                  );
                },
              }}
            />
          </Tabs.TabPane>

          <Tabs.TabPane
            tab={
              <span>
                <FileTextOutlined />
                Installments
              </span>
            }
            key="3"
          >
            <Card size="small" className="mb-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <Title level={5} style={{ marginBottom: 4 }}>
                    Installment Views
                  </Title>
                  <Text type="secondary">
                    Switch between all installment records and month-wise tracker.
                  </Text>
                </div>
                <Space>
                  <Button
                    type={installmentsView === "list" ? "primary" : "default"}
                    onClick={() => setInstallmentsView("list")}
                  >
                    All Installments
                  </Button>
                  <Button
                    type={installmentsView === "tracker" ? "primary" : "default"}
                    onClick={() => setInstallmentsView("tracker")}
                  >
                    Installment Tracker
                  </Button>
                </Space>
              </div>
            </Card>

            {installmentsView === "tracker" ? (
              renderInstallmentTrackerContent()
            ) : (
              feeStructures.map((fs) => (
                <Card
                  key={fs._id}
                  size="small"
                  title={`${fs.course?.courseName || "Course"} - Installments`}
                  className="mb-4"
                >
                  {fs.installments?.length > 0 ? (
                    <Table
                      dataSource={getSortedInstallments(fs.installments)}
                      columns={[
                        {
                          title: "#",
                          dataIndex: "installmentNumber",
                          key: "number",
                          render: (num) => <Tag color="blue">#{num}</Tag>,
                        },
                        {
                          title: "Description",
                          dataIndex: "description",
                          key: "description",
                        },
                        {
                          title: "Amount",
                          dataIndex: "amount",
                          key: "amount",
                          render: (amt) => `Rs ${amt?.toLocaleString()}`,
                        },
                        {
                          title: "Paid",
                          dataIndex: "paidAmount",
                          key: "paidAmount",
                          render: (amt) => `Rs ${(amt || 0).toLocaleString()}`,
                        },
                        {
                          title: "Date",
                          dataIndex: "dueDate",
                          key: "dueDate",
                          render: (_, inst) => {
                            const displayDate = getInstallmentSortDate(inst);
                            const isPaid = inst.status === "Paid";
                            const isPartial = inst.status === "Partial";
                            return (
                              <span>
                                {new Date(displayDate).toLocaleDateString()}
                                {(isPaid || isPartial) && inst.paidDate
                                  ? " (Paid Date)"
                                  : " (Due Date)"}
                              </span>
                            );
                          },
                        },
                        {
                          title: "Status",
                          dataIndex: "status",
                          key: "status",
                          render: (status) => {
                            const colors = {
                              Paid: "green",
                              Partial: "orange",
                              Pending: "default",
                              Overdue: "red",
                            };
                            return <Tag color={colors[status]}>{status}</Tag>;
                          },
                        },
                        {
                          title: "Actions",
                          key: "actions",
                          render: (_, inst) => (
                            <Button
                              type="primary"
                              size="small"
                              icon={<DollarOutlined />}
                              onClick={() => handleRecordPayment(fs, inst)}
                              disabled={inst.status === "Paid"}
                            >
                              Pay
                            </Button>
                          ),
                        },
                      ]}
                      rowKey="_id"
                      pagination={false}
                    />
                  ) : (
                    <Text type="secondary">No installments configured.</Text>
                  )}
                </Card>
              ))
            )}
          </Tabs.TabPane>
        </Tabs>
      </Card>

      <FeePaymentFormEnhanced
        visible={paymentModalVisible}
        onClose={() => {
          setPaymentModalVisible(false);
          setSelectedFeeStructure(null);
          setSelectedInstallment(null);
          setSelectedTrackerRowKeys([]);
        }}
        onPaymentSuccess={(data) => {
          message.success("Payment recorded successfully!");
          setSelectedTrackerRowKeys([]);
          fetchStudentData();
        }}
        feeStructure={selectedFeeStructure}
        studentInfo={studentInfo}
        selectedInstallment={selectedInstallment}
        initialSelectedPaymentRows={selectedTrackerRows}
      />

      <PaymentReceipt
        visible={receiptVisible}
        onClose={() => {
          setReceiptVisible(false);
          setReceiptData(null);
        }}
        paymentData={receiptData}
        institutionInfo={{
          name: "ODC Education Center",
          address: "Your Institute Address Here",
          phone: "Your Contact Number",
          email: "info@odc.edu",
        }}
      />

      <Modal
        title="Edit Payment"
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        onOk={handleSaveEdit}
        confirmLoading={processing}
        width={500}
      >
        <Form layout="vertical">
          <Form.Item label="Amount">
            <Input
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
              prefix="Rs"
            />
          </Form.Item>
          <Form.Item label="Payment Date">
            <DatePicker
              value={editPaymentDate ? dayjs(editPaymentDate) : null}
              onChange={(date) => setEditPaymentDate(date ? date.toDate() : null)}
              style={{ width: "100%" }}
              format="YYYY-MM-DD"
            />
          </Form.Item>
          <Form.Item label="Payment Method">
            <Select
              value={editPaymentMethod}
              onChange={setEditPaymentMethod}
              options={[
                { value: "Cash", label: "Cash" },
                { value: "Bank Transfer", label: "Bank Transfer" },
                { value: "Online", label: "Online Payment" },
                { value: "Cheque", label: "Cheque" },
                { value: "Other", label: "Other" },
              ]}
            />
          </Form.Item>
          <Form.Item label="Notes">
            <Input
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default StudentFeeProfile;
