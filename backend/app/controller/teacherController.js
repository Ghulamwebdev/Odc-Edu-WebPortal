import courseModule from "../modules/courseModule.js";
import AdmissionSchema from "../modules/AdmissionModule.js";
import TeacherSchema from "../modules/teacherModule.js";
import EnrollmentSchema from "../modules/enrollmentModule.js";
import AttendanceSchema from "../modules/attendanceModule.js";
import BatchSchema from "../modules/batchModule.js";
import HolidaySchema from "../modules/holidayModule.js";
import FeeStructureSchema from "../modules/feeStructureModule.js";
import FeePaymentSchema from "../modules/feePaymentModule.js";
import * as XLSX from "xlsx";
import TeacherPayroll from "../modules/teacherPayrollModule.js";
import StudentTeacherAssignment from "../modules/studentTeacherAssignmentModule.js";

const getRowValue = (row, keys = []) => {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== "") {
      return row[key];
    }
  }
  return null;
};

const normalizeString = (value) => String(value || "").trim();

const isRowBlank = (row = {}) =>
  !Object.values(row).some((value) => normalizeString(value));

const parseSkills = (value) =>
  normalizeString(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const parseCourseRefs = (value) =>
  normalizeString(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const getPreviousPayrollPeriod = (year, month) => {
  const baseDate = new Date(Number(year), Number(month) - 1, 1);
  const previous = new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 1);
  return {
    year: previous.getFullYear(),
    month: previous.getMonth() + 1,
  };
};

const deriveCarryForwardEligibleAmount = (payrollRecord) => {
  if (!payrollRecord) {
    return 0;
  }

  if (payrollRecord.carryForwardEligibleAmount !== undefined) {
    return Math.max(0, Number(payrollRecord.carryForwardEligibleAmount || 0));
  }

  const baseDueAmount = Math.max(
    0,
    Number(
      payrollRecord.baseDueAmount !== undefined
        ? payrollRecord.baseDueAmount
        : payrollRecord.dueAmount || 0,
    ),
  );
  const carryForwardInAmount = Math.max(
    0,
    Number(payrollRecord.carryForwardInAmount || 0),
  );
  const paidAmount = Math.max(0, Number(payrollRecord.paidAmount || 0));
  const appliedToCarry = Math.min(paidAmount, carryForwardInAmount);
  const appliedToCurrent = Math.min(
    baseDueAmount,
    Math.max(0, paidAmount - appliedToCarry),
  );

  return Math.max(0, baseDueAmount - appliedToCurrent);
};

const calculatePayrollTotals = ({
  baseDueAmount,
  carryForwardInAmount,
  paidAmount,
}) => {
  const normalizedBaseDueAmount = Math.max(0, Number(baseDueAmount || 0));
  const normalizedCarryForwardInAmount = Math.max(
    0,
    Number(carryForwardInAmount || 0),
  );
  const normalizedPaidAmount = Math.max(0, Number(paidAmount || 0));
  const totalDueAmount = normalizedBaseDueAmount + normalizedCarryForwardInAmount;
  const appliedToCarry = Math.min(
    normalizedPaidAmount,
    normalizedCarryForwardInAmount,
  );
  const appliedToCurrent = Math.min(
    normalizedBaseDueAmount,
    Math.max(0, normalizedPaidAmount - appliedToCarry),
  );

  return {
    baseDueAmount: normalizedBaseDueAmount,
    carryForwardInAmount: normalizedCarryForwardInAmount,
    totalDueAmount,
    carryForwardEligibleAmount: Math.max(
      0,
      normalizedBaseDueAmount - appliedToCurrent,
    ),
    remainingAmount: Math.max(0, totalDueAmount - normalizedPaidAmount),
    overpaidAmount: Math.max(0, normalizedPaidAmount - totalDueAmount),
    status:
      totalDueAmount <= 0
        ? "paid"
        : normalizedPaidAmount >= totalDueAmount
        ? "paid"
        : normalizedPaidAmount > 0
        ? "partial"
        : "unpaid",
  };
};

const getTeacherCarryForwardAmount = async (teacherId, year, month) => {
  const previousPeriod = getPreviousPayrollPeriod(year, month);
  const previousPayrollRecord = await TeacherPayroll.findOne({
    teacher: teacherId,
    year: previousPeriod.year,
    month: previousPeriod.month,
  }).lean();

  return {
    carryForwardInAmount: deriveCarryForwardEligibleAmount(previousPayrollRecord),
  };
};

const parseSalaryAmount = (value) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const sanitized = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(sanitized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const batchDaysToDowSet = (days) => {
  const map = {
    "Monday to Saturday": [1, 2, 3, 4, 5, 6],
    "Monday to Thursday": [1, 2, 3, 4],
    "Saturday & Sunday": [6, 0],
  };
  return new Set(map[days] || []);
};

const getMonthWindow = (year, month) => {
  const from = new Date(year, month - 1, 1);
  from.setHours(0, 0, 0, 0);
  const to = new Date(year, month, 0);
  to.setHours(23, 59, 59, 999);
  return { from, to };
};

const getMonthDisplayLabel = (year, month) =>
  new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));

const getPerStudentMonthConfig = (teacher, payrollRecord = null) => {
  if (payrollRecord) {
    const salaryType = payrollRecord.salaryType || "per_student";
    const salaryPerStudent =
      payrollRecord.salaryPerStudent !== undefined &&
      payrollRecord.salaryPerStudent !== null
        ? Number(payrollRecord.salaryPerStudent)
        : 0;
    const attendanceThreshold =
      payrollRecord.attendanceThreshold !== undefined &&
      payrollRecord.attendanceThreshold !== null
        ? Number(payrollRecord.attendanceThreshold)
        : 50;
    const monthlySalary =
      payrollRecord.monthlySalary !== undefined && payrollRecord.monthlySalary !== null
        ? payrollRecord.monthlySalary
        : null;

    return {
      salaryType,
      monthlySalary,
      salaryPerStudent,
      attendanceThreshold,
      isConfigured:
        salaryType === "per_student"
          ? salaryPerStudent !== null && salaryPerStudent !== undefined && Number(salaryPerStudent) > 0
          : Boolean(monthlySalary),
    };
  }

  if ((teacher.salaryType || "fixed") === "per_student") {
    return {
      salaryType: "per_student",
      monthlySalary: null,
      salaryPerStudent: 0,
      attendanceThreshold: Number(teacher.attendanceThreshold ?? 50),
      isConfigured: false,
    };
  }

  return {
    salaryType: teacher.salaryType || "fixed",
    monthlySalary: teacher.monthlySalary ?? null,
    salaryPerStudent: teacher.salaryPerStudent ?? null,
    attendanceThreshold: Number(teacher.attendanceThreshold ?? 50),
    isConfigured: true,
  };
};

const getDateKey = (dateValue) => {
  const date = new Date(dateValue);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const getBatchHolidayDateSet = async (batchId, from, to) => {
  const holidays = await HolidaySchema.find({
    isActive: true,
    $and: [
      {
        $or: [
          { date: { $gte: from, $lte: to } },
          { date: { $lte: to }, endDate: { $ne: null, $gte: from } },
        ],
      },
      {
        $or: [{ affectedBatches: { $size: 0 } }, { affectedBatches: batchId }],
      },
    ],
  })
    .select("date endDate")
    .lean();

  const holidayDateSet = new Set();
  holidays.forEach((holiday) => {
    const start = new Date(holiday.date);
    const end = holiday.endDate ? new Date(holiday.endDate) : new Date(holiday.date);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    for (let current = new Date(start); current <= end; current.setDate(current.getDate() + 1)) {
      if (current >= from && current <= to) {
        holidayDateSet.add(getDateKey(current));
      }
    }
  });

  return holidayDateSet;
};

const getBatchWorkingDaysCount = async (batch, from, to) => {
  if (!batch?.days) return 0;
  const workingDow = batchDaysToDowSet(batch.days);
  const holidayDateSet = await getBatchHolidayDateSet(batch._id, from, to);
  let total = 0;

  for (let current = new Date(from); current <= to; current.setDate(current.getDate() + 1)) {
    const dateKey = getDateKey(current);
    if (workingDow.has(current.getDay()) && !holidayDateSet.has(dateKey)) {
      total += 1;
    }
  }

  return total;
};

const createTeacher = async (req, res) => {
  try {
    console.log("=== CREATE TEACHER REQUEST ===");
    // console.log("Request Body:", req.body);

    let {
      teacherId,
      fullName,
      fatherName,
      gender,
      appointmentDate,
      contactNo,
      contractPeriod,
      cnicNo,
      address,
      courseId,
      designation,
      highestQualification,
      degreeTitle,
      majorSubject,
      teachingExperience,
      computerSkills,
      monthlySalary,
      salaryType,
      salaryPerStudent,
      attendanceThreshold,
    } = req.body;

    // Parse courseId if it's a JSON string (from FormData)
    if (courseId && typeof courseId === "string") {
      try {
        courseId = JSON.parse(courseId);
      } catch (e) {
        courseId = [courseId];
      }
    }

    // ✅ Parse computerSkills
    computerSkills = computerSkills || [];
    if (typeof computerSkills === "string") {
      // Try JSON parse first, fall back to comma split
      try {
        computerSkills = JSON.parse(computerSkills);
      } catch (e) {
        computerSkills = computerSkills.split(",").map(s => s.trim()).filter(Boolean);
      }
    }
    // Ensure it's an array
    if (!Array.isArray(computerSkills)) {
      computerSkills = [];
    }

    console.log("Parsed computerSkills:", computerSkills);

    // Handle profile picture if uploaded
    let profilePicture = null;
    if (req.file) {
      profilePicture = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    }

    // Validate required fields
    if (
      !teacherId ||
      !fullName ||
      !fatherName ||
      !gender ||
      !appointmentDate ||
      !contactNo ||
      !contractPeriod ||
      !cnicNo ||
      !address
    ) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided",
      });
    }

    const teacherData = {
      teacherId,
      fullName,
      fatherName,
      gender,
      appointmentDate,
      contactNo,
      contractPeriod,
      cnicNo,
      address,
      profilePicture,
      courseId,
      designation: designation || null,
      highestQualification: highestQualification || null,
      degreeTitle: degreeTitle || null,
      majorSubject: majorSubject || null,
      teachingExperience: teachingExperience || null,
      computerSkills: computerSkills,
      monthlySalary: monthlySalary || null,
      salaryType: salaryType === "per_student" ? "per_student" : "fixed",
      salaryPerStudent:
        salaryPerStudent !== undefined && salaryPerStudent !== null && salaryPerStudent !== ""
          ? Number(salaryPerStudent)
          : null,
      attendanceThreshold:
        attendanceThreshold !== undefined && attendanceThreshold !== null && attendanceThreshold !== ""
          ? Number(attendanceThreshold)
          : 50,
    };

    console.log("Teacher Data to save:", teacherData);

    // Create teacher
    const teacher = await TeacherSchema.create(teacherData);
    
    // Assign teacher to courses
    if (courseId && courseId.length > 0) {
      await courseModule.updateMany(
        { _id: { $in: courseId } },
        { $addToSet: { teacherId: teacher._id } }
      );
    }

    res.status(201).json({
      success: true,
      message: "Teacher created and courses assigned successfully",
      data: teacher,
    });
  } catch (error) {
    console.error("Create Teacher Error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get all teachers
export const getAllTeachers = async (req, res) => {
  try {
    const teachers = await TeacherSchema.find()
      .populate("courseId", "courseName courseId")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: "Teachers retrieved successfully",
      data: teachers,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get teacher by ID
export const getTeacherById = async (req, res) => {
  try {
    const { id } = req.params;
    const teacher = await TeacherSchema.findById(id).populate(
      "courseId",
      "courseName courseId"
    );

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: "Teacher not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Teacher retrieved successfully",
      data: teacher,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const calculateTeacherCompensationData = async (
  teacher,
  year,
  month,
  options = {},
) => {
  const studentAdjustments = Array.isArray(options.studentAdjustments)
    ? options.studentAdjustments
    : [];
  const salaryConfigOverride = options.salaryConfigOverride || {};
  const { from, to } = getMonthWindow(year, month);

  const assignedCourseIds = (teacher.courseId || [])
    .map((course) => (course?._id ? course._id : course))
    .filter(Boolean);
  const teacherId = String(teacher._id);
  const teacherCourseMap = new Map(
    (teacher.courseId || [])
      .filter((course) => course?._id)
      .map((course) => [String(course._id), course]),
  );
  const activeAssignments = await StudentTeacherAssignment.find({ isActive: true })
    .populate("student", "studentName registrationNo mobileNumber isActive")
    .populate("enrollment")
    .populate("batch", "batchName batchCode days")
    .populate("assignedCourse", "courseName courseId")
    .lean();
  const assignmentByEnrollment = new Map(
    activeAssignments.map((assignment) => [
      String(assignment.enrollment?._id || assignment.enrollment),
      assignment,
    ]),
  );

  const enrollments = await EnrollmentSchema.find({
    course: { $in: assignedCourseIds },
    status: "Active",
  })
    .populate("student", "studentName registrationNo mobileNumber isActive")
    .populate("batch", "batchName batchCode days")
    .lean();

  const defaultActiveEnrollments = enrollments
    .filter((enrollment) => enrollment.student && enrollment.student.isActive !== false)
    .filter((enrollment) => {
      const assignment = assignmentByEnrollment.get(String(enrollment._id));
      return !assignment || String(assignment.teacher?._id || assignment.teacher) === teacherId;
    });
  const transferredEnrollments = activeAssignments
    .filter((assignment) => String(assignment.teacher?._id || assignment.teacher) === teacherId)
    .filter((assignment) => assignment.student && assignment.student.isActive !== false)
    .map((assignment) => ({
      ...(assignment.enrollment || {}),
      _id: assignment.enrollment?._id || assignment.enrollment,
      student: assignment.student,
      course: assignment.assignedCourse?._id || assignment.assignedCourse,
      batch: assignment.batch || assignment.enrollment?.batch,
      teacherAssignment: assignment,
    }))
    .filter((enrollment) => enrollment._id && enrollment.student && enrollment.course);

  const activeEnrollmentMap = new Map();
  [...defaultActiveEnrollments, ...transferredEnrollments].forEach((enrollment) => {
    const key = String(enrollment._id);
    if (key) activeEnrollmentMap.set(key, enrollment);
  });
  const activeEnrollments = Array.from(activeEnrollmentMap.values());

  const uniqueStudentIds = [
    ...new Set(activeEnrollments.map((enrollment) => String(enrollment.student._id))),
  ];
  const batchIds = [
    ...new Set(
      activeEnrollments
        .map((enrollment) => enrollment.batch?._id?.toString())
        .filter(Boolean),
    ),
  ];

  const attendanceRecords = batchIds.length
    ? await AttendanceSchema.find({
        batch: { $in: batchIds },
        personType: "student",
        person: { $in: uniqueStudentIds },
        date: { $gte: from, $lte: to },
      })
        .select("batch person status date")
        .lean()
    : [];

  const batchMap = new Map();
  for (const enrollment of activeEnrollments) {
    if (enrollment.batch?._id) {
      batchMap.set(String(enrollment.batch._id), enrollment.batch);
    }
  }

  const batchWorkingDaysMap = new Map();
  for (const [batchId, batch] of batchMap.entries()) {
    batchWorkingDaysMap.set(batchId, await getBatchWorkingDaysCount(batch, from, to));
  }

  const attendanceMap = new Map();
  attendanceRecords.forEach((record) => {
    const key = `${String(record.person)}:${String(record.batch)}`;
    if (!attendanceMap.has(key)) attendanceMap.set(key, []);
    attendanceMap.get(key).push(record);
  });

  const studentMonthMap = new Map();
  const courseSummariesMap = new Map();

  activeEnrollments.forEach((enrollment) => {
    const courseId = String(enrollment.course);
    const assignment = enrollment.teacherAssignment || null;
    const assignedCourse = assignment?.assignedCourse || null;
    const courseMeta =
      assignedCourse?._id || assignedCourse?.courseName
        ? assignedCourse
        : teacherCourseMap.get(courseId) || null;

    if (!courseSummariesMap.has(courseId)) {
      courseSummariesMap.set(courseId, {
        _id: courseId,
        courseId: courseMeta?.courseId || "N/A",
        courseName: courseMeta?.courseName || "Unnamed Course",
        activeStudents: [],
      });
    }

    const studentId = String(enrollment.student._id);
    const batchId = enrollment.batch?._id ? String(enrollment.batch._id) : null;
    const attendanceKey = batchId ? `${studentId}:${batchId}` : null;
    const records = attendanceKey ? attendanceMap.get(attendanceKey) || [] : [];

    let attendedUnits = 0;
    let presentDays = 0;
    let halfDays = 0;
    let absentDays = 0;
    let leaveDays = 0;
    let holidayDays = 0;

    records.forEach((record) => {
      if (record.status === "Present") {
        attendedUnits += 1;
        presentDays += 1;
      } else if (record.status === "Half Day") {
        attendedUnits += 0.5;
        halfDays += 1;
      } else if (record.status === "Absent") {
        absentDays += 1;
      } else if (record.status === "Leave") {
        leaveDays += 1;
      } else if (record.status === "Holiday") {
        holidayDays += 1;
      }
    });

    const totalWorkingDays = batchId ? batchWorkingDaysMap.get(batchId) || 0 : 0;
    const attendancePercentage =
      totalWorkingDays > 0 ? round2((attendedUnits / totalWorkingDays) * 100) : 0;

      const studentMonthEntry = {
      enrollmentId: String(enrollment._id),
      assignmentId: assignment?._id || null,
      studentId,
      studentName: enrollment.student.studentName,
      registrationNo: enrollment.student.registrationNo || "N/A",
      mobileNumber: enrollment.student.mobileNumber || "N/A",
      batchId,
      batchName: enrollment.batch?.batchName || "Batch not linked",
      batchCode: enrollment.batch?.batchCode || "N/A",
      assignedTeacherId: teacherId,
      transferDate: assignment?.transferDate || null,
      transferReason: assignment?.reason || "",
      totalWorkingDays,
      presentDays,
      halfDays,
      absentDays,
      leaveDays,
      holidayDays,
      attendancePercentage,
    };

    courseSummariesMap.get(courseId).activeStudents.push(studentMonthEntry);

    if (!studentMonthMap.has(studentId)) {
      studentMonthMap.set(studentId, {
        studentId,
        studentName: enrollment.student.studentName,
        registrationNo: enrollment.student.registrationNo || "N/A",
        isMovedStudent: false,
        transferDate: null,
        transferReason: "",
        totalWorkingDays: 0,
        attendedUnits: 0,
        presentDays: 0,
        halfDays: 0,
        absentDays: 0,
        leaveDays: 0,
        holidayDays: 0,
      });
    }

    const aggregated = studentMonthMap.get(studentId);
    if (assignment) {
      aggregated.isMovedStudent = true;
      aggregated.transferDate = assignment.transferDate || aggregated.transferDate;
      aggregated.transferReason = assignment.reason || aggregated.transferReason;
    }
    aggregated.totalWorkingDays += totalWorkingDays;
    aggregated.attendedUnits += attendedUnits;
    aggregated.presentDays += presentDays;
    aggregated.halfDays += halfDays;
    aggregated.absentDays += absentDays;
    aggregated.leaveDays += leaveDays;
    aggregated.holidayDays += holidayDays;
  });

  const salaryType = salaryConfigOverride.salaryType || teacher.salaryType || "fixed";
  const monthlySalary =
    salaryConfigOverride.monthlySalary !== undefined
      ? salaryConfigOverride.monthlySalary
      : teacher.monthlySalary ?? null;
  const attendanceThreshold = Number(
    salaryConfigOverride.attendanceThreshold ?? teacher.attendanceThreshold ?? 50,
  );
  const salaryPerStudent = Number(
    salaryConfigOverride.salaryPerStudent ?? teacher.salaryPerStudent ?? 0,
  );
  const isPerStudentMonthConfigured =
    salaryType === "per_student"
      ? salaryConfigOverride.isConfigured !== undefined
        ? salaryConfigOverride.isConfigured === true
        : salaryPerStudent > 0
      : true;
  const studentAdjustmentMap = new Map(
    studentAdjustments.map((item) => [
      String(item.studentId?._id || item.studentId),
      {
        amount: round2(Number(item.amount || 0)),
        note: item.note || "",
        updatedAt: item.updatedAt || null,
      },
    ]),
  );

  const uniqueStudentSummaries = Array.from(studentMonthMap.values()).map((student) => {
    const monthlyAttendancePercentage =
      student.totalWorkingDays > 0
        ? round2((student.attendedUnits / student.totalWorkingDays) * 100)
        : 0;
    const defaultCalculatedSalaryAmount =
      salaryType === "per_student" &&
      isPerStudentMonthConfigured &&
      salaryPerStudent > 0 &&
      monthlyAttendancePercentage >= attendanceThreshold
        ? salaryPerStudent
        : 0;
    const adjustment = studentAdjustmentMap.get(String(student.studentId)) || null;
    const calculatedSalaryAmount = adjustment
      ? round2(Number(adjustment.amount || 0))
      : defaultCalculatedSalaryAmount;
    const isSalaryEligible = adjustment
      ? calculatedSalaryAmount > 0
      : salaryType === "per_student" &&
        isPerStudentMonthConfigured &&
        salaryPerStudent > 0 &&
        monthlyAttendancePercentage >= attendanceThreshold;

    return {
      studentId: student.studentId,
      studentName: student.studentName,
      registrationNo: student.registrationNo,
      isMovedStudent: student.isMovedStudent === true,
      transferDate: student.transferDate || null,
      transferReason: student.transferReason || "",
      totalWorkingDays: student.totalWorkingDays,
      attendedUnits: round2(student.attendedUnits),
      presentDays: student.presentDays,
      halfDays: student.halfDays,
      absentDays: student.absentDays,
      leaveDays: student.leaveDays,
      holidayDays: student.holidayDays,
      monthlyAttendancePercentage,
      attendancePercentage: monthlyAttendancePercentage,
      hasManualAdjustment: Boolean(adjustment),
      manualAdjustedAmount: adjustment ? calculatedSalaryAmount : null,
      manualAdjustmentNote: adjustment?.note || "",
      defaultCalculatedSalaryAmount,
      isSalaryEligible,
      isEligible: isSalaryEligible,
      calculatedSalaryAmount,
    };
  });

  const eligibleStudents = uniqueStudentSummaries.filter((student) => student.isSalaryEligible);
  const movedStudents = uniqueStudentSummaries.filter(
    (student) => student.isMovedStudent === true,
  );
  const calculatedMonthlySalary =
    salaryType === "per_student"
      ? round2(
          uniqueStudentSummaries.reduce(
            (sum, student) => sum + Number(student.calculatedSalaryAmount || 0),
            0,
          ),
        )
      : round2(parseSalaryAmount(monthlySalary));
  const payrollDeductionAmount = round2(
    Number(options.payrollAdjustments?.deductionAmount || 0),
  );
  const payrollBonusAmount = round2(
    Number(options.payrollAdjustments?.bonusAmount || 0),
  );
  const finalMonthlySalary = round2(
    Math.max(0, calculatedMonthlySalary - payrollDeductionAmount) +
      payrollBonusAmount,
  );

  return {
    teacher,
    month: {
      year,
      month,
      label: `${year}-${String(month).padStart(2, "0")}`,
      displayLabel: getMonthDisplayLabel(year, month),
    },
    salaryConfig: {
      salaryType,
      monthlySalary: monthlySalary ?? null,
      salaryPerStudent: salaryType === "per_student" ? salaryPerStudent : null,
      attendanceThreshold,
      deductionAmount: payrollDeductionAmount,
      deductionNote: String(options.payrollAdjustments?.deductionNote || "").trim(),
      bonusAmount: payrollBonusAmount,
      bonusNote: String(options.payrollAdjustments?.bonusNote || "").trim(),
      isConfigured: salaryType === "per_student" ? isPerStudentMonthConfigured : true,
    },
    summary: {
      totalAssignedCourses: assignedCourseIds.length,
      totalActiveStudents: uniqueStudentSummaries.length,
      movedStudents: movedStudents.length,
      eligibleStudents: eligibleStudents.length,
      calculatedMonthlySalary,
      finalMonthlySalary,
    },
    studentsForSalary: uniqueStudentSummaries,
    courses: Array.from(courseSummariesMap.values()),
  };
};

export const getTeacherCompensationDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const now = new Date();
    const year = Number(req.query.year) || now.getFullYear();
    const month = Number(req.query.month) || now.getMonth() + 1;

    const teacher = await TeacherSchema.findById(id).populate(
      "courseId",
      "courseName courseId",
    );

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: "Teacher not found",
      });
    }

    const payrollRecord = await TeacherPayroll.findOne({
      teacher: teacher._id,
      year,
      month,
    }).lean();
    const salaryConfigOverride = getPerStudentMonthConfig(teacher, payrollRecord);
    const compensation = await calculateTeacherCompensationData(teacher, year, month, {
      studentAdjustments: payrollRecord?.studentAdjustments || [],
      salaryConfigOverride,
      payrollAdjustments: {
        deductionAmount: payrollRecord?.deductionAmount || 0,
        deductionNote: payrollRecord?.deductionNote || "",
        bonusAmount: payrollRecord?.bonusAmount || 0,
        bonusNote: payrollRecord?.bonusNote || "",
      },
    });

    res.status(200).json({
      success: true,
      data: compensation,
    });
  } catch (error) {
    console.error("Get teacher compensation details error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const applyTeacherStudentCompensationUpdate = async (teacherId, payload = {}) => {
  const { year, month, studentId, amount, note = "" } = payload;

  if (!studentId) {
    const error = new Error("Student is required");
    error.statusCode = 400;
    throw error;
  }

  const selectedYear = Number(year);
  const selectedMonth = Number(month);
  if (!selectedYear || !selectedMonth) {
    const error = new Error("Year and month are required");
    error.statusCode = 400;
    throw error;
  }

  const normalizedAmount =
    amount === null || amount === undefined || amount === ""
      ? null
      : round2(Number(amount));

  if (normalizedAmount !== null && (!Number.isFinite(normalizedAmount) || normalizedAmount < 0)) {
    const error = new Error("Amount must be a valid non-negative number");
    error.statusCode = 400;
    throw error;
  }

  const teacher = await TeacherSchema.findById(teacherId).populate("courseId", "courseName courseId");
  if (!teacher) {
    const error = new Error("Teacher not found");
    error.statusCode = 404;
    throw error;
  }

  if (normalizedSalaryType === "fixed" && !normalizedMonthlySalary) {
    const error = new Error("Monthly fixed salary is required");
    error.statusCode = 400;
    throw error;
  }

  teacher.salaryType = normalizedSalaryType;
  teacher.monthlySalary =
    normalizedSalaryType === "fixed" ? normalizedMonthlySalary : null;
  teacher.salaryPerStudent =
    normalizedSalaryType === "per_student" ? normalizedSalaryPerStudent : null;
  teacher.attendanceThreshold = normalizedAttendanceThreshold;
  await teacher.save();

  let payrollRecord = await TeacherPayroll.findOne({
    teacher: teacher._id,
    year: selectedYear,
    month: selectedMonth,
  });
  const salaryConfigOverride = getPerStudentMonthConfig(teacher, payrollRecord);

  if (!payrollRecord) {
    payrollRecord = await TeacherPayroll.create({
      teacher: teacher._id,
      year: selectedYear,
      month: selectedMonth,
      salaryType: salaryConfigOverride.salaryType,
      monthlySalary: salaryConfigOverride.monthlySalary,
      salaryPerStudent: salaryConfigOverride.salaryPerStudent,
      attendanceThreshold: salaryConfigOverride.attendanceThreshold,
      dueAmount: 0,
      remainingAmount: 0,
      paidAmount: 0,
      status: "unpaid",
      studentAdjustments: [],
    });
  }

  const existingIndex = payrollRecord.studentAdjustments.findIndex(
    (item) => String(item.studentId) === String(studentId),
  );

  if (normalizedAmount === null) {
    if (existingIndex >= 0) {
      payrollRecord.studentAdjustments.splice(existingIndex, 1);
    }
  } else if (existingIndex >= 0) {
    payrollRecord.studentAdjustments[existingIndex].amount = normalizedAmount;
    payrollRecord.studentAdjustments[existingIndex].note = String(note || "").trim();
    payrollRecord.studentAdjustments[existingIndex].updatedAt = new Date();
  } else {
    payrollRecord.studentAdjustments.push({
      studentId,
      amount: normalizedAmount,
      note: String(note || "").trim(),
      updatedAt: new Date(),
    });
  }

  const compensation = await calculateTeacherCompensationData(teacher, selectedYear, selectedMonth, {
    studentAdjustments: payrollRecord.studentAdjustments,
    salaryConfigOverride: {
      salaryType: payrollRecord.salaryType,
      monthlySalary: payrollRecord.monthlySalary,
      salaryPerStudent: payrollRecord.salaryPerStudent,
      attendanceThreshold: payrollRecord.attendanceThreshold,
      isConfigured:
        payrollRecord.salaryType === "per_student"
          ? Number(payrollRecord.salaryPerStudent || 0) > 0
      : true,
    },
    payrollAdjustments: {
      deductionAmount: payrollRecord.deductionAmount || 0,
      deductionNote: payrollRecord.deductionNote || "",
      bonusAmount: payrollRecord.bonusAmount || 0,
      bonusNote: payrollRecord.bonusNote || "",
    },
  });

  const payrollTotals = calculatePayrollTotals({
    baseDueAmount: Number(compensation.summary.finalMonthlySalary || compensation.summary.calculatedMonthlySalary || 0),
    carryForwardInAmount: 0,
    paidAmount: Number(payrollRecord.paidAmount || 0),
  });
  const paidAmount = Number(payrollRecord.paidAmount || 0);
  payrollRecord.salaryType = salaryConfigOverride.salaryType;
  payrollRecord.monthlySalary = salaryConfigOverride.monthlySalary;
  payrollRecord.salaryPerStudent = salaryConfigOverride.salaryPerStudent;
  payrollRecord.attendanceThreshold = salaryConfigOverride.attendanceThreshold;
  payrollRecord.totalActiveStudents = compensation.summary.totalActiveStudents;
  payrollRecord.eligibleStudents = compensation.summary.eligibleStudents;
  payrollRecord.baseDueAmount = payrollTotals.baseDueAmount;
  payrollRecord.carryForwardInAmount = payrollTotals.carryForwardInAmount;
  payrollRecord.carryForwardEligibleAmount =
    payrollTotals.carryForwardEligibleAmount;
  payrollRecord.dueAmount = payrollTotals.totalDueAmount;
  payrollRecord.remainingAmount = payrollTotals.remainingAmount;
  payrollRecord.overpaidAmount = payrollTotals.overpaidAmount;
  payrollRecord.status = payrollTotals.status;

  await payrollRecord.save();

  return {
    success: true,
    message: "Student salary updated successfully",
    data: compensation,
  };
};

const applyTeacherMonthlySalaryConfigUpdate = async (teacherId, payload = {}) => {
  const selectedYear = Number(payload.year);
  const selectedMonth = Number(payload.month);

  if (!selectedYear || !selectedMonth) {
    const error = new Error("Year and month are required");
    error.statusCode = 400;
    throw error;
  }

  const normalizedSalaryType = payload.salaryType === "per_student" ? "per_student" : "fixed";
  const normalizedAttendanceThreshold =
    payload.attendanceThreshold !== undefined &&
    payload.attendanceThreshold !== null &&
    payload.attendanceThreshold !== ""
      ? Number(payload.attendanceThreshold)
      : 50;
  const normalizedDeductionAmount =
    payload.deductionAmount !== undefined &&
    payload.deductionAmount !== null &&
    payload.deductionAmount !== ""
      ? round2(Number(payload.deductionAmount))
      : 0;
  const normalizedBonusAmount =
    payload.bonusAmount !== undefined &&
    payload.bonusAmount !== null &&
    payload.bonusAmount !== ""
      ? round2(Number(payload.bonusAmount))
      : 0;
  const normalizedDeductionNote = String(payload.deductionNote || "").trim();
  const normalizedBonusNote = String(payload.bonusNote || "").trim();
  const normalizedSalaryPerStudent =
    payload.salaryPerStudent !== undefined &&
    payload.salaryPerStudent !== null &&
    payload.salaryPerStudent !== ""
      ? round2(Number(payload.salaryPerStudent))
      : 0;
  const normalizedMonthlySalary =
    payload.monthlySalary !== undefined && payload.monthlySalary !== null
      ? String(payload.monthlySalary).trim() || null
      : null;

  if (normalizedSalaryType === "per_student" && normalizedSalaryPerStudent < 0) {
    const error = new Error("Salary amount per student must be a valid non-negative number");
    error.statusCode = 400;
    throw error;
  }

  if (normalizedDeductionAmount < 0 || normalizedBonusAmount < 0) {
    const error = new Error("Deduction and bonus amounts must be non-negative numbers");
    error.statusCode = 400;
    throw error;
  }

  const teacher = await TeacherSchema.findById(teacherId).populate("courseId", "courseName courseId");
  if (!teacher) {
    const error = new Error("Teacher not found");
    error.statusCode = 404;
    throw error;
  }

  let payrollRecord = await TeacherPayroll.findOne({
    teacher: teacher._id,
    year: selectedYear,
    month: selectedMonth,
  });

  if (!payrollRecord) {
    payrollRecord = await TeacherPayroll.create({
      teacher: teacher._id,
      year: selectedYear,
      month: selectedMonth,
      salaryType: normalizedSalaryType,
      monthlySalary: normalizedSalaryType === "fixed" ? normalizedMonthlySalary : null,
      salaryPerStudent:
        normalizedSalaryType === "per_student" ? normalizedSalaryPerStudent : null,
      attendanceThreshold: normalizedAttendanceThreshold,
      deductionAmount: normalizedDeductionAmount,
      deductionNote: normalizedDeductionNote,
      bonusAmount: normalizedBonusAmount,
      bonusNote: normalizedBonusNote,
      dueAmount: 0,
      remainingAmount: 0,
      paidAmount: 0,
      status: "unpaid",
      studentAdjustments: [],
    });
  } else {
    payrollRecord.salaryType = normalizedSalaryType;
    payrollRecord.monthlySalary = normalizedSalaryType === "fixed" ? normalizedMonthlySalary : null;
    payrollRecord.salaryPerStudent =
      normalizedSalaryType === "per_student" ? normalizedSalaryPerStudent : null;
    payrollRecord.attendanceThreshold = normalizedAttendanceThreshold;
    payrollRecord.deductionAmount = normalizedDeductionAmount;
    payrollRecord.deductionNote = normalizedDeductionNote;
    payrollRecord.bonusAmount = normalizedBonusAmount;
    payrollRecord.bonusNote = normalizedBonusNote;
  }

  const compensation = await calculateTeacherCompensationData(teacher, selectedYear, selectedMonth, {
    studentAdjustments: payrollRecord.studentAdjustments || [],
    salaryConfigOverride: {
      salaryType: payrollRecord.salaryType,
      monthlySalary: payrollRecord.monthlySalary,
      salaryPerStudent: payrollRecord.salaryPerStudent,
      attendanceThreshold: payrollRecord.attendanceThreshold,
      isConfigured:
        payrollRecord.salaryType === "per_student"
          ? Number(payrollRecord.salaryPerStudent || 0) > 0
      : true,
    },
    payrollAdjustments: {
      deductionAmount: payrollRecord.deductionAmount || 0,
      deductionNote: payrollRecord.deductionNote || "",
      bonusAmount: payrollRecord.bonusAmount || 0,
      bonusNote: payrollRecord.bonusNote || "",
    },
  });

  const payrollTotals = calculatePayrollTotals({
    baseDueAmount: Number(compensation.summary.finalMonthlySalary || compensation.summary.calculatedMonthlySalary || 0),
    carryForwardInAmount: 0,
    paidAmount: Number(payrollRecord.paidAmount || 0),
  });
  const paidAmount = Number(payrollRecord.paidAmount || 0);
  payrollRecord.totalActiveStudents = compensation.summary.totalActiveStudents;
  payrollRecord.eligibleStudents = compensation.summary.eligibleStudents;
  payrollRecord.baseDueAmount = payrollTotals.baseDueAmount;
  payrollRecord.carryForwardInAmount = payrollTotals.carryForwardInAmount;
  payrollRecord.carryForwardEligibleAmount =
    payrollTotals.carryForwardEligibleAmount;
  payrollRecord.dueAmount = payrollTotals.totalDueAmount;
  payrollRecord.remainingAmount = payrollTotals.remainingAmount;
  payrollRecord.overpaidAmount = payrollTotals.overpaidAmount;
  payrollRecord.status = payrollTotals.status;

  await payrollRecord.save();
  await teacher.populate("courseId", "courseName courseId");

  return {
    success: true,
    message: "Teacher salary rule updated successfully",
    data: compensation,
    teacher,
  };
};

export const updateTeacherStudentCompensation = async (req, res) => {
  try {
    const result = await applyTeacherStudentCompensationUpdate(req.params.id, req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Update teacher student compensation error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

export const updateTeacherMonthlySalaryConfig = async (req, res) => {
  try {
    const result = await applyTeacherMonthlySalaryConfigUpdate(req.params.id, req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Update teacher monthly salary config error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

export const transferTeacherStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      enrollmentId,
      studentId,
      targetTeacherId,
      targetCourseId,
      targetBatchId,
      transferDate,
      reason,
      year,
      month,
    } = req.body || {};

    if (!enrollmentId || !studentId || !targetTeacherId || !targetCourseId || !transferDate || !String(reason || "").trim()) {
      return res.status(400).json({
        success: false,
        message: "Student, target teacher, target course, transfer date, and reason are required",
      });
    }

    if (String(id) === String(targetTeacherId)) {
      return res.status(400).json({
        success: false,
        message: "Please choose a different teacher for the transfer",
      });
    }

    const [sourceTeacher, targetTeacher, enrollment] = await Promise.all([
      TeacherSchema.findById(id).lean(),
      TeacherSchema.findById(targetTeacherId).lean(),
      EnrollmentSchema.findById(enrollmentId).lean(),
    ]);

    if (!sourceTeacher) {
      return res.status(404).json({ success: false, message: "Current teacher not found" });
    }
    if (!targetTeacher) {
      return res.status(404).json({ success: false, message: "Target teacher not found" });
    }
    if (!enrollment || String(enrollment.student) !== String(studentId)) {
      return res.status(404).json({ success: false, message: "Student enrollment not found" });
    }

    const targetTeacherCourseIds = (targetTeacher.courseId || []).map((course) => String(course));
    if (!targetTeacherCourseIds.includes(String(targetCourseId))) {
      return res.status(400).json({
        success: false,
        message: "Selected course is not assigned to the target teacher",
      });
    }

    const duplicateEnrollment = await EnrollmentSchema.findOne({
      student: studentId,
      course: targetCourseId,
      _id: { $ne: enrollmentId },
    }).lean();

    if (duplicateEnrollment) {
      return res.status(400).json({
        success: false,
        message: "This student is already assigned to the selected target course",
      });
    }

    let targetBatch = null;
    if (targetBatchId) {
      targetBatch = await BatchSchema.findById(targetBatchId).lean();
      if (!targetBatch) {
        return res.status(404).json({ success: false, message: "Target batch not found" });
      }
      if (String(targetBatch.course) !== String(targetCourseId)) {
        return res.status(400).json({
          success: false,
          message: "Selected batch does not belong to the selected target course",
        });
      }
    } else {
      targetBatch = await BatchSchema.findOne({
        course: targetCourseId,
        isActive: true,
        status: { $in: ["Active", "Upcoming"] },
      })
        .sort({ status: 1, startDate: -1, createdAt: -1 })
        .lean();
    }

    if (!targetBatch) {
      return res.status(400).json({
        success: false,
        message: "Please create or select a batch for the target course before moving this student",
      });
    }

    const sourceCourseId = enrollment.course;
    const sourceBatchId = enrollment.batch || null;
    const resolvedTargetBatchId = targetBatch._id;
    const isChangingBatch = String(sourceBatchId || "") !== String(resolvedTargetBatchId);

    if (
      isChangingBatch &&
      Number(targetBatch.maxStudents || 0) > 0 &&
      Number(targetBatch.currentStudents || 0) >= Number(targetBatch.maxStudents || 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Selected target batch is full. Please choose another batch.",
      });
    }

    await StudentTeacherAssignment.updateMany(
      { enrollment: enrollmentId, isActive: true },
      { $set: { isActive: false } },
    );

    await EnrollmentSchema.findByIdAndUpdate(enrollmentId, {
      $set: {
        course: targetCourseId,
        batch: resolvedTargetBatchId,
        status: "Active",
        notes: [
          enrollment.notes,
          `Moved to selected teacher/course on ${transferDate}: ${String(reason || "").trim()}`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    });

    if (isChangingBatch) {
      if (sourceBatchId) {
        await BatchSchema.findByIdAndUpdate(sourceBatchId, {
          $inc: { currentStudents: -1 },
        });
        await BatchSchema.findByIdAndUpdate(sourceBatchId, {
          $max: { currentStudents: 0 },
        });
      }
      await BatchSchema.findByIdAndUpdate(resolvedTargetBatchId, {
        $inc: { currentStudents: 1 },
      });
    }

    const enrolledCourseIds = await EnrollmentSchema.distinct("course", {
      student: studentId,
    });

    await AdmissionSchema.findByIdAndUpdate(studentId, {
      $set: {
        enrolledCourses: enrolledCourseIds,
        course: targetCourseId,
      },
    });

    await FeeStructureSchema.findOneAndUpdate(
      { enrollment: enrollmentId },
      { $set: { course: targetCourseId } },
    );

    const feeStructure = await FeeStructureSchema.findOne({ enrollment: enrollmentId })
      .select("_id")
      .lean();
    if (feeStructure?._id) {
      await FeePaymentSchema.updateMany(
        { feeStructure: feeStructure._id },
        { $set: { course: targetCourseId } },
      );
    }

    await StudentTeacherAssignment.create({
      student: studentId,
      enrollment: enrollmentId,
      sourceCourse: sourceCourseId,
      assignedCourse: targetCourseId,
      batch: resolvedTargetBatchId,
      fromTeacher: id,
      teacher: targetTeacherId,
      transferDate: new Date(transferDate),
      reason: String(reason || "").trim(),
      createdBy: req.user?._id || null,
    });

    const selectedYear = Number(year) || new Date().getFullYear();
    const selectedMonth = Number(month) || new Date().getMonth() + 1;
    const refreshedTeacher = await TeacherSchema.findById(id).populate("courseId", "courseName courseId");
    const data = await calculateTeacherCompensationData(refreshedTeacher, selectedYear, selectedMonth);

    return res.status(200).json({
      success: true,
      message: "Student moved to the selected teacher successfully",
      data,
    });
  } catch (error) {
    console.error("Transfer teacher student error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update teacher
export const updateTeacher = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (
      Object.prototype.hasOwnProperty.call(updateData, "studentId") &&
      Object.prototype.hasOwnProperty.call(updateData, "year") &&
      Object.prototype.hasOwnProperty.call(updateData, "month")
    ) {
      const result = await applyTeacherStudentCompensationUpdate(id, updateData);
      return res.status(200).json(result);
    }

    if (
      Object.prototype.hasOwnProperty.call(updateData, "year") &&
      Object.prototype.hasOwnProperty.call(updateData, "month") &&
      (Object.prototype.hasOwnProperty.call(updateData, "salaryType") ||
        Object.prototype.hasOwnProperty.call(updateData, "salaryPerStudent") ||
        Object.prototype.hasOwnProperty.call(updateData, "attendanceThreshold") ||
        Object.prototype.hasOwnProperty.call(updateData, "monthlySalary"))
    ) {
      const result = await applyTeacherMonthlySalaryConfigUpdate(id, updateData);
      return res.status(200).json(result);
    }

    // Parse courseId if it's a JSON string (from FormData)
    if (updateData.courseId && typeof updateData.courseId === "string") {
      try {
        updateData.courseId = JSON.parse(updateData.courseId);
      } catch (e) {
        updateData.courseId = [updateData.courseId];
      }
    }

    // ✅ Parse computerSkills
    updateData.computerSkills = updateData.computerSkills || [];
    if (typeof updateData.computerSkills === "string") {
      // Try JSON parse first, fall back to comma split
      try {
        updateData.computerSkills = JSON.parse(updateData.computerSkills);
      } catch (e) {
        updateData.computerSkills = updateData.computerSkills.split(",").map(s => s.trim()).filter(Boolean);
      }
    }
    // Ensure it's an array
    if (!Array.isArray(updateData.computerSkills)) {
      updateData.computerSkills = [];
    }

    console.log("Parsed computerSkills for update:", updateData.computerSkills);

    // monthlySalary is already a string, no conversion needed
    if (updateData.salaryType) {
      updateData.salaryType =
        updateData.salaryType === "per_student" ? "per_student" : "fixed";
    }
    if (Object.prototype.hasOwnProperty.call(updateData, "salaryPerStudent")) {
      updateData.salaryPerStudent =
        updateData.salaryPerStudent !== undefined &&
        updateData.salaryPerStudent !== null &&
        updateData.salaryPerStudent !== ""
          ? Number(updateData.salaryPerStudent)
          : null;
    }
    if (Object.prototype.hasOwnProperty.call(updateData, "attendanceThreshold")) {
      updateData.attendanceThreshold =
        updateData.attendanceThreshold !== undefined &&
        updateData.attendanceThreshold !== null &&
        updateData.attendanceThreshold !== ""
          ? Number(updateData.attendanceThreshold)
          : 50;
    }

    // Handle profile picture if uploaded
    if (req.file) {
      updateData.profilePicture = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    }

    const teacher = await TeacherSchema.findById(id);
    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: "Teacher not found",
      });
    }
    // If courseId is being updated, handle course-teacher relationships
    if (updateData.courseId) {
      // Remove teacher from old courses
      if (teacher.courseId && Array.isArray(teacher.courseId) && teacher.courseId.length > 0) {
        await courseModule.updateMany(
          { _id: { $in: teacher.courseId } },
          { $pull: { teacherId: teacher._id } }
        );
      }

      // Add teacher to new courses
      if (Array.isArray(updateData.courseId) && updateData.courseId.length > 0) {
        await courseModule.updateMany(
          { _id: { $in: updateData.courseId } },
          { $addToSet: { teacherId: teacher._id } }
        );
      }
    }

    const updatedTeacher = await TeacherSchema.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate("courseId", "courseName courseId");

    res.status(200).json({
      success: true,
      message: "Teacher updated successfully",
      data: updatedTeacher,
    });
  } catch (error) {
    console.error("Update teacher error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete teacher
export const deleteTeacher = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("=== DELETE TEACHER REQUEST ===");
    console.log("Teacher ID:", id);

    const teacher = await TeacherSchema.findById(id);
    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: "Teacher not found",
      });
    }

    // Remove teacher from all courses
    if (teacher.courseId && teacher.courseId.length > 0) {
      console.log("Removing teacher from courses:", teacher.courseId);
      await courseModule.updateMany(
        { _id: { $in: teacher.courseId } },
        { $pull: { teacherId: teacher._id } }
      );
    }

    await TeacherSchema.findByIdAndDelete(id);

    console.log("Teacher deleted successfully");

    res.status(200).json({
      success: true,
      message: "Teacher deleted successfully",
    });
  } catch (error) {
    console.error("Delete teacher error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const bulkImportTeachers = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    const workbook = XLSX.read(req.file.buffer, {
      type: "buffer",
      cellDates: true,
    });
    const firstSheetName = workbook.SheetNames[0];
    const rows = firstSheetName
      ? XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
          defval: "",
          raw: false,
        })
      : [];

    if (!rows.length) {
      return res.status(400).json({
        success: false,
        message: "No employee data found in the file",
      });
    }

    const courses = await courseModule.find({}, "courseName courseId").lean();
    const courseLookup = new Map();
    courses.forEach((course) => {
      courseLookup.set(normalizeString(course._id), String(course._id));
      courseLookup.set(normalizeString(course.courseId).toLowerCase(), String(course._id));
      courseLookup.set(normalizeString(course.courseName).toLowerCase(), String(course._id));
    });

    const results = {
      imported: 0,
      updated: 0,
      errors: [],
    };

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const rowNumber = index + 2;

      try {
        if (isRowBlank(row)) {
          continue;
        }

        const teacherId = normalizeString(
          getRowValue(row, ["Employee ID", "Teacher ID", "teacherId", "ID"]),
        );
        const fullName = normalizeString(
          getRowValue(row, ["Full Name", "Employee Name", "fullName"]),
        );
        const fatherName = normalizeString(
          getRowValue(row, ["Father Name", "fatherName"]),
        );
        const gender = normalizeString(getRowValue(row, ["Gender", "gender"]));
        const appointmentDate = normalizeString(
          getRowValue(row, ["Appointment Date", "Date of Joining", "appointmentDate"]),
        );
        const contactNo = normalizeString(
          getRowValue(row, ["Contact Number", "Contact No", "Phone", "contactNo"]),
        );
        const contractPeriod = normalizeString(
          getRowValue(row, ["Contract Period", "contractPeriod"]),
        );
        const cnicNo = normalizeString(
          getRowValue(row, ["CNIC Number", "CNIC No", "CNIC", "cnicNo"]),
        );
        const address = normalizeString(getRowValue(row, ["Address", "address"]));

        if (
          !teacherId ||
          !fullName ||
          !fatherName ||
          !gender ||
          !appointmentDate ||
          !contactNo ||
          !contractPeriod ||
          !cnicNo ||
          !address
        ) {
          throw new Error("Missing one or more required employee fields");
        }

        const designation = normalizeString(
          getRowValue(row, ["Designation", "designation"]),
        );
        const highestQualification = normalizeString(
          getRowValue(row, ["Highest Qualification", "highestQualification"]),
        );
        const degreeTitle = normalizeString(
          getRowValue(row, ["Degree Title", "degreeTitle"]),
        );
        const majorSubject = normalizeString(
          getRowValue(row, ["Major Subject", "Subject", "majorSubject"]),
        );
        const teachingExperience = normalizeString(
          getRowValue(row, ["Experience", "Teaching Experience", "teachingExperience"]),
        );
        const monthlySalary = normalizeString(
          getRowValue(row, ["Monthly Salary", "monthlySalary"]),
        );
        const computerSkills = parseSkills(
          getRowValue(row, ["Other Skills", "Computer Skills", "computerSkills"]),
        );
        const courseRefs = parseCourseRefs(
          getRowValue(row, ["Assigned Courses", "Course IDs", "courseId"]),
        );

        const resolvedCourseIds = courseRefs
          .map((ref) => courseLookup.get(ref.toLowerCase()) || courseLookup.get(ref))
          .filter(Boolean);

        const teacherData = {
          teacherId,
          fullName,
          fatherName,
          gender,
          appointmentDate,
          contactNo,
          contractPeriod,
          cnicNo,
          address,
          designation: designation || null,
          highestQualification: highestQualification || null,
          degreeTitle: degreeTitle || null,
          majorSubject: majorSubject || null,
          teachingExperience: teachingExperience || null,
          computerSkills,
          monthlySalary: monthlySalary || null,
          courseId: resolvedCourseIds,
        };

        const existingTeacher = await TeacherSchema.findOne({
          $or: [{ teacherId }, { cnicNo }],
        });

        if (existingTeacher) {
          if (existingTeacher.courseId?.length) {
            await courseModule.updateMany(
              { _id: { $in: existingTeacher.courseId } },
              { $pull: { teacherId: existingTeacher._id } },
            );
          }

          await TeacherSchema.findByIdAndUpdate(existingTeacher._id, teacherData, {
            new: true,
            runValidators: true,
          });

          if (resolvedCourseIds.length) {
            await courseModule.updateMany(
              { _id: { $in: resolvedCourseIds } },
              { $addToSet: { teacherId: existingTeacher._id } },
            );
          }

          results.updated += 1;
        } else {
          const teacher = await TeacherSchema.create(teacherData);
          if (resolvedCourseIds.length) {
            await courseModule.updateMany(
              { _id: { $in: resolvedCourseIds } },
              { $addToSet: { teacherId: teacher._id } },
            );
          }
          results.imported += 1;
        }
      } catch (error) {
        results.errors.push(`Row ${rowNumber}: ${error.message}`);
      }
    }

    res.status(200).json({
      success: true,
      message: "Employee import completed",
      data: results,
    });
  } catch (error) {
    console.error("Bulk employee import error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while importing employees",
      error: error.message,
    });
  }
};

export default createTeacher;
