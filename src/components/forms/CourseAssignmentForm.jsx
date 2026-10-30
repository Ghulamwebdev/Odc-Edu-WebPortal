import {
  Modal,
  Form,
  Select,
  DatePicker,
  Button,
  InputNumber,
  Card,
  Table,
  Typography,
  Tag,
  Space,
  Alert,
  Row,
  Col,
  Input,
  Tabs,
} from "antd";
import { EditOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import { getBatchesByCourse } from "../../services/batchService";
import { getFeeStructure } from "../../services/feeService";

const { Option } = Select;
const { Text } = Typography;

const PLAN_OPTIONS = [
  { value: "custom", label: "Custom plan", defaultDiscount: 0 },
  { value: "full_payment", label: "Full plan", defaultDiscount: 15 },
];

const COURSE_ASSIGNMENT_STEPS = [
  {
    key: "basic",
    label: "Basic Info",
    fields: ["courseId", "enrollmentDate", "status"],
  },
  {
    key: "plan",
    label: "Payment Plan",
    fields: ["paymentPlanType", "discountPercentage", "numberOfInstallments"],
  },
  {
    key: "fees",
    label: "Fees",
    fields: [],
  },
  {
    key: "installments",
    label: "Installments",
    fields: [],
  },
];

const ADDITIONAL_FEE_TYPES = [
  { value: "exam", label: "Exam Fee" },
  { value: "Library Charges", label: "Library Charges" },
  // { value: "practical", label: "Practical Fee" },
  { value: "other", label: "Other Fee" },
];

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const addMonths = (dateValue, monthsToAdd) => {
  const date = dayjs(dateValue).toDate();
  date.setMonth(date.getMonth() + monthsToAdd);
  return dayjs(date);
};

const createAdditionalFeeRow = () => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  feeType: "exam",
  title: "Exam Fee",
  amount: 0,
  paymentMode: "one_time",
});

const getFeeTypeLabel = (feeType) =>
  ADDITIONAL_FEE_TYPES.find((item) => item.value === feeType)?.label || "Other Fee";

const sanitizeAdditionalFees = (rows = []) =>
  rows
    .map((row) => ({
      ...row,
      amount: round2(row.amount),
      title: (row.title || "").trim() || getFeeTypeLabel(row.feeType),
      paymentMode: row.paymentMode === "two_installments" ? "two_installments" : "one_time",
    }))
    .filter((row) => row.amount > 0);

const buildAdditionalFeesFromFeeStructure = (feeStructure = {}) => {
  const rows = Array.isArray(feeStructure?.additionalFees)
    ? feeStructure.additionalFees.map((fee, idx) => ({
        id: `${Date.now()}-${idx}`,
        feeType: fee.feeType || "exam",
        title: fee.title || getFeeTypeLabel(fee.feeType || "exam"),
        amount: fee.amount,
        paymentMode: fee.paymentMode || "one_time",
      }))
    : [];

  const existingTypes = new Set(
    rows.map((row) => String(row.feeType || "").toLowerCase()),
  );
  const legacyFeeRows = [
    { key: "examFee", feeType: "exam", title: "Exam Fee" },
    { key: "registrationFee", feeType: "registration", title: "Registration Fee" },
    { key: "practicalFee", feeType: "practical", title: "Practical Fee" },
    { key: "otherFee", feeType: "other", title: "Other Fee" },
  ];

  legacyFeeRows.forEach((fee) => {
    const amount = round2(feeStructure?.[fee.key] || 0);
    if (amount <= 0 || existingTypes.has(fee.feeType)) return;

    rows.push({
      id: `${Date.now()}-${fee.key}`,
      feeType: fee.feeType,
      title: fee.title,
      amount,
      paymentMode: "one_time",
    });
  });

  return rows;
};

const getAdditionalFeeInstallmentCount = (rows = []) =>
  sanitizeAdditionalFees(rows).reduce(
    (count, fee) => count + (fee.paymentMode === "two_installments" ? 2 : 1),
    0,
  );

const buildDistributedValues = (amount, count) => {
  const safeAmount = round2(amount);
  const safeCount = Math.max(1, Math.min(24, Number(count) || 1));

  if (safeAmount <= 0) {
    return Array.from({ length: safeCount }, () => 0);
  }

  const base = Math.floor((safeAmount / safeCount) * 100) / 100;
  let assigned = 0;

  return Array.from({ length: safeCount }, (_, index) => {
    const isLast = index === safeCount - 1;
    const value = isLast ? round2(safeAmount - assigned) : round2(base);
    assigned = round2(assigned + value);
    return value;
  });
};

const getFeeComponentKey = (feeType) => {
  if (feeType === "exam") return "examFee";
  if (feeType === "registration") return "registrationFee";
  if (feeType === "practical") return "practicalFee";
  return "otherFee";
};

const buildInstallments = (
  count,
  feeConfig,
  startDate,
  existing = [],
  additionalFees = [],
) => {
  const safeCount = Math.max(1, Math.min(24, Number(count) || 1));
  const effectiveCourseFee = round2(
    feeConfig.discountedCourseFee ?? feeConfig.courseFee,
  );
  const coursePlan = buildDistributedValues(effectiveCourseFee, safeCount);

  const baseInstallments = Array.from({ length: safeCount }, (_, index) => {
    const isFirst = index === 0;
    const isLast = index === safeCount - 1;
    const feeComponents = {
      admissionFee: isFirst ? round2(feeConfig.admissionFee) : 0,
      courseFee: coursePlan[index],
      certificateFee: isLast ? round2(feeConfig.certificateFee) : 0,
      examFee: 0,
      registrationFee: 0,
      practicalFee: 0,
      otherFee: 0,
    };
    const amount = round2(
      feeComponents.admissionFee +
        feeComponents.courseFee +
        feeComponents.certificateFee,
    );

    return {
      installmentNumber: index + 1,
      description:
        safeCount === 1
          ? "Full Payment"
          : isFirst
            ? "Admission Fee + Course Fee"
            : isLast
              ? "Course Fee + Certificate Fee"
              : `Course Fee Installment ${index + 1}`,
      amount,
      dueDate:
        existing[index]?.dueDate && dayjs(existing[index].dueDate).isValid()
          ? dayjs(existing[index].dueDate)
          : addMonths(startDate, index),
      status: existing[index]?.status || "Pending",
      paidAmount: existing[index]?.paidAmount || 0,
      feeComponents,
    };
  });

  const cleanAdditional = sanitizeAdditionalFees(additionalFees);
  const extraInstallments = [];
  let extraOffset = 0;

  cleanAdditional.forEach((fee) => {
    if (fee.paymentMode === "one_time") {
      const componentKey = getFeeComponentKey(fee.feeType);
      const baseIndex = safeCount + extraOffset;
      extraInstallments.push({
        installmentNumber: baseIndex + 1,
        description: `${fee.title}`,
        amount: fee.amount,
        dueDate: addMonths(startDate, baseIndex),
        status: "Pending",
        paidAmount: 0,
        feeComponents: {
          admissionFee: 0,
          courseFee: 0,
          certificateFee: 0,
          examFee: fee.feeType === "exam" ? fee.amount : 0,
          registrationFee: fee.feeType === "registration" ? fee.amount : 0,
          practicalFee: fee.feeType === "practical" ? fee.amount : 0,
          otherFee: !["exam", "registration", "practical"].includes(fee.feeType) ? fee.amount : 0,
          [componentKey]: fee.amount,
        },
      });
      extraOffset += 1;
      return;
    }

    const first = round2(Math.floor((fee.amount / 2) * 100) / 100);
    const second = round2(fee.amount - first);
    const baseIndex = safeCount + extraOffset;

    extraInstallments.push({
      installmentNumber: baseIndex + 1,
      description: `${fee.title} - Installment 1/2`,
      amount: first,
      dueDate: addMonths(startDate, baseIndex),
      status: "Pending",
      paidAmount: 0,
      feeComponents: {
        admissionFee: 0,
        courseFee: 0,
        certificateFee: 0,
        examFee: fee.feeType === "exam" ? first : 0,
        registrationFee: fee.feeType === "registration" ? first : 0,
        practicalFee: fee.feeType === "practical" ? first : 0,
        otherFee: fee.feeType === "other" ? first : 0,
      },
    });

    extraInstallments.push({
      installmentNumber: baseIndex + 2,
      description: `${fee.title} - Installment 2/2`,
      amount: second,
      dueDate: addMonths(startDate, baseIndex + 1),
      status: "Pending",
      paidAmount: 0,
      feeComponents: {
        admissionFee: 0,
        courseFee: 0,
        certificateFee: 0,
        examFee: fee.feeType === "exam" ? second : 0,
        registrationFee: fee.feeType === "registration" ? second : 0,
        practicalFee: fee.feeType === "practical" ? second : 0,
        otherFee: fee.feeType === "other" ? second : 0,
      },
    });
    extraOffset += 2;
  });

  const combined = [...baseInstallments, ...extraInstallments].map((item, index) => ({
    ...item,
    installmentNumber: index + 1,
  }));

  // Ensure installment totals always reflect final discounted fee.
  const currentTotal = round2(combined.reduce((sum, item) => sum + item.amount, 0));
  const targetTotal = round2(feeConfig.finalFee ?? currentTotal);
  const diff = round2(targetTotal - currentTotal);
  if (combined.length > 0 && diff !== 0) {
    const lastIndex = combined.length - 1;
    const lastInstallment = combined[lastIndex];
    const nextFeeComponents = {
      ...(lastInstallment.feeComponents || {}),
    };

    if (nextFeeComponents.otherFee > 0) {
      nextFeeComponents.otherFee = round2(nextFeeComponents.otherFee + diff);
    } else if (nextFeeComponents.certificateFee > 0) {
      nextFeeComponents.certificateFee = round2(
        nextFeeComponents.certificateFee + diff,
      );
    } else if (nextFeeComponents.courseFee > 0) {
      nextFeeComponents.courseFee = round2(nextFeeComponents.courseFee + diff);
    } else {
      nextFeeComponents.courseFee = round2(
        Number(nextFeeComponents.courseFee || 0) + diff,
      );
    }

    combined[lastIndex] = {
      ...lastInstallment,
      amount: round2(lastInstallment.amount + diff),
      feeComponents: nextFeeComponents,
    };
  }

  return combined;
};

const CourseAssignmentForm = ({
  visible,
  onCancel,
  onFinish,
  form,
  courses,
  selectedStudent,
  loading,
  editingEnrollment,
}) => {
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [installments, setInstallments] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [additionalFees, setAdditionalFees] = useState([]);
  const [editingFeeModal, setEditingFeeModal] = useState(false);
  const [editingFeeType, setEditingFeeType] = useState(null);
  const [editingFeeValue, setEditingFeeValue] = useState(0);
  const [overriddenFees, setOverriddenFees] = useState({
    admissionFee: null,
    courseFee: null,
    certificateFee: null,
  });
  const [isEditMode, setIsEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");
  const currentStepIndex = Math.max(
    0,
    COURSE_ASSIGNMENT_STEPS.findIndex((step) => step.key === activeTab),
  );
  const currentStep = COURSE_ASSIGNMENT_STEPS[currentStepIndex];
  const nextStep = COURSE_ASSIGNMENT_STEPS[currentStepIndex + 1];
  const isLastStep = currentStepIndex === COURSE_ASSIGNMENT_STEPS.length - 1;

  // Ref to prevent courseId effect from resetting form values during edit initialization
  const isInitializingEditRef = useRef(false);
  // Ref to prevent selectedCourse/enrollmentDate effect from overwriting saved installments on init
  const skipInstallmentInitRef = useRef(false);
  // Ref to prevent paymentPlanType effect from overwriting saved discount/installments on init
  const isInitPaymentPlanRef = useRef(false);
  // Ref to avoid automatic installment rebuilds after initial edit restore
  const userChangedInstallmentInputsRef = useRef(false);
  const userChangedAdditionalFeesRef = useRef(false);
  // Ref to track previous enrollment date for installment date recalculation
  const prevEnrollmentDateRef = useRef(null);

  const courseId = Form.useWatch("courseId", form);
  const enrollmentDate = Form.useWatch("enrollmentDate", form);
  const enrollmentStatus = Form.useWatch("status", form) || "Active";
  const paymentPlanType = Form.useWatch("paymentPlanType", form);
  const discountPercentage = Form.useWatch("discountPercentage", form) || 0;
  const numberOfInstallments = Form.useWatch("numberOfInstallments", form) || 1;
  const assignedCourseIds = useMemo(() => {
    const activeEditingCourseId = editingEnrollment?.course?._id
      ? String(editingEnrollment.course._id)
      : null;

    return new Set(
      (selectedStudent?.enrollments || [])
        .map((enrollment) => enrollment?.course?._id || enrollment?.course)
        .filter(Boolean)
        .map((value) => String(value))
        .filter((value) => value !== activeEditingCourseId),
    );
  }, [editingEnrollment, selectedStudent]);
  const availableCourses = useMemo(
    () =>
      (courses || []).filter(
        (course) => !assignedCourseIds.has(String(course._id)),
      ),
    [assignedCourseIds, courses],
  );

  const baseFee = useMemo(() => {
    if (!selectedCourse) {
      return {
        admissionFee: 0,
        courseFee: 0,
        discountedCourseFee: 0,
        certificateFee: 0,
        additionalFeesTotal: 0,
        totalBeforeDiscount: 0,
        discountAmount: 0,
        finalFee: 0,
      };
    }

    const admissionFee = round2(
      overriddenFees.admissionFee !== null
        ? overriddenFees.admissionFee
        : selectedCourse.admissionFee || 0
    );
    const courseFee = round2(
      overriddenFees.courseFee !== null
        ? overriddenFees.courseFee
        : selectedCourse.courseFee || 0
    );
    const certificateFee = round2(
      overriddenFees.certificateFee !== null
        ? overriddenFees.certificateFee
        : selectedCourse.certificateFee || 0
    );
    const additionalFeesTotal = round2(
      sanitizeAdditionalFees(additionalFees).reduce(
        (sum, item) => sum + item.amount,
        0,
      ),
    );

    const totalBeforeDiscount = round2(
      admissionFee + courseFee + certificateFee + additionalFeesTotal,
    );
    const discountAmount = round2(
      Math.min(courseFee, (courseFee * discountPercentage) / 100),
    );
    const discountedCourseFee = round2(Math.max(0, courseFee - discountAmount));
    const finalFee = round2(Math.max(0, totalBeforeDiscount - discountAmount));

    return {
      admissionFee,
      courseFee,
      discountedCourseFee,
      certificateFee,
      additionalFeesTotal,
      totalBeforeDiscount,
      discountAmount,
      finalFee,
    };
  }, [selectedCourse, additionalFees, discountPercentage, overriddenFees]);

  const fetchBatches = async (selectedCourseId) => {
    setLoadingBatches(true);
    try {
      const response = await getBatchesByCourse(selectedCourseId);
      if (response.success) {
        const active = response.data.filter(
          (batch) => batch.status === "Active" || batch.status === "Upcoming",
        );
        setBatches(active);

        const currentBatchId = form.getFieldValue("batchId");
        if (!currentBatchId && active.length === 1) {
          form.setFieldValue("batchId", active[0]._id);
        }
      } else {
        setBatches([]);
      }
    } catch (error) {
      console.error("Error fetching batches:", error);
      setBatches([]);
    } finally {
      setLoadingBatches(false);
    }
  };

  useEffect(() => {
    if (!visible) {
      setActiveTab("basic");
      setSelectedCourse(null);
      setInstallments([]);
      setBatches([]);
      setAdditionalFees([]);
      setOverriddenFees({
        admissionFee: null,
        courseFee: null,
        certificateFee: null,
      });
      setIsEditMode(false);
      isInitializingEditRef.current = false;
      isInitPaymentPlanRef.current = false;
      skipInstallmentInitRef.current = false;
      userChangedAdditionalFeesRef.current = false;
      prevEnrollmentDateRef.current = null;
      return;
    }

    if (editingEnrollment) {
      // Edit mode - fee data lives in feeStructure (separate document), not enrollment itself
      isInitializingEditRef.current = true;
      isInitPaymentPlanRef.current = true;
      setIsEditMode(true);
      const enrollment = editingEnrollment;
      const fs = enrollment.feeStructure;
      const restoredAdditionalFees = buildAdditionalFeesFromFeeStructure(fs);
      const storedInstallmentCount =
        fs?.installments?.length || fs?.numberOfInstallments || 2;
      const baseInstallmentCount = Math.max(
        1,
        storedInstallmentCount -
          getAdditionalFeeInstallmentCount(restoredAdditionalFees),
      );

      form.resetFields();
      form.setFieldsValue({
        courseId: enrollment.course?._id,
        enrollmentDate: dayjs(enrollment.enrollmentDate),
        status: enrollment.status || "Active",
        completionDate: enrollment.completionDate ? dayjs(enrollment.completionDate) : null,
        batchId: enrollment.batch?._id || null,
        paymentPlanType: fs?.paymentPlanType || "custom",
        discountPercentage: fs?.discountPercentage || 0,
        numberOfInstallments: baseInstallmentCount,
      });

      userChangedInstallmentInputsRef.current = false;
      prevEnrollmentDateRef.current = enrollment.enrollmentDate;

      // Load course details
      const course = courses.find((c) => c._id === enrollment.course?._id);
      if (course) {
        setSelectedCourse(course);
        fetchBatches(course._id);
      }

      // Set overridden fees from feeStructure (not from enrollment document)
      setOverriddenFees({
        admissionFee: fs?.admissionFee ?? null,
        courseFee: fs?.courseFee ?? null,
        certificateFee: fs?.certificateFee ?? null,
      });

      setAdditionalFees(
        restoredAdditionalFees.length
          ? restoredAdditionalFees
          : [createAdditionalFeeRow()],
      );
      userChangedAdditionalFeesRef.current = false;

      // Set installments from feeStructure
      if (fs?.installments?.length > 0) {
        setInstallments(
          fs.installments.map((inst) => ({
            ...inst,
            dueDate: inst.dueDate ? dayjs(inst.dueDate) : null,
          })),
        );
        skipInstallmentInitRef.current = true;
      } else {
        setInstallments([]);
        const loadFeeStructure = async () => {
          try {
            const feeResponse = await getFeeStructure(
              editingEnrollment.student?._id || editingEnrollment.student,
              editingEnrollment.course?._id || editingEnrollment.course,
            );
            if (feeResponse.success && feeResponse.data?.installments?.length > 0) {
              setInstallments(
                feeResponse.data.installments.map((inst) => ({
                  ...inst,
                  dueDate: inst.dueDate ? dayjs(inst.dueDate) : null,
                })),
              );
              skipInstallmentInitRef.current = true;
            }
          } catch (error) {
            console.error("Failed to load fee structure installments:", error);
          }
        };

        loadFeeStructure();
      }
    } else {
      // Create mode
      setIsEditMode(false);
      isInitializingEditRef.current = false;
      isInitPaymentPlanRef.current = false;
      setAdditionalFees([createAdditionalFeeRow()]);
      userChangedAdditionalFeesRef.current = false;
      setOverriddenFees({
        admissionFee: null,
        courseFee: null,
        certificateFee: null,
      });
      prevEnrollmentDateRef.current = null;
      form.setFieldsValue({
        status: "Active",
        completionDate: null,
        paymentPlanType: "custom",
        discountPercentage: 0,
        numberOfInstallments: 2,
        enrollmentDate: dayjs(),
      });
    }
  }, [visible, editingEnrollment, form, courses]);

  useEffect(() => {
    if (!courseId) {
      setSelectedCourse(null);
      if (!editingEnrollment) {
        setInstallments([]);
      }
      return;
    }

    const course = courses.find((item) => item._id === courseId) || null;
    setSelectedCourse(course);
    fetchBatches(courseId);

    if (!editingEnrollment && !isInitializingEditRef.current) {
      form.setFieldValue("batchId", null);
      setOverriddenFees({
        admissionFee: null,
        courseFee: null,
        certificateFee: null,
      });

      if (course) {
        let defaultCount = 2;
        if (paymentPlanType === "full_payment") {
          defaultCount = 1;
        }
        form.setFieldValue("numberOfInstallments", defaultCount);
      }

      setInstallments([]);
    }

    // Clear the initialization lock after the edit form has loaded once.
    if (editingEnrollment && isInitializingEditRef.current) {
      isInitializingEditRef.current = false;
      return;
    }
  }, [courseId, courses, editingEnrollment, form]);

  useEffect(() => {
    if (!paymentPlanType) return;

    // Skip auto-defaults during edit initialization — preserve saved values
    if (isInitPaymentPlanRef.current) {
      isInitPaymentPlanRef.current = false;
      return;
    }

    userChangedInstallmentInputsRef.current = true;

    const plan = PLAN_OPTIONS.find((item) => item.value === paymentPlanType);
    if (plan) {
      form.setFieldValue("discountPercentage", plan.defaultDiscount);
    }

    if (paymentPlanType === "full_payment") {
      form.setFieldValue("numberOfInstallments", 1);
      return;
    }

    if (paymentPlanType === "custom") {
      const current = Number(form.getFieldValue("numberOfInstallments")) || 0;
      if (current < 2) {
        form.setFieldValue("numberOfInstallments", 2);
      }
    }
  }, [paymentPlanType, form]);

  useEffect(() => {
    if (enrollmentStatus !== "Completed") {
      form.setFieldValue("completionDate", null);
    }
  }, [enrollmentStatus, form]);

  useEffect(() => {
    if (!selectedCourse || !enrollmentDate) {
      setInstallments([]);
      prevEnrollmentDateRef.current = null;
      return;
    }

    // Skip the first rebuild during edit initialization. We already restored
    // saved installments from the existing fee structure and don't want that
    // data overwritten before the user interacts with the form.
    if (editingEnrollment && skipInstallmentInitRef.current) {
      skipInstallmentInitRef.current = false;
      return;
    }

    // Preserve restored installments until the user explicitly changes the plan/fees.
    if (editingEnrollment && installments.length > 0 && !userChangedInstallmentInputsRef.current) {
      return;
    }

    // When the enrollment date changes, recalculate all due dates from the new date
    // rather than preserving the old dates from existing installments
    const prevDate = prevEnrollmentDateRef.current;
    const dateChanged =
      prevDate !== null && !dayjs(enrollmentDate).isSame(dayjs(prevDate), "day");
    prevEnrollmentDateRef.current = enrollmentDate;

    setInstallments((prev) =>
      buildInstallments(
        numberOfInstallments,
        baseFee,
        enrollmentDate,
        dateChanged ? [] : prev,
        additionalFees,
      ),
    );
  }, [selectedCourse, enrollmentDate, numberOfInstallments, baseFee, additionalFees, editingEnrollment, installments.length]);

  const addAdditionalFee = () => {
    userChangedInstallmentInputsRef.current = true;
    userChangedAdditionalFeesRef.current = true;
    setAdditionalFees((prev) => [...prev, createAdditionalFeeRow()]);
  };

  const removeAdditionalFee = (id) => {
    userChangedInstallmentInputsRef.current = true;
    userChangedAdditionalFeesRef.current = true;
    setAdditionalFees((prev) => prev.filter((item) => item.id !== id));
  };

  const updateAdditionalFee = (id, updates) => {
    userChangedInstallmentInputsRef.current = true;
    userChangedAdditionalFeesRef.current = true;
    setAdditionalFees((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const merged = { ...item, ...updates };
        if (updates.feeType) {
          if (!item.title || item.title === getFeeTypeLabel(item.feeType)) {
            merged.title = getFeeTypeLabel(updates.feeType);
          }
        }
        return merged;
      }),
    );
  };

  const updateInstallmentDueDate = (index, dateValue) => {
    setInstallments((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              dueDate: dateValue,
            }
          : item,
      ),
    );
  };

  const openFeeEditModal = (feeType, currentValue) => {
    setEditingFeeType(feeType);
    setEditingFeeValue(currentValue);
    setEditingFeeModal(true);
  };

  const closeFeeEditModal = () => {
    setEditingFeeModal(false);
    setEditingFeeType(null);
    setEditingFeeValue(0);
  };

  const saveFeeEdit = () => {
    userChangedInstallmentInputsRef.current = true;
    setOverriddenFees((prev) => ({
      ...prev,
      [editingFeeType]: round2(editingFeeValue),
    }));
    closeFeeEditModal();
  };

  const validateAssignmentStep = async (stepKey = activeTab) => {
    const step = COURSE_ASSIGNMENT_STEPS.find((item) => item.key === stepKey);
    if (!step) return true;

    if (step.fields.length > 0) {
      await form.validateFields(step.fields);
    }

    if (step.key === "fees") {
      if (!selectedCourse) {
        throw new Error("Please select a course before reviewing fees");
      }
      if (baseFee.finalFee <= 0) {
        throw new Error("Please review the fee setup before continuing");
      }
    }

    if (step.key === "installments") {
      if (!installments.length) {
        throw new Error("Installments are required before assigning the course");
      }

      const hasInvalidInstallment = installments.some(
        (item) => !item.amount || !item.dueDate,
      );
      if (hasInvalidInstallment) {
        throw new Error("Please complete all installment amounts and due dates");
      }
    }

    return true;
  };

  const handleFormValuesChange = (changedValues) => {
    const changedKeys = Object.keys(changedValues || {});
    if (
      changedKeys.some((key) =>
        [
          "courseId",
          "enrollmentDate",
          "paymentPlanType",
          "discountPercentage",
          "numberOfInstallments",
        ].includes(key),
      )
    ) {
      userChangedInstallmentInputsRef.current = true;
    }
  };

  const handleStepAction = async () => {
    console.log("CourseAssignmentForm: handleStepAction clicked", { isEditMode });
    if (isEditMode) {
      try {
        form.submit();
      } catch (err) {
        console.error("CourseAssignmentForm: form.submit() threw", err);
      }
      return;
    }

    if (isLastStep) {
      try {
        await validateAssignmentStep(activeTab);
        form.submit();
      } catch (error) {
        const errorMessage =
          error?.message ||
          `Please complete the ${currentStep.label} tab before assigning the course.`;
        Modal.warning({
          title: "Complete this step first",
          content: errorMessage,
          centered: true,
        });
      }
      return;
    }

    try {
      await validateAssignmentStep(activeTab);
      if (nextStep) {
        setActiveTab(nextStep.key);
      }
    } catch (error) {
      const errorMessage =
        error?.message ||
        `Please complete the ${currentStep.label} tab before moving to the next step.`;
      Modal.warning({
        title: "Complete this step first",
        content: errorMessage,
        centered: true,
      });
    }
  };

  const handleTabChange = async (nextTabKey) => {
    if (isEditMode) {
      setActiveTab(nextTabKey);
      return;
    }

    const nextIndex = COURSE_ASSIGNMENT_STEPS.findIndex(
      (step) => step.key === nextTabKey,
    );

    if (nextIndex <= currentStepIndex) {
      setActiveTab(nextTabKey);
      return;
    }

    try {
      await validateAssignmentStep(activeTab);
      setActiveTab(nextTabKey);
    } catch (error) {
      Modal.warning({
        title: "Complete this step first",
        content:
          error?.message ||
          `Please complete the ${currentStep.label} tab before moving ahead.`,
        centered: true,
      });
    }
  };

  const handleSubmit = async (values) => {
    console.log("CourseAssignmentForm: handleSubmit invoked", { isEditMode });
    if (!isEditMode) {
      try {
        for (const step of COURSE_ASSIGNMENT_STEPS) {
          await validateAssignmentStep(step.key);
        }
      } catch (error) {
        Modal.warning({
          title: "Complete all steps first",
          content:
            error?.message ||
            "Please complete every course assignment tab before assigning the course.",
          centered: true,
        });
        return;
      }
    }

    const cleanedAdditionalFees = sanitizeAdditionalFees(additionalFees);
    
    // Validate that fees are not negative
    if (baseFee.admissionFee < 0 || baseFee.courseFee < 0 || baseFee.certificateFee < 0) {
      console.error("Invalid fee values detected:", baseFee);
      return;
    }

    // Format installments properly for backend
    const formattedInstallments = installments.map((inst) => ({
      installmentNumber: inst.installmentNumber,
      description: inst.description,
      amount: round2(inst.amount),
      dueDate: inst.dueDate?.format("YYYY-MM-DD") || inst.dueDate,
      status: inst.status || "Pending",
      paidAmount: inst.paidAmount || 0,
      feeComponents: {
        admissionFee: round2(inst.feeComponents?.admissionFee || 0),
        courseFee: round2(inst.feeComponents?.courseFee || 0),
        certificateFee: round2(inst.feeComponents?.certificateFee || 0),
        examFee: round2(inst.feeComponents?.examFee || 0),
        registrationFee: round2(inst.feeComponents?.registrationFee || 0),
        practicalFee: round2(inst.feeComponents?.practicalFee || 0),
        otherFee: round2(inst.feeComponents?.otherFee || 0),
      },
    }));

    const shouldUpdateAdditionalFees =
      !isEditMode || userChangedAdditionalFeesRef.current;

    const payload = {
      ...values,
      status: values.status || "Active",
      completionDate:
        values.status === "Completed"
          ? values.completionDate?.format("YYYY-MM-DD") ||
            dayjs().format("YYYY-MM-DD")
          : undefined,
      // Include overridden/custom fees - these will override course defaults in backend
      admissionFee: baseFee.admissionFee,
      courseFee: baseFee.courseFee,
      certificateFee: baseFee.certificateFee,
      totalFee: baseFee.finalFee,
      discount: baseFee.discountAmount,
      totalDiscount: baseFee.discountAmount,
      discountType: "courseFee",
      discountPercentage: discountPercentage,
      discountOnCourseFee: baseFee.discountAmount,
      finalFee: baseFee.finalFee,
      paymentPlanType: values.paymentPlanType,
      numberOfInstallments: numberOfInstallments,
      // Properly formatted installments with custom fees included
      installments: formattedInstallments,
    };

    if (shouldUpdateAdditionalFees) {
      payload.examFee = 0;
      payload.registrationFee = 0;
      payload.practicalFee = 0;
      payload.otherFee = 0;
      payload.additionalFees = cleanedAdditionalFees;
    }

    console.log("📤 CourseAssignmentForm sending payload:", {
      customFees: {
        admissionFee: baseFee.admissionFee,
        courseFee: baseFee.courseFee,
        certificateFee: baseFee.certificateFee,
      },
      totalFee: baseFee.finalFee,
      numberOfInstallments: formattedInstallments.length,
      installmentsSample: formattedInstallments[0],
    });

    onFinish(payload);
  };

  const installmentColumns = [
    {
      title: "#",
      dataIndex: "installmentNumber",
      key: "installmentNumber",
      width: 70,
    },
    {
      title: "Title",
      dataIndex: "description",
      key: "description",
      render: (description) => <Text>{description}</Text>,
    },
    {
      title: "Amount",
      dataIndex: "amount",
      key: "amount",
      render: (amount) => <Text strong>PKR {round2(amount).toLocaleString()}</Text>,
    },
    {
      title: "Due Date",
      dataIndex: "dueDate",
      key: "dueDate",
      render: (dueDate, record, index) => (
        <DatePicker
          value={dueDate ? dayjs(dueDate) : null}
          format="YYYY-MM-DD"
          onChange={(dateValue) => updateInstallmentDueDate(index, dateValue)}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status) => (
        <Tag color={status === "Paid" ? "green" : "default"}>{status}</Tag>
      ),
    },
  ];

  const paidInstallments = installments.filter((item) => item.status === "Paid").length;
  const unpaidInstallments = installments.length - paidInstallments;

  return (
    <Modal
      title={
        isEditMode
          ? `Edit Course for ${selectedStudent?.studentName || "Student"}`
          : `Assign Course to ${selectedStudent?.studentName || "Student"}`
      }
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={1040}
      centered
      destroyOnClose
      styles={{
        body: {
          paddingTop: 12,
          maxHeight: "78vh",
          overflow: "hidden",
        },
      }}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        onValuesChange={handleFormValuesChange}
        onFinishFailed={(errorInfo) => console.error("CourseAssignmentForm validation failed:", errorInfo)}
      >
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <div style={{ marginBottom: 12 }}>
            <Space wrap size={[8, 8]}>
              <Tag color="blue">
                Student: {selectedStudent?.studentName || "Student"}
              </Tag>
              <Tag color="green">
                Final Fee: PKR {baseFee.finalFee.toLocaleString()}
              </Tag>
              <Tag color="purple">
                Installments: {numberOfInstallments}
              </Tag>
              {installments.length !== numberOfInstallments && (
                <Tag color="geekblue">
                  Total entries: {installments.length}
                </Tag>
              )}
              {!isEditMode && (
                <Tag color="geekblue">
                  Step {currentStepIndex + 1} of {COURSE_ASSIGNMENT_STEPS.length}
                </Tag>
              )}
            </Space>
          </div>

          {!isEditMode && (
            <div
              style={{
                marginBottom: 14,
                padding: "12px 14px",
                borderRadius: 12,
                background: "linear-gradient(135deg, #EEF2FF 0%, #F5F3FF 100%)",
                border: "1px solid #C7D2FE",
                color: "#4338CA",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {isLastStep
                ? "Final step: review installments and click Assign Course to complete the enrollment."
                : `Complete the ${currentStep.label} tab, then click Next: ${
                    nextStep?.label || "Continue"
                  } to continue.`}
            </div>
          )}

          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: "auto",
              paddingRight: 4,
            }}
          >
            <Tabs
              activeKey={activeTab}
              onChange={handleTabChange}
              items={[
                {
                  key: "basic",
                  label: "Basic Info",
                  children: (
                    <div>
                      <Card size="small" style={{ marginBottom: 16 }}>
                        <Space style={{ width: "100%" }} size={16} align="start" wrap>
                          <Form.Item
                            label="Course"
                            name="courseId"
                            rules={[{ required: true, message: "Select a course" }]}
                            style={{ flex: 1, minWidth: 230 }}
                          >
                            <Select
                              placeholder="Select course"
                              showSearch
                              optionFilterProp="children"
                              size="large"
                            >
                              {availableCourses.map((course) => (
                                <Option key={course._id} value={course._id}>
                                  {course.courseName} ({course.courseId})
                                </Option>
                              ))}
                            </Select>
                          </Form.Item>
                        {availableCourses.length === 0 && !isEditMode && (
                          <Alert
                            type="info"
                            showIcon
                            message="All available courses are already assigned to this student."
                            style={{ width: "100%", marginBottom: 16 }}
                          />
                        )}

                          <Form.Item
                            label="Enrollment Date"
                            name="enrollmentDate"
                            rules={[{ required: true, message: "Select enrollment date" }]}
                            style={{ minWidth: 230 }}
                          >
                            <DatePicker format="YYYY-MM-DD" style={{ width: "100%" }} size="large" />
                          </Form.Item>

                          <Form.Item
                            label="Status"
                            name="status"
                            rules={[{ required: true, message: "Select status" }]}
                            style={{ minWidth: 210 }}
                          >
                            <Select size="large">
                              <Option value="Active">Active</Option>
                              <Option value="Completed">Passout / Completed</Option>
                              <Option value="Dropped">Dropout</Option>
                              <Option value="On Hold">On Hold</Option>
                            </Select>
                          </Form.Item>
                        </Space>

                        {enrollmentStatus === "Completed" && (
                          <Form.Item
                            label="Completion Date"
                            name="completionDate"
                            rules={[{ required: true, message: "Select completion date" }]}
                            style={{ marginBottom: 0 }}
                          >
                            <DatePicker format="YYYY-MM-DD" style={{ width: "100%" }} size="large" />
                          </Form.Item>
                        )}
                      </Card>

                      <Card size="small" title="Batch Selection">
                        <Form.Item label="Batch (Optional)" name="batchId" style={{ marginBottom: 0 }}>
                          <Select
                            placeholder="Select batch"
                            allowClear
                            loading={loadingBatches}
                            disabled={!courseId || loadingBatches}
                            size="large"
                          >
                            {batches.map((batch) => (
                              <Option key={batch._id} value={batch._id}>
                                {batch.batchName} - {batch.batchCode} ({batch.currentStudents || 0}/
                                {batch.maxStudents})
                              </Option>
                            ))}
                          </Select>
                        </Form.Item>
                      </Card>
                    </div>
                  ),
                },
                {
                  key: "plan",
                  label: "Payment Plan",
                  children: (
                    <Card title="Plan Setup" size="small">
                      <Space style={{ width: "100%" }} size={16} align="start" wrap>
                        <Form.Item
                          label="Plan Type"
                          name="paymentPlanType"
                          rules={[{ required: true, message: "Select plan type" }]}
                          style={{ flex: 1, minWidth: 220 }}
                        >
                          <Select size="large">
                            {PLAN_OPTIONS.map((plan) => (
                              <Option key={plan.value} value={plan.value}>
                                {plan.label}
                              </Option>
                            ))}
                          </Select>
                        </Form.Item>

                        <Form.Item
                          label="Discount (%)"
                          name="discountPercentage"
                          rules={[{ required: true, message: "Enter discount percentage" }]}
                          style={{ minWidth: 200 }}
                        >
                          <InputNumber min={0} max={100} precision={2} style={{ width: "100%" }} size="large" />
                        </Form.Item>

                        <Form.Item
                          label="Installments"
                          name="numberOfInstallments"
                          rules={[{ required: true, message: "Select installment count" }]}
                          style={{ minWidth: 200 }}
                        >
                          <Select disabled={paymentPlanType === "full_payment"} size="large">
                            {(paymentPlanType === "full_payment"
                              ? [1]
                              : Array.from({ length: 23 }, (_, index) => index + 2)
                            ).map((count) => (
                              <Option key={count} value={count}>
                                {count}
                              </Option>
                            ))}
                          </Select>
                        </Form.Item>
                      </Space>

                      <Alert
                        type="info"
                        showIcon
                        style={{ marginTop: 8 }}
                        message="Choose the plan first, then review fee summary and installment dates in the next tabs."
                        description="For additional fee rows: One-time creates one separate installment. Two-installments splits the same fee into two scheduled installments."
                      />
                    </Card>
                  ),
                },
                {
                  key: "fees",
                  label: "Fees",
                  children: (
                    <div>
                      <Card
                        title="Additional Fees Structure"
                        size="small"
                        style={{ marginBottom: 16 }}
                        extra={<Button onClick={addAdditionalFee}>Add Fee</Button>}
                      >
                        {additionalFees.length === 0 && (
                          <Text type="secondary">No additional fee added.</Text>
                        )}
                        <Space direction="vertical" style={{ width: "100%" }} size={10}>
                          {additionalFees.map((fee) => (
                            <Row gutter={[8, 8]} key={fee.id} align="middle">
                              <Col xs={24} md={5}>
                                <Select
                                  value={fee.feeType}
                                  onChange={(value) => updateAdditionalFee(fee.id, { feeType: value })}
                                  style={{ width: "100%" }}
                                  size="large"
                                >
                                  {ADDITIONAL_FEE_TYPES.map((type) => (
                                    <Option key={type.value} value={type.value}>
                                      {type.label}
                                    </Option>
                                  ))}
                                </Select>
                              </Col>
                              <Col xs={24} md={7}>
                                <Input
                                  value={fee.title}
                                  placeholder="Fee title"
                                  size="large"
                                  onChange={(e) =>
                                    updateAdditionalFee(fee.id, { title: e.target.value })
                                  }
                                />
                              </Col>
                              <Col xs={24} md={5}>
                                <InputNumber
                                  min={0}
                                  size="large"
                                  style={{ width: "100%" }}
                                  value={fee.amount}
                                  onChange={(value) => updateAdditionalFee(fee.id, { amount: value || 0 })}
                                />
                              </Col>
                              <Col xs={24} md={5}>
                                <Select
                                  value={fee.paymentMode}
                                  onChange={(value) =>
                                    updateAdditionalFee(fee.id, { paymentMode: value })
                                  }
                                  style={{ width: "100%" }}
                                  size="large"
                                >
                                  <Option value="one_time">One Time</Option>
                                  <Option value="two_installments">Two Installments</Option>
                                </Select>
                              </Col>
                              <Col xs={24} md={2}>
                                <Button
                                  danger
                                  block
                                  disabled={additionalFees.length === 1}
                                  onClick={() => removeAdditionalFee(fee.id)}
                                  size="large"
                                >
                                  Remove
                                </Button>
                              </Col>
                            </Row>
                          ))}
                        </Space>
                      </Card>

                      <Card title="Fee Summary" size="small">
                        <Space direction="vertical" style={{ width: "100%" }} size={10}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <Text>Admission Fee: PKR {baseFee.admissionFee.toLocaleString()}</Text>
                            <Button
                              type="text"
                              size="small"
                              icon={<EditOutlined />}
                              onClick={() => openFeeEditModal("admissionFee", baseFee.admissionFee)}
                            >
                              Edit
                            </Button>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <Text>Course Fee: PKR {baseFee.courseFee.toLocaleString()}</Text>
                            <Button
                              type="text"
                              size="small"
                              icon={<EditOutlined />}
                              onClick={() => openFeeEditModal("courseFee", baseFee.courseFee)}
                            >
                              Edit
                            </Button>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <Text>Certificate Fee: PKR {baseFee.certificateFee.toLocaleString()}</Text>
                            <Button
                              type="text"
                              size="small"
                              icon={<EditOutlined />}
                              onClick={() => openFeeEditModal("certificateFee", baseFee.certificateFee)}
                            >
                              Edit
                            </Button>
                          </div>
                          <Text>Additional Fees Total: PKR {baseFee.additionalFeesTotal.toLocaleString()}</Text>
                          <Text>Total Before Discount: PKR {baseFee.totalBeforeDiscount.toLocaleString()}</Text>
                          <Text type="success">
                            Course Fee Discount ({discountPercentage}%): -PKR {baseFee.discountAmount.toLocaleString()}
                          </Text>
                          <Text type="success">
                            Course Fee After Discount: PKR {baseFee.discountedCourseFee.toLocaleString()}
                          </Text>
                          <Text strong style={{ fontSize: 16 }}>
                            Final Fee: PKR {baseFee.finalFee.toLocaleString()}
                          </Text>
                          <Space wrap>
                            <Tag color="green">Paid: {paidInstallments}</Tag>
                            <Tag color="default">Unpaid: {unpaidInstallments}</Tag>
                            <Tag color="red">Remaining: PKR {baseFee.finalFee.toLocaleString()}</Tag>
                          </Space>
                        </Space>
                      </Card>
                    </div>
                  ),
                },
                {
                  key: "installments",
                  label: "Installments",
                  children: (
                    <Card title="Installment List" size="small">
                      <Table
                        dataSource={installments}
                        columns={installmentColumns}
                        rowKey="installmentNumber"
                        pagination={false}
                        size="small"
                        scroll={{ y: 320 }}
                        locale={{ emptyText: "Select course and enrollment date to generate installments" }}
                      />
                    </Card>
                  ),
                },
              ]}
            />
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              marginTop: 12,
              paddingTop: 12,
              borderTop: "1px solid #F0F0F0",
            }}
          >
            <Space wrap>
              {COURSE_ASSIGNMENT_STEPS.map((step) => (
                <Button
                  key={step.key}
                  type={activeTab === step.key ? "primary" : "default"}
                  onClick={() => handleTabChange(step.key)}
                  style={
                    activeTab === step.key
                      ? {
                          background:
                            "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                          border: "none",
                          borderRadius: 8,
                        }
                      : { borderRadius: 8 }
                  }
                >
                  {step.label}
                </Button>
              ))}
            </Space>
            <Space>
              <Button onClick={onCancel}>Cancel</Button>
              <Button type="primary" onClick={handleStepAction} loading={loading}>
                {isEditMode
                  ? "Update Course"
                  : isLastStep
                    ? "Assign Course"
                    : `Next: ${nextStep?.label || "Continue"}`}
              </Button>
            </Space>
          </div>
        </div>
      </Form>

      {/* Edit Fee Modal */}
      <Modal
        title="Edit Fee"
        open={editingFeeModal}
        onCancel={closeFeeEditModal}
        onOk={saveFeeEdit}
        centered
        width={400}
      >
        <Form layout="vertical">
          <Form.Item
            label={
              editingFeeType === "admissionFee"
                ? "Admission Fee"
                : editingFeeType === "courseFee"
                ? "Course Fee"
                : "Certificate Fee"
            }
          >
            <InputNumber
              size="large"
              className="w-full"
              min={0}
              value={editingFeeValue}
              onChange={(value) => setEditingFeeValue(value || 0)}
              prefix="PKR"
            />
          </Form.Item>
        </Form>
      </Modal>
    </Modal>
  );
};

export default CourseAssignmentForm;
