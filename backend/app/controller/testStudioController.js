import * as XLSX from "xlsx";
import Course from "../modules/courseModule.js";
import Batch from "../modules/batchModule.js";
import Enrollment from "../modules/enrollmentModule.js";
import EmployeeCourse from "../modules/employeeCourseModule.js";
import UserAuth from "../modules/userAuthModal.js";
import Admission from "../modules/AdmissionModule.js";
import {
  QuestionBank,
  Test,
  TestAttempt,
  TestAuditLog,
} from "../modules/testStudioModule.js";
import { gradeTestAttempt } from "../utils/testStudioGrading.js";

const QUESTION_TYPES = new Set([
  "mcq_single",
  "mcq_multiple",
  "true_false",
  "short_answer",
  "long_answer",
  "fill_blank",
]);

const stripUnsafeHtml = (value = "") =>
  String(value || "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .trim();

const normalizeArray = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return String(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
};

const getUserId = (req) => req.user?._id || req.user?.id;

const getStudentPortalUser = async (req) => {
  const user = await UserAuth.findById(getUserId(req)).lean();
  if (!user || user.accountType !== "student" || !user.student) {
    const error = new Error("Student portal account required.");
    error.statusCode = 403;
    throw error;
  }
  return user;
};

const getAssignedCourseIds = async (req) => {
  if (req.currentUser?.isSuperAdmin || req.user?.isSuperAdmin) {
    return Course.distinct("_id", {});
  }

  const assignments = await EmployeeCourse.find({ employee: getUserId(req) }).lean();
  return assignments.map((item) => String(item.course));
};

const assertCourseAccess = async (req, courseId) => {
  const assignedCourseIds = await getAssignedCourseIds(req);
  if (!assignedCourseIds.map(String).includes(String(courseId))) {
    const error = new Error("You can only manage tests for assigned courses.");
    error.statusCode = 403;
    throw error;
  }
  return assignedCourseIds;
};

const assertBatchAccess = async (req, courseId, batchIds = []) => {
  await assertCourseAccess(req, courseId);
  const uniqueBatchIds = [...new Set(batchIds.map(String))];
  if (!uniqueBatchIds.length) return [];

  const batches = await Batch.find({
    _id: { $in: uniqueBatchIds },
    course: courseId,
  }).lean();

  if (batches.length !== uniqueBatchIds.length) {
    const error = new Error("One or more selected batches are not linked to the selected course.");
    error.statusCode = 403;
    throw error;
  }

  return batches;
};

const computeLifecycleStatus = (test, now = new Date()) => {
  if (test.status === "cancelled" || test.status === "draft") return test.status;
  if (test.status === "live" && test.schedule?.isPaused) return "live";
  const startAt = test.schedule?.startAt ? new Date(test.schedule.startAt) : null;
  const endAt = test.schedule?.endAt ? new Date(test.schedule.endAt) : null;
  if (endAt && now >= endAt) return "completed";
  if (startAt && now >= startAt) return "live";
  return "scheduled";
};

const getStudentBatchIds = async (studentId) => {
  const enrollments = await Enrollment.find({
    student: studentId,
    status: { $in: ["Active", "Completed", "On Hold"] },
  }).lean();
  return [...new Set(enrollments.map((enrollment) => String(enrollment.batch)).filter(Boolean))];
};

const sanitizeQuestionForStudent = (question = {}, index = 0) => ({
  _id: question._id,
  order: question.order ?? index,
  questionType: question.questionType,
  questionText: question.questionText,
  imageUrl: question.imageUrl,
  marks: question.marks,
  options: (question.options || []).map((option, optionIndex) => ({
    _id: String(option._id || optionIndex),
    text: option.text,
  })),
});

const serializeStudentTest = (test, attempt = null, now = new Date()) => {
  const plain = test.toObject ? test.toObject() : test;
  const status = computeLifecycleStatus(plain, now);
  const startAt = plain.schedule?.startAt ? new Date(plain.schedule.startAt) : null;
  const endAt = plain.schedule?.endAt ? new Date(plain.schedule.endAt) : null;
  const canStart = status === "live" && !plain.schedule?.isPaused && (!endAt || now < endAt);
  return {
    _id: plain._id,
    title: plain.title,
    description: plain.description,
    instructions: plain.instructions,
    topic: plain.topic,
    course: plain.course,
    teacher: plain.teacherUser,
    totalMarks: plain.totalMarks,
    passingMarks: plain.passingMarks,
    passingPercentage: plain.passingPercentage,
    schedule: plain.schedule,
    status,
    canStart,
    attempt: attempt
      ? {
          _id: attempt._id,
          status: attempt.status,
          startedAt: attempt.startedAt,
          expiresAt: attempt.expiresAt,
          submittedAt: attempt.submittedAt,
          score: attempt.score,
          percentage: attempt.percentage,
          passed: attempt.passed,
        }
      : null,
  };
};

const normalizeQuestion = (question = {}, index = 0, defaults = {}) => {
  const questionType = question.questionType || defaults.questionType || "mcq_single";
  const options = Array.isArray(question.options)
    ? question.options
        .map((option) => ({
          _id: option._id,
          text: stripUnsafeHtml(option.text),
          isCorrect: Boolean(option.isCorrect),
        }))
        .filter((option) => option.text)
    : [];

  return {
    bankQuestion: question.bankQuestion || null,
    sectionId: question.sectionId || null,
    order: Number(question.order ?? index),
    questionType,
    difficulty: ["easy", "medium", "hard"].includes(question.difficulty)
      ? question.difficulty
      : "medium",
    questionText: stripUnsafeHtml(question.questionText),
    imageUrl: stripUnsafeHtml(question.imageUrl),
    options,
    correctAnswers: normalizeArray(question.correctAnswers).map(String),
    modelAnswer: stripUnsafeHtml(question.modelAnswer),
    explanation: stripUnsafeHtml(question.explanation),
    marks: Number(question.marks ?? defaults.marksPerQuestion ?? 1),
    negativeMarks: Number(question.negativeMarks ?? 0),
    tags: normalizeArray(question.tags),
  };
};

const normalizeSections = (sections = []) =>
  (Array.isArray(sections) ? sections : []).map((section) => ({
    _id: section._id,
    title: stripUnsafeHtml(section.title || "Section"),
    questionType: section.questionType || "mcq_single",
    numberOfQuestions: Number(section.numberOfQuestions || 0),
    marksPerQuestion: Number(section.marksPerQuestion || 1),
    attemptAny:
      section.attemptAny === null || section.attemptAny === undefined || section.attemptAny === ""
        ? null
        : Number(section.attemptAny),
  }));

const normalizePaperHeader = (paperHeader = {}) => ({
  logo: stripUnsafeHtml(paperHeader.logo || ""),
  logoText: stripUnsafeHtml(paperHeader.logoText || ""),
  academyName: stripUnsafeHtml(paperHeader.academyName || ""),
  address: stripUnsafeHtml(paperHeader.address || ""),
  phone: stripUnsafeHtml(paperHeader.phone || ""),
  email: stripUnsafeHtml(paperHeader.email || ""),
  website: stripUnsafeHtml(paperHeader.website || ""),
  note: stripUnsafeHtml(paperHeader.note || ""),
});

const buildTestPayload = (body = {}, currentTest = null) => {
  const schedule = body.schedule || {};
  const sections = normalizeSections(body.sections || currentTest?.sections || []);
  const questions = (Array.isArray(body.questions) ? body.questions : currentTest?.questions || []).map(
    (question, index) => normalizeQuestion(question, index),
  );
  const computedTotalMarks = questions.reduce((sum, question) => sum + Number(question.marks || 0), 0);

  return {
    title: stripUnsafeHtml(body.title || currentTest?.title || ""),
    description: stripUnsafeHtml(body.description || ""),
    instructions: stripUnsafeHtml(body.instructions || ""),
    course: body.course || currentTest?.course,
    topic: stripUnsafeHtml(body.topic || ""),
    allowedQuestionTypes: normalizeArray(body.allowedQuestionTypes).filter((type) =>
      QUESTION_TYPES.has(type),
    ),
    sections,
    questions,
    totalMarks: Number(body.totalMarks || computedTotalMarks || 0),
    passingMarks: Number(body.passingMarks || 0),
    passingPercentage:
      body.passingPercentage === "" || body.passingPercentage === undefined
        ? null
        : Number(body.passingPercentage),
    negativeMarking: {
      enabled: Boolean(body.negativeMarking?.enabled),
      value: Number(body.negativeMarking?.value || 0),
    },
    schedule: {
      timezone: schedule.timezone || "Asia/Karachi",
      startAt: schedule.startAt ? new Date(schedule.startAt) : null,
      endAt: schedule.endAt ? new Date(schedule.endAt) : null,
      durationMinutes: Number(schedule.durationMinutes || 60),
      allowLateEntry: schedule.allowLateEntry !== false,
      graceMinutes: Number(schedule.graceMinutes || 0),
      publishAt: schedule.publishAt ? new Date(schedule.publishAt) : null,
      isPaused: Boolean(schedule.isPaused),
      pausedAt: schedule.pausedAt ? new Date(schedule.pausedAt) : null,
      totalPausedMs: Number(schedule.totalPausedMs || 0),
    },
    assignedBatches: normalizeArray(body.batchIds).map((batchId) => ({
      batch: batchId,
      course: body.course || currentTest?.course,
    })),
    excludedStudents: normalizeArray(body.excludedStudentIds).map((studentId) => ({
      student: studentId,
    })),
    settings: {
      shuffleQuestions: Boolean(body.settings?.shuffleQuestions),
      shuffleOptions: Boolean(body.settings?.shuffleOptions),
      resultVisibility: body.settings?.resultVisibility || "after_publish",
      allowReview: Boolean(body.settings?.allowReview),
      attemptsAllowed: Number(body.settings?.attemptsAllowed || 1),
      layout: body.settings?.layout || "all_questions",
      allowBackNavigation: body.settings?.allowBackNavigation !== false,
      antiCheating: {
        requireFullScreen: Boolean(body.settings?.antiCheating?.requireFullScreen),
        trackTabSwitch: body.settings?.antiCheating?.trackTabSwitch !== false,
        maxWarnings: Number(body.settings?.antiCheating?.maxWarnings || 3),
        autoSubmitOnViolation: body.settings?.antiCheating?.autoSubmitOnViolation !== false,
        disableCopyPaste: body.settings?.antiCheating?.disableCopyPaste !== false,
        disableRightClick: body.settings?.antiCheating?.disableRightClick !== false,
      },
      paperHeader: normalizePaperHeader(body.settings?.paperHeader || currentTest?.settings?.paperHeader || {}),
    },
  };
};

const validatePublishable = (payload) => {
  const errors = [];
  const now = new Date();
  const questionMarks = payload.questions.reduce((sum, question) => sum + Number(question.marks || 0), 0);
  if (!payload.title) errors.push("Test title is required.");
  if (!payload.course) errors.push("Course is required.");
  if (!payload.questions.length) errors.push("At least one question is required.");
  if (!payload.assignedBatches.length) errors.push("At least one batch is required.");
  if (!payload.schedule.startAt || !payload.schedule.endAt) errors.push("Start and end time are required.");
  if (payload.schedule.startAt && payload.schedule.startAt <= now) errors.push("Schedule start time must be in the future.");
  if (payload.schedule.startAt && payload.schedule.endAt && payload.schedule.endAt <= payload.schedule.startAt) {
    errors.push("End time must be after start time.");
  }
  if (Number(payload.totalMarks || 0) !== Number(questionMarks || 0)) {
    errors.push("Total marks must match the sum of question marks.");
  }
  return errors;
};

const createAudit = (test, req, action, before = null, after = null, note = "") =>
  TestAuditLog.create({
    test: test._id || test,
    actor: getUserId(req),
    action,
    before,
    after,
    note,
  });

const syncQuestionBank = async (test, req) => {
  const writes = test.questions.map((question) => ({
    updateOne: {
      filter: {
        owner: getUserId(req),
        course: test.course,
        questionText: question.questionText,
        questionType: question.questionType,
      },
      update: {
        $set: {
          topic: test.topic || "",
          difficulty: question.difficulty,
          imageUrl: question.imageUrl,
          options: question.options,
          correctAnswers: question.correctAnswers,
          modelAnswer: question.modelAnswer,
          explanation: question.explanation,
          defaultMarks: question.marks,
          tags: question.tags,
          isDeleted: false,
        },
        $setOnInsert: {
          owner: getUserId(req),
          course: test.course,
          questionText: question.questionText,
          questionType: question.questionType,
        },
      },
      upsert: true,
    },
  }));

  if (writes.length) {
    await QuestionBank.bulkWrite(writes);
  }
};

const attachAssignmentStats = async (test) => {
  const plain = test.toObject ? test.toObject() : test;
  const batchIds = (plain.assignedBatches || []).map((item) => item.batch?._id || item.batch);
  const excluded = new Set((plain.excludedStudents || []).map((item) => String(item.student?._id || item.student)));
  const enrollments = batchIds.length
    ? await Enrollment.find({ batch: { $in: batchIds }, status: { $in: ["Active", "Completed", "On Hold"] } })
        .populate("student", "studentName registrationNo emailAddress isActive")
        .lean()
    : [];
  const students = enrollments.filter((enrollment) => !excluded.has(String(enrollment.student?._id || enrollment.student)));
  const attempts = await TestAttempt.find({ test: plain._id }).lean();
  const attemptCounts = attempts.reduce(
    (acc, attempt) => {
      acc[attempt.status] = (acc[attempt.status] || 0) + 1;
      return acc;
    },
    { not_started: Math.max(0, students.length - attempts.length) },
  );
  return {
    ...plain,
    studentCount: students.length,
    attemptCounts,
  };
};

export const getTeacherTestStudioOptions = async (req, res) => {
  try {
    const courseIds = await getAssignedCourseIds(req);
    const [courses, batches] = await Promise.all([
      Course.find({ _id: { $in: courseIds } }, "courseId courseName courseCategory duration").sort({ courseName: 1 }).lean(),
      Batch.find({ course: { $in: courseIds } }, "batchName batchCode course shift status startDate isActive").sort({ startDate: -1 }).lean(),
    ]);

    res.status(200).json({
      success: true,
      data: courses.map((course) => ({
        ...course,
        batches: batches.filter((batch) => String(batch.course) === String(course._id)),
      })),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

export const previewTestAssignment = async (req, res) => {
  try {
    const { courseId, batchIds = [], excludedStudentIds = [] } = req.body;
    const batches = await assertBatchAccess(req, courseId, batchIds);
    const excluded = new Set(excludedStudentIds.map(String));
    const enrollments = await Enrollment.find({
      batch: { $in: batches.map((batch) => batch._id) },
      status: { $in: ["Active", "Completed", "On Hold"] },
    })
      .populate("student", "studentName registrationNo emailAddress isActive")
      .lean();

    const uniqueStudents = new Map();
    enrollments.forEach((enrollment) => {
      const studentId = String(enrollment.student?._id || enrollment.student);
      if (studentId && !excluded.has(studentId)) uniqueStudents.set(studentId, enrollment.student);
    });

    res.status(200).json({
      success: true,
      data: {
        batches,
        studentCount: uniqueStudents.size,
        students: Array.from(uniqueStudents.values()),
      },
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

export const getMyStudentTests = async (req, res) => {
  try {
    const studentUser = await getStudentPortalUser(req);
    const studentId = String(studentUser.student);
    const batchIds = await getStudentBatchIds(studentId);
    const now = new Date();

    const tests = batchIds.length
      ? await Test.find({
          isDeleted: false,
          status: { $nin: ["draft", "cancelled"] },
          "assignedBatches.batch": { $in: batchIds },
          "excludedStudents.student": { $ne: studentId },
        })
          .populate("course", "courseId courseName")
          .populate("teacherUser", "name email profile")
          .sort({ "schedule.startAt": 1 })
      : [];

    const attempts = await TestAttempt.find({
      student: studentId,
      test: { $in: tests.map((test) => test._id) },
    }).lean();
    const attemptByTest = new Map(attempts.map((attempt) => [String(attempt.test), attempt]));

    res.status(200).json({
      success: true,
      data: tests.map((test) => serializeStudentTest(test, attemptByTest.get(String(test._id)), now)),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

export const startMyStudentTest = async (req, res) => {
  try {
    const studentUser = await getStudentPortalUser(req);
    const studentId = String(studentUser.student);
    const batchIds = await getStudentBatchIds(studentId);
    const test = await Test.findOne({
      _id: req.params.id,
      isDeleted: false,
      status: { $nin: ["draft", "cancelled"] },
      "assignedBatches.batch": { $in: batchIds },
      "excludedStudents.student": { $ne: studentId },
    })
      .populate("course", "courseId courseName")
      .populate("teacherUser", "name email profile");

    if (!test) return res.status(404).json({ success: false, message: "Assigned test not found." });

    const now = new Date();
    const status = computeLifecycleStatus(test, now);
    const startAt = test.schedule?.startAt ? new Date(test.schedule.startAt) : null;
    const endAt = test.schedule?.endAt ? new Date(test.schedule.endAt) : null;
    if (status !== "live" || test.schedule?.isPaused || (startAt && now < startAt) || (endAt && now >= endAt)) {
      return res.status(400).json({ success: false, message: "Test paper is available only during the selected test time." });
    }

    const assignedBatchIds = (test.assignedBatches || []).map((item) => String(item.batch));
    const studentBatch = batchIds.find((batchId) => assignedBatchIds.includes(String(batchId)));
    let attempt = await TestAttempt.findOne({ test: test._id, student: studentId });

    if (attempt && ["submitted", "auto_submitted", "graded"].includes(attempt.status)) {
      return res.status(400).json({ success: false, message: "You have already submitted this test." });
    }

    if (!attempt) {
      attempt = await TestAttempt.create({
        test: test._id,
        student: studentId,
        batch: studentBatch,
        startedAt: now,
        expiresAt: endAt,
        status: "in_progress",
      });
    } else {
      attempt.status = "in_progress";
      attempt.startedAt = attempt.startedAt || now;
      attempt.expiresAt = attempt.expiresAt || endAt;
      await attempt.save();
    }

    res.status(200).json({
      success: true,
      data: {
        test: {
          ...serializeStudentTest(test, attempt, now),
          questions: (test.questions || []).map((question, index) => sanitizeQuestionForStudent(question, index)),
          settings: {
            layout: test.settings?.layout || "all_questions",
            allowBackNavigation: test.settings?.allowBackNavigation !== false,
          },
        },
        attempt,
      },
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

export const submitMyStudentTest = async (req, res) => {
  try {
    const studentUser = await getStudentPortalUser(req);
    const studentId = String(studentUser.student);
    const test = await Test.findOne({ _id: req.params.id, isDeleted: false });
    if (!test) return res.status(404).json({ success: false, message: "Test not found." });

    const now = new Date();
    const attempt = await TestAttempt.findOne({ test: test._id, student: studentId });
    if (!attempt) return res.status(404).json({ success: false, message: "Start the test before submitting." });
    if (["submitted", "auto_submitted", "graded"].includes(attempt.status)) {
      return res.status(400).json({ success: false, message: "This test is already submitted." });
    }

    const endAt = test.schedule?.endAt ? new Date(test.schedule.endAt) : null;
    const grading = gradeTestAttempt(test.toObject(), req.body.answers || []);
    attempt.answers = grading.answers;
    attempt.score = grading.score;
    attempt.percentage = grading.percentage;
    attempt.passed = grading.passed;
    attempt.submittedAt = now;
    attempt.status = endAt && now > endAt ? "auto_submitted" : "submitted";
    await attempt.save();

    res.status(200).json({
      success: true,
      message: "Test submitted successfully",
      data: {
        attemptId: attempt._id,
        status: attempt.status,
        score: attempt.score,
        percentage: attempt.percentage,
        passed: attempt.passed,
      },
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

export const getTests = async (req, res) => {
  try {
    const { status, search, courseId } = req.query;
    const courseIds = await getAssignedCourseIds(req);
    const filter = {
      isDeleted: false,
      course: { $in: courseId ? [courseId] : courseIds },
    };
    if (!(req.currentUser?.isSuperAdmin || req.user?.isSuperAdmin)) {
      filter.teacherUser = getUserId(req);
    }
    if (status && status !== "all") filter.status = status;
    if (search) filter.title = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

    const tests = await Test.find(filter)
      .populate("course", "courseId courseName")
      .populate("assignedBatches.batch", "batchName batchCode")
      .sort({ createdAt: -1 });

    const now = new Date();
    const normalized = await Promise.all(
      tests.map(async (test) => {
        const nextStatus = computeLifecycleStatus(test, now);
        if (test.status !== nextStatus) {
          test.status = nextStatus;
          await test.save();
        }
        return attachAssignmentStats(test);
      }),
    );

    res.status(200).json({ success: true, data: normalized });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

export const getTestById = async (req, res) => {
  try {
    const test = await Test.findOne({ _id: req.params.id, isDeleted: false })
      .populate("course", "courseId courseName")
      .populate("assignedBatches.batch", "batchName batchCode shift status")
      .populate("excludedStudents.student", "studentName registrationNo")
      .lean();
    if (!test) return res.status(404).json({ success: false, message: "Test not found" });
    await assertCourseAccess(req, test.course?._id || test.course);
    if (!(req.currentUser?.isSuperAdmin || req.user?.isSuperAdmin) && String(test.teacherUser) !== String(getUserId(req))) {
      return res.status(403).json({ success: false, message: "You can only view your own tests." });
    }
    res.status(200).json({ success: true, data: await attachAssignmentStats(test) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

export const getTestAttempts = async (req, res) => {
  try {
    const test = await Test.findOne({ _id: req.params.id, isDeleted: false }).lean();
    if (!test) return res.status(404).json({ success: false, message: "Test not found" });
    await assertCourseAccess(req, test.course);
    if (!(req.currentUser?.isSuperAdmin || req.user?.isSuperAdmin) && String(test.teacherUser) !== String(getUserId(req))) {
      return res.status(403).json({ success: false, message: "You can only view submissions for your own tests." });
    }

    const attempts = await TestAttempt.find({ test: test._id })
      .populate("student", "studentName registrationNo mobileNumber emailAddress")
      .populate("batch", "batchName batchCode")
      .sort({ submittedAt: -1, updatedAt: -1 })
      .lean();

    const batchIds = (test.assignedBatches || []).map((item) => item.batch);
    const excluded = new Set((test.excludedStudents || []).map((item) => String(item.student)));
    const enrollments = batchIds.length
      ? await Enrollment.find({ batch: { $in: batchIds }, status: { $in: ["Active", "Completed", "On Hold"] } })
          .populate("student", "studentName registrationNo mobileNumber emailAddress")
          .populate("batch", "batchName batchCode")
          .lean()
      : [];
    const attemptStudentIds = new Set(attempts.map((attempt) => String(attempt.student?._id || attempt.student)));
    const missingAttempts = [];
    const seenMissingStudents = new Set();

    enrollments.forEach((enrollment) => {
      const studentId = String(enrollment.student?._id || enrollment.student || "");
      if (!studentId || excluded.has(studentId) || attemptStudentIds.has(studentId) || seenMissingStudents.has(studentId)) return;
      seenMissingStudents.add(studentId);
      missingAttempts.push({
        _id: `not-started-${test._id}-${studentId}`,
        status: "not_started",
        student: enrollment.student,
        batch: enrollment.batch,
        startedAt: null,
        submittedAt: null,
        score: 0,
        percentage: 0,
        passed: false,
        answers: [],
        synthetic: true,
      });
    });

    res.status(200).json({
      success: true,
      data: [...attempts, ...missingAttempts].map((attempt) => ({
        _id: attempt._id,
        status: attempt.status,
        student: attempt.student,
        batch: attempt.batch,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        score: attempt.score,
        percentage: attempt.percentage,
        passed: attempt.passed,
        answers: attempt.answers,
      })),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

export const reassignRemainingStudents = async (req, res) => {
  try {
    const test = await Test.findOne({ _id: req.params.id, isDeleted: false });
    if (!test) return res.status(404).json({ success: false, message: "Test not found" });
    await assertCourseAccess(req, test.course);
    if (!(req.currentUser?.isSuperAdmin || req.user?.isSuperAdmin) && String(test.teacherUser) !== String(getUserId(req))) {
      return res.status(403).json({ success: false, message: "You can only reassign your own tests." });
    }

    const { startAt, endAt, durationMinutes } = req.body || {};
    const nextStart = startAt ? new Date(startAt) : null;
    const nextEnd = endAt ? new Date(endAt) : null;
    if (!nextStart || !nextEnd || Number.isNaN(nextStart.getTime()) || Number.isNaN(nextEnd.getTime())) {
      return res.status(400).json({ success: false, message: "Start and end time are required." });
    }
    if (nextEnd <= nextStart) {
      return res.status(400).json({ success: false, message: "End time must be after start time." });
    }

    const before = test.toObject();
    const submittedStatuses = ["submitted", "auto_submitted", "graded"];
    const remainingAttempts = await TestAttempt.find({
      test: test._id,
      status: { $nin: submittedStatuses },
    });

    await Promise.all(
      remainingAttempts.map((attempt) => {
        attempt.status = "not_started";
        attempt.startedAt = null;
        attempt.expiresAt = null;
        attempt.submittedAt = null;
        attempt.lastAutosaveAt = null;
        return attempt.save();
      }),
    );

    test.schedule.startAt = nextStart;
    test.schedule.endAt = nextEnd;
    test.schedule.durationMinutes = Number(durationMinutes || test.schedule.durationMinutes || 60);
    test.schedule.isPaused = false;
    test.schedule.pausedAt = null;
    test.status = computeLifecycleStatus({ ...test.toObject(), status: "scheduled" });
    if (test.status === "draft" || test.status === "completed") test.status = "scheduled";
    await test.save();

    const stats = await attachAssignmentStats(test);
    const remainingCount =
      (stats.attemptCounts?.not_started || 0) +
      (stats.attemptCounts?.in_progress || 0) +
      (stats.attemptCounts?.expired || 0);

    await createAudit(test, req, "reassigned_remaining", before, test.toObject(), `Remaining students: ${remainingCount}`);
    res.status(200).json({
      success: true,
      message: `Test reassigned for ${remainingCount} remaining student(s). Submitted students are kept completed.`,
      data: stats,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

export const saveTest = async (req, res) => {
  try {
    const payload = buildTestPayload(req.body);
    await assertBatchAccess(req, payload.course, payload.assignedBatches.map((item) => item.batch));
    const test = await Test.create({
      ...payload,
      teacherUser: getUserId(req),
      status: "draft",
    });
    await syncQuestionBank(test, req);
    await createAudit(test, req, "created", null, payload);
    res.status(201).json({ success: true, message: "Test draft saved", data: await attachAssignmentStats(test) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

export const updateTest = async (req, res) => {
  try {
    const test = await Test.findOne({ _id: req.params.id, isDeleted: false });
    if (!test) return res.status(404).json({ success: false, message: "Test not found" });
    await assertCourseAccess(req, test.course);
    if (!(req.currentUser?.isSuperAdmin || req.user?.isSuperAdmin) && String(test.teacherUser) !== String(getUserId(req))) {
      return res.status(403).json({ success: false, message: "You can only edit your own tests." });
    }
    if (["live", "completed"].includes(test.status)) {
      return res.status(400).json({ success: false, message: "Started tests only allow limited edits in a later phase." });
    }

    const before = test.toObject();
    const payload = buildTestPayload(req.body, test);
    await assertBatchAccess(req, payload.course, payload.assignedBatches.map((item) => item.batch));
    Object.assign(test, payload);
    await test.save();
    await syncQuestionBank(test, req);
    await createAudit(test, req, "updated", before, test.toObject());
    res.status(200).json({ success: true, message: "Test updated", data: await attachAssignmentStats(test) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

export const publishTest = async (req, res) => {
  try {
    const test = await Test.findOne({ _id: req.params.id, isDeleted: false });
    if (!test) return res.status(404).json({ success: false, message: "Test not found" });
    await assertCourseAccess(req, test.course);
    if (!(req.currentUser?.isSuperAdmin || req.user?.isSuperAdmin) && String(test.teacherUser) !== String(getUserId(req))) {
      return res.status(403).json({ success: false, message: "You can only publish your own tests." });
    }
    const errors = validatePublishable(test.toObject());
    if (errors.length) return res.status(400).json({ success: false, message: errors.join(" ") });
    const before = test.toObject();
    test.status = computeLifecycleStatus({ ...test.toObject(), status: "scheduled" });
    if (test.status === "draft") test.status = "scheduled";
    test.publishedAt = new Date();
    await test.save();
    await createAudit(test, req, "published", before, test.toObject());
    res.status(200).json({ success: true, message: "Test published", data: await attachAssignmentStats(test) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

export const pauseTestTimer = async (req, res) => {
  try {
    const test = await Test.findOne({ _id: req.params.id, isDeleted: false });
    if (!test) return res.status(404).json({ success: false, message: "Test not found" });
    await assertCourseAccess(req, test.course);
    if (!(req.currentUser?.isSuperAdmin || req.user?.isSuperAdmin) && String(test.teacherUser) !== String(getUserId(req))) {
      return res.status(403).json({ success: false, message: "You can only pause your own tests." });
    }

    const now = new Date();
    const nextStatus = computeLifecycleStatus(test, now);
    if (nextStatus !== "live") {
      return res.status(400).json({ success: false, message: "Only live tests can be paused." });
    }
    if (test.schedule?.isPaused) {
      return res.status(200).json({ success: true, message: "Test timer is already paused", data: await attachAssignmentStats(test) });
    }

    const before = test.toObject();
    test.status = "live";
    test.schedule.isPaused = true;
    test.schedule.pausedAt = now;
    await test.save();
    await createAudit(test, req, "timer_paused", before, test.toObject());
    res.status(200).json({ success: true, message: "Test timer paused", data: await attachAssignmentStats(test) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

export const resumeTestTimer = async (req, res) => {
  try {
    const test = await Test.findOne({ _id: req.params.id, isDeleted: false });
    if (!test) return res.status(404).json({ success: false, message: "Test not found" });
    await assertCourseAccess(req, test.course);
    if (!(req.currentUser?.isSuperAdmin || req.user?.isSuperAdmin) && String(test.teacherUser) !== String(getUserId(req))) {
      return res.status(403).json({ success: false, message: "You can only continue your own tests." });
    }
    if (test.status !== "live" || !test.schedule?.isPaused || !test.schedule?.pausedAt) {
      return res.status(400).json({ success: false, message: "This test timer is not paused." });
    }

    const now = new Date();
    const pausedMs = Math.max(0, now.getTime() - new Date(test.schedule.pausedAt).getTime());
    const before = test.toObject();
    test.schedule.endAt = test.schedule.endAt
      ? new Date(new Date(test.schedule.endAt).getTime() + pausedMs)
      : test.schedule.endAt;
    test.schedule.totalPausedMs = Number(test.schedule.totalPausedMs || 0) + pausedMs;
    test.schedule.isPaused = false;
    test.schedule.pausedAt = null;
    await test.save();

    const inProgressAttempts = await TestAttempt.find({ test: test._id, status: "in_progress", expiresAt: { $ne: null } });
    await Promise.all(
      inProgressAttempts.map((attempt) => {
        attempt.expiresAt = new Date(new Date(attempt.expiresAt).getTime() + pausedMs);
        return attempt.save();
      }),
    );

    await createAudit(test, req, "timer_resumed", before, test.toObject());
    res.status(200).json({ success: true, message: "Test timer continued", data: await attachAssignmentStats(test) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

export const getTeacherPaperHeader = async (req, res) => {
  try {
    const user = await UserAuth.findById(getUserId(req)).lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.status(200).json({
      success: true,
      data: normalizePaperHeader(user.testPaperHeader || {}),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

export const updateTeacherPaperHeader = async (req, res) => {
  try {
    const user = await UserAuth.findById(getUserId(req));
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    user.testPaperHeader = normalizePaperHeader(req.body || {});
    await user.save();
    res.status(200).json({
      success: true,
      message: "Test paper header saved",
      data: normalizePaperHeader(user.testPaperHeader || {}),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

export const updateTestPaperHeader = async (req, res) => {
  try {
    const test = await Test.findOne({ _id: req.params.id, isDeleted: false });
    if (!test) return res.status(404).json({ success: false, message: "Test not found" });
    await assertCourseAccess(req, test.course);
    if (!(req.currentUser?.isSuperAdmin || req.user?.isSuperAdmin) && String(test.teacherUser) !== String(getUserId(req))) {
      return res.status(403).json({ success: false, message: "You can only update your own test paper header." });
    }

    const before = test.toObject();
    test.settings = {
      ...(test.settings?.toObject ? test.settings.toObject() : test.settings || {}),
      paperHeader: normalizePaperHeader(req.body || {}),
    };
    await test.save();
    await createAudit(test, req, "paper_header_updated", before, test.toObject());
    res.status(200).json({ success: true, message: "Test paper header saved", data: await attachAssignmentStats(test) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

export const deleteTest = async (req, res) => {
  try {
    const test = await Test.findOne({ _id: req.params.id, isDeleted: false });
    if (!test) return res.status(404).json({ success: false, message: "Test not found" });
    if (test.status !== "draft") return res.status(400).json({ success: false, message: "Only draft tests can be deleted." });
    await assertCourseAccess(req, test.course);
    test.isDeleted = true;
    await test.save();
    await createAudit(test, req, "deleted");
    res.status(200).json({ success: true, message: "Draft test deleted" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

export const duplicateTest = async (req, res) => {
  try {
    const test = await Test.findOne({ _id: req.params.id, isDeleted: false }).lean();
    if (!test) return res.status(404).json({ success: false, message: "Test not found" });
    await assertCourseAccess(req, test.course);
    const duplicate = await Test.create({
      ...test,
      _id: undefined,
      title: `${test.title} Copy`,
      status: "draft",
      publishedAt: null,
      createdAt: undefined,
      updatedAt: undefined,
      teacherUser: getUserId(req),
    });
    await createAudit(duplicate, req, "duplicated", { sourceTest: test._id }, duplicate.toObject());
    res.status(201).json({ success: true, message: "Test duplicated", data: await attachAssignmentStats(duplicate) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

export const getQuestionBank = async (req, res) => {
  try {
    const courseIds = await getAssignedCourseIds(req);
    const filter = {
      isDeleted: false,
      course: { $in: req.query.courseId ? [req.query.courseId] : courseIds },
      $or: [{ owner: getUserId(req) }, { isShared: true }],
    };
    if (req.query.questionType) filter.questionType = req.query.questionType;
    const data = await QuestionBank.find(filter).sort({ createdAt: -1 }).lean();
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

export const importQuestionBank = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
    const { courseId } = req.body;
    await assertCourseAccess(req, courseId);
    const workbook = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
    const rows = workbook.SheetNames[0]
      ? XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "", raw: false })
      : [];
    const docs = rows
      .map((row) => normalizeQuestion({
        questionText: row.Question || row.questionText,
        questionType: row.Type || row.questionType || "mcq_single",
        difficulty: String(row.Difficulty || "medium").toLowerCase(),
        marks: row.Marks || 1,
        options: ["Option A", "Option B", "Option C", "Option D"]
          .map((key) => row[key])
          .filter(Boolean)
          .map((text, index) => ({
            text,
            isCorrect: String(row["Correct Answer"] || "").split(",").map((item) => item.trim().toUpperCase()).includes(String.fromCharCode(65 + index)),
          })),
        correctAnswers: String(row["Correct Answer"] || "").split(",").map((item) => item.trim()).filter(Boolean),
        modelAnswer: row["Model Answer"] || "",
        explanation: row.Explanation || "",
        tags: row.Tags || "",
      }))
      .filter((question) => question.questionText)
      .map((question) => ({
        owner: getUserId(req),
        course: courseId,
        topic: stripUnsafeHtml(req.body.topic || ""),
        questionType: question.questionType,
        difficulty: question.difficulty,
        questionText: question.questionText,
        options: question.options,
        correctAnswers: question.correctAnswers,
        modelAnswer: question.modelAnswer,
        explanation: question.explanation,
        defaultMarks: question.marks,
        tags: question.tags,
      }));

    if (docs.length) await QuestionBank.insertMany(docs, { ordered: false });
    res.status(200).json({ success: true, message: "Questions imported", data: { imported: docs.length } });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};
