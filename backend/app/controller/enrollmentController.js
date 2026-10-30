// controllers/enrollmentController.js
import EnrollmentSchema from "../modules/enrollmentModule.js";
import FeeStructureSchema from "../modules/feeStructureModule.js";
import AdmissionSchema from "../modules/AdmissionModule.js";
import CourseSchema from "../modules/courseModule.js";
import BatchSchema from "../modules/batchModule.js";
import { calculateInstallmentPlan } from "../utils/installmentCalculator.js";
import { syncStudentRegistrationNo } from "../utils/registrationNumberSync.js";

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const clamp = (value, min, max) =>
  Math.min(max, Math.max(min, Number(value) || min));
const hasDefinedValue = (value) => value !== undefined && value !== null;

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

const splitAcrossInstallments = (amount, count, includeInInstallments = false) => {
  const safeAmount = round2(amount);
  const safeCount = clamp(count, 1, 24);
  if (safeAmount <= 0) {
    return Array.from({ length: safeCount }, () => 0);
  }

  if (!includeInInstallments) {
    return [safeAmount, ...Array.from({ length: safeCount - 1 }, () => 0)];
  }

  const base = Math.floor((safeAmount / safeCount) * 100) / 100;
  let assigned = 0;
  const chunks = [];
  for (let i = 0; i < safeCount; i++) {
    const isLast = i === safeCount - 1;
    const value = isLast ? round2(safeAmount - assigned) : round2(base);
    chunks.push(value);
    assigned = round2(assigned + value);
  }
  return chunks;
};

const rebalanceInstallmentsToTarget = (installments = [], targetTotal = 0) => {
  const normalized = installments.map((item) => ({
    ...item,
    amount: round2(Math.max(0, item.amount || 0)),
  }));

  if (normalized.length === 0) return normalized;

  const target = round2(Math.max(0, targetTotal || 0));
  const current = round2(
    normalized.reduce((sum, item) => sum + (item.amount || 0), 0),
  );
  const diff = round2(target - current);

  if (diff === 0) return normalized;

  if (diff > 0) {
    const lastIndex = normalized.length - 1;
    normalized[lastIndex].amount = round2(normalized[lastIndex].amount + diff);
    return normalized;
  }

  let remainingToReduce = round2(Math.abs(diff));
  for (let i = normalized.length - 1; i >= 0 && remainingToReduce > 0; i--) {
    const available = round2(normalized[i].amount || 0);
    const reduceBy = Math.min(available, remainingToReduce);
    normalized[i].amount = round2(available - reduceBy);
    remainingToReduce = round2(remainingToReduce - reduceBy);
  }

  return normalized;
};

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

const getInstallmentsTotal = (installments = []) =>
  round2(
    installments.reduce((sum, item) => sum + Number(item?.amount || 0), 0),
  );

const generateEqualInstallments = ({
  feeConfig,
  count,
  startDate,
  targetTotal,
}) => {
  const safeCount = clamp(count, 1, 24);
  const installments = [];
  const admissionPlan = [
    round2(feeConfig.admissionFee),
    ...Array.from({ length: safeCount - 1 }, () => 0),
  ];
  const coursePlan = splitAcrossInstallments(
    feeConfig.courseFee,
    safeCount,
    true,
  );
  const certificatePlan = [
    ...Array.from({ length: safeCount - 1 }, () => 0),
    round2(feeConfig.certificateFee),
  ];
  const examPlan = splitAcrossInstallments(
    feeConfig.examFee,
    safeCount,
    feeConfig.includeExamFeeInInstallments,
  );
  const registrationPlan = splitAcrossInstallments(
    feeConfig.registrationFee,
    safeCount,
    feeConfig.includeRegistrationFeeInInstallments,
  );
  const practicalPlan = splitAcrossInstallments(
    feeConfig.practicalFee,
    safeCount,
    feeConfig.includePracticalFeeInInstallments,
  );
  const otherPlan = splitAcrossInstallments(
    feeConfig.otherFee,
    safeCount,
    feeConfig.includeOtherFeeInInstallments,
  );

  for (let i = 0; i < safeCount; i++) {
    const feeComponents = {
      admissionFee: admissionPlan[i],
      courseFee: coursePlan[i],
      certificateFee: certificatePlan[i],
      examFee: examPlan[i],
      registrationFee: registrationPlan[i],
      practicalFee: practicalPlan[i],
      otherFee: otherPlan[i],
    };
    const amount = round2(
      feeComponents.admissionFee +
        feeComponents.courseFee +
        feeComponents.certificateFee +
        feeComponents.examFee +
        feeComponents.registrationFee +
        feeComponents.practicalFee +
        feeComponents.otherFee,
    );

    installments.push({
      installmentNumber: i + 1,
      description:
        safeCount === 1
          ? "Full Payment"
          : i === 0
            ? "Admission Fee + Course Fee"
            : i === safeCount - 1
              ? "Course Fee + Certificate Fee"
              : `Course Fee Installment ${i + 1}`,
      feeComponents,
      amount,
      dueDate: addMonths(startDate, i),
      status: "Pending",
      paidAmount: 0,
    });
  }

  const currentTotal = round2(
    installments.reduce((sum, item) => sum + (item.amount || 0), 0),
  );
  const finalTarget = round2(targetTotal ?? currentTotal);
  return rebalanceInstallmentsToTarget(installments, finalTarget);
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
    description:
      item?.description?.trim() || `Installment ${index + 1}`,
    feeComponents: {
      admissionFee: round2(item?.feeComponents?.admissionFee || 0),
      courseFee: round2(
        item?.feeComponents?.courseFee ??
          item?.amount ??
          0,
      ),
      certificateFee: round2(item?.feeComponents?.certificateFee || 0),
      examFee: round2(item?.feeComponents?.examFee || 0),
      registrationFee: round2(item?.feeComponents?.registrationFee || 0),
      practicalFee: round2(item?.feeComponents?.practicalFee || 0),
      otherFee: round2(item?.feeComponents?.otherFee || 0),
    },
    amount: round2(
      hasDefinedValue(item?.amount)
        ? item.amount
        : getInstallmentComponentsTotal(item?.feeComponents),
    ),
    dueDate: item?.dueDate
      ? new Date(item.dueDate)
      : addMonths(startDate, index),
    status: item?.status || "Pending",
    paidAmount: round2(item?.paidAmount || 0),
  }));

  if (preserveExactAmounts) {
    return normalized;
  }

  const targetTotal = round2(totalAmount);
  return rebalanceInstallmentsToTarget(normalized, targetTotal);
};

const mergeInstallmentsPreservingPaid = (
  existingInstallments = [],
  updatedInstallments = [],
  targetTotal,
) => {
  const paidInstallments = (Array.isArray(existingInstallments) ? existingInstallments : [])
    .filter(
      (installment) =>
        Number(installment?.paidAmount || 0) > 0 ||
        ["Paid", "Partial"].includes(installment?.status),
    )
    .map((installment) => ({
      ...installment,
      installmentNumber: Number(installment.installmentNumber),
    }));

  const paidByNumber = new Map(
    paidInstallments.map((installment) => [installment.installmentNumber, installment]),
  );
  const merged = (Array.isArray(updatedInstallments) ? updatedInstallments : []).map(
    (installment) =>
      paidByNumber.get(Number(installment.installmentNumber)) || installment,
  );

  for (const paidInstallment of paidInstallments) {
    if (
      !merged.some(
        (installment) =>
          Number(installment.installmentNumber) === paidInstallment.installmentNumber,
      )
    ) {
      merged.push(paidInstallment);
    }
  }

  const sortedInstallments = merged.sort(
    (left, right) => Number(left.installmentNumber) - Number(right.installmentNumber),
  );

  if (!hasDefinedValue(targetTotal)) return sortedInstallments;

  const paidNumbers = new Set(paidInstallments.map((item) => item.installmentNumber));
  const paidTotal = getInstallmentsTotal(
    sortedInstallments.filter((item) =>
      paidNumbers.has(Number(item.installmentNumber)),
    ),
  );
  const targetUnpaidTotal = round2(Math.max(0, Number(targetTotal) - paidTotal));
  const unpaidInstallments = sortedInstallments.filter(
    (item) => !paidNumbers.has(Number(item.installmentNumber)),
  );

  if (unpaidInstallments.length === 0 && targetUnpaidTotal > 0) {
    const lastInstallment = sortedInstallments[sortedInstallments.length - 1];
    sortedInstallments.push({
      installmentNumber: Number(lastInstallment?.installmentNumber || 0) + 1,
      description: "Additional Installment",
      feeComponents: {
        admissionFee: 0,
        courseFee: targetUnpaidTotal,
        certificateFee: 0,
        examFee: 0,
        registrationFee: 0,
        practicalFee: 0,
        otherFee: 0,
      },
      amount: targetUnpaidTotal,
      dueDate: addMonths(lastInstallment?.dueDate || new Date(), 1),
      status: "Pending",
      paidAmount: 0,
    });
    return sortedInstallments;
  }

  const currentUnpaidTotal = getInstallmentsTotal(unpaidInstallments);
  let assignedAmount = 0;
  const lastUnpaid = unpaidInstallments[unpaidInstallments.length - 1];

  sortedInstallments.forEach((installment) => {
    if (paidNumbers.has(Number(installment.installmentNumber))) return;

    const isLastUnpaid = installment === lastUnpaid;
    const amount =
      currentUnpaidTotal > 0 && !isLastUnpaid
        ? round2(
            (Number(installment.amount || 0) / currentUnpaidTotal) *
              targetUnpaidTotal,
          )
        : isLastUnpaid
          ? round2(targetUnpaidTotal - assignedAmount)
          : 0;
    assignedAmount = round2(assignedAmount + amount);

    const components = Object.entries(installment.feeComponents || {}).filter(
      ([key]) =>
        [
          "admissionFee",
          "courseFee",
          "certificateFee",
          "examFee",
          "registrationFee",
          "practicalFee",
          "otherFee",
        ].includes(key),
    );
    const componentTotal = round2(
      components.reduce((sum, [, value]) => sum + Number(value || 0), 0),
    );
    let assignedComponents = 0;
    const feeComponents = Object.fromEntries(
      components.map(([key, value], index) => {
        const isLastComponent = index === components.length - 1;
        const componentAmount =
          componentTotal > 0 && !isLastComponent
            ? round2((Number(value || 0) / componentTotal) * amount)
            : isLastComponent
              ? round2(amount - assignedComponents)
              : 0;
        assignedComponents = round2(assignedComponents + componentAmount);
        return [key, componentAmount];
      }),
    );

    if (components.length === 0) {
      feeComponents.courseFee = amount;
    }

    installment.amount = amount;
    installment.feeComponents = feeComponents;
  });

  return sortedInstallments;
};

// Create enrollment for a student
export const createEnrollment = async (req, res) => {
  try {
    const {
      studentId,
      courseId,
      batchId,
      enrollmentDate,
      notes,
      admissionFee,
      courseFee,
      certificateFee,
      examFee,
      registrationFee,
      practicalFee,
      otherFee,
      includeExamFeeInInstallments,
      includeRegistrationFeeInInstallments,
      includePracticalFeeInInstallments,
      includeOtherFeeInInstallments,
      additionalFees,
      discount,
      discountType,
      discountOnAdmission,
      discountOnCourseFee,
      totalDiscount,
      discountPercentage,
      paymentPlanType,
      numberOfInstallments,
      installments,
    } = req.body;

    if (!studentId || !courseId) {
      return res.status(400).json({
        success: false,
        message: "Student ID and Course ID are required",
      });
    }

    // Check if student exists
    const student = await AdmissionSchema.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // Check if course exists
    const course = await CourseSchema.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    const existingEnrollment = await EnrollmentSchema.findOne({
      student: studentId,
      course: courseId,
    }).lean();

    if (existingEnrollment) {
      return res.status(400).json({
        success: false,
        message: "This course is already assigned to the selected student",
      });
    }

    // Check if batch exists and belongs to the course
    if (batchId) {
      const batch = await BatchSchema.findById(batchId);
      if (!batch) {
        return res.status(404).json({
          success: false,
          message: "Batch not found",
        });
      }
      if (batch.course.toString() !== courseId) {
        return res.status(400).json({
          success: false,
          message: "Batch does not belong to the selected course",
        });
      }
      // Check batch capacity
      if (batch.currentStudents >= batch.maxStudents) {
        return res.status(400).json({
          success: false,
          message: "Batch is full. Cannot enroll more students.",
        });
      }
    }

    // Create enrollment
    const newEnrollment = new EnrollmentSchema({
      student: studentId,
      course: courseId,
      batch: batchId || null,
      enrollmentDate: enrollmentDate || new Date(),
      notes,
    });

    const savedEnrollment = await newEnrollment.save();

    // Update batch student count if batch is assigned
    if (batchId) {
      await BatchSchema.findByIdAndUpdate(batchId, {
        $inc: { currentStudents: 1 },
      });
    }

    await AdmissionSchema.findByIdAndUpdate(studentId, {
      $addToSet: { enrolledCourses: courseId },
    });

    const systemGrantedNumber = await syncStudentRegistrationNo(studentId);

    // Calculate flexible fee + installment plan
    const selectedAdmissionFee = round2(admissionFee ?? course.admissionFee ?? 0);
    const selectedCourseFee = round2(courseFee ?? course.courseFee ?? 0);
    const selectedCertificateFee = round2(
      certificateFee ?? course.certificateFee ?? 0,
    );
    const selectedExamFee = round2(examFee ?? course.examFee ?? 0);
    const selectedRegistrationFee = round2(
      registrationFee ?? course.registrationFee ?? 0,
    );
    const selectedPracticalFee = round2(practicalFee ?? course.practicalFee ?? 0);
    const selectedOtherFee = round2(otherFee ?? course.otherFee ?? 0);
    const resolvedIncludeExamFeeInInstallments =
      includeExamFeeInInstallments ??
      course.includeExamFeeInInstallments ??
      false;
    const resolvedIncludeRegistrationFeeInInstallments =
      includeRegistrationFeeInInstallments ??
      course.includeRegistrationFeeInInstallments ??
      false;
    const resolvedIncludePracticalFeeInInstallments =
      includePracticalFeeInInstallments ??
      course.includePracticalFeeInInstallments ??
      false;
    const resolvedIncludeOtherFeeInInstallments =
      includeOtherFeeInInstallments ??
      course.includeOtherFeeInInstallments ??
      false;
    const resolvedAdditionalFees = normalizeAdditionalFees(additionalFees);
    const additionalFeesTotal = round2(
      resolvedAdditionalFees.reduce((sum, item) => sum + item.amount, 0),
    );
    const effectiveDiscountPercentage = clamp(discountPercentage, 0, 100);
    const requestedCourseDiscount = round2(
      discountOnCourseFee ?? totalDiscount ?? discount ?? 0,
    );
    const percentageCourseDiscount = round2(
      (selectedCourseFee * effectiveDiscountPercentage) / 100,
    );
    const amountDiscount = round2(
      Math.min(
        selectedCourseFee,
        discountOnCourseFee != null
          ? requestedCourseDiscount
          : effectiveDiscountPercentage > 0
            ? percentageCourseDiscount
            : requestedCourseDiscount,
      ),
    );
    const discountedCourseFee = round2(
      Math.max(0, selectedCourseFee - amountDiscount),
    );
    const calculatedFinalFee = round2(
      selectedAdmissionFee +
        discountedCourseFee +
        selectedCertificateFee +
        selectedExamFee +
        selectedRegistrationFee +
        selectedPracticalFee +
        selectedOtherFee +
        additionalFeesTotal,
    );
    const enrollmentStartDate = enrollmentDate || new Date();

    let resolvedInstallments = normalizeInstallments({
      installments,
      totalAmount: calculatedFinalFee,
      startDate: enrollmentStartDate,
      preserveExactAmounts: true,
    });

    const resolvedFinalFee = resolvedInstallments.length
      ? getInstallmentsTotal(resolvedInstallments)
      : calculatedFinalFee;

    if (resolvedInstallments.length === 0) {
      const fallbackCount = clamp(
        numberOfInstallments ||
          (paymentPlanType === "full_payment"
            ? 1
            : paymentPlanType === "three_installments"
              ? 3
              : paymentPlanType === "monthly"
                ? course.duration || 1
                : 1),
        1,
        24,
      );

      if (paymentPlanType === "custom") {
        resolvedInstallments = generateEqualInstallments({
          feeConfig: {
            admissionFee: selectedAdmissionFee,
            courseFee: discountedCourseFee,
            certificateFee: selectedCertificateFee,
            examFee: selectedExamFee,
            registrationFee: selectedRegistrationFee,
            practicalFee: selectedPracticalFee,
            otherFee: selectedOtherFee,
            includeExamFeeInInstallments: resolvedIncludeExamFeeInInstallments,
            includeRegistrationFeeInInstallments:
              resolvedIncludeRegistrationFeeInInstallments,
            includePracticalFeeInInstallments:
              resolvedIncludePracticalFeeInInstallments,
            includeOtherFeeInInstallments:
              resolvedIncludeOtherFeeInInstallments,
          },
          count: fallbackCount,
          startDate: enrollmentStartDate,
          targetTotal: resolvedFinalFee,
        });
      } else {
        const plan = calculateInstallmentPlan({
          admissionFee: selectedAdmissionFee,
          courseFee: selectedCourseFee,
          certificateFee: selectedCertificateFee,
          courseDuration: fallbackCount,
          discountOnAdmission: 0,
          discountOnCourseFee: amountDiscount,
          discountType: "courseFee",
          startDate: enrollmentStartDate,
        });
        resolvedInstallments = normalizeInstallments({
          installments: plan.installments,
          totalAmount: resolvedFinalFee,
          startDate: enrollmentStartDate,
        });
      }
    }

    const finalAmount = resolvedInstallments.length
      ? getInstallmentsTotal(resolvedInstallments)
      : resolvedFinalFee;

    const feeStructure = new FeeStructureSchema({
      student: studentId,
      course: courseId,
      enrollment: savedEnrollment._id,
      admissionFee: selectedAdmissionFee,
      courseFee: selectedCourseFee,
      certificateFee: selectedCertificateFee,
      examFee: selectedExamFee,
      registrationFee: selectedRegistrationFee,
      practicalFee: selectedPracticalFee,
      otherFee: selectedOtherFee,
      additionalFees: resolvedAdditionalFees,
      totalFee: finalAmount,
      discount: amountDiscount,
      discountPercentage: effectiveDiscountPercentage,
      paymentPlanType: paymentPlanType || "custom",
      discountType: amountDiscount > 0 ? "courseFee" : discountType || "none",
      discountOnAdmission: Math.round(discountOnAdmission || 0),
      discountOnCourseFee: Math.round(amountDiscount),
      remainingAmount: finalAmount,
      installmentEnabled: resolvedInstallments.length > 1,
      numberOfInstallments: resolvedInstallments.length,
      installments: resolvedInstallments,
      feeStatus: "Unpaid",
      systemGrantedNumber: systemGrantedNumber,
    });

    await feeStructure.save();

    // Refetch the student to get the updated registrationNo if it was just assigned
    const updatedStudent = await AdmissionSchema.findById(studentId).lean();

    const populatedEnrollment = await EnrollmentSchema.findById(
      savedEnrollment._id,
    )
      .populate("student", "registrationNo studentName")
      .populate(
        "course",
        "courseName courseId courseCategory admissionFee courseFee certificateFee examFee registrationFee practicalFee otherFee totalFee",
      )
      .populate(
        "batch",
        "batchName batchCode shift days hoursPerDay startDate",
      );

    // Override student data with the latest from database
    const enrollmentObj = populatedEnrollment.toObject();
    if (updatedStudent) {
      enrollmentObj.student = {
        _id: updatedStudent._id,
        registrationNo: updatedStudent.registrationNo,
        studentName: updatedStudent.studentName,
      };
    }

    res.status(201).json({
      success: true,
      message: "Enrollment created successfully",
      data: {
        ...enrollmentObj,
        feeStructure,
      },
    });
  } catch (error) {
    console.error("Enrollment creation error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while creating enrollment",
      error: error.message,
    });
  }
};

// Get all enrollments for a student
export const getStudentEnrollments = async (req, res) => {
  try {
    const { studentId } = req.params;

    const enrollments = await EnrollmentSchema.find({ student: studentId })
      .populate({
        path: "course",
        select:
          "courseName courseId courseCategory duration admissionFee courseFee certificateFee examFee registrationFee practicalFee otherFee totalFee",
        populate: {
          path: "teacherId",
          select: "fullName gender email",
        },
      })
      .populate("student", "registrationNo studentName")
      .populate(
        "batch",
        "batchName batchCode shift days hoursPerDay startDate status",
      )
      .sort({ enrollmentDate: -1 });

    // Fetch fee structure for each enrollment
    const enrollmentsWithFees = await Promise.all(
      enrollments.map(async (enrollment) => {
        const feeStructure = await FeeStructureSchema.findOne({
          enrollment: enrollment._id,
        });

        return {
          ...enrollment.toObject(),
          feeStructure: feeStructure || null,
        };
      }),
    );

    res.status(200).json({
      success: true,
      message: "Enrollments retrieved successfully",
      data: enrollmentsWithFees,
    });
  } catch (error) {
    console.error("Error retrieving enrollments:", error);
    res.status(500).json({
      success: false,
      message: "Server error while retrieving enrollments",
      error: error.message,
    });
  }
};

// Get all students enrolled in a course
export const getCourseEnrollments = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { status } = req.query;

    const filter = { course: courseId };
    if (status) {
      filter.status = status;
    }

    const enrollments = await EnrollmentSchema.find(filter)
      .populate(
        "student",
        "registrationNo studentName gender mobileNumber emailAddress",
      )
      .populate("course", "courseName courseId courseCategory")
      .populate(
        "batch",
        "batchName batchCode shift days hoursPerDay startDate status",
      )
      .sort({ enrollmentDate: -1 });

    res.status(200).json({
      success: true,
      message: "Course enrollments retrieved successfully",
      data: enrollments,
    });
  } catch (error) {
    console.error("Error retrieving course enrollments:", error);
    res.status(500).json({
      success: false,
      message: "Server error while retrieving course enrollments",
      error: error.message,
    });
  }
};

// Update enrollment status and all enrollment information
export const updateEnrollmentStatus = async (req, res) => {
  try {
    const { enrollmentId } = req.params;
    const {
      courseId,
      status,
      completionDate,
      notes,
      enrollmentDate,
      batchId,
      admissionFee,
      courseFee,
      certificateFee,
      examFee,
      registrationFee,
      practicalFee,
      otherFee,
      additionalFees,
      discount,
      discountPercentage,
      discountOnCourseFee,
      totalFee,
      finalFee,
      paymentPlanType,
      numberOfInstallments,
      installments,
    } = req.body;

    // ── Update the Enrollment document (only fields that exist in the schema) ──
    const existingEnrollment = await EnrollmentSchema.findById(enrollmentId).lean();
    if (!existingEnrollment) {
      return res.status(404).json({
        success: false,
        message: "Enrollment not found",
      });
    }

    if (courseId && String(existingEnrollment.course) !== String(courseId)) {
      const duplicateEnrollment = await EnrollmentSchema.findOne({
        student: existingEnrollment.student,
        course: courseId,
        _id: { $ne: enrollmentId },
      }).lean();

      if (duplicateEnrollment) {
        return res.status(400).json({
          success: false,
          message: "This course is already assigned to the selected student",
        });
      }
    }

    const enrollmentUpdateData = {};
    if (courseId) enrollmentUpdateData.course = courseId;
    if (status) enrollmentUpdateData.status = status;
    if (completionDate) enrollmentUpdateData.completionDate = completionDate;
    if (notes !== undefined) enrollmentUpdateData.notes = notes;
    if (enrollmentDate) enrollmentUpdateData.enrollmentDate = enrollmentDate;
    // The Enrollment schema field is "batch", not "batchId"
    if (batchId !== undefined) enrollmentUpdateData.batch = batchId || null;

    const updatedEnrollment = await EnrollmentSchema.findByIdAndUpdate(
      enrollmentId,
      enrollmentUpdateData,
      { new: true },
    )
      .populate("student", "registrationNo studentName")
      .populate("course", "courseName courseId")
      .populate("batch", "batchName shift days");

    if (courseId && String(existingEnrollment.course) !== String(courseId)) {
      await AdmissionSchema.findByIdAndUpdate(existingEnrollment.student, {
        $pull: { enrolledCourses: existingEnrollment.course },
        $addToSet: { enrolledCourses: courseId },
      });
    }

    const syncedRegistrationNo = await syncStudentRegistrationNo(
      existingEnrollment.student,
    );

    // ── Update the FeeStructure document with the new fee/installment data ──
    const feeStructureUpdate = {};
    if (courseId) feeStructureUpdate.course = courseId;
    if (admissionFee !== undefined) feeStructureUpdate.admissionFee = round2(admissionFee);
    if (courseFee !== undefined) feeStructureUpdate.courseFee = round2(courseFee);
    if (certificateFee !== undefined) feeStructureUpdate.certificateFee = round2(certificateFee);
    if (examFee !== undefined) feeStructureUpdate.examFee = round2(examFee);
    if (registrationFee !== undefined) feeStructureUpdate.registrationFee = round2(registrationFee);
    if (practicalFee !== undefined) feeStructureUpdate.practicalFee = round2(practicalFee);
    if (otherFee !== undefined) feeStructureUpdate.otherFee = round2(otherFee);
    if (additionalFees !== undefined) feeStructureUpdate.additionalFees = normalizeAdditionalFees(additionalFees);
    if (discount !== undefined) feeStructureUpdate.discount = round2(discount);
    if (discountPercentage !== undefined) feeStructureUpdate.discountPercentage = clamp(discountPercentage, 0, 100);
    if (discountOnCourseFee !== undefined) feeStructureUpdate.discountOnCourseFee = round2(discountOnCourseFee);

    const normalizedInstallments = installments?.length
      ? normalizeInstallments({
          installments,
          totalAmount: finalFee ?? totalFee,
          startDate: enrollmentDate || new Date(),
          preserveExactAmounts: true,
        })
      : [];
    const existingFeeStructure = await FeeStructureSchema.findOne({ enrollment: enrollmentId }).lean();
    const mergedInstallments = normalizedInstallments.length
      ? mergeInstallmentsPreservingPaid(
          existingFeeStructure?.installments,
          normalizedInstallments,
          finalFee ?? totalFee,
        )
      : [];
    const requestedTotal = hasDefinedValue(finalFee ?? totalFee)
      ? round2(finalFee ?? totalFee)
      : undefined;
    const resolvedTotal = mergedInstallments.length
      ? getInstallmentsTotal(mergedInstallments)
      : requestedTotal ?? 0;
    if (finalFee !== undefined || totalFee !== undefined) {
      feeStructureUpdate.totalFee = requestedTotal ?? resolvedTotal;
    }
    if (paymentPlanType) feeStructureUpdate.paymentPlanType = paymentPlanType;
    if (numberOfInstallments !== undefined) {
      feeStructureUpdate.numberOfInstallments = numberOfInstallments;
      feeStructureUpdate.installmentEnabled = numberOfInstallments > 1;
    }
    if (mergedInstallments.length > 0) {
      feeStructureUpdate.installments = mergedInstallments;
      feeStructureUpdate.numberOfInstallments = mergedInstallments.length;
      feeStructureUpdate.installmentEnabled = mergedInstallments.length > 1;
      feeStructureUpdate.totalFee = resolvedTotal;
    }

    if (Object.keys(feeStructureUpdate).length > 0) {
      feeStructureUpdate.systemGrantedNumber = syncedRegistrationNo;
      // Recalculate remainingAmount = totalFee - paidAmount
      if (feeStructureUpdate.totalFee !== undefined) {
        const paidAmount = round2(existingFeeStructure?.paidAmount || 0);
        feeStructureUpdate.remainingAmount = round2(feeStructureUpdate.totalFee - paidAmount);
      }
      await FeeStructureSchema.findOneAndUpdate(
        { enrollment: enrollmentId },
        { $set: feeStructureUpdate },
        { new: true },
      );
    }

    // Fetch the latest fee structure to include in response so client sees
    // the definitive persisted installments/fees immediately.
    const latestFeeStructure = await FeeStructureSchema.findOne({ enrollment: enrollmentId })
      .lean();

    res.status(200).json({
      success: true,
      message: "Enrollment updated successfully",
      data: {
        enrollment: updatedEnrollment,
        feeStructure: latestFeeStructure || null,
      },
    });
  } catch (error) {
    console.error("Error updating enrollment:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating enrollment",
      error: error.message,
    });
  }
};

// Get all enrollments with filters
export const getAllEnrollments = async (req, res) => {
  try {
    const { status, courseId, page = 1, limit = 10000 } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (courseId) filter.course = courseId;

    const skip = (page - 1) * limit;

    const enrollments = await EnrollmentSchema.find(filter)
      .populate("student", "registrationNo studentName gender mobileNumber")
      .populate({
        path: "course",
        select:
          "courseName courseId courseCategory shift duration admissionFee courseFee certificateFee examFee registrationFee practicalFee otherFee totalFee",
        populate: { path: "teacherId", select: "fullName" },
      })
      .populate(
        "batch",
        "batchName batchCode shift days hoursPerDay startDate status",
      )
      .sort({ enrollmentDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Attach feeStructure to each enrollment in one server-side batch
    // This avoids N+1 round-trips from the client
    const enrollmentIds = enrollments.map((e) => e._id);
    const feeStructures = await FeeStructureSchema.find({
      enrollment: { $in: enrollmentIds },
    }).lean();

    const feeMap = {};
    feeStructures.forEach((fs) => {
      feeMap[fs.enrollment.toString()] = fs;
    });

    const enriched = enrollments.map((e) => ({
      ...e.toObject(),
      feeStructure: feeMap[e._id.toString()] || null,
    }));

    const total = await EnrollmentSchema.countDocuments(filter);

    res.status(200).json({
      success: true,
      message: "Enrollments retrieved successfully",
      data: enriched,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error retrieving enrollments:", error);
    res.status(500).json({
      success: false,
      message: "Server error while retrieving enrollments",
      error: error.message,
    });
  }
};

// Delete enrollment and associated fee structure
export const deleteEnrollment = async (req, res) => {
  try {
    const { enrollmentId } = req.params;

    // Find the enrollment
    const enrollment = await EnrollmentSchema.findById(enrollmentId);

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: "Enrollment not found",
      });
    }

    // Delete associated fee structure
    await FeeStructureSchema.findOneAndDelete({
      enrollment: enrollmentId,
    });

    // Decrement batch student count if batch is assigned
    if (enrollment.batch) {
      await BatchSchema.findByIdAndUpdate(enrollment.batch, {
        $inc: { currentStudents: -1 },
      });
    }

    // Remove course from student's enrolledCourses array
    await AdmissionSchema.findByIdAndUpdate(enrollment.student, {
      $pull: { enrolledCourses: enrollment.course },
    });

    // Delete the enrollment
    await EnrollmentSchema.findByIdAndDelete(enrollmentId);

    await syncStudentRegistrationNo(enrollment.student);

    res.status(200).json({
      success: true,
      message: "Enrollment and associated fee structure deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting enrollment:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting enrollment",
      error: error.message,
    });
  }
};

export default {
  createEnrollment,
  getStudentEnrollments,
  getCourseEnrollments,
  updateEnrollmentStatus,
  getAllEnrollments,
  deleteEnrollment,
};
