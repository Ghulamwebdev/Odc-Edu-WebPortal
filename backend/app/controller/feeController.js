// controllers/feeController.js
import FeeStructureSchema from "../modules/feeStructureModule.js";
import FeePaymentSchema from "../modules/feePaymentModule.js";
import AdmissionSchema from "../modules/AdmissionModule.js";
import CourseSchema from "../modules/courseModule.js";
import EnrollmentSchema from "../modules/enrollmentModule.js";
import {
  generateReceiptNumber,
  calculateRefund,
} from "../utils/installmentCalculator.js";
import { createAutoAccountingEntry } from "../utils/autoAccountingEntry.js";
import { getCourseInstallmentCount } from "../utils/installmentExtension.js";

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const clamp = (value, min, max) =>
  Math.min(max, Math.max(min, Number(value) || min));

const addMonths = (dateValue, monthsToAdd) => {
  const date = new Date(dateValue);
  date.setMonth(date.getMonth() + monthsToAdd);
  return date;
};

const normalizeAdditionalFees = (rows = []) =>
  (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const amount = round2(row?.amount);
      const feeType = ["exam", "registration", "practical", "other"].includes(
        row?.feeType,
      )
        ? row.feeType
        : "other";
      const title = (row?.title || "").trim() || "Additional Fee";
      const paymentMode =
        row?.paymentMode === "two_installments"
          ? "two_installments"
          : "one_time";

      return {
        feeType,
        title,
        amount,
        paymentMode,
        numberOfInstallments: paymentMode === "two_installments" ? 2 : 1,
      };
    })
    .filter((row) => row.amount > 0);

const getInstallmentComponentsTotal = (feeComponents = {}) =>
  round2(
    Number(feeComponents?.admissionFee || 0) +
      Number(feeComponents?.courseFee || 0) +
      Number(feeComponents?.certificateFee || 0) +
      Number(feeComponents?.examFee || 0) +
      Number(feeComponents?.registrationFee || 0) +
      Number(feeComponents?.practicalFee || 0) +
      Number(feeComponents?.otherFee || 0),
  );

const rebalanceInstallmentsToTarget = (installments = [], targetTotal = 0) => {
  const normalized = installments.map((item) => ({
    ...item,
    amount: round2(Math.max(0, item.amount || 0)),
  }));

  if (!normalized.length) {
    return normalized;
  }

  const target = round2(Math.max(0, targetTotal || 0));
  const current = round2(
    normalized.reduce((sum, item) => sum + (item.amount || 0), 0),
  );
  const diff = round2(target - current);

  if (diff === 0) {
    return normalized;
  }

  const lastIndex = normalized.length - 1;
  normalized[lastIndex].amount = round2(normalized[lastIndex].amount + diff);

  return normalized;
};

const normalizeInstallments = ({
  installments,
  totalAmount,
  startDate,
  preserveExactAmounts = false,
}) => {
  if (!Array.isArray(installments) || installments.length === 0) {
    return [];
  }

  const normalized = installments.map((item, index) => ({
    installmentNumber: index + 1,
    description: item?.description?.trim() || `Installment ${index + 1}`,
    feeComponents: {
      admissionFee: round2(item?.feeComponents?.admissionFee || 0),
      courseFee: round2(item?.feeComponents?.courseFee ?? item?.amount ?? 0),
      certificateFee: round2(item?.feeComponents?.certificateFee || 0),
      examFee: round2(item?.feeComponents?.examFee || 0),
      registrationFee: round2(item?.feeComponents?.registrationFee || 0),
      practicalFee: round2(item?.feeComponents?.practicalFee || 0),
      otherFee: round2(item?.feeComponents?.otherFee || 0),
    },
    amount: round2(
      item?.amount ?? getInstallmentComponentsTotal(item?.feeComponents),
    ),
    dueDate: item?.dueDate ? new Date(item.dueDate) : addMonths(startDate, index),
    status: item?.status || "Pending",
    paidAmount: round2(item?.paidAmount || 0),
  }));

  if (preserveExactAmounts) {
    return normalized;
  }

  return rebalanceInstallmentsToTarget(normalized, totalAmount);
};

const buildDistributedValues = (amount, count) => {
  const safeAmount = round2(amount);
  const safeCount = clamp(count, 1, 24);

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

const buildInstallments = ({
  count,
  startDate,
  admissionFee,
  courseFee,
  certificateFee,
  additionalFees = [],
  finalFee,
}) => {
  const safeCount = clamp(count, 1, 24);
  const coursePlan = buildDistributedValues(courseFee, safeCount);

  const baseInstallments = Array.from({ length: safeCount }, (_, index) => {
    const isFirst = index === 0;
    const isLast = index === safeCount - 1;
    const feeComponents = {
      admissionFee: isFirst ? round2(admissionFee) : 0,
      courseFee: coursePlan[index],
      certificateFee: isLast ? round2(certificateFee) : 0,
      examFee: 0,
      registrationFee: 0,
      practicalFee: 0,
      otherFee: 0,
    };

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
      amount: getInstallmentComponentsTotal(feeComponents),
      dueDate: addMonths(startDate, index),
      status: "Pending",
      paidAmount: 0,
      feeComponents,
    };
  });

  const extraInstallments = [];
  let extraOffset = 0;

  normalizeAdditionalFees(additionalFees).forEach((fee) => {
    const componentKey = getFeeComponentKey(fee.feeType);
    const baseIndex = safeCount + extraOffset;

    if (fee.paymentMode === "one_time") {
      extraInstallments.push({
        installmentNumber: baseIndex + 1,
        description: fee.title,
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
          otherFee: fee.feeType === "other" ? fee.amount : 0,
          [componentKey]: fee.amount,
        },
      });
      extraOffset += 1;
      return;
    }

    const firstAmount = round2(Math.floor((fee.amount / 2) * 100) / 100);
    const secondAmount = round2(fee.amount - firstAmount);

    extraInstallments.push(
      {
        installmentNumber: baseIndex + 1,
        description: `${fee.title} - Installment 1/2`,
        amount: firstAmount,
        dueDate: addMonths(startDate, baseIndex),
        status: "Pending",
        paidAmount: 0,
        feeComponents: {
          admissionFee: 0,
          courseFee: 0,
          certificateFee: 0,
          examFee: fee.feeType === "exam" ? firstAmount : 0,
          registrationFee: fee.feeType === "registration" ? firstAmount : 0,
          practicalFee: fee.feeType === "practical" ? firstAmount : 0,
          otherFee: fee.feeType === "other" ? firstAmount : 0,
        },
      },
      {
        installmentNumber: baseIndex + 2,
        description: `${fee.title} - Installment 2/2`,
        amount: secondAmount,
        dueDate: addMonths(startDate, baseIndex + 1),
        status: "Pending",
        paidAmount: 0,
        feeComponents: {
          admissionFee: 0,
          courseFee: 0,
          certificateFee: 0,
          examFee: fee.feeType === "exam" ? secondAmount : 0,
          registrationFee: fee.feeType === "registration" ? secondAmount : 0,
          practicalFee: fee.feeType === "practical" ? secondAmount : 0,
          otherFee: fee.feeType === "other" ? secondAmount : 0,
        },
      },
    );
    extraOffset += 2;
  });

  return rebalanceInstallmentsToTarget(
    [...baseInstallments, ...extraInstallments].map((item, index) => ({
      ...item,
      installmentNumber: index + 1,
    })),
    finalFee,
  );
};

const getDb = async () => {
  const mongoose = (await import("mongoose")).default;
  return mongoose.connection.db;
};

const getIdVariants = async (value) => {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return [];
  }

  const mongoose = (await import("mongoose")).default;
  const variants = [rawValue];

  if (mongoose.Types.ObjectId.isValid(rawValue)) {
    variants.push(new mongoose.Types.ObjectId(rawValue));
  }

  return variants;
};

const findRawById = async (collectionName, id) => {
  const idVariants = await getIdVariants(id);
  if (!idVariants.length) {
    return null;
  }

  const db = await getDb();
  return db.collection(collectionName).findOne({ _id: { $in: idVariants } });
};

const findRawFeeStructure = async ({ feeStructureId, studentId, courseId }) => {
  const db = await getDb();

  if (feeStructureId) {
    const directMatch = await findRawById("feestructures", feeStructureId);
    if (directMatch) {
      return directMatch;
    }
  }

  const studentVariants = await getIdVariants(studentId);
  const courseVariants = await getIdVariants(courseId);

  return db
    .collection("feestructures")
    .find({
      student: { $in: studentVariants },
      course: { $in: courseVariants },
    })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(1)
    .next();
};

const getRawStudentAndCourse = async (studentId, courseId) => {
  const [student, course] = await Promise.all([
    findRawById("admissions", studentId),
    findRawById("courses", courseId),
  ]);

  return { student, course };
};

const getNextReceiptNumber = async (prefix = "RCP", paymentDate = new Date()) => {
  const date = new Date(paymentDate);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid payment date");
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const monthPrefix = `${prefix}-${year}${month}-`;

  const monthPayments = await FeePaymentSchema.find({
    receiptNo: { $regex: `^${monthPrefix}` },
  })
    .select("receiptNo")
    .lean();

  const nextSequence =
    monthPayments.reduce((maxSequence, payment) => {
      const sequenceMatch = String(payment?.receiptNo || "").match(/-(\d+)$/);
      const sequence = sequenceMatch ? Number(sequenceMatch[1]) : 0;
      return Number.isFinite(sequence) ? Math.max(maxSequence, sequence) : maxSequence;
    }, 0) + 1;

  return generateReceiptNumber(prefix, nextSequence, date);
};

// Create or Update Fee Structure
export const createOrUpdateFeeStructure = async (req, res) => {
  try {
    const {
      studentId,
      courseId,
      admissionFee,
      courseFee,
      certificateFee,
      examFee,
      registrationFee,
      practicalFee,
      otherFee,
      discount,
      additionalFees,
      paymentPlanType,
      discountOnAdmission,
      discountOnCourseFee,
      discountPercentage,
      totalFee,
      finalFee,
      installmentEnabled,
      numberOfInstallments,
      installments,
      installmentDetails,
      notes,
    } = req.body;

    if (!studentId || !courseId) {
      return res.status(400).json({
        success: false,
        message: "Student ID and Course ID are required",
      });
    }

    // Check enrollment exists
    const enrollment = await EnrollmentSchema.findOne({
      student: studentId,
      course: courseId,
    });

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: "Enrollment not found. Please enroll student first.",
      });
    }

    // Get course details for default fees
    const course = await CourseSchema.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    const feeData = {
      admissionFee: round2(admissionFee ?? course.admissionFee ?? 0),
      courseFee: round2(courseFee ?? course.courseFee ?? 0),
      certificateFee: round2(certificateFee ?? course.certificateFee ?? 0),
      examFee: round2(examFee ?? course.examFee ?? 0),
      registrationFee: round2(registrationFee ?? course.registrationFee ?? 0),
      practicalFee: round2(practicalFee ?? course.practicalFee ?? 0),
      otherFee: round2(otherFee ?? course.otherFee ?? 0),
    };
    const resolvedAdditionalFees = normalizeAdditionalFees(additionalFees);
    const additionalFeesTotal = round2(
      resolvedAdditionalFees.reduce((sum, item) => sum + item.amount, 0),
    );
    const effectiveDiscountPercentage = clamp(discountPercentage, 0, 100);
    const requestedCourseDiscount = round2(
      discountOnCourseFee ?? discount ?? 0,
    );
    const percentageCourseDiscount = round2(
      (feeData.courseFee * effectiveDiscountPercentage) / 100,
    );
    const resolvedCourseDiscount = round2(
      Math.min(
        feeData.courseFee,
        discountOnCourseFee != null
          ? requestedCourseDiscount
          : effectiveDiscountPercentage > 0
            ? percentageCourseDiscount
            : requestedCourseDiscount,
      ),
    );
    const resolvedAdmissionDiscount = round2(discountOnAdmission || 0);
    const totalBeforeDiscount =
      feeData.admissionFee +
      feeData.courseFee +
      feeData.certificateFee +
      feeData.examFee +
      feeData.registrationFee +
      feeData.practicalFee +
      feeData.otherFee +
      additionalFeesTotal;

    feeData.discount = resolvedCourseDiscount;
    feeData.discountOnCourseFee = resolvedCourseDiscount;
    feeData.discountOnAdmission = resolvedAdmissionDiscount;
    feeData.discountType =
      resolvedAdmissionDiscount > 0 && resolvedCourseDiscount > 0
        ? "both"
        : resolvedAdmissionDiscount > 0
          ? "admission"
          : resolvedCourseDiscount > 0
            ? "courseFee"
            : "none";
    feeData.totalFee = round2(
      finalFee ??
        totalFee ??
        (totalBeforeDiscount -
          resolvedAdmissionDiscount -
          resolvedCourseDiscount),
    );

    const rawInstallments = Array.isArray(installments) && installments.length
      ? installments
      : installmentDetails;
    const enrollmentStartDate = enrollment.enrollmentDate || new Date();
    let normalizedInstallments = normalizeInstallments({
      installments: rawInstallments,
      totalAmount: feeData.totalFee,
      startDate: enrollmentStartDate,
      preserveExactAmounts: true,
    });

    if (
      !normalizedInstallments.length &&
      (installmentEnabled || Number(numberOfInstallments || 1) > 1 || resolvedAdditionalFees.length > 0)
    ) {
      normalizedInstallments = buildInstallments({
        count: numberOfInstallments || 1,
        startDate: enrollmentStartDate,
        admissionFee: Math.max(0, feeData.admissionFee - resolvedAdmissionDiscount),
        courseFee: Math.max(0, feeData.courseFee - resolvedCourseDiscount),
        certificateFee: feeData.certificateFee,
        additionalFees: resolvedAdditionalFees,
        finalFee: feeData.totalFee,
      });
    }

    const resolvedInstallmentCount = clamp(
      numberOfInstallments ||
        getCourseInstallmentCount(normalizedInstallments) ||
        normalizedInstallments.length ||
        1,
      1,
      24,
    );
    const resolvedInstallmentEnabled = normalizedInstallments.length > 1;
    const resolvedTotalFee = normalizedInstallments.length
      ? round2(
          normalizedInstallments.reduce(
            (sum, item) => sum + Number(item?.amount || 0),
            0,
          ),
        )
      : feeData.totalFee;

    // Check if fee structure already exists
    let feeStructure = await FeeStructureSchema.findOne({
      student: studentId,
      course: courseId,
    }).sort({ updatedAt: -1, createdAt: -1 });

    if (feeStructure) {
      // Update existing fee structure
      feeStructure.admissionFee = feeData.admissionFee;
      feeStructure.courseFee = feeData.courseFee;
      feeStructure.certificateFee = feeData.certificateFee;
      feeStructure.examFee = feeData.examFee;
      feeStructure.registrationFee = feeData.registrationFee;
      feeStructure.practicalFee = feeData.practicalFee;
      feeStructure.otherFee = feeData.otherFee;
      feeStructure.discount = feeData.discount;
      feeStructure.discountOnCourseFee = feeData.discountOnCourseFee;
      feeStructure.discountOnAdmission = feeData.discountOnAdmission;
      feeStructure.discountPercentage = effectiveDiscountPercentage;
      feeStructure.discountType = feeData.discountType;
      feeStructure.paymentPlanType = paymentPlanType || "custom";
      feeStructure.additionalFees = resolvedAdditionalFees;
      feeStructure.totalFee = resolvedTotalFee;
      feeStructure.remainingAmount = round2(
        resolvedTotalFee - Number(feeStructure.paidAmount || 0),
      );
      feeStructure.installmentEnabled = resolvedInstallmentEnabled;
      feeStructure.numberOfInstallments = resolvedInstallmentCount;
      feeStructure.installmentAmount = resolvedInstallmentEnabled
        ? round2(resolvedTotalFee / resolvedInstallmentCount)
        : resolvedTotalFee;
      feeStructure.installments = normalizedInstallments;

      if (notes) feeStructure.notes = notes;

      await feeStructure.save();
    } else {
      // Create new fee structure
      const newFeeStructureData = {
        student: studentId,
        course: courseId,
        enrollment: enrollment._id,
        ...feeData,
        additionalFees: resolvedAdditionalFees,
        totalFee: resolvedTotalFee,
        remainingAmount: resolvedTotalFee,
        paymentPlanType: paymentPlanType || "custom",
        discountPercentage: effectiveDiscountPercentage,
        installmentEnabled: resolvedInstallmentEnabled,
        numberOfInstallments: resolvedInstallmentCount,
        installmentAmount: resolvedInstallmentEnabled
          ? round2(resolvedTotalFee / resolvedInstallmentCount)
          : resolvedTotalFee,
        notes,
      };

      newFeeStructureData.installments = normalizedInstallments;

      feeStructure = new FeeStructureSchema(newFeeStructureData);
      await feeStructure.save();
    }

    const populatedFeeStructure = await FeeStructureSchema.findById(
      feeStructure._id,
    )
      .populate("student", "registrationNo studentName mobileNumber")
      .populate("course", "courseName courseId");

    res.status(200).json({
      success: true,
      message: feeStructure.isNew
        ? "Fee structure created successfully"
        : "Fee structure updated successfully",
      data: populatedFeeStructure,
    });
  } catch (error) {
    console.error("Fee structure error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while managing fee structure",
      error: error.message,
    });
  }
};

// Get Fee Structure for a student and course
export const getFeeStructure = async (req, res) => {
  try {
    const { studentId, courseId } = req.params;

    const feeStructure = await FeeStructureSchema.findOne({
      student: studentId,
      course: courseId,
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .populate(
        "student",
        "registrationNo studentName mobileNumber emailAddress",
      )
      .populate("course", "courseName courseId totalFee");

    if (!feeStructure) {
      return res.status(404).json({
        success: false,
        message: "Fee structure not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Fee structure retrieved successfully",
      data: feeStructure,
    });
  } catch (error) {
    console.error("Error retrieving fee structure:", error);
    res.status(500).json({
      success: false,
      message: "Server error while retrieving fee structure",
      error: error.message,
    });
  }
};

// Get all fee structures for a student
export const getStudentFeeStructures = async (req, res) => {
  try {
    const { studentId } = req.params;

    const feeStructures = await FeeStructureSchema.find({ student: studentId })
      .populate("course", "courseName courseId totalFee")
      .populate("enrollment", "status enrollmentDate")
      .sort({ updatedAt: -1, createdAt: -1 });

    const latestFeeStructures = [];
    const seenFeeStructures = new Set();
    feeStructures.forEach((feeStructure) => {
      const enrollmentId =
        feeStructure.enrollment?._id || feeStructure.enrollment;
      const key = enrollmentId
        ? `enrollment:${enrollmentId}`
        : `course:${feeStructure.student?._id || feeStructure.student}:${
            feeStructure.course?._id || feeStructure.course
          }`;
      if (seenFeeStructures.has(key)) return;
      seenFeeStructures.add(key);
      latestFeeStructures.push(feeStructure);
    });

    res.status(200).json({
      success: true,
      message: "Fee structures retrieved successfully",
      data: latestFeeStructures,
    });
  } catch (error) {
    console.error("Error retrieving fee structures:", error);
    res.status(500).json({
      success: false,
      message: "Server error while retrieving fee structures",
      error: error.message,
    });
  }
};

const inferPreferredIncomeHeadName = (feeStructure, installmentNumber) => {
  const normalizedInstallmentNumber = Number(installmentNumber || 0);
  const targetInstallment = Array.isArray(feeStructure?.installments)
    ? feeStructure.installments.find(
        (item) => Number(item?.installmentNumber) === normalizedInstallmentNumber,
      )
    : null;

  const feeComponents = targetInstallment?.feeComponents || {};
  const headCandidates = [
    { key: "admissionFee", label: "Admission Fee" },
    { key: "courseFee", label: "Course Fees" },
    { key: "certificateFee", label: "Certificate Fee" },
    { key: "examFee", label: "Exam Fee" },
    { key: "registrationFee", label: "Registration Fee" },
    { key: "practicalFee", label: "Practical Fee" },
    { key: "otherFee", label: "Other Fee" },
  ].filter((item) => Number(feeComponents?.[item.key] || 0) > 0);

  if (headCandidates.length === 1) {
    return headCandidates[0].label;
  }

  const description = String(targetInstallment?.description || "").toLowerCase();
  if (description.includes("admission")) return "Admission Fee";
  if (description.includes("certificate")) return "Certificate Fee";
  if (description.includes("exam")) return "Exam Fee";
  if (description.includes("registration")) return "Registration Fee";
  if (description.includes("practical")) return "Practical Fee";
  if (description.includes("other")) return "Other Fee";

  return "Course Fees";
};

// Record a fee payment
export const recordFeePayment = async (req, res) => {
  try {
    const {
      studentId,
      courseId,
      feeStructureId,
      amount,
      paymentDate,
      paymentMethod,
      transactionId,
      chequeNo,
      bankName,
      installmentNumber,
      voucherNo,
      remarks,
      receivedBy,
      paymentType, // 'Full', 'Partial', 'Installment'
      accountingPaymentMethodId, // ObjectId of the accounting PaymentMethod chosen in UI
    } = req.body;

    if (!studentId || !courseId || !amount) {
      return res.status(400).json({
        success: false,
        message: "Student ID, Course ID, and Amount are required",
      });
    }

    const normalizedAmount = Number(amount || 0);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid payment amount is required",
      });
    }

    // Restored databases may store fee structure IDs as strings, so resolve via raw collection.
    const feeStructure = await findRawFeeStructure({
      feeStructureId,
      studentId,
      courseId,
    });

    if (!feeStructure) {
      return res.status(404).json({
        success: false,
        message: "Fee structure not found",
      });
    }

    const resolvedPaymentDate = paymentDate ? new Date(paymentDate) : new Date();
    if (Number.isNaN(resolvedPaymentDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "A valid payment date is required",
      });
    }
    const db = await getDb();
    let payment = null;
    let receiptNo = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      receiptNo = await getNextReceiptNumber("RCP", resolvedPaymentDate);

      try {
        payment = await FeePaymentSchema.create({
          receiptNo,
          voucherNo: voucherNo || "",
          student: feeStructure.student || studentId,
          course: String(feeStructure.course || courseId),
          feeStructure: feeStructure._id,
          installmentNumber: installmentNumber || null,
          amount: normalizedAmount,
          paymentDate: resolvedPaymentDate,
          paymentMethod: paymentMethod || "Cash",
          accountingPaymentMethodId: accountingPaymentMethodId || null,
          transactionId: transactionId || "",
          chequeNo: chequeNo || "",
          bankName: bankName || "",
          remarks: remarks || "",
          receivedBy: receivedBy || null,
          status: "Completed",
          paymentType: paymentType || "Installment",
        });
        break;
      } catch (error) {
        if (error?.code !== 11000 || !String(error?.message || "").includes("receiptNo")) {
          throw error;
        }

        if (attempt === 2) {
          throw error;
        }
      }
    }

    // Update fee structure (using rounded amounts)
    feeStructure.paidAmount = Math.round(
      Number(feeStructure.paidAmount || 0) + normalizedAmount,
    );
    // Ensure remainingAmount is never negative
    const calculatedRemaining = Math.round(
      Number(feeStructure.totalFee || 0) - feeStructure.paidAmount,
    );
    feeStructure.remainingAmount = Math.max(0, calculatedRemaining);

    // Update installment if applicable
    if (installmentNumber && (feeStructure.installments || []).length > 0) {
      const installmentIndex = feeStructure.installments.findIndex(
        (inst) => Number(inst.installmentNumber) === Number(installmentNumber),
      );

      if (installmentIndex !== -1) {
        const installment = feeStructure.installments[installmentIndex];
        installment.paidAmount = Math.round(
          Number(installment.paidAmount || 0) + normalizedAmount,
        );
        installment.paidDate = resolvedPaymentDate;
        installment.receiptNumber = receiptNo;
        installment.voucherNo = voucherNo;

        if (installment.paidAmount >= installment.amount) {
          installment.status = "Paid";
        } else if (installment.paidAmount > 0) {
          installment.status = "Partial";
        }
      }
    }

    // Update overall fee status
    if (feeStructure.remainingAmount <= 0) {
      feeStructure.feeStatus = "Paid";
    } else if (feeStructure.paidAmount > 0) {
      feeStructure.feeStatus = "Partial";
    }

    feeStructure.updatedAt = new Date();
    await db
      .collection("feestructures")
      .replaceOne({ _id: feeStructure._id }, feeStructure);

    const { student, course } = await getRawStudentAndCourse(studentId, courseId);
    const populatedPayment = {
      ...payment.toObject(),
      student,
      course,
    };

    // ── Auto accounting entry (non-blocking) ───────────────
    await createAutoAccountingEntry({
      entryType: "Income",
      preferredHeadName: inferPreferredIncomeHeadName(
        feeStructure,
        installmentNumber,
      ),
      amount: normalizedAmount,
      paymentDate: resolvedPaymentDate,
      studentName: populatedPayment?.student?.studentName || "Student",
      studentRegNo: populatedPayment?.student?.registrationNo,
      studentMobile: populatedPayment?.student?.mobileNumber,
      courseName: populatedPayment?.course?.courseName,
      receiptNo,
      voucherNo,
      paymentMethodId: accountingPaymentMethodId || null,
      paymentMethodStr: paymentMethod,
      paymentType: paymentType || "Installment",
      installmentNumber,
      transactionId,
      chequeNo,
      bankName,
      receivedBy,
      remarks,
    }).catch((err) =>
      console.error("[AutoAccounting] Fee payment entry failed:", err),
    );

    res.status(201).json({
      success: true,
      message: "Payment recorded successfully",
      data: {
        payment: populatedPayment,
        feeStructure: {
          totalFee: feeStructure.totalFee,
          paidAmount: feeStructure.paidAmount,
          remainingAmount: feeStructure.remainingAmount,
          feeStatus: feeStructure.feeStatus,
          installments: feeStructure.installments,
        },
      },
    });
  } catch (error) {
    console.error("Payment recording error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while recording payment",
      error: error.message,
    });
  }
};

// Get payment history for a student
export const getStudentPaymentHistory = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { courseId } = req.query;

    const filter = { student: studentId };
    if (courseId) {
      filter.course = courseId;
    }

    const payments = await FeePaymentSchema.find(filter)
      .populate("course", "courseName courseId")
      .populate("receivedBy", "name email")
      .sort({ paymentDate: -1 });

    const totalPaid = payments.reduce(
      (sum, payment) => sum + payment.amount,
      0,
    );

    res.status(200).json({
      success: true,
      message: "Payment history retrieved successfully",
      data: {
        payments,
        totalPaid,
      },
    });
  } catch (error) {
    console.error("Error retrieving payment history:", error);
    res.status(500).json({
      success: false,
      message: "Server error while retrieving payment history",
      error: error.message,
    });
  }
};

// Get all fee structures with filters
export const getAllFeeStructures = async (req, res) => {
  try {
    const { feeStatus, courseId, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (feeStatus) filter.feeStatus = feeStatus;
    if (courseId) filter.course = courseId;

    const skip = (page - 1) * limit;

    const feeStructures = await FeeStructureSchema.find(filter)
      .populate("student", "registrationNo studentName mobileNumber")
      .populate("course", "courseName courseId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await FeeStructureSchema.countDocuments(filter);

    // Calculate summary
    const summary = await FeeStructureSchema.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalFeeAmount: { $sum: "$totalFee" },
          totalPaidAmount: { $sum: "$paidAmount" },
          totalRemainingAmount: { $sum: "$remainingAmount" },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      message: "Fee structures retrieved successfully",
      data: feeStructures,
      summary: summary[0] || {
        totalFeeAmount: 0,
        totalPaidAmount: 0,
        totalRemainingAmount: 0,
      },
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error retrieving fee structures:", error);
    res.status(500).json({
      success: false,
      message: "Server error while retrieving fee structures",
      error: error.message,
    });
  }
};

// Update payment status
export const updatePaymentStatus = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { status, remarks, amount, paymentMethod, paymentDate, notes } =
      req.body;

    // Build update object dynamically
    const updateData = {};
    if (status) updateData.status = status;
    if (remarks) updateData.remarks = remarks;
    if (amount) updateData.amount = amount;
    if (paymentMethod) updateData.paymentMethod = paymentMethod;
    if (notes) updateData.notes = notes;
    if (paymentDate) updateData.paymentDate = paymentDate;

    const payment = await FeePaymentSchema.findByIdAndUpdate(
      paymentId,
      updateData,
      { new: true },
    )
      .populate("student", "registrationNo studentName")
      .populate("course", "courseName courseId");

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    // Keep installment payment values in sync with edited payment records.
    if (
      payment.feeStructure &&
      payment.installmentNumber &&
      (amount || paymentDate || status)
    ) {
      const feeStructure = await FeeStructureSchema.findById(
        payment.feeStructure,
      );
      if (feeStructure && feeStructure.installments) {
        const installment = feeStructure.installments.find(
          (inst) => inst.installmentNumber === payment.installmentNumber,
        );
        if (installment) {
          if (amount) {
            installment.paidAmount = amount;
          }
          if (paymentDate) {
            installment.paidDate = new Date(paymentDate);
          }
          if (status) {
            installment.status = status;
          } else if (installment.paidAmount >= installment.amount) {
            installment.status = "Paid";
          } else if (installment.paidAmount > 0) {
            installment.status = "Partial";
          }
          await feeStructure.save();
        }
      }
    }

    res.status(200).json({
      success: true,
      message: "Payment updated successfully",
      data: payment,
    });
  } catch (error) {
    console.error("Error updating payment:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating payment",
      error: error.message,
    });
  }
};

export const getNextVoucherNumber = async (req, res) => {
  try {
    // Get the highest existing voucher number
    const lastPayment = await FeePaymentSchema.findOne({})
      .sort({ createdAt: -1 })
      .select("voucherNo");

    let nextNumber = 1;
    if (lastPayment && lastPayment.voucherNo) {
      // Extract the number from voucherNo (assuming format like "001", "002", etc.)
      const match = lastPayment.voucherNo.match(/^(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }

    const voucherNo = String(nextNumber).padStart(3, "0");

    res.status(200).json({
      success: true,
      data: { voucherNo },
    });
  } catch (error) {
    console.error("Error generating voucher number:", error);
    res.status(500).json({
      success: false,
      message: "Server error while generating voucher number",
      error: error.message,
    });
  }
};

// Get all payments with filters
export const getAllPayments = async (req, res) => {
  try {
    const {
      status,
      courseId,
      studentId,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (courseId) filter.course = courseId;
    if (studentId) filter.student = studentId;

    if (startDate || endDate) {
      filter.paymentDate = {};
      if (startDate) filter.paymentDate.$gte = new Date(startDate);
      if (endDate) filter.paymentDate.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const payments = await FeePaymentSchema.find(filter)
      .populate("student", "registrationNo studentName mobileNumber")
      .populate("course", "courseName courseId")
      .populate("receivedBy", "name email")
      .sort({ paymentDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await FeePaymentSchema.countDocuments(filter);

    // Calculate total amount
    const totalAmount = await FeePaymentSchema.aggregate([
      { $match: filter },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    res.status(200).json({
      success: true,
      message: "Payments retrieved successfully",
      data: payments,
      totalAmount: totalAmount[0]?.total || 0,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error retrieving payments:", error);
    res.status(500).json({
      success: false,
      message: "Server error while retrieving payments",
      error: error.message,
    });
  }
};

// Update Installment Status
export const updateInstallmentStatus = async (req, res) => {
  try {
    const { feeStructureId, installmentId } = req.params;
    const { status, paidAmount, paidDate } = req.body;

    const feeStructure = await FeeStructureSchema.findById(feeStructureId);

    if (!feeStructure) {
      return res.status(404).json({
        success: false,
        message: "Fee structure not found",
      });
    }

    // Find the installment
    const installment = feeStructure.installments.id(installmentId);

    if (!installment) {
      return res.status(404).json({
        success: false,
        message: "Installment not found",
      });
    }

    // Update installment
    installment.status = status;
    installment.paidAmount = paidAmount || 0;
    if (paidDate) {
      installment.paidDate = paidDate;
    }

    // Update fee structure totals
    const totalPaid = feeStructure.installments.reduce(
      (sum, inst) => sum + (inst.paidAmount || 0),
      0,
    );
    feeStructure.paidAmount = totalPaid;
    feeStructure.remainingAmount = feeStructure.totalFee - totalPaid;

    // Update overall fee status
    if (totalPaid === 0) {
      feeStructure.feeStatus = "Unpaid";
    } else if (totalPaid >= feeStructure.totalFee) {
      feeStructure.feeStatus = "Paid";
    } else {
      feeStructure.feeStatus = "Partial";
    }

    await feeStructure.save();

    res.status(200).json({
      success: true,
      message: "Installment status updated successfully",
      data: feeStructure,
    });
  } catch (error) {
    console.error("Error updating installment:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating installment",
      error: error.message,
    });
  }
};

// Process refund for a payment
export const processRefund = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { refundAmount, refundReason, refundedBy } = req.body;

    if (!refundAmount || refundAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid refund amount is required",
      });
    }

    // Get payment record
    const payment = await FeePaymentSchema.findById(paymentId);
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    if (payment.status === "Refunded") {
      return res.status(400).json({
        success: false,
        message: "Payment has already been refunded",
      });
    }

    if (refundAmount > payment.amount) {
      return res.status(400).json({
        success: false,
        message: "Refund amount cannot exceed payment amount",
      });
    }

    // Update payment record
    payment.status = "Refunded";
    payment.refundDetails = {
      refundAmount,
      refundDate: new Date(),
      refundReason,
      refundedBy,
    };

    await payment.save();

    // Update fee structure
    const feeStructure = await FeeStructureSchema.findById(
      payment.feeStructure,
    );

    if (feeStructure) {
      feeStructure.paidAmount = Math.round(
        feeStructure.paidAmount - refundAmount,
      );
      feeStructure.remainingAmount = Math.round(
        feeStructure.remainingAmount + refundAmount,
      );

      // Update installment if applicable
      if (payment.installmentNumber) {
        const installmentIndex = feeStructure.installments.findIndex(
          (inst) => inst.installmentNumber === payment.installmentNumber,
        );

        if (installmentIndex !== -1) {
          const installment = feeStructure.installments[installmentIndex];
          installment.paidAmount = Math.max(
            0,
            Math.round((installment.paidAmount || 0) - refundAmount),
          );

          if (installment.paidAmount === 0) {
            installment.status = "Pending";
            installment.receiptNumber = null;
          } else if (installment.paidAmount < installment.amount) {
            installment.status = "Partial";
          }
        }
      }

      // Update overall fee status
      if (feeStructure.paidAmount === 0) {
        feeStructure.feeStatus = "Unpaid";
      } else if (feeStructure.paidAmount < feeStructure.totalFee) {
        feeStructure.feeStatus = "Partial";
      }

      await feeStructure.save();
    }

    const populatedPayment = await FeePaymentSchema.findById(payment._id)
      .populate("student", "registrationNo studentName")
      .populate("course", "courseName courseId");

    // ── Auto accounting entry (non-blocking) ───────────────
    createAutoAccountingEntry({
      entryType: "Expense",
      preferredHeadName: "Fees Refund",
      amount: refundAmount,
      paymentDate: new Date(),
      studentName: populatedPayment?.student?.studentName || "Student",
      studentRegNo: populatedPayment?.student?.registrationNo,
      courseName: populatedPayment?.course?.courseName,
      receiptNo: payment.receiptNo,
      voucherNo: payment.voucherNo,
      paymentMethodId: payment.accountingPaymentMethodId || null,
      paymentMethodStr: payment.paymentMethod,
      paymentType: payment.paymentType,
      installmentNumber: payment.installmentNumber,
      transactionId: payment.transactionId,
      chequeNo: payment.chequeNo,
      bankName: payment.bankName,
      refundReason,
      refundedBy,
    }).catch((err) =>
      console.error("[AutoAccounting] Refund entry failed:", err),
    );

    res.status(200).json({
      success: true,
      message: "Refund processed successfully",
      data: {
        payment: populatedPayment,
        refundDetails: payment.refundDetails,
      },
    });
  } catch (error) {
    console.error("Refund processing error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while processing refund",
      error: error.message,
    });
  }
};

// Calculate refund amount for a student
export const calculateRefundAmount = async (req, res) => {
  try {
    const { studentId, courseId } = req.params;
    const { completedMonths } = req.body;

    // Get fee structure
    const feeStructure = await FeeStructureSchema.findOne({
      student: studentId,
      course: courseId,
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .populate("course", "duration");

    if (!feeStructure) {
      return res.status(404).json({
        success: false,
        message: "Fee structure not found",
      });
    }

    // Calculate monthly course fee
    const monthlyCourseFee =
      feeStructure.courseFee / feeStructure.course.duration;

    // Calculate refund
    const refundCalc = calculateRefund({
      totalPaid: feeStructure.paidAmount,
      admissionFee: feeStructure.admissionFee,
      completedMonths: completedMonths || 0,
      monthlyCourseFee,
    });

    res.status(200).json({
      success: true,
      message: "Refund calculated successfully",
      data: refundCalc,
    });
  } catch (error) {
    console.error("Refund calculation error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while calculating refund",
      error: error.message,
    });
  }
};

// Generate payment receipt
export const getPaymentReceipt = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await FeePaymentSchema.findById(paymentId)
      .populate({
        path: "student",
        select:
          "registrationNo studentName fatherName mobileNumber emailAddress",
      })
      .populate("course", "courseName courseId duration")
      .populate("receivedBy", "name email");

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    // Get fee components for the installment if applicable
    let feeComponents = null;
    let installmentInfo = null;
    if (payment.installmentNumber && payment.feeStructure) {
      const feeStructure = await FeeStructureSchema.findById(
        payment.feeStructure,
      );
      if (feeStructure && feeStructure.installments) {
        const installment = feeStructure.installments.find(
          (inst) => inst.installmentNumber === payment.installmentNumber,
        );
        if (installment && installment.feeComponents) {
          feeComponents = installment.feeComponents;
          // Include installment status information for partial payments
          installmentInfo = {
            installmentAmount: installment.amount,
            paidAmount: installment.paidAmount || 0,
            status: installment.status,
            dueDate: installment.dueDate,
          };
        }
      }
    }

    const responseData = payment.toObject();
    if (feeComponents) {
      responseData.feeComponents = feeComponents;
    }
    if (installmentInfo) {
      responseData.installmentInfo = installmentInfo;
    }

    res.status(200).json({
      success: true,
      message: "Payment receipt retrieved successfully",
      data: responseData,
    });
  } catch (error) {
    console.error("Error retrieving receipt:", error);
    res.status(500).json({
      success: false,
      message: "Server error while retrieving receipt",
      error: error.message,
    });
  }
};

export default {
  createOrUpdateFeeStructure,
  getFeeStructure,
  getStudentFeeStructures,
  recordFeePayment,
  getStudentPaymentHistory,
  getAllFeeStructures,
  getAllPayments,
  updatePaymentStatus,
  updateInstallmentStatus,
  processRefund,
  calculateRefundAmount,
  getPaymentReceipt,
  getNextVoucherNumber,
};
