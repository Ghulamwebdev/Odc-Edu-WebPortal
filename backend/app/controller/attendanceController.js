import AttendanceSchema from "../modules/attendanceModule.js";
import BatchSchema from "../modules/batchModule.js";
import EnrollmentSchema from "../modules/enrollmentModule.js";
import TeacherSchema from "../modules/teacherModule.js";
import HolidaySchema from "../modules/holidayModule.js";
import AdmissionSchema from "../modules/AdmissionModule.js";
import {
  assertFaceEncryptionConfigured,
  decryptFaceDescriptors,
  encryptFaceDescriptors,
  FACE_MODEL_VERSION,
  getFaceDuplicateThreshold,
  getFaceDescriptorDistance,
  getFaceMatchMinMargin,
  getFaceMatchThreshold,
  normalizeFaceDescriptors,
} from "../utils/faceRecognition.js";

// ─── Helper: map batch.days string → JS day-of-week numbers ──────────────────
const batchDaysToDowSet = (days) => {
  // JS: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
  const map = {
    "Monday to Saturday": [1, 2, 3, 4, 5, 6],
    "Monday to Thursday": [1, 2, 3, 4],
    "Saturday & Sunday": [6, 0],
  };
  return new Set(map[days] || []);
};

// ─── Helper: is the given date a working day for the batch? ──────────────────
const isWorkingDay = (date, batchDays) => {
  const dow = new Date(date).getDay();
  return batchDaysToDowSet(batchDays).has(dow);
};

const isWithinBatchDateRange = (date, batch) => {
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);

  if (batch?.startDate) {
    const startDate = new Date(batch.startDate);
    startDate.setHours(0, 0, 0, 0);
    if (targetDate < startDate) return false;
  }

  if (batch?.endDate) {
    const endDate = new Date(batch.endDate);
    endDate.setHours(23, 59, 59, 999);
    if (targetDate > endDate) return false;
  }

  return true;
};

const normalizeEnrollmentStatus = (status) =>
  String(status || "").trim().toLowerCase();

const isAttendanceEligibleEnrollmentStatus = (status) =>
  ["active", "enrolled", "on hold"].includes(normalizeEnrollmentStatus(status));

// ─── Helper: check if date is a holiday for the batch ────────────────────────
const checkHoliday = async (date, batchId) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const nextD = new Date(d);
  nextD.setDate(nextD.getDate() + 1);

  const holiday = await HolidaySchema.findOne({
    isActive: true,
    $and: [
      {
        $or: [
          { date: { $gte: d, $lt: nextD } },
          { date: { $lte: d }, endDate: { $ne: null, $gte: d } },
        ],
      },
      {
        $or: [
          { affectedBatches: { $size: 0 } },
          { affectedBatches: batchId },
        ],
      },
    ],
  }).lean();
  return holiday || null;
};

const ACTIVE_QR_ENROLLMENT_STATUSES = ["Active", "Enrolled", "On Hold"];
const ACTIVE_FACE_ENROLLMENT_STATUSES = ["Active", "Enrolled"];

const findQrEligibleStudentEnrollments = async ({ studentId, studentCode, attendanceDate }) => {
  const enrollments = await EnrollmentSchema.find({
    status: { $in: ACTIVE_QR_ENROLLMENT_STATUSES },
  })
    .populate("student", "studentName registrationNo gender profilePicture mobileNumber")
    .populate("batch", "batchName batchCode days shift hoursPerDay startDate endDate")
    .lean();

  const normalizedStudentId = String(studentId || "").trim();
  const normalizedStudentCode = String(studentCode || "").trim();

  return enrollments.filter((enrollment) => {
    const student = enrollment?.student;
    const batch = enrollment?.batch;

    if (!student || !batch) return false;

    const matchesStudent =
      (normalizedStudentId && String(student._id || "") === normalizedStudentId) ||
      (normalizedStudentCode &&
        String(student.registrationNo || "").trim() === normalizedStudentCode);

    if (!matchesStudent) return false;
    if (!isWithinBatchDateRange(attendanceDate, batch)) return false;
    if (!isWorkingDay(attendanceDate, batch.days)) return false;

    return true;
  });
};

const markQrAttendance = async (req, res) => {
  try {
    const { date, studentId, studentCode } = req.body || {};

    if (!date || (!studentId && !studentCode)) {
      return res.status(400).json({
        success: false,
        message: "date and either studentId or studentCode are required",
      });
    }

    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);

    const eligibleEnrollments = await findQrEligibleStudentEnrollments({
      studentId,
      studentCode,
      attendanceDate,
    });

    if (!eligibleEnrollments.length) {
      return res.status(404).json({
        success: false,
        message:
          "No active working batch was found for this student on the selected date. Please check the student's batch schedule and try again.",
      });
    }

    const holidayFilteredEnrollments = [];
    for (const enrollment of eligibleEnrollments) {
      const holiday = await checkHoliday(attendanceDate, enrollment.batch._id);
      if (!holiday || holiday.type !== "academy") {
        holidayFilteredEnrollments.push(enrollment);
      }
    }

    if (!holidayFilteredEnrollments.length) {
      return res.status(400).json({
        success: false,
        message:
          "This student's active batch is on an academy holiday for the selected date, so QR attendance cannot be marked today.",
      });
    }

    const student = holidayFilteredEnrollments[0].student;
    const batchIds = holidayFilteredEnrollments.map((enrollment) => enrollment.batch._id);

    const existingRecords = await AttendanceSchema.find({
      batch: { $in: batchIds },
      date: attendanceDate,
      person: student._id,
      personType: "student",
    })
      .select("batch status")
      .lean();

    if (existingRecords.length === batchIds.length) {
      return res.status(409).json({
        success: false,
        code: "ATTENDANCE_ALREADY_MARKED",
        message:
          "Attendance already marked for this student today. Please scan again next day.",
      });
    }

    const existingBatchIds = new Set(existingRecords.map((record) => String(record.batch)));
    const targetEnrollments = holidayFilteredEnrollments.filter(
      (enrollment) => !existingBatchIds.has(String(enrollment.batch._id)),
    );

    if (!targetEnrollments.length) {
      return res.status(409).json({
        success: false,
        code: "ATTENDANCE_ALREADY_MARKED",
        message:
          "Attendance already marked for this student today. Please scan again next day.",
      });
    }

    const ops = targetEnrollments.map((enrollment) => ({
      updateOne: {
        filter: {
          batch: enrollment.batch._id,
          date: attendanceDate,
          person: student._id,
        },
        update: {
          $set: {
            batch: enrollment.batch._id,
            date: attendanceDate,
            person: student._id,
            personModel: "Admission",
            personType: "student",
            status: "Present",
            notes: "Marked via QR ID card scan",
            method: "qr",
            markedBy: req.user?._id,
          },
        },
        upsert: true,
      },
    }));

    await AttendanceSchema.bulkWrite(ops, { ordered: false });

    return res.status(200).json({
      success: true,
      message:
        targetEnrollments.length > 1
          ? "Attendance marked successfully for all active batches."
          : "Attendance marked successfully.",
      data: {
        student: {
          _id: student._id,
          name: student.studentName,
          registrationNo: student.registrationNo,
          gender: student.gender,
          profilePicture: student.profilePicture || "",
          mobileNumber: student.mobileNumber || "",
        },
        batchesMarked: targetEnrollments.map((enrollment) => ({
          _id: enrollment.batch._id,
          batchName: enrollment.batch.batchName,
          batchCode: enrollment.batch.batchCode,
          shift: enrollment.batch.shift || "",
        })),
      },
    });
  } catch (error) {
    console.error("markQrAttendance error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const enrollFaceAttendance = async (req, res) => {
  try {
    const { studentId, faceDescriptors } = req.body || {};
    const normalizedDescriptors = normalizeFaceDescriptors(faceDescriptors);
    if (!studentId || !normalizedDescriptors) {
      return res.status(400).json({
        success: false,
        message:
          "studentId and 1 to 5 valid 128-value face descriptors are required",
      });
    }

    assertFaceEncryptionConfigured();
    const student = await AdmissionSchema.findById(studentId)
      .select("studentName registrationNo gender profilePicture mobileNumber isActive")
      .lean();
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }
    if (student.isActive === false) {
      return res.status(409).json({
        success: false,
        code: "STUDENT_INACTIVE",
        message: "Face registration is unavailable for an inactive student.",
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const activeEnrollments = await EnrollmentSchema.find({
      student: studentId,
      status: { $in: ACTIVE_FACE_ENROLLMENT_STATUSES },
      enrollmentDate: { $lte: today },
    })
      .populate("batch", "status isActive startDate endDate")
      .lean();
    if (
      !activeEnrollments.some(
        (enrollment) =>
          enrollment.batch?.status === "Active" &&
          enrollment.batch.isActive !== false &&
          isWithinBatchDateRange(today, enrollment.batch),
      )
    ) {
      return res.status(409).json({
        success: false,
        code: "FACE_NO_ACTIVE_ENROLLMENT",
        message:
          "Face registration requires an active course enrollment in an active batch.",
      });
    }

    const enrolledStudents = await AdmissionSchema.find({
      _id: { $ne: studentId },
      "faceAttendance.enabled": true,
      "faceAttendance.modelVersion": FACE_MODEL_VERSION,
      "faceAttendance.descriptorsEncrypted": { $exists: true, $ne: "" },
    })
      .select(
        "studentName registrationNo faceAttendance.modelVersion +faceAttendance.descriptorsEncrypted",
      )
      .lean();

    const duplicateDistance = getFaceDuplicateThreshold();
    let duplicateStudent = null;
    for (const enrolledStudent of enrolledStudents) {
      const savedDescriptors = decryptFaceDescriptors(
        enrolledStudent.faceAttendance?.descriptorsEncrypted,
      );
      const distance = Math.min(
        ...normalizedDescriptors.flatMap((descriptor) =>
          savedDescriptors.map((savedDescriptor) =>
            getFaceDescriptorDistance(descriptor, savedDescriptor),
          ),
        ),
      );
      if (!duplicateStudent || distance < duplicateStudent.distance) {
        duplicateStudent = { student: enrolledStudent, distance };
      }
    }

    if (
      duplicateStudent &&
      duplicateStudent.distance <= duplicateDistance
    ) {
      return res.status(409).json({
        success: false,
        code: "FACE_ALREADY_ENROLLED",
        message: `This face is already setup for ${duplicateStudent.student.studentName}${duplicateStudent.student.registrationNo ? ` (${duplicateStudent.student.registrationNo})` : ""}. Please use a different student's face.`,
        data: {
          matchedStudent: {
            _id: duplicateStudent.student._id,
            name: duplicateStudent.student.studentName,
            registrationNo: duplicateStudent.student.registrationNo || "",
          },
        },
      });
    }

    const updatedStudent = await AdmissionSchema.findByIdAndUpdate(
      studentId,
      {
        $set: {
          "faceAttendance.enabled": true,
          "faceAttendance.descriptorsEncrypted":
            encryptFaceDescriptors(normalizedDescriptors),
          "faceAttendance.modelVersion": FACE_MODEL_VERSION,
          "faceAttendance.samplesCount": normalizedDescriptors.length,
          "faceAttendance.updatedBy": req.user?._id || req.user?.id,
          "faceAttendance.updatedAt": new Date(),
        },
        $unset: {
          "faceAttendance.imageData": 1,
          "faceAttendance.faceHash": 1,
          "faceAttendance.faceHashV2": 1,
        },
      },
      {
        new: true,
        select:
          "studentName registrationNo gender profilePicture mobileNumber faceAttendance.enabled faceAttendance.modelVersion faceAttendance.samplesCount faceAttendance.updatedAt",
      },
    ).lean();

    if (!updatedStudent) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Face attendance setup saved successfully.",
      data: {
        student: {
          _id: updatedStudent._id,
          name: updatedStudent.studentName,
          registrationNo: updatedStudent.registrationNo,
          gender: updatedStudent.gender,
          profilePicture: updatedStudent.profilePicture || "",
          mobileNumber: updatedStudent.mobileNumber || "",
          faceAttendance: updatedStudent.faceAttendance,
        },
      },
    });
  } catch (error) {
    console.error("enrollFaceAttendance error:", error);
    res.status(error?.code === "FACE_ENCRYPTION_KEY_MISSING" ? 503 : 500).json({
      success: false,
      code: error?.code || "FACE_ENROLLMENT_FAILED",
      message: error?.message || "Unable to save face registration.",
    });
  }
};

const markFaceAttendance = async (req, res) => {
  try {
    const { batchId, date, faceDescriptor } = req.body || {};
    const [normalizedDescriptor] =
      normalizeFaceDescriptors([faceDescriptor]) || [];
    if (!batchId || !date || !normalizedDescriptor) {
      return res.status(400).json({
        success: false,
        message: "batchId, date, and one valid face descriptor are required",
      });
    }

    const attendanceDate = new Date(date);
    if (Number.isNaN(attendanceDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "A valid attendance date is required.",
      });
    }
    attendanceDate.setHours(0, 0, 0, 0);

    if (batchId !== "__all_batches__") {
      const selectedBatch = await BatchSchema.findById(batchId).select("_id").lean();
      if (!selectedBatch) {
        return res.status(404).json({ success: false, message: "Batch not found" });
      }
    }

    assertFaceEncryptionConfigured();
    const registeredStudents = await AdmissionSchema.find({
      isActive: { $ne: false },
      "faceAttendance.enabled": true,
      "faceAttendance.modelVersion": FACE_MODEL_VERSION,
      "faceAttendance.descriptorsEncrypted": { $exists: true, $ne: "" },
    })
      .select(
        "studentName registrationNo gender profilePicture mobileNumber faceAttendance.modelVersion +faceAttendance.descriptorsEncrypted",
      )
      .lean();

    if (!registeredStudents.length) {
      return res.status(404).json({
        success: false,
        code: "FACE_NOT_SETUP",
        message:
          "No compatible face registration was found. Set up or refresh the student's face first.",
      });
    }

    const candidates = registeredStudents.map((student) => {
      const savedDescriptors = decryptFaceDescriptors(
        student.faceAttendance?.descriptorsEncrypted,
      );
      return {
        student,
        distance: Math.min(
          ...savedDescriptors.map((savedDescriptor) =>
            getFaceDescriptorDistance(normalizedDescriptor, savedDescriptor),
          ),
        ),
      };
    }).sort((left, right) => left.distance - right.distance);

    const bestMatch = candidates[0];
    const secondMatch = candidates[1];
    const maxDistance = getFaceMatchThreshold();
    const minMargin = getFaceMatchMinMargin();

    if (
      bestMatch.distance > maxDistance ||
      (secondMatch &&
        secondMatch.distance - bestMatch.distance < minMargin)
    ) {
      return res.status(422).json({
        success: false,
        code: "FACE_MATCH_NOT_CONFIDENT",
        message:
          "A face was detected, but no registered student matched confidently. Improve the lighting, center the face, or verify the student's face setup.",
        data: {
          bestDistance: Number(bestMatch.distance.toFixed(4)),
        },
      });
    }

    const student = bestMatch.student;
    const activeEnrollments = await EnrollmentSchema.find({
      student: student._id,
      status: { $in: ACTIVE_FACE_ENROLLMENT_STATUSES },
      enrollmentDate: { $lte: attendanceDate },
    })
      .populate(
        "batch",
        "batchName batchCode days shift hoursPerDay startDate endDate status isActive",
      )
      .populate("course", "courseName")
      .lean();
    const validEnrollments = activeEnrollments.filter(
      (enrollment) =>
        enrollment.batch &&
        enrollment.batch.status === "Active" &&
        enrollment.batch.isActive !== false &&
        isWithinBatchDateRange(attendanceDate, enrollment.batch),
    );

    if (!validEnrollments.length) {
      return res.status(409).json({
        success: false,
        code: "FACE_NO_ACTIVE_ENROLLMENT",
        message:
          "This student was recognized, but has no active course or batch enrollment.",
      });
    }

    const eligibleEnrollments = [];
    for (const enrollment of validEnrollments) {
      if (!isWorkingDay(attendanceDate, enrollment.batch.days)) continue;
      const holiday = await checkHoliday(attendanceDate, enrollment.batch._id);
      if (!holiday || holiday.type !== "academy") {
        eligibleEnrollments.push(enrollment);
      }
    }

    if (!eligibleEnrollments.length) {
      return res.status(400).json({
        success: false,
        code: "FACE_ATTENDANCE_CLOSED",
        message:
          "The student's active batches are not scheduled for attendance on this date or are closed for an academy holiday.",
      });
    }

    const confidence = Math.max(
      0,
      Math.round((1 - bestMatch.distance / maxDistance) * 100),
    );
    const batchesMarked = eligibleEnrollments.map((enrollment) => ({
      _id: enrollment.batch._id,
      batchName: enrollment.batch.batchName,
      batchCode: enrollment.batch.batchCode,
      courseName: enrollment.course?.courseName || "",
      shift: enrollment.batch.shift || "",
    }));
    const alreadyMarkedBatches = [];
    const newlyMarkedBatches = [];
    const attendanceRecords = [];

    for (const enrollment of eligibleEnrollments) {
      const batch = enrollment.batch;
      const filter = {
        batch: batch._id,
        date: attendanceDate,
        person: student._id,
        personType: "student",
      };
      let record = await AttendanceSchema.findOne(filter)
        .select("batch status method date createdAt")
        .lean();
      let wasAlreadyMarked = !!record;

      if (!record) {
        try {
          record = await AttendanceSchema.create({
            ...filter,
            personModel: "Admission",
            status: "Present",
            notes: `Marked via face attendance (match score ${confidence}%)`,
            method: "face",
            markedBy: req.user?._id || req.user?.id,
          });
        } catch (error) {
          if (error?.code !== 11000) throw error;
          record = await AttendanceSchema.findOne(filter)
            .select("batch status method date createdAt")
            .lean();
          if (!record) throw error;
          wasAlreadyMarked = true;
        }
      }

      if (wasAlreadyMarked) {
        alreadyMarkedBatches.push(
          batchesMarked.find((item) => String(item._id) === String(batch._id)),
        );
      } else {
        newlyMarkedBatches.push(
          batchesMarked.find((item) => String(item._id) === String(batch._id)),
        );
      }

      attendanceRecords.push({
        batch: String(record.batch),
        batchName: batch.batchName,
        courseName: enrollment.course?.courseName || "",
        date: record.date,
        status: record.status,
        method: record.method,
        createdAt: record.createdAt,
      });
    }

    const data = {
      student: {
        _id: student._id,
        name: student.studentName,
        registrationNo: student.registrationNo,
        gender: student.gender,
        profilePicture: student.profilePicture || "",
        mobileNumber: student.mobileNumber || "",
      },
      batchesMarked,
      newlyMarkedBatches,
      alreadyMarkedBatches,
      attendanceRecords,
      confidence,
      matchDistance: Number(bestMatch.distance.toFixed(4)),
    };

    if (!newlyMarkedBatches.length) {
      return res.status(409).json({
        success: false,
        code: "ATTENDANCE_ALREADY_MARKED",
        message: "Attendance already exists for this student in all eligible batches.",
        data,
      });
    }

    return res.status(200).json({
      success: true,
      message: alreadyMarkedBatches.length
        ? "Attendance marked for the remaining active batches."
        : batchesMarked.length > 1
          ? "Face attendance marked successfully for all active batches."
          : "Face attendance marked successfully.",
      data,
    });
  } catch (error) {
    console.error("markFaceAttendance error:", error);
    res.status(error?.code === "FACE_ENCRYPTION_KEY_MISSING" ? 503 : 500).json({
      success: false,
      code: error?.code || "FACE_ATTENDANCE_FAILED",
      message: error?.message || "Unable to complete face attendance.",
    });
  }
};

// ─── POST /attendance/bulk ────────────────────────────────────────────────────
// Body: { batchId, date, records: [{ personId, personType, status, notes }] }
const bulkMarkAttendance = async (req, res) => {
  try {
    const { batchId, date, records } = req.body;
    if (!batchId || !date || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({
        success: false,
        message: "batchId, date, and records[] are required",
      });
    }

    const batch = await BatchSchema.findById(batchId);
    if (!batch) {
      return res.status(404).json({ success: false, message: "Batch not found" });
    }

    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);

    if (!isWithinBatchDateRange(attendanceDate, batch)) {
      return res.status(400).json({
        success: false,
        message: `Attendance can only be marked between ${new Date(batch.startDate).toDateString()} and ${batch.endDate ? new Date(batch.endDate).toDateString() : "the batch end date"} for batch "${batch.batchName}"`,
      });
    }

    if (!isWorkingDay(attendanceDate, batch.days)) {
      return res.status(400).json({
        success: false,
        message: `${attendanceDate.toDateString()} is not a working day for batch "${batch.batchName}" (${batch.days})`,
      });
    }

    // Block only academy holidays (government holidays allow attendance if academy is open)
    const holiday = await checkHoliday(attendanceDate, batchId);
    if (holiday && holiday.type === "academy") {
      return res.status(400).json({
        success: false,
        message: `${attendanceDate.toDateString()} is an academy holiday: "${holiday.name}" — attendance cannot be marked on academy holidays`,
      });
    }

    const ops = records.map(({ personId, personType, status, notes }) => {
      const personModel = personType === "student" ? "Admission" : "Teacher";
      return {
        updateOne: {
          filter: { batch: batchId, date: attendanceDate, person: personId },
          update: {
            $set: {
              batch: batchId,
              date: attendanceDate,
              person: personId,
              personModel,
              personType,
              status: status || "Absent",
              notes: notes || "",
              method: "manual",
              markedBy: req.user?._id,
            },
          },
          upsert: true,
        },
      };
    });

    await AttendanceSchema.bulkWrite(ops);

    res.status(200).json({ success: true, message: "Attendance saved successfully" });
  } catch (error) {
    console.error("bulkMarkAttendance error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET /attendance/batch/:batchId?date=YYYY-MM-DD ─────────────────────────
const getAttendanceByBatchAndDate = async (req, res) => {
  try {
    const { batchId } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ success: false, message: "date query param required" });
    }

    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(attendanceDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const records = await AttendanceSchema.find({
      batch: batchId,
      date: { $gte: attendanceDate, $lt: nextDay },
    })
      .populate("person")
      .lean();

    res.status(200).json({ success: true, data: records });
  } catch (error) {
    console.error("getAttendanceByBatchAndDate error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET /attendance/person/:personId?personType=student&from=&to= ────────────
const getPersonAttendance = async (req, res) => {
  try {
    const { personId } = req.params;
    const { personType, from, to } = req.query;

    const filter = { person: personId };
    if (personType) filter.personType = personType;
    if (from || to) {
      filter.date = {};
      if (from) {
        const f = new Date(from);
        f.setHours(0, 0, 0, 0);
        filter.date.$gte = f;
      }
      if (to) {
        const t = new Date(to);
        t.setHours(23, 59, 59, 999);
        filter.date.$lte = t;
      }
    }

    const records = await AttendanceSchema.find(filter)
      .populate("batch", "batchName batchCode days")
      .sort({ date: -1 })
      .lean();

    res.status(200).json({ success: true, data: records });
  } catch (error) {
    console.error("getPersonAttendance error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET /attendance/batch/:batchId/members ──────────────────────────────────
// Returns students (via enrollments) and teachers for a batch
const getBatchMembers = async (req, res) => {
  try {
    const { batchId } = req.params;

    const batch = await BatchSchema.findById(batchId)
      .populate("course", "courseName")
      .lean();

    if (!batch) {
      return res.status(404).json({ success: false, message: "Batch not found" });
    }

    // Students enrolled in this batch — include Active and On Hold
    const enrollments = await EnrollmentSchema.find({
      batch: batchId,
    })
      .populate(
        "student",
        "studentName registrationNo gender profilePicture mobileNumber faceAttendance.enabled faceAttendance.modelVersion faceAttendance.updatedAt faceAttendance.samplesCount",
      )
      .lean();

    console.log(`[Attendance] Batch: ${batchId} | Enrollments found: ${enrollments.length}`);

    const students = enrollments
      .filter((e) => e.student)
      .map((e) => ({
        _id: e.student._id,
        name: e.student.studentName,
        registrationNo: e.student.registrationNo,
        gender: e.student.gender,
        profilePicture: e.student.profilePicture || "",
        mobileNumber: e.student.mobileNumber || "",
        faceAttendance: {
          enabled: !!e.student.faceAttendance?.enabled,
          modelVersion: e.student.faceAttendance?.modelVersion || "",
          matcherVersion:
            e.student.faceAttendance?.modelVersion === FACE_MODEL_VERSION ? 3 : 1,
          updatedAt: e.student.faceAttendance?.updatedAt || null,
          samplesCount: e.student.faceAttendance?.samplesCount || 0,
        },
        enrollmentStatus: e.status,
        enrollmentNotes: e.notes || "",
        attendanceEligible: isAttendanceEligibleEnrollmentStatus(e.status),
        personType: "student",
      }));

    // Teachers assigned to this course — Teacher schema has no isActive field
    const courseId = batch.course?._id || batch.course;
    console.log(`[Attendance] Looking for teachers with courseId: ${courseId}`);
    const teachers = await TeacherSchema.find({
      courseId: courseId,
    })
      .select("fullName teacherId gender designation")
      .lean();

    console.log(`[Attendance] Teachers found: ${teachers.length}`);

    const teacherList = teachers.map((t) => ({
      _id: t._id,
      name: t.fullName,
      teacherId: t.teacherId,
      gender: t.gender,
      designation: t.designation,
      personType: "teacher",
    }));

    res.status(200).json({
      success: true,
      data: {
        batch,
        students,
        teachers: teacherList,
      },
    });
  } catch (error) {
    console.error("getBatchMembers error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET /attendance/batch/:batchId/summary?from=&to= ────────────────────────
// Monthly/range summary: count per person
const getAttendanceSummary = async (req, res) => {
  try {
    const { batchId } = req.params;
    const { from, to, personType } = req.query;

    const filter = { batch: batchId };
    if (personType) filter.personType = personType;
    if (from || to) {
      filter.date = {};
      if (from) {
        const f = new Date(from);
        f.setHours(0, 0, 0, 0);
        filter.date.$gte = f;
      }
      if (to) {
        const t = new Date(to);
        t.setHours(23, 59, 59, 999);
        filter.date.$lte = t;
      }
    }

    const summary = await AttendanceSchema.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { person: "$person", personType: "$personType", status: "$status" },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: { person: "$_id.person", personType: "$_id.personType" },
          statusCounts: {
            $push: { status: "$_id.status", count: "$count" },
          },
        },
      },
    ]);

    res.status(200).json({ success: true, data: summary });
  } catch (error) {
    console.error("getAttendanceSummary error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET /attendance/working-days/:batchId?year=&month= ──────────────────────
// Return which calendar days are working days for a batch (excl. holidays)
const getWorkingDays = async (req, res) => {
  try {
    const { batchId } = req.params;
    const { year, month } = req.query;

    const batch = await BatchSchema.findById(batchId).lean();
    if (!batch) {
      return res.status(404).json({ success: false, message: "Batch not found" });
    }

    const y = parseInt(year) || new Date().getFullYear();
    const m = parseInt(month) || new Date().getMonth() + 1;

    const dowSet = batchDaysToDowSet(batch.days);
    const daysInMonth = new Date(y, m, 0).getDate();

    // Fetch holidays for this batch in this month
    const from = new Date(y, m - 1, 1);
    const to   = new Date(y, m - 1, daysInMonth, 23, 59, 59);
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
          $or: [
            { affectedBatches: { $size: 0 } },
            { affectedBatches: batchId },
          ],
        },
      ],
    }).select("date endDate").lean();

    const holidayDateSet = new Set();
    holidays.forEach((h) => {
      const start = new Date(h.date);
      const end   = h.endDate ? new Date(h.endDate) : new Date(h.date);
      let cur = new Date(start);
      while (cur <= end) {
        holidayDateSet.add(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2,"0")}-${String(cur.getDate()).padStart(2,"0")}`);
        cur.setDate(cur.getDate() + 1);
      }
    });

    const workingDays = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date    = new Date(y, m - 1, d);
      const dateStr = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      if (dowSet.has(date.getDay()) && !holidayDateSet.has(dateStr)) {
        workingDays.push(d);
      }
    }

    res.status(200).json({
      success: true,
      data: { batchId, year: y, month: m, batchDays: batch.days, workingDays },
    });
  } catch (error) {
    console.error("getWorkingDays error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET /attendance/batch/:batchId/calendar?year=&month= ─────────────────────
// Lightweight calendar view: returns { "YYYY-MM-DD": { Present, Absent, HalfDay, Leave, total } }
const getMonthCalendar = async (req, res) => {
  try {
    const { batchId } = req.params;
    const y = parseInt(req.query.year) || new Date().getFullYear();
    const m = parseInt(req.query.month) || new Date().getMonth() + 1;

    const from = new Date(y, m - 1, 1);
    from.setHours(0, 0, 0, 0);
    const to = new Date(y, m, 0);
    to.setHours(23, 59, 59, 999);

    const records = await AttendanceSchema.find({
      batch: batchId,
      date: { $gte: from, $lte: to },
    })
      .select("date status updatedAt")
      .lean();

    const calendarMap = {};
    records.forEach((r) => {
      // Use LOCAL date parts to avoid UTC-offset mismatch (dates stored at local midnight)
      const d = r.date;
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!calendarMap[dateStr]) {
        calendarMap[dateStr] = { Present: 0, Absent: 0, "Half Day": 0, Leave: 0, total: 0 };
      }
      calendarMap[dateStr][r.status] = (calendarMap[dateStr][r.status] || 0) + 1;
      calendarMap[dateStr].total += 1;
    });

    res.status(200).json({ success: true, data: calendarMap });
  } catch (error) {
    console.error("getMonthCalendar error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET /attendance/batch/:batchId/history?from=&to=&personType= ─────────────
// Full history: every record in range, populated with person name/id.
// Also returns per-person totals for a summary table.
const getAttendanceHistory = async (req, res) => {
  try {
    const { batchId } = req.params;
    const { from, to, personType } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: "from and to query params are required (YYYY-MM-DD)",
      });
    }

    const fromDate = new Date(from);
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    const filter = {
      batch: batchId,
      date: { $gte: fromDate, $lte: toDate },
    };
    if (personType && personType !== "all") filter.personType = personType;

    const records = await AttendanceSchema.find(filter)
      .populate({
        path: "person",
        select: "studentName registrationNo gender fullName teacherId designation",
      })
      .sort({ date: 1, personType: 1 })
      .lean();

    // Build per-person summary
    const summaryMap = {};
    records.forEach((r) => {
      const pid = String(r.person?._id || r.person);
      if (!summaryMap[pid]) {
        const p = r.person || {};
        summaryMap[pid] = {
          _id: pid,
          name: p.studentName || p.fullName || "—",
          identifier: p.registrationNo || p.teacherId || "—",
          gender: p.gender || "—",
          personType: r.personType,
          Present: 0,
          Absent: 0,
          "Half Day": 0,
          Leave: 0,
          total: 0,
        };
      }
      summaryMap[pid][r.status] = (summaryMap[pid][r.status] || 0) + 1;
      summaryMap[pid].total += 1;
    });

    res.status(200).json({
      success: true,
      data: {
        records,
        summary: Object.values(summaryMap),
        total: records.length,
      },
    });
  } catch (error) {
    console.error("getAttendanceHistory error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── POST /attendance/mark-holiday ─────────────────────────────────────────
// Body: { holidayId }
// Auto-creates/updates attendance records for all batch members on a holiday date
const markHolidayAttendance = async (req, res) => {
  try {
    const { holidayId } = req.body;
    if (!holidayId) {
      return res.status(400).json({ success: false, message: "holidayId is required" });
    }

    const holiday = await HolidaySchema.findById(holidayId).lean();
    if (!holiday) {
      return res.status(404).json({ success: false, message: "Holiday not found" });
    }

    // Determine affected batch IDs
    let batchIds = (holiday.affectedBatches || []).map((id) => id.toString());
    if (batchIds.length === 0) {
      const allBatches = await BatchSchema.find({}, "_id").lean();
      batchIds = allBatches.map((b) => b._id.toString());
    }

    const date = new Date(holiday.date);
    date.setHours(0, 0, 0, 0);

    const ops = [];

    for (const batchId of batchIds) {
      const batch = await BatchSchema.findById(batchId, "course").lean();
      if (!batch) continue;

      // Students enrolled in this batch
      const enrollments = await EnrollmentSchema.find(
        { batch: batchId, status: { $in: ["Active", "On Hold"] } },
        "student"
      ).lean();

      for (const en of enrollments) {
        if (!en.student) continue;
        ops.push({
          updateOne: {
            filter: { batch: batchId, date, person: en.student },
            update: {
              $set: {
                batch: batchId,
                date,
                person: en.student,
                personModel: "Admission",
                personType: "student",
                status: "Holiday",
                notes: `Holiday: ${holiday.name}`,
                method: "holiday",
                markedBy: req.user?._id,
              },
            },
            upsert: true,
          },
        });
      }

      // Teachers assigned to the batch's course
      const courseId = batch.course;
      if (courseId) {
        const teachers = await TeacherSchema.find({ courseId }, "_id").lean();
        for (const t of teachers) {
          ops.push({
            updateOne: {
              filter: { batch: batchId, date, person: t._id },
              update: {
                $set: {
                  batch: batchId,
                  date,
                  person: t._id,
                  personModel: "Teacher",
                  personType: "teacher",
                  status: "Holiday",
                  notes: `Holiday: ${holiday.name}`,
                  method: "holiday",
                  markedBy: req.user?._id,
                },
              },
              upsert: true,
            },
          });
        }
      }
    }

    if (ops.length > 0) {
      await AttendanceSchema.bulkWrite(ops, { ordered: false });
    }

    return res.json({
      success: true,
      message: `Holiday attendance marked for ${ops.length} record(s) across ${batchIds.length} batch(es)`,
      totalMarked: ops.length,
    });
  } catch (error) {
    console.error("markHolidayAttendance error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export {
  bulkMarkAttendance,
  markQrAttendance,
  enrollFaceAttendance,
  markFaceAttendance,
  getAttendanceByBatchAndDate,
  getPersonAttendance,
  getBatchMembers,
  getAttendanceSummary,
  getWorkingDays,
  getAttendanceHistory,
  getMonthCalendar,
  markHolidayAttendance,
};
