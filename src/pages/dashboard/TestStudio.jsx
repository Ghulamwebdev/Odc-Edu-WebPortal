import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Card,
  Checkbox,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Statistic,
  Steps,
  Switch,
  Table,
  Tabs,
  Tag,
  Upload,
  message,
} from "antd";
import {
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FileExcelOutlined,
  PlusOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SaveOutlined,
  SendOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import { ClipboardList, Clock, FileQuestion, Users } from "lucide-react";
import { useModulePermissions } from "../../hooks/usePermissions";
import useZustandStore from "../../stores/zustandStore";
import {
  createTest,
  deleteTest,
  duplicateTest,
  getTeacherPaperHeader,
  getTestById,
  getTestAttempts,
  getQuestionBank,
  getTests,
  getTestStudioOptions,
  importQuestionBank,
  pauseTestTimer,
  previewTestAssignment,
  publishTest,
  publishTestResults,
  reassignRemainingStudents,
  resumeTestTimer,
  updateTest,
} from "../../services/testStudioService";

const questionTypeOptions = [
  { label: "MCQ - Single Correct", value: "mcq_single" },
  { label: "MCQ - Multiple Select", value: "mcq_multiple" },
  { label: "True / False", value: "true_false" },
  { label: "Short Answer", value: "short_answer" },
  { label: "Long Answer / Essay", value: "long_answer" },
  { label: "Fill in the Blanks", value: "fill_blank" },
];

const difficultyOptions = [
  { label: "Easy", value: "easy" },
  { label: "Medium", value: "medium" },
  { label: "Hard", value: "hard" },
];

const emptyQuestion = (order = 0, questionType = "mcq_single") => ({
  order,
  questionType,
  difficulty: "medium",
  questionText: "",
  options:
    questionType === "true_false"
      ? [
          { text: "True", isCorrect: true },
          { text: "False", isCorrect: false },
        ]
      : [
          { text: "", isCorrect: true },
          { text: "", isCorrect: false },
          { text: "", isCorrect: false },
          { text: "", isCorrect: false },
        ],
  correctAnswers: [],
  modelAnswer: "",
  explanation: "",
  marks: 1,
  negativeMarks: 0,
  tags: [],
});

const statusColors = {
  draft: "default",
  scheduled: "blue",
  live: "green",
  completed: "purple",
  cancelled: "red",
};

const defaultPaperHeader = {
  logo: "",
  logoText: "",
  academyName: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  note: "",
};

const TestStudio = ({ setupMode = false, detailMode = false }) => {
  const navigate = useNavigate();
  const { id: routeTestId } = useParams();
  const permissions = useModulePermissions("test_studio");
  const adminInfo = useZustandStore((state) => state.adminInfo);
  const employeeMode =
    String(adminInfo?.userData?.role || "").toLowerCase() === "employee";
  const canCreateTest = employeeMode || permissions.create;
  const canUpdateTest = employeeMode || permissions.update;
  const canPublishTest = employeeMode || permissions.approve;
  const canDeleteTest = employeeMode || permissions.delete;
  const [tests, setTests] = useState([]);
  const [options, setOptions] = useState([]);
  const [questionBank, setQuestionBank] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importingQuestions, setImportingQuestions] = useState(false);
  const [formRevision, setFormRevision] = useState(0);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingTest, setEditingTest] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [questions, setQuestions] = useState([emptyQuestion()]);
  const [teacherQuestionIndex, setTeacherQuestionIndex] = useState(0);
  const [paperPreviewOpen, setPaperPreviewOpen] = useState(false);
  const [sections, setSections] = useState([]);
  const [assignmentPreview, setAssignmentPreview] = useState(null);
  const [filters, setFilters] = useState({ status: "all", search: "" });
  const [detailTest, setDetailTest] = useState(null);
  const [detailAttempts, setDetailAttempts] = useState([]);
  const [detailAttemptsLoading, setDetailAttemptsLoading] = useState(false);
  const [detailFilters, setDetailFilters] = useState({
    batchId: "all",
    result: "all",
    answerResult: "all",
    search: "",
  });
  const [localRecoveryDraft, setLocalRecoveryDraft] = useState(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [reassignTest, setReassignTest] = useState(null);
  const [teacherPaperHeader, setTeacherPaperHeader] = useState(defaultPaperHeader);
  const [nowTick, setNowTick] = useState(dayjs());
  const [courseDetailsOpen, setCourseDetailsOpen] = useState(false);
  const [form] = Form.useForm();
  const [reassignForm] = Form.useForm();
  const autoSaveTestIdRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const autoSaveQueueRef = useRef(Promise.resolve());
  const draftVersionRef = useRef(0);
  const autoSaveErrorShownRef = useRef(false);
  const localStorageErrorShownRef = useRef(false);
  const selectedCourse = Form.useWatch("course", { form, preserve: true });
  const selectedBatchIds = Form.useWatch("batchIds", { form, preserve: true }) || [];
  const selectedQuestionLayout =
    Form.useWatch(["settings", "layout"], { form, preserve: true }) || "all_questions";
  const submittedDetailAttempts = useMemo(
    () => detailAttempts.filter((attempt) => ["submitted", "auto_submitted", "graded"].includes(attempt.status)),
    [detailAttempts],
  );
  const rankedDetailAttempts = useMemo(
    () =>
      [...submittedDetailAttempts].sort((left, right) => {
        const scoreDifference = Number(right.score || 0) - Number(left.score || 0);
        if (scoreDifference) return scoreDifference;
        const percentageDifference = Number(right.percentage || 0) - Number(left.percentage || 0);
        if (percentageDifference) return percentageDifference;
        return new Date(left.submittedAt || 0) - new Date(right.submittedAt || 0);
      }),
    [submittedDetailAttempts],
  );
  const positionByAttemptId = useMemo(
    () => new Map(rankedDetailAttempts.slice(0, 3).map((attempt, index) => [String(attempt._id), index + 1])),
    [rankedDetailAttempts],
  );
  const detailPerformanceSummary = useMemo(() => {
    const answerTotals = submittedDetailAttempts.reduce(
      (totals, attempt) => {
        (attempt.answers || []).forEach((answer) => {
          const answered = (answer.selectedOptions || []).length > 0 || Boolean(String(answer.textAnswer || "").trim());
          if (!answered) {
            totals.unanswered += 1;
          } else if (answer.isCorrect === true) {
            totals.right += 1;
          } else if (answer.autoGraded !== false) {
            totals.wrong += 1;
          } else {
            totals.needsReview += 1;
          }
        });
        return totals;
      },
      { right: 0, wrong: 0, unanswered: 0, needsReview: 0 },
    );
    const passed = submittedDetailAttempts.filter((attempt) => attempt.passed).length;
    const failed = submittedDetailAttempts.length - passed;
    const scoreTotal = submittedDetailAttempts.reduce((total, attempt) => total + Number(attempt.score || 0), 0);
    const percentageTotal = submittedDetailAttempts.reduce((total, attempt) => total + Number(attempt.percentage || 0), 0);

    return {
      submitted: submittedDetailAttempts.length,
      passed,
      failed,
      remaining: Math.max(0, Number(detailTest?.studentCount || 0) - submittedDetailAttempts.length),
      inProgress: detailAttempts.filter((attempt) => attempt.status === "in_progress").length,
      notStarted: detailAttempts.filter((attempt) => attempt.status === "not_started").length,
      averageScore: submittedDetailAttempts.length ? Math.round((scoreTotal / submittedDetailAttempts.length) * 100) / 100 : 0,
      averagePercentage: submittedDetailAttempts.length
        ? Math.round((percentageTotal / submittedDetailAttempts.length) * 100) / 100
        : 0,
      ...answerTotals,
    };
  }, [detailAttempts, detailTest?.studentCount, submittedDetailAttempts]);
  const visibleDetailAttempts = useMemo(() => {
    const keyword = detailFilters.search.trim().toLowerCase();
    const orderedAttempts = [
      ...rankedDetailAttempts.slice(0, 3),
      ...rankedDetailAttempts.slice(3),
      ...detailAttempts.filter((attempt) => !["submitted", "auto_submitted", "graded"].includes(attempt.status)),
    ];

    return orderedAttempts.filter((attempt) => {
      const batchId = String(attempt.batch?._id || attempt.batch || "");
      const isSubmitted = ["submitted", "auto_submitted", "graded"].includes(attempt.status);
      const matchesResult =
        detailFilters.result === "all" ||
        (detailFilters.result === "remaining" && !isSubmitted) ||
        (detailFilters.result === "passed" && isSubmitted && attempt.passed) ||
        (detailFilters.result === "failed" && isSubmitted && !attempt.passed);
      const answerCounts = (attempt.answers || []).reduce(
        (counts, answer) => {
          const answered = (answer.selectedOptions || []).length > 0 || Boolean(String(answer.textAnswer || "").trim());
          if (!answered) return counts;
          if (answer.isCorrect === true) counts.right += 1;
          else if (answer.autoGraded !== false) counts.wrong += 1;
          else counts.needsReview += 1;
          return counts;
        },
        { right: 0, wrong: 0, needsReview: 0 },
      );
      const matchesAnswerResult =
        detailFilters.answerResult === "all" ||
        (detailFilters.answerResult === "has_wrong" && answerCounts.wrong > 0) ||
        (detailFilters.answerResult === "all_right" && isSubmitted && answerCounts.right > 0 && !answerCounts.wrong && !answerCounts.needsReview) ||
        (detailFilters.answerResult === "needs_review" && answerCounts.needsReview > 0);
      const searchValue = [
        attempt.student?.studentName,
        attempt.student?.registrationNo,
        attempt.batch?.batchName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (detailFilters.batchId === "all" || batchId === detailFilters.batchId) &&
        matchesResult &&
        matchesAnswerResult &&
        (!keyword || searchValue.includes(keyword))
      );
    });
  }, [detailAttempts, detailFilters, rankedDetailAttempts]);

  const testStudioBasePath = employeeMode
    ? "/employee-dashboard/test-studio"
    : "/dashboard/test-studio";
  const localDraftKey = `test-studio-draft:${adminInfo?.userData?._id || adminInfo?.userData?.email || "current"}`;

  useEffect(() => {
    if (setupMode) return;
    try {
      const snapshot = JSON.parse(localStorage.getItem(localDraftKey) || "null");
      setLocalRecoveryDraft(snapshot?.values ? snapshot : null);
    } catch (error) {
      message.error("Could not read the browser recovery draft.");
      console.error("Failed to read local test draft", error);
    }
  }, [setupMode, localDraftKey]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [testsResponse, optionsResponse] = await Promise.all([
        setupMode ? Promise.resolve({ data: [] }) : getTests(filters),
        getTestStudioOptions(),
      ]);
      if (!setupMode) {
        setTests(testsResponse.data || []);
      }
      setOptions(optionsResponse.data || []);
    } catch (error) {
      message.error(error.message || "Failed to load Test Studio");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filters.status]);

  useEffect(() => {
    if (!detailMode || !routeTestId) return;

    setDetailFilters({ batchId: "all", result: "all", answerResult: "all", search: "" });
    const loadDetailTest = async () => {
      setLoading(true);
      try {
        const response = await getTestById(routeTestId);
        setDetailTest(response.data || null);
      } catch (error) {
        message.error(error.message || "Failed to load test details");
        navigate(testStudioBasePath);
      } finally {
        setLoading(false);
      }
    };

    loadDetailTest();
  }, [detailMode, routeTestId]);

  useEffect(() => {
    const loadPaperHeader = async () => {
      try {
        const response = await getTeacherPaperHeader();
        setTeacherPaperHeader({ ...defaultPaperHeader, ...(response.data || {}) });
      } catch {
        setTeacherPaperHeader(defaultPaperHeader);
      }
    };
    loadPaperHeader();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(dayjs()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const loadBank = async () => {
      if (!selectedCourse) {
        setQuestionBank([]);
        return;
      }
      try {
        const response = await getQuestionBank({ courseId: selectedCourse });
        setQuestionBank(response.data || []);
      } catch {
        setQuestionBank([]);
      }
    };
    loadBank();
  }, [selectedCourse]);

  const loadDetailAttempts = async (testId = detailTest?._id) => {
    if (!testId) {
      setDetailAttempts([]);
      return;
    }
    setDetailAttemptsLoading(true);
    try {
      const response = await getTestAttempts(testId);
      setDetailAttempts(response.data || []);
    } catch (error) {
      message.error(error.message || "Failed to load submitted papers");
    } finally {
      setDetailAttemptsLoading(false);
    }
  };

  useEffect(() => {
    loadDetailAttempts();
  }, [detailTest?._id]);

  const courses = options;
  const allAssignedBatches = useMemo(
    () =>
      options.flatMap((course) =>
        (course.batches || []).map((batch) => ({
          ...batch,
          courseName: course.courseName,
          courseCode: course.courseId,
          courseId: course._id,
        })),
      ),
    [options],
  );
  const batches = useMemo(
    () =>
      selectedCourse
        ? allAssignedBatches.filter(
            (batch) => String(batch.courseId || batch.course) === String(selectedCourse),
          )
        : allAssignedBatches,
    [allAssignedBatches, selectedCourse],
  );
  const selectedCourseId =
    selectedCourse && typeof selectedCourse === "object"
      ? selectedCourse._id
      : selectedCourse;
  const selectedCourseIds = [
    ...new Set(
      [
        selectedCourseId,
        ...allAssignedBatches
          .filter((batch) =>
            selectedBatchIds.some((id) => String(id?._id || id) === String(batch._id)),
          )
          .map((batch) => batch.courseId || batch.course),
      ]
        .map((id) => String(id || ""))
        .filter(Boolean),
    ),
  ];
  const selectedCourseRecords = selectedCourseIds.map(
    (courseId) =>
      options.find((course) => String(course._id) === courseId) ||
      allAssignedBatches.find((batch) => String(batch.courseId || batch.course) === courseId),
  );

  const createScheduleWindow = (dayOffset = 0) => {
    const durationMinutes = Number(form.getFieldValue(["schedule", "durationMinutes"]) || 60);
    const startAt = dayjs()
      .add(dayOffset, "day")
      .add(dayOffset === 0 ? 10 : 0, "minute")
      .second(0)
      .millisecond(0);

    return {
      startAt,
      endAt: startAt.add(durationMinutes, "minute"),
      durationMinutes,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Karachi",
    };
  };

  const applyQuickSchedule = (dayOffset = 0) => {
    form.setFieldsValue({
      schedule: {
        ...form.getFieldValue("schedule"),
        ...createScheduleWindow(dayOffset),
      },
    });
  };

  const summary = useMemo(
    () => ({
      total: tests.length,
      upcoming: tests.filter((test) => test.status === "scheduled").length,
      live: tests.filter((test) => test.status === "live").length,
      completed: tests.filter((test) => test.status === "completed").length,
    }),
    [tests],
  );

  const filteredTests = useMemo(() => {
    const keyword = filters.search.trim().toLowerCase();
    if (!keyword) return tests;
    return tests.filter((test) =>
      [test.title, test.course?.courseName, test.topic, test.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }, [tests, filters.search]);

  const openCreateWizard = () => {
    if (!canCreateTest) return message.warning("You do not have permission to create tests.");
    autoSaveTestIdRef.current = null;
    setEditingTest(null);
    setCurrentStep(0);
    setQuestions([emptyQuestion()]);
    setTeacherQuestionIndex(0);
    setPaperPreviewOpen(false);
    setSections([]);
    setAssignmentPreview(null);
    form.resetFields();
    form.setFieldsValue({
      allowedQuestionTypes: ["mcq_single"],
      totalMarks: 1,
      passingMarks: 0,
      schedule: {
        ...createScheduleWindow(0),
        allowLateEntry: true,
        graceMinutes: 0,
      },
      batchIds: [],
      excludedStudentIds: [],
      settings: {
        resultVisibility: "after_publish",
        attemptsAllowed: 1,
        layout: "all_questions",
        allowBackNavigation: true,
        antiCheating: {
          trackTabSwitch: true,
          maxWarnings: 3,
          autoSubmitOnViolation: true,
          disableCopyPaste: true,
          disableRightClick: true,
        },
      },
    });
    setFormRevision((revision) => revision + 1);
    if (setupMode) {
      return;
    }
    navigate(`${testStudioBasePath}/create`);
  };

  useEffect(() => {
    if (setupMode) {
      openCreateWizard();
    }
  }, [setupMode]);

  const openEditWizard = (test) => {
    if (!permissions.update) return message.warning("You do not have permission to edit tests.");
    autoSaveTestIdRef.current = test.status === "draft" ? test._id : null;
    setEditingTest(test);
    setCurrentStep(Math.max(0, Math.min(6, Number(test.wizardStep || 0))));
    setQuestions((test.questions || []).map((question, index) => ({ ...question, order: index })));
    setTeacherQuestionIndex(0);
    setPaperPreviewOpen(false);
    setSections(test.sections || []);
    setAssignmentPreview(null);
    form.resetFields();
    form.setFieldsValue({
      title: test.title,
      description: test.description,
      instructions: test.instructions,
      course: test.course?._id || test.course,
      topic: test.topic,
      allowedQuestionTypes: test.allowedQuestionTypes || [],
      totalMarks: test.totalMarks,
      passingMarks: test.passingMarks,
      passingPercentage: test.passingPercentage,
      negativeMarking: test.negativeMarking || { enabled: false, value: 0 },
      schedule: {
        ...test.schedule,
        startAt: test.schedule?.startAt ? dayjs(test.schedule.startAt) : null,
        endAt: test.schedule?.endAt ? dayjs(test.schedule.endAt) : null,
      },
      batchIds: (test.assignedBatches || []).map((item) => item.batch?._id || item.batch),
      excludedStudentIds: (test.excludedStudents || []).map((item) => item.student?._id || item.student),
      settings: test.settings || {},
    });
    setFormRevision((revision) => revision + 1);
    setWizardOpen(true);
  };

  const buildPayload = useCallback(() => {
    const values = form.getFieldsValue(true);
    const cleanedQuestions = questions
      .map((question, index) => ({
        ...question,
        order: index,
        questionText: String(question.questionText || "").trim(),
      }))
      .filter((question) => question.questionText);

    return {
      ...values,
      sections,
      wizardStep: currentStep,
      questions: cleanedQuestions.map((question, index) => ({
        ...question,
        order: index,
        correctAnswers:
          ["mcq_single", "mcq_multiple", "true_false"].includes(question.questionType)
            ? (question.options || [])
                .map((option, optionIndex) => (option.isCorrect ? String(option._id || optionIndex) : null))
                .filter(Boolean)
            : question.correctAnswers || [],
      })),
      schedule: {
        ...values.schedule,
        startAt: values.schedule?.startAt ? values.schedule.startAt.toISOString() : null,
        endAt: values.schedule?.endAt ? values.schedule.endAt.toISOString() : null,
      },
    };
  }, [form, questions, sections, currentStep]);

  const continueLocalRecoveryDraft = () => {
    if (!localRecoveryDraft) return;
    autoSaveTestIdRef.current = null;
    setEditingTest(null);
    form.setFieldsValue({
      ...localRecoveryDraft.values,
      schedule: {
        ...localRecoveryDraft.values.schedule,
        startAt: localRecoveryDraft.values.schedule?.startAt ? dayjs(localRecoveryDraft.values.schedule.startAt) : null,
        endAt: localRecoveryDraft.values.schedule?.endAt ? dayjs(localRecoveryDraft.values.schedule.endAt) : null,
      },
    });
    setQuestions(
      Array.isArray(localRecoveryDraft.questions) && localRecoveryDraft.questions.length
        ? localRecoveryDraft.questions
        : [emptyQuestion()],
    );
    setTeacherQuestionIndex(0);
    setPaperPreviewOpen(false);
    setSections(Array.isArray(localRecoveryDraft.sections) ? localRecoveryDraft.sections : []);
    setCurrentStep(Number.isInteger(localRecoveryDraft.currentStep) ? localRecoveryDraft.currentStep : 0);
    setAssignmentPreview(null);
    setFormRevision((revision) => revision + 1);
    setWizardOpen(true);
  };

  const discardLocalRecoveryDraft = () => {
    try {
      localStorage.removeItem(localDraftKey);
      setLocalRecoveryDraft(null);
    } catch (error) {
      message.error("Could not remove the browser recovery draft.");
      console.error("Failed to discard local test draft", error);
    }
  };

  useEffect(() => {
    if (!(setupMode || wizardOpen) || (editingTest && editingTest.status !== "draft")) return undefined;

    const version = ++draftVersionRef.current;
    const payload = buildPayload();
    const snapshot = {
      values: form.getFieldsValue(true),
      questions,
      sections,
      currentStep,
    };

    try {
      localStorage.setItem(localDraftKey, JSON.stringify(snapshot));
      setLocalRecoveryDraft(snapshot);
    } catch (error) {
      if (!localStorageErrorShownRef.current) {
        message.error("Could not save a browser recovery copy of this test.");
        localStorageErrorShownRef.current = true;
      }
      console.error("Failed to save local test draft", error);
    }

    if (!String(payload.title || "").trim() || !payload.course) return undefined;

    autoSaveTimerRef.current = window.setTimeout(() => {
      const save = autoSaveQueueRef.current.then(async () => {
        const testId = autoSaveTestIdRef.current;
        const response = testId
          ? await updateTest(testId, payload)
          : await createTest(payload);
        autoSaveTestIdRef.current = response.data?._id || testId;
        autoSaveErrorShownRef.current = false;
        if (version === draftVersionRef.current) {
          localStorage.removeItem(localDraftKey);
          setLocalRecoveryDraft(null);
          localStorageErrorShownRef.current = false;
        }
      });
      autoSaveQueueRef.current = save.catch((error) => {
        if (!autoSaveErrorShownRef.current) {
          message.error(error.message || "Automatic draft saving failed. Please save the draft manually.");
          autoSaveErrorShownRef.current = true;
        }
      });
    }, 900);

    return () => window.clearTimeout(autoSaveTimerRef.current);
  }, [setupMode, wizardOpen, editingTest, formRevision, questions, sections, currentStep, buildPayload, form, localDraftKey]);

  const restoreManualSave = async (payload) => {
    window.clearTimeout(autoSaveTimerRef.current);
    await autoSaveQueueRef.current;
    const testId = editingTest?._id || autoSaveTestIdRef.current;
    return testId ? updateTest(testId, payload) : createTest(payload);
  };

  const getPublishValidationIssues = () => {
    const values = form.getFieldsValue(true);
    const nonEmptyQuestions = questions.filter((question) =>
      String(question.questionText || "").trim(),
    );
    const questionMarks = nonEmptyQuestions.reduce(
      (sum, question) => sum + Number(question.marks || 0),
      0,
    );
    const issues = [];

    if (!values.title) issues.push("Title is required");
    if (!values.course) issues.push("Course is required");
    if (!nonEmptyQuestions.length) issues.push("At least one question with text is required");
    if (Number(values.totalMarks || 0) !== questionMarks) {
      issues.push("Total marks must equal question marks");
    }
    if (!values.batchIds?.length) issues.push("At least one batch must be selected");
    if (!values.schedule?.startAt) issues.push("Start time is required");
    if (!values.schedule?.endAt) issues.push("End time is required");
    if (values.schedule?.startAt && values.schedule.startAt.isBefore(dayjs())) {
      issues.push("Schedule must be in the future");
    }
    if (
      values.schedule?.startAt &&
      values.schedule?.endAt &&
      !values.schedule.endAt.isAfter(values.schedule.startAt)
    ) {
      issues.push("End time must be after start time");
    }

    return issues;
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      const payload = buildPayload();
      if (!payload.course) {
        message.warning("Select a course before saving the draft.");
        setCurrentStep(0);
        return;
      }
      const response = await restoreManualSave(payload);
      message.success(response.message || "Test saved");
      autoSaveTestIdRef.current = null;
      localStorage.removeItem(localDraftKey);
      setLocalRecoveryDraft(null);
      if (setupMode) {
        navigate(testStudioBasePath);
      } else {
        setWizardOpen(false);
      }
      await loadData();
    } catch (error) {
      message.error(error.message || "Failed to save test");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    const issues = getPublishValidationIssues();
    if (issues.length) {
      message.error(issues[0]);
      setCurrentStep(6);
      return;
    }

    setSaving(true);
    try {
      const payload = buildPayload();
      const saveResponse = await restoreManualSave(payload);
      await publishTest(saveResponse.data._id);
      message.success("Test published successfully");
      autoSaveTestIdRef.current = null;
      localStorage.removeItem(localDraftKey);
      setLocalRecoveryDraft(null);
      if (setupMode) {
        navigate(testStudioBasePath);
      } else {
        setWizardOpen(false);
      }
      await loadData();
    } catch (error) {
      message.error(error.message || "Failed to publish test");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTest = async (test) => {
    try {
      await deleteTest(test._id);
      message.success("Draft deleted");
      await loadData();
    } catch (error) {
      message.error(error.message || "Failed to delete draft");
    }
  };

  const handleTimerControl = async (test) => {
    try {
      const response = test.schedule?.isPaused
        ? await resumeTestTimer(test._id)
        : await pauseTestTimer(test._id);
      message.success(response.message || (test.schedule?.isPaused ? "Test timer continued" : "Test timer paused"));
      await loadData();
    } catch (error) {
      message.error(error.message || "Failed to update timer");
    }
  };

  const openReassignRemaining = (test) => {
    setReassignTest(test);
    const startAt = dayjs().add(1, "day").hour(9).minute(0).second(0);
    reassignForm.setFieldsValue({
      startAt,
      endAt: startAt.add(test.schedule?.durationMinutes || 60, "minute"),
      durationMinutes: test.schedule?.durationMinutes || 60,
    });
    setReassignOpen(true);
  };

  const handlePublishResults = async () => {
    if (!detailTest?._id) return;
    try {
      const response = await publishTestResults(detailTest._id);
      setDetailTest((current) =>
        current ? { ...current, resultsPublished: true } : current,
      );
      message.success(response.message || "Test results published to students.");
      await Promise.all([loadData(), loadDetailAttempts(detailTest._id)]);
    } catch (error) {
      message.error(error.message || "Failed to publish test results");
    }
  };

  const handleReassignRemaining = async () => {
    const targetTest = reassignTest || detailTest;
    if (!targetTest?._id) return;
    try {
      const values = await reassignForm.validateFields();
      setReassigning(true);
      const response = await reassignRemainingStudents(targetTest._id, {
        startAt: values.startAt?.toISOString(),
        endAt: values.endAt?.toISOString(),
        durationMinutes: values.durationMinutes,
      });
      message.success(response.message || "Remaining students reassigned");
      setReassignOpen(false);
      setReassignTest(null);
      if (detailMode) {
        setDetailTest(response.data || targetTest);
      }
      await Promise.all([loadData(), loadDetailAttempts(targetTest._id)]);
    } catch (error) {
      if (!error?.errorFields) message.error(error.message || "Failed to reassign remaining students");
    } finally {
      setReassigning(false);
    }
  };

  const formatCountdown = (milliseconds) => {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds]
      .map((value) => String(value).padStart(2, "0"))
      .join(":");
  };

  const getRemainingMs = (test) => {
    if (!test.schedule?.endAt) return 0;
    const referenceTime = test.schedule?.isPaused && test.schedule?.pausedAt
      ? dayjs(test.schedule.pausedAt)
      : nowTick;
    return dayjs(test.schedule.endAt).diff(referenceTime);
  };

  const renderTimer = (test) => {
    if (test.status === "live") {
      const remainingMs = getRemainingMs(test);
      return (
        <Space direction="vertical" size={2}>
          <span className="font-ArialBold text-primary">{formatCountdown(remainingMs)}</span>
          {test.schedule?.isPaused ? <Tag color="orange">Paused</Tag> : <Tag color="green">Running</Tag>}
        </Space>
      );
    }
    if (test.status === "scheduled" && test.schedule?.startAt) {
      return <span className="text-slate-500">Starts in {formatCountdown(dayjs(test.schedule.startAt).diff(nowTick))}</span>;
    }
    return <span className="text-slate-400">-</span>;
  };

  const handleAssignmentPreview = async () => {
    try {
      const values = form.getFieldsValue(true);
      if (!values.course || !values.batchIds?.length) {
        message.warning("Select a course and at least one batch first.");
        return;
      }
      const response = await previewTestAssignment({
        courseId: values.course,
        batchIds: values.batchIds,
        excludedStudentIds: values.excludedStudentIds || [],
      });
      setAssignmentPreview(response.data);
    } catch (error) {
      message.error(error.message || "Failed to preview assignment");
    }
  };

  const handleNextStep = async () => {
    setCurrentStep((prev) => prev + 1);
  };

  const addQuestion = (type = form.getFieldValue("allowedQuestionTypes")?.[0] || "mcq_single") => {
    setTeacherQuestionIndex(questions.length);
    setQuestions((prev) => [...prev, emptyQuestion(prev.length, type)]);
  };

  const updateQuestion = (index, patch) => {
    setQuestions((prev) => prev.map((question, itemIndex) => (itemIndex === index ? { ...question, ...patch } : question)));
  };

  const moveQuestion = (index, direction) => {
    setQuestions((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const duplicateQuestion = (index) => {
    setTeacherQuestionIndex(index + 1);
    setQuestions((prev) => {
      const clone = { ...prev[index], questionText: `${prev[index].questionText} Copy` };
      return [...prev.slice(0, index + 1), clone, ...prev.slice(index + 1)];
    });
  };

  const removeQuestion = (index) => {
    setQuestions((prev) => {
      const nextQuestions = prev.filter((_, itemIndex) => itemIndex !== index);
      setTeacherQuestionIndex(Math.min(index, Math.max(0, nextQuestions.length - 1)));
      return nextQuestions;
    });
  };

  const importTemplate = () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet([
      {
        Question: "Which option is correct?",
        Type: "mcq_single",
        Difficulty: "medium",
        Marks: 1,
        "Option A": "Option 1",
        "Option B": "Option 2",
        "Option C": "",
        "Option D": "",
        "Correct Answer": "A",
        "Model Answer": "",
        Explanation: "Optional explanation",
        Tags: "chapter-1, basics",
      },
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Questions");
    XLSX.writeFile(workbook, "test-studio-question-template.xlsx");
  };

  const handleQuestionImport = async (file) => {
    setImportingQuestions(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.SheetNames[0] ? workbook.Sheets[workbook.SheetNames[0]] : null;
      const rows = sheet ? XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false }) : [];
      const parsedQuestions = [];
      const rowErrors = [];
      const acceptedTypes = new Set(questionTypeOptions.map((option) => option.value));

      rows.forEach((row, index) => {
        const questionText = String(row.Question || row.questionText || "").trim();
        if (!questionText) return;

        const questionType = String(row.Type || row.questionType || "mcq_single").trim().toLowerCase();
        const difficulty = String(row.Difficulty || "medium").trim().toLowerCase();
        const marks = Number(row.Marks || 1);
        if (!acceptedTypes.has(questionType)) {
          rowErrors.push(`Row ${index + 2}: unsupported question type "${questionType}".`);
          return;
        }
        if (!difficultyOptions.some((option) => option.value === difficulty)) {
          rowErrors.push(`Row ${index + 2}: difficulty must be Easy, Medium, or Hard.`);
          return;
        }
        if (!Number.isFinite(marks) || marks <= 0) {
          rowErrors.push(`Row ${index + 2}: marks must be greater than zero.`);
          return;
        }

        const answerTokens = String(row["Correct Answer"] || "")
          .split(",")
          .map((answer) => answer.trim().toLowerCase())
          .filter(Boolean);
        let options = ["Option A", "Option B", "Option C", "Option D"]
          .map((key, optionIndex) => ({
            text: String(row[key] || "").trim(),
            isCorrect: answerTokens.includes(String.fromCharCode(97 + optionIndex)),
          }))
          .filter((option) => option.text);
        if (questionType === "true_false" && !options.length) {
          options = [
            { text: "True", isCorrect: answerTokens.includes("true") || answerTokens.includes("a") },
            { text: "False", isCorrect: answerTokens.includes("false") || answerTokens.includes("b") },
          ];
        }
        if (["mcq_single", "mcq_multiple", "true_false"].includes(questionType)) {
          options = options.map((option) => ({
            ...option,
            isCorrect:
              option.isCorrect ||
              answerTokens.includes(option.text.toLowerCase()),
          }));
          const correctCount = options.filter((option) => option.isCorrect).length;
          if (!options.length || !correctCount || (questionType !== "mcq_multiple" && correctCount > 1)) {
            rowErrors.push(`Row ${index + 2}: provide options and a valid correct answer.`);
            return;
          }
        }

        parsedQuestions.push({
          ...emptyQuestion(questions.length + parsedQuestions.length, questionType),
          difficulty,
          questionText,
          options,
          marks,
          modelAnswer: String(row["Model Answer"] || "").trim(),
          explanation: String(row.Explanation || "").trim(),
          tags: String(row.Tags || "").split(",").map((tag) => tag.trim()).filter(Boolean),
        });
      });

      if (rowErrors.length) {
        message.error(rowErrors.slice(0, 3).join(" "));
        return Upload.LIST_IGNORE;
      }
      if (!parsedQuestions.length) {
        message.error("No questions were found. Use the downloaded template and add question text.");
        return Upload.LIST_IGNORE;
      }

      const updatedQuestions = [...questions, ...parsedQuestions];
      setQuestions(updatedQuestions);
      setTeacherQuestionIndex(updatedQuestions.length - 1);
      form.setFieldValue(
        "totalMarks",
        updatedQuestions.reduce(
          (sum, question) => sum + (String(question.questionText || "").trim() ? Number(question.marks || 0) : 0),
          0,
        ),
      );

      let bankImportError = "";
      if (selectedCourse) {
        try {
          const response = await importQuestionBank({ file, courseId: selectedCourse });
          if (!response.data?.imported) {
            bankImportError = "No questions were saved to the Question Bank";
          }
        } catch (error) {
          bankImportError = error.message || "Question Bank import failed";
        }
      }
      if (bankImportError) {
        Modal.warning({
          title: "Questions added to this test",
          centered: true,
          width: 520,
          okText: "Continue editing",
          content: (
            <div className="space-y-2">
              <p>
                <strong>{parsedQuestions.length}</strong> question(s) were added to the current test.
              </p>
              <p>
                They were not saved to the Question Bank. {bankImportError}
              </p>
              <p>Select the test course and import again if you also want to add these questions to its bank.</p>
            </div>
          ),
        });
      } else if (!selectedCourse) {
        Modal.warning({
          title: "Questions added to this test",
          centered: true,
          width: 520,
          okText: "Continue editing",
          content: (
            <div className="space-y-2">
              <p>
                <strong>{parsedQuestions.length}</strong> question(s) were added to the current test.
              </p>
              <p>The questions are ready to edit and will be included when you save the test as a draft.</p>
              <p>Select a course before importing if you also want to save the questions to the Question Bank.</p>
            </div>
          ),
        });
      } else {
        Modal.success({
          title: "Question import complete",
          centered: true,
          width: 520,
          okText: "Continue editing",
          content: (
            <div className="space-y-2">
              <p>
                <strong>{parsedQuestions.length}</strong> question(s) were added to the current test.
              </p>
              <p>The questions were also saved to the Question Bank for the selected course.</p>
              <p>Review the imported questions, then save the test as a draft or continue setting it up.</p>
            </div>
          ),
        });
      }
    } catch (error) {
      message.error(error.message || "Could not read this question file.");
    } finally {
      setImportingQuestions(false);
    }
    return Upload.LIST_IGNORE;
  };

  const addPdfText = (doc, text, x, y, options = {}) => {
    if (!text) return y;
    const lines = doc.splitTextToSize(String(text), options.maxWidth || 180);
    doc.text(lines, x, y, options);
    return y + lines.length * (options.lineHeight || 6);
  };

  const normalizePdfLogo = (imageData) =>
    new Promise((resolve) => {
      if (!imageData) {
        resolve("");
        return;
      }

      const value = String(imageData);
      if (/^data:image\/(png|jpe?g);base64,/i.test(value)) {
        resolve(value);
        return;
      }

      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth || image.width;
          canvas.height = image.naturalHeight || image.height;
          const context = canvas.getContext("2d");
          if (!context) {
            resolve("");
            return;
          }
          context.drawImage(image, 0, 0);
          resolve(canvas.toDataURL("image/png"));
        } catch {
          resolve("");
        }
      };
      image.onerror = () => resolve("");
      image.src = value;
    });

  const addPdfImage = (doc, imageData, x, y, width, height) => {
    if (!imageData) return false;
    const format = String(imageData).includes("image/jpeg") || String(imageData).includes("image/jpg")
      ? "JPEG"
      : "PNG";
    try {
      doc.addImage(imageData, format, x, y, width, height);
      return true;
    } catch {
      try {
        doc.addImage(imageData, format === "PNG" ? "JPEG" : "PNG", x, y, width, height);
        return true;
      } catch {
        return false;
      }
    }
  };

  const drawTestPaperHeader = async (doc, test) => {
    const savedHeader = test.settings?.paperHeader || {};
    const paperHeader = Object.keys(defaultPaperHeader).reduce((acc, key) => {
      acc[key] = teacherPaperHeader[key] || savedHeader[key] || defaultPaperHeader[key];
      return acc;
    }, {});
    const logoData = await normalizePdfLogo(paperHeader.logo);
    const academyName = paperHeader.academyName || "Academy / Institute Name";
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    const contentWidth = pageWidth - margin * 2;
    const logoSize = 24;
    const top = 12;
    const logoRendered = addPdfImage(doc, logoData, margin, top, logoSize, logoSize);
    const textLeft = logoRendered ? margin + logoSize + 8 : margin;
    const textWidth = logoRendered ? contentWidth - logoSize - 8 : contentWidth;
    const textCenter = textLeft + textWidth / 2;
    let y = top + 3;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    const academyLines = doc.splitTextToSize(String(academyName), textWidth);
    doc.text(academyLines, textCenter, y, { align: "center" });
    y += academyLines.length * 7;

    if (paperHeader.logoText && paperHeader.logoText !== academyName) {
      doc.setFontSize(11);
      const logoTextLines = doc.splitTextToSize(String(paperHeader.logoText), textWidth);
      doc.text(logoTextLines, textCenter, y, { align: "center" });
      y += logoTextLines.length * 5.5;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const headerLines = [
      paperHeader.address,
      [paperHeader.phone, paperHeader.email, paperHeader.website].filter(Boolean).join(" | "),
      paperHeader.note,
    ].filter(Boolean);

    headerLines.forEach((line) => {
      const lines = doc.splitTextToSize(String(line), textWidth);
      doc.text(lines, textCenter, y, { align: "center" });
      y += lines.length * 4.7;
    });

    const dividerY = Math.max(y + 5, top + (logoRendered ? logoSize + 5 : 27));
    doc.setDrawColor(20, 40, 90);
    doc.setLineWidth(0.3);
    doc.line(margin, dividerY, pageWidth - margin, dividerY);
    return dividerY + 8;
  };

  const downloadTestPaperPdf = async (test) => {
    try {
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      let y = await drawTestPaperHeader(doc, test);
      const pageHeight = doc.internal.pageSize.getHeight();
      const addPageIfNeeded = async (space = 20) => {
        if (y + space <= pageHeight - 15) return;
        doc.addPage();
        y = await drawTestPaperHeader(doc, test);
      };

      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      y = addPdfText(doc, test.title || "Test Paper", 14, y, { maxWidth: 180, lineHeight: 7 });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      y = addPdfText(doc, `Course: ${test.course?.courseName || "N/A"}    Topic: ${test.topic || "N/A"}    Marks: ${test.totalMarks || 0}`, 14, y + 1);
      y = addPdfText(doc, `Duration: ${test.schedule?.durationMinutes || "-"} minutes    Date: ${dayjs().format("DD MMM YYYY")}`, 14, y);
      if (test.instructions) {
        y += 3;
        doc.setFont("helvetica", "bold");
        y = addPdfText(doc, "Instructions", 14, y);
        doc.setFont("helvetica", "normal");
        y = addPdfText(doc, test.instructions, 14, y, { maxWidth: 180 });
      }

      for (let index = 0; index < (test.questions || []).length; index += 1) {
        const question = (test.questions || [])[index];
        if (test.settings?.layout === "one_by_one" && index > 0) {
          doc.addPage();
          y = await drawTestPaperHeader(doc, test);
        }
        await addPageIfNeeded(30);
        y += 4;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        y = addPdfText(doc, `${index + 1}. ${question.questionText || "Question"} (${question.marks || 0} marks)`, 14, y, { maxWidth: 180 });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);

        if (["mcq_single", "mcq_multiple", "true_false"].includes(question.questionType)) {
          for (let optionIndex = 0; optionIndex < (question.options || []).length; optionIndex += 1) {
            const option = (question.options || [])[optionIndex];
            await addPageIfNeeded(8);
            const label = String.fromCharCode(65 + optionIndex);
            y = addPdfText(doc, `${label}. ${option.text || ""}`, 20, y, { maxWidth: 170, lineHeight: 5 });
          }
        } else {
          await addPageIfNeeded(24);
          doc.setDrawColor(210, 210, 210);
          for (let line = 0; line < 4; line += 1) {
            doc.line(20, y + line * 8, 190, y + line * 8);
          }
          y += 34;
        }
      }

      const pageCount = doc.getNumberOfPages();
      for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(`Page ${page} of ${pageCount}`, 196, 287, { align: "right" });
        doc.setTextColor(0);
      }

      doc.save(`${test.title || "test-paper"}.pdf`);
      message.success("Test paper PDF downloaded");
    } catch (error) {
      console.error("Test paper PDF failed:", error);
      message.error("Failed to download test paper PDF");
    }
  };

  const downloadTestResultsPdf = (test, attempts) => {
    try {
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const pageHeight = doc.internal.pageSize.getHeight();
      const submitted = (attempts || [])
        .filter((attempt) => ["submitted", "auto_submitted", "graded"].includes(attempt.status))
        .sort((left, right) => Number(right.score || 0) - Number(left.score || 0));
      const rankById = new Map(submitted.slice(0, 3).map((attempt, index) => [String(attempt._id), index + 1]));
      const questionMap = new Map((test.questions || []).map((question) => [String(question._id), question]));
      const totals = submitted.reduce(
        (result, attempt) => {
          result.passed += attempt.passed ? 1 : 0;
          (attempt.answers || []).forEach((answer) => {
            const answered = (answer.selectedOptions || []).length > 0 || Boolean(String(answer.textAnswer || "").trim());
            if (!answered) result.unanswered += 1;
            else if (answer.isCorrect === true) result.right += 1;
            else if (answer.autoGraded !== false) result.wrong += 1;
            else result.needsReview += 1;
          });
          return result;
        },
        { passed: 0, right: 0, wrong: 0, unanswered: 0, needsReview: 0 },
      );
      let y = 16;

      const ensureSpace = (height = 12) => {
        if (y + height <= pageHeight - 14) return;
        doc.addPage();
        y = 16;
      };
      const writeLine = (text, { bold = false, size = 10, indent = 14 } = {}) => {
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(size);
        const lines = doc.splitTextToSize(String(text || "-"), 182 - (indent - 14));
        ensureSpace(lines.length * 5 + 2);
        doc.text(lines, indent, y);
        y += lines.length * 5 + 2;
      };

      writeLine(test.title || "Test Results", { bold: true, size: 16 });
      writeLine(`Course: ${test.course?.courseName || "N/A"}  |  Topic: ${test.topic || "N/A"}`);
      writeLine(`Assigned batches: ${(test.assignedBatches || []).map((item) => item.batch?.batchName || item.batchName || "Batch").join(", ") || "N/A"}`);
      writeLine(`Report generated: ${dayjs().format("DD MMM YYYY, hh:mm A")}`);
      y += 2;
      writeLine(
        `Students: ${attempts.length}  |  Submitted: ${submitted.length}  |  Passed: ${totals.passed}  |  Failed: ${submitted.length - totals.passed}  |  Remaining: ${Math.max(0, Number(test.studentCount || 0) - submitted.length)}`,
        { bold: true },
      );
      writeLine(`Right answers: ${totals.right}  |  Wrong answers: ${totals.wrong}  |  Unanswered: ${totals.unanswered}  |  Needs review: ${totals.needsReview}`);
      writeLine(`Test marks: ${test.totalMarks || 0}  |  Passing marks: ${test.passingMarks || 0}`);
      y += 3;

      const sortedAttempts = [
        ...submitted,
        ...(attempts || []).filter((attempt) => !["submitted", "auto_submitted", "graded"].includes(attempt.status)),
      ];
      sortedAttempts.forEach((attempt) => {
        y += 2;
        writeLine(
          `${rankById.has(String(attempt._id)) ? `Position ${rankById.get(String(attempt._id))}: ` : ""}${attempt.student?.studentName || "Student"} (${attempt.student?.registrationNo || "No registration"})`,
          { bold: true, size: 12 },
        );
        const isSubmitted = ["submitted", "auto_submitted", "graded"].includes(attempt.status);
        writeLine(`Batch: ${attempt.batch?.batchName || "N/A"}  |  Status: ${attempt.status}  |  Score: ${attempt.score || 0}/${test.totalMarks || 0} (${attempt.percentage || 0}%)  |  Result: ${isSubmitted ? (attempt.passed ? "Passed" : "Not passed") : "Pending"}`);
        if (attempt.submittedAt) writeLine(`Submitted: ${dayjs(attempt.submittedAt).format("DD MMM YYYY, hh:mm A")}`);

        if (!attempt.answers?.length) {
          writeLine("No submitted answers.");
          return;
        }

        attempt.answers.forEach((answer, index) => {
          const question = questionMap.get(String(answer.questionId));
          const options = question?.options || [];
          const optionText = (optionId) => {
            const option = options.find((item, optionIndex) => String(item._id || optionIndex) === String(optionId));
            return option?.text || optionId;
          };
          const selected = (answer.selectedOptions || []).map(optionText);
          const correct = (question?.correctAnswers || []).map(optionText);
          const answered = selected.length > 0 || Boolean(String(answer.textAnswer || "").trim());
          const answerStatus = answer.isCorrect === true
            ? "Right"
            : !answered
              ? "Unanswered"
              : answer.autoGraded === false
                ? "Needs review"
                : "Wrong";

          writeLine(`Q${index + 1}. ${question?.questionText || "Question"} [${answerStatus}; ${answer.marksAwarded || 0}/${question?.marks || 0} marks]`, { bold: true });
          writeLine(`Student answer: ${selected.length ? selected.join(", ") : answer.textAnswer || "No answer"}`, { indent: 18, size: 9 });
          writeLine(`Correct answer: ${correct.length ? correct.join(", ") : question?.modelAnswer || "N/A"}`, { indent: 18, size: 9 });
        });
      });

      const safeTitle = String(test.title || "test-results").replace(/[<>:"/\\|?*]+/g, "-").trim();
      doc.save(`${safeTitle || "test-results"}-results.pdf`);
      message.success("Test results PDF downloaded");
    } catch (error) {
      console.error("Test results PDF failed:", error);
      message.error("Failed to download test results PDF");
    }
  };

  const stepItems = [
    { title: "Basic" },
    { title: "Format" },
    { title: "Questions" },
    { title: "Schedule" },
    { title: "Batches" },
    { title: "Settings" },
    { title: "Review" },
  ];

  const renderBasicStep = () => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Form.Item name="title" label="Test Title" rules={[{ required: true, message: "Title is required" }]}>
        <Input className="form-input" placeholder="e.g. Mid Term Assessment" />
      </Form.Item>
      <Form.Item name="course" label="Course" rules={[{ required: true, message: "Course is required" }]}>
        <Select
          className="form-input"
          placeholder="Select assigned course"
          options={courses.map((course) => ({ label: `${course.courseName} (${course.courseId})`, value: course._id }))}
          onChange={() => {
            form.setFieldValue("batchIds", []);
            setAssignmentPreview(null);
          }}
        />
      </Form.Item>
      <Form.Item name="topic" label="Subject / Topic">
        <Input className="form-input" placeholder="Optional topic" />
      </Form.Item>
      <Form.Item name="description" label="Description">
        <Input.TextArea rows={3} placeholder="Short test description" />
      </Form.Item>
      <Form.Item name="instructions" label="Instructions for Students" className="md:col-span-2">
        <Input.TextArea rows={4} placeholder="Rules, allowed material, and submission instructions" />
      </Form.Item>
    </div>
  );

  const renderFormatStep = () => (
    <div className="space-y-4">
      <Form.Item name="allowedQuestionTypes" label="Question Types Allowed" rules={[{ required: true }]}>
        <Checkbox.Group options={questionTypeOptions} />
      </Form.Item>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Form.Item name="totalMarks" label="Total Marks" rules={[{ required: true }]}>
          <InputNumber className="w-full form-input" min={0} />
        </Form.Item>
        <Form.Item name="passingMarks" label="Passing Marks">
          <InputNumber className="w-full form-input" min={0} />
        </Form.Item>
        <Form.Item name={["negativeMarking", "enabled"]} label="Negative Marking" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name={["negativeMarking", "value"]} label="Wrong MCQ Deduction">
          <InputNumber className="w-full form-input" min={0} step={0.25} />
        </Form.Item>
      </div>
      <Card
        title="Sections"
        extra={<Button onClick={() => setSections((prev) => [...prev, { title: `Section ${prev.length + 1}`, questionType: "mcq_single", numberOfQuestions: 0, marksPerQuestion: 1 }])}>Add Section</Button>}
      >
        {sections.length ? (
          <div className="space-y-3">
            {sections.map((section, index) => (
              <div key={index} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-5">
                <Input value={section.title} onChange={(e) => setSections((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, title: e.target.value } : item))} />
                <Select value={section.questionType} options={questionTypeOptions} onChange={(value) => setSections((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, questionType: value } : item))} />
                <InputNumber className="w-full" min={0} value={section.numberOfQuestions} onChange={(value) => setSections((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, numberOfQuestions: value } : item))} />
                <InputNumber className="w-full" min={0} value={section.marksPerQuestion} onChange={(value) => setSections((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, marksPerQuestion: value } : item))} />
                <Button danger onClick={() => setSections((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>
              </div>
            ))}
          </div>
        ) : (
          <Empty description="No sections added. Questions can still be created without sections." />
        )}
      </Card>
    </div>
  );

  const renderQuestionEditor = (question, index) => {
    const usesOptions = ["mcq_single", "mcq_multiple", "true_false"].includes(question.questionType);
    return (
      <Card
        key={`${index}-${question.questionType}`}
        title={`Question ${index + 1}`}
        extra={
          <Space>
            <Button size="small" onClick={() => moveQuestion(index, -1)}>Up</Button>
            <Button size="small" onClick={() => moveQuestion(index, 1)}>Down</Button>
            <Button size="small" icon={<CopyOutlined />} onClick={() => duplicateQuestion(index)} />
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeQuestion(index)} />
          </Space>
        }
        className="rounded-2xl"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Select value={question.questionType} options={questionTypeOptions} onChange={(value) => updateQuestion(index, { ...emptyQuestion(index, value), questionText: question.questionText })} />
          <Select value={question.difficulty} options={difficultyOptions} onChange={(value) => updateQuestion(index, { difficulty: value })} />
          <InputNumber className="w-full" min={0} value={question.marks} onChange={(value) => updateQuestion(index, { marks: value })} addonAfter="marks" />
          <Input value={(question.tags || []).join(", ")} onChange={(e) => updateQuestion(index, { tags: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="Tags" />
        </div>
        <Input.TextArea className="mt-3" rows={3} value={question.questionText} onChange={(e) => updateQuestion(index, { questionText: e.target.value })} placeholder="Write the question" />
        {usesOptions ? (
          <div className="mt-3 space-y-2">
            {(question.options || []).map((option, optionIndex) => (
              <div key={optionIndex} className="flex gap-2">
                <Checkbox
                  checked={option.isCorrect}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    const nextOptions = (question.options || []).map((item, itemIndex) => ({
                      ...item,
                      isCorrect:
                        question.questionType === "mcq_single" || question.questionType === "true_false"
                          ? itemIndex === optionIndex && checked
                          : itemIndex === optionIndex
                            ? checked
                            : item.isCorrect,
                    }));
                    updateQuestion(index, { options: nextOptions });
                  }}
                />
                <Input
                  value={option.text}
                  onChange={(e) => updateQuestion(index, { options: (question.options || []).map((item, itemIndex) => itemIndex === optionIndex ? { ...item, text: e.target.value } : item) })}
                  placeholder={`Option ${optionIndex + 1}`}
                />
              </div>
            ))}
            {question.questionType !== "true_false" ? (
              <Button size="small" onClick={() => updateQuestion(index, { options: [...(question.options || []), { text: "", isCorrect: false }] })}>
                Add Option
              </Button>
            ) : null}
          </div>
        ) : (
          <Input.TextArea className="mt-3" rows={3} value={question.modelAnswer} onChange={(e) => updateQuestion(index, { modelAnswer: e.target.value })} placeholder="Model answer / marking guideline" />
        )}
        <Input.TextArea className="mt-3" rows={2} value={question.explanation} onChange={(e) => updateQuestion(index, { explanation: e.target.value })} placeholder="Explanation (optional)" />
      </Card>
    );
  };

  const renderQuestionsStep = () => (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button icon={<PlusOutlined />} onClick={() => addQuestion()}>Add Question</Button>
        <Button onClick={() => setPaperPreviewOpen(true)}>Preview Question Paper</Button>
        <Button icon={<FileExcelOutlined />} onClick={importTemplate}>Download Import Template</Button>
        <Upload
          accept=".xlsx,.xls,.csv"
          beforeUpload={handleQuestionImport}
          showUploadList={false}
        >
          <Button icon={<FileExcelOutlined />} loading={importingQuestions}>Import Questions</Button>
        </Upload>
      </div>
      {questionBank.length ? (
        <Card title="Question Bank" className="rounded-2xl">
          <div className="flex flex-wrap gap-2">
            {questionBank.slice(0, 12).map((item) => (
              <Button
                key={item._id}
                size="small"
                onClick={() => {
                  setTeacherQuestionIndex(questions.length);
                  setQuestions((prev) => [
                    ...prev, {
                      bankQuestion: item._id,
                      questionType: item.questionType,
                      difficulty: item.difficulty,
                      questionText: item.questionText,
                      options: item.options,
                      correctAnswers: item.correctAnswers,
                      modelAnswer: item.modelAnswer,
                      explanation: item.explanation,
                      marks: item.defaultMarks || 1,
                      tags: item.tags || [],
                    },
                  ]);
                }}
              >
                Reuse: {item.questionText.slice(0, 40)}
              </Button>
            ))}
          </div>
        </Card>
      ) : null}
      <div className="space-y-4">
        {selectedQuestionLayout === "one_by_one" ? (
          <>
            {questions[teacherQuestionIndex]
              ? renderQuestionEditor(questions[teacherQuestionIndex], teacherQuestionIndex)
              : <Empty description="Add a question to begin" />}
            {questions.length > 0 ? (
              <div className="flex items-center justify-between">
                <Button
                  disabled={teacherQuestionIndex === 0}
                  onClick={() => setTeacherQuestionIndex((index) => Math.max(0, index - 1))}
                >
                  Previous
                </Button>
                <span className="text-sm text-slate-500">
                  Question {teacherQuestionIndex + 1} of {questions.length}
                </span>
                <Button
                  disabled={teacherQuestionIndex >= questions.length - 1}
                  onClick={() =>
                    setTeacherQuestionIndex((index) => Math.min(questions.length - 1, index + 1))
                  }
                >
                  Next
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          questions.map((question, index) => renderQuestionEditor(question, index))
        )}
      </div>
      <Modal
        title={`Question Paper Preview - ${selectedQuestionLayout === "one_by_one" ? "One question at a time" : "All questions"}`}
        open={paperPreviewOpen}
        onCancel={() => setPaperPreviewOpen(false)}
        footer={null}
        width={800}
      >
        <div className="space-y-4">
          {(selectedQuestionLayout === "one_by_one"
            ? questions.slice(teacherQuestionIndex, teacherQuestionIndex + 1)
            : questions
          ).map((question, visibleIndex) => {
            const index = selectedQuestionLayout === "one_by_one"
              ? teacherQuestionIndex
              : visibleIndex;
            return (
              <Card
                key={`${question.order ?? index}-${index}`}
                title={`Question ${index + 1} (${question.marks || 0} marks)`}
              >
                <div className="mb-3 font-semibold text-primary">
                  {question.questionText || "Question text will appear here"}
                </div>
                {["mcq_single", "mcq_multiple", "true_false"].includes(question.questionType) ? (
                  <div className="space-y-2">
                    {(question.options || []).map((option, optionIndex) => (
                      <div key={option._id || optionIndex} className="rounded border border-slate-200 px-3 py-2">
                        {String.fromCharCode(65 + optionIndex)}. {option.text || "Option"}
                      </div>
                    ))}
                  </div>
                ) : null}
              </Card>
            );
          })}
          {selectedQuestionLayout === "one_by_one" && questions.length > 0 ? (
            <div className="flex items-center justify-between">
              <Button
                disabled={teacherQuestionIndex === 0}
                onClick={() => setTeacherQuestionIndex((index) => Math.max(0, index - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-slate-500">
                Question {teacherQuestionIndex + 1} of {questions.length}
              </span>
              <Button
                disabled={teacherQuestionIndex >= questions.length - 1}
                onClick={() =>
                  setTeacherQuestionIndex((index) => Math.min(questions.length - 1, index + 1))
                }
              >
                Next
              </Button>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );

  const renderScheduleStep = () => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <Space wrap>
          <Button onClick={() => applyQuickSchedule(0)}>Today</Button>
          <Button onClick={() => applyQuickSchedule(1)}>Tomorrow</Button>
        </Space>
      </div>
      <Form.Item name={["schedule", "startAt"]} label="Start Date & Time" rules={[{ required: true }]}>
        <DatePicker
          showTime
          className="w-full"
          disabledDate={(current) => current && current < dayjs().startOf("day")}
        />
      </Form.Item>
      <Form.Item name={["schedule", "endAt"]} label="End Date & Time" rules={[{ required: true }]}>
        <DatePicker
          showTime
          className="w-full"
          disabledDate={(current) => current && current < dayjs().startOf("day")}
        />
      </Form.Item>
      <Form.Item name={["schedule", "durationMinutes"]} label="Duration (minutes)" rules={[{ required: true }]}>
        <InputNumber className="w-full form-input" min={1} />
      </Form.Item>
      <Form.Item name={["schedule", "timezone"]} label="Timezone">
        <Input className="form-input" />
      </Form.Item>
      <Form.Item name={["schedule", "allowLateEntry"]} label="Allow Late Entry" valuePropName="checked">
        <Switch />
      </Form.Item>
      <Form.Item name={["schedule", "graceMinutes"]} label="Grace Period (minutes)">
        <InputNumber className="w-full form-input" min={0} />
      </Form.Item>
    </div>
  );

  const renderBatchStep = () => (
    <div className="space-y-4">
      <Form.Item name="batchIds" label="Assign to Batches" rules={[{ required: true, message: "Select at least one batch" }]}>
        <Select
          mode="multiple"
          showSearch
          optionFilterProp="searchLabel"
          placeholder="Select batches linked with assigned courses"
          options={batches.map((batch) => ({
            label: `${batch.batchName} (${batch.batchCode}) - ${batch.courseName || "Course"}`,
            value: batch._id,
            searchLabel: `${batch.batchName} ${batch.batchCode} ${batch.courseName} ${batch.courseCode} ${batch.status}`,
          }))}
          onChange={(values) => {
            const selectedBatches = allAssignedBatches.filter((batch) =>
              values.includes(batch._id),
            );
            const selectedCourseIds = [
              ...new Set(
                selectedBatches
                  .map((batch) => String(batch.courseId || batch.course || ""))
                  .filter(Boolean),
              ),
            ];

            if (selectedCourseIds.length === 1) {
              form.setFieldValue("course", selectedCourseIds[0]);
            } else if (selectedCourseIds.length > 1) {
              message.warning("Please select batches from one course for a single test.");
            }

            setAssignmentPreview(null);
          }}
          optionRender={(option) => {
            const batch = allAssignedBatches.find((item) => item._id === option.value);
            return (
              <div className="flex flex-col">
                <span>{batch?.batchName || option.label}</span>
                <span className="text-[11px] text-slate-400">
                  {batch?.batchCode || "Batch"} · {batch?.courseName || "Course"} · {batch?.status || "N/A"}
                </span>
              </div>
            );
          }}
        />
      </Form.Item>
      <Button onClick={handleAssignmentPreview}>Preview Students</Button>
      {assignmentPreview ? (
        <Card className="rounded-2xl">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Statistic title="Selected Batches" value={assignmentPreview.batches?.length || 0} />
            <Statistic title="Students Assigned" value={assignmentPreview.studentCount || 0} />
            <div className="text-sm text-slate-500">New students joining selected batches before start are included dynamically by batch assignment.</div>
          </div>
          <Form.Item name="excludedStudentIds" label="Exclude Specific Students" className="mt-4">
            <Select
              mode="multiple"
              options={(assignmentPreview.students || []).map((student) => ({
                label: `${student.studentName} (${student.registrationNo || "No ID"})`,
                value: student._id,
              }))}
            />
          </Form.Item>
        </Card>
      ) : null}
    </div>
  );

  const renderSettingsStep = () => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Form.Item name={["settings", "shuffleQuestions"]} label="Shuffle Questions" valuePropName="checked"><Switch /></Form.Item>
      <Form.Item name={["settings", "shuffleOptions"]} label="Shuffle Options" valuePropName="checked"><Switch /></Form.Item>
      <Form.Item name={["settings", "resultVisibility"]} label="Result Visibility">
        <Select options={[{ label: "Immediately", value: "immediate" }, { label: "After Teacher Publishes", value: "after_publish" }, { label: "Never", value: "never" }]} />
      </Form.Item>
      <Form.Item name={["settings", "attemptsAllowed"]} label="Attempts Allowed"><InputNumber min={1} className="w-full" /></Form.Item>
      <Form.Item name={["settings", "allowReview"]} label="Allow Answer Review" valuePropName="checked"><Switch /></Form.Item>
      <Form.Item name={["settings", "layout"]} label="Question Layout">
        <Select options={[{ label: "All questions on one page", value: "all_questions" }, { label: "One question at a time", value: "one_by_one" }]} />
      </Form.Item>
      <Form.Item name={["settings", "allowBackNavigation"]} label="Allow Back Navigation" valuePropName="checked"><Switch /></Form.Item>
      <Form.Item name={["settings", "antiCheating", "requireFullScreen"]} label="Require Full Screen" valuePropName="checked"><Switch /></Form.Item>
      <Form.Item name={["settings", "antiCheating", "trackTabSwitch"]} label="Track Tab Switch" valuePropName="checked"><Switch /></Form.Item>
      <Form.Item name={["settings", "antiCheating", "maxWarnings"]} label="Max Warnings"><InputNumber min={0} className="w-full" /></Form.Item>
      <Form.Item name={["settings", "antiCheating", "autoSubmitOnViolation"]} label="Auto Submit on Violations" valuePropName="checked"><Switch /></Form.Item>
      <Form.Item name={["settings", "antiCheating", "disableCopyPaste"]} label="Disable Copy/Paste" valuePropName="checked"><Switch /></Form.Item>
      <Form.Item name={["settings", "antiCheating", "disableRightClick"]} label="Disable Right Click" valuePropName="checked"><Switch /></Form.Item>
    </div>
  );

  const renderReviewStep = () => {
    const nonEmptyQuestions = questions.filter((question) =>
      String(question.questionText || "").trim(),
    );
    const questionMarks = nonEmptyQuestions.reduce((sum, question) => sum + Number(question.marks || 0), 0);
    const issues = getPublishValidationIssues();

    return (
      <div className="space-y-4">
        <Card title="Summary" className="rounded-2xl">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <div className="text-sm text-slate-500">Selected Courses</div>
              <Button
                type="link"
                className="!h-auto !p-0 !text-2xl !text-slate-900"
                disabled={!selectedCourseRecords.length}
                onClick={() => setCourseDetailsOpen(true)}
                aria-label={`Show ${selectedCourseRecords.length} selected courses`}
              >
                {selectedCourseRecords.length}
              </Button>
            </div>
            <Statistic title="Questions" value={nonEmptyQuestions.length} />
            <Statistic title="Question Marks" value={questionMarks} />
            <Statistic title="Assigned Batches" value={selectedBatchIds.length} />
          </div>
        </Card>
        <Modal
          title="Selected Courses"
          open={courseDetailsOpen}
          onCancel={() => setCourseDetailsOpen(false)}
          footer={null}
        >
          <div className="space-y-2">
            {selectedCourseRecords.map((course, index) => (
              <div
                key={selectedCourseIds[index]}
                className="rounded-lg border border-slate-200 px-3 py-2"
              >
                {course?.courseName || "Course"}
                {course?.courseId ? ` (${course.courseId})` : ""}
              </div>
            ))}
          </div>
        </Modal>
        <Card title="Validation" className="rounded-2xl">
          {issues.length ? (
            <div className="space-y-2">
              {issues.map((issue) => <Tag key={issue} color="red">{issue}</Tag>)}
            </div>
          ) : (
            <Tag color="green">Ready to save or publish</Tag>
          )}
        </Card>
      </div>
    );
  };

  const renderCurrentStep = () =>
    [renderBasicStep, renderFormatStep, renderQuestionsStep, renderScheduleStep, renderBatchStep, renderSettingsStep, renderReviewStep][currentStep]?.();

  const renderWizardPage = () => (
    <div className="test-studio-modal space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="module-title">Create Test</h2>
            <p className="module-subtitle">Set up details, questions, timing, batches, and publishing rules</p>
          </div>
          <Button onClick={() => navigate(testStudioBasePath)}>Back to Test Studio</Button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Steps current={currentStep} items={stepItems} className="mb-6" />
        <Form form={form} layout="vertical" onValuesChange={() => setFormRevision((revision) => revision + 1)}>
          {renderCurrentStep()}
        </Form>
        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <Button disabled={currentStep === 0} onClick={() => setCurrentStep((prev) => prev - 1)}>Back</Button>
          {currentStep < stepItems.length - 1 ? (
            <Button type="primary" onClick={handleNextStep}>Next</Button>
          ) : null}
          <Button icon={<SaveOutlined />} loading={saving} onClick={handleSaveDraft}>Save Draft</Button>
          <Button type="primary" icon={<SendOutlined />} loading={saving} onClick={handlePublish}>Publish</Button>
        </div>
      </div>
    </div>
  );

  if (setupMode) {
    return renderWizardPage();
  }

  const renderAttemptAnswers = (attempt) => {
    const questionMap = new Map((detailTest?.questions || []).map((question) => [String(question._id), question]));
    if (!attempt.answers?.length) {
      return <Empty description="No answers submitted for this student" />;
    }

    return (
      <div className="space-y-3 bg-slate-50 p-3">
        {attempt.answers.map((answer, index) => {
          const question = questionMap.get(String(answer.questionId));
          const optionMap = new Map((question?.options || []).map((option, optionIndex) => [String(option._id || optionIndex), option.text]));
          const selected = (answer.selectedOptions || []).map((optionId) => optionMap.get(String(optionId)) || optionId);
          const correct = (question?.correctAnswers || []).map((optionId) => optionMap.get(String(optionId)) || optionId);
          const answered = selected.length > 0 || Boolean(String(answer.textAnswer || "").trim());
          const answerStatus = answer.isCorrect === true
            ? "Right"
            : !answered
              ? "Unanswered"
              : answer.autoGraded === false
                ? "Needs Review"
                : "Wrong";

          return (
            <div key={`${answer.questionId}-${index}`} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="font-semibold text-primary">
                  Q{index + 1}. {question?.questionText || "Question"}
                </div>
                <Tag color={answerStatus === "Right" ? "green" : answerStatus === "Wrong" ? "red" : "orange"}>
                  {answerStatus}
                </Tag>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 text-sm md:grid-cols-3">
                <div>
                  <div className="text-xs font-semibold uppercase text-slate-500">Student Answer</div>
                  <div>{selected.length ? selected.join(", ") : answer.textAnswer || "No answer"}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase text-slate-500">Correct Answer</div>
                  <div>{correct.length ? correct.join(", ") : question?.modelAnswer || "N/A"}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase text-slate-500">Marks</div>
                  <div>{answer.marksAwarded || 0} / {question?.marks || 0}</div>
                </div>
              </div>
              {question?.explanation ? (
                <div className="mt-2 text-xs text-slate-500">Explanation: {question.explanation}</div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  const getAttemptAnswerCounts = (attempt) =>
    (attempt.answers || []).reduce(
      (counts, answer) => {
        const answered = (answer.selectedOptions || []).length > 0 || Boolean(String(answer.textAnswer || "").trim());
        if (!answered) return counts;
        if (answer.isCorrect === true) counts.right += 1;
        else if (answer.autoGraded !== false) counts.wrong += 1;
        else counts.needsReview += 1;
        return counts;
      },
      { right: 0, wrong: 0, needsReview: 0 },
    );

  const renderTestDetailsContent = () => {
    if (!detailTest) {
      return <Card loading={loading} className="rounded-2xl" />;
    }

    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="module-title">Test Details</h2>
            <p className="module-subtitle">
              Review {detailTest.course?.courseName || "course"} results, answer details, and batch performance
            </p>
          </div>
          <Button onClick={() => navigate(testStudioBasePath)}>Back to Test Studio</Button>
        </div>
        <Card>
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="m-0 text-lg font-ArialBold text-primary">{detailTest.title}</h3>
              <p className="m-0 mt-1 text-sm text-slate-500">{detailTest.description || "No description"}</p>
              <p className="m-0 mt-1 text-xs text-slate-500">
                Course: {detailTest.course?.courseName || "N/A"} · Topic: {detailTest.topic || "N/A"}
              </p>
            </div>
            <Tag color={statusColors[detailTest.status]}>{detailTest.status}</Tag>
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card><Statistic title="Assigned Students" value={detailTest.studentCount || 0} /></Card>
          <Card><Statistic title="Submitted" value={detailPerformanceSummary.submitted} /></Card>
          <Card><Statistic title="Passed" value={detailPerformanceSummary.passed} valueStyle={{ color: "#16a34a" }} /></Card>
          <Card><Statistic title="Failed" value={detailPerformanceSummary.failed} valueStyle={{ color: "#dc2626" }} /></Card>
          <Card><Statistic title="Remaining" value={detailPerformanceSummary.remaining} /></Card>
          <Card><Statistic title="In Progress" value={detailPerformanceSummary.inProgress} /></Card>
          <Card><Statistic title="Not Started" value={detailPerformanceSummary.notStarted} /></Card>
          <Card><Statistic title="Average Score" value={detailPerformanceSummary.averageScore} suffix={`/ ${detailTest.totalMarks || 0}`} /></Card>
          <Card><Statistic title="Average Percentage" value={detailPerformanceSummary.averagePercentage} suffix="%" /></Card>
          <Card><Statistic title="Right Answers" value={detailPerformanceSummary.right} valueStyle={{ color: "#16a34a" }} /></Card>
          <Card><Statistic title="Wrong Answers" value={detailPerformanceSummary.wrong} valueStyle={{ color: "#dc2626" }} /></Card>
          <Card><Statistic title="Unanswered" value={detailPerformanceSummary.unanswered} /></Card>
          <Card><Statistic title="Needs Review" value={detailPerformanceSummary.needsReview} /></Card>
        </div>
        <Card title="Position Holders">
          {rankedDetailAttempts.length ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {rankedDetailAttempts.slice(0, 3).map((attempt, index) => (
                <div key={attempt._id} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-amber-800">
                    {index === 0 ? "1st Place" : index === 1 ? "2nd Place" : "3rd Place"}
                  </div>
                  <div className="mt-1 font-semibold text-primary">{attempt.student?.studentName || "Student"}</div>
                  <div className="text-sm text-slate-600">
                    {attempt.score || 0} / {detailTest.totalMarks || 0} ({attempt.percentage || 0}%)
                  </div>
                  <div className="text-xs text-slate-500">{attempt.batch?.batchName || "N/A"}</div>
                </div>
              ))}
            </div>
          ) : (
            <Empty description="Position holders appear after students submit the test" />
          )}
        </Card>
        <Card title="Assigned Batches">
          <div className="flex flex-wrap gap-2">
            {(detailTest.assignedBatches || []).map((item) => <Tag key={item.batch?._id || item.batch}>{item.batch?.batchName || item.batch}</Tag>)}
          </div>
        </Card>
        <Card
          title="Student Test Completion"
          extra={
            canPublishTest ? (
              <Space>
                {detailTest.settings?.resultVisibility === "after_publish" &&
                !detailTest.resultsPublished &&
                detailTest.schedule?.endAt &&
                !dayjs(detailTest.schedule.endAt).isAfter(dayjs()) ? (
                  <Button size="small" type="primary" onClick={handlePublishResults}>
                    Publish Results
                  </Button>
                ) : null}
                <Button
                  size="small"
                  icon={<DownloadOutlined />}
                  onClick={() => downloadTestResultsPdf(detailTest, detailAttempts)}
                >
                  Download Results PDF
                </Button>
                <Button size="small" onClick={() => openReassignRemaining(detailTest)}>
                  Reassign Remaining
                </Button>
              </Space>
            ) : (
              <Button
                size="small"
                icon={<DownloadOutlined />}
                onClick={() => downloadTestResultsPdf(detailTest, detailAttempts)}
              >
                Download Results PDF
              </Button>
            )
          }
        >
          <div className="mb-4 flex flex-col gap-2 md:flex-row">
            <Input.Search
              allowClear
              placeholder="Search student or registration"
              value={detailFilters.search}
              onChange={(event) => setDetailFilters((current) => ({ ...current, search: event.target.value }))}
              className="md:max-w-xs"
            />
            <Select
              value={detailFilters.batchId}
              onChange={(batchId) => setDetailFilters((current) => ({ ...current, batchId }))}
              className="md:min-w-52"
              options={[
                { label: "All assigned batches", value: "all" },
                ...(detailTest.assignedBatches || []).map((item) => ({
                  label: item.batch?.batchName || item.batchName || "Batch",
                  value: String(item.batch?._id || item.batch),
                })),
              ]}
            />
            <Select
              value={detailFilters.result}
              onChange={(result) => setDetailFilters((current) => ({ ...current, result }))}
              className="md:min-w-40"
              options={[
                { label: "All results", value: "all" },
                { label: "Passed", value: "passed" },
                { label: "Failed", value: "failed" },
                { label: "Not submitted", value: "remaining" },
              ]}
            />
            <Select
              value={detailFilters.answerResult}
              onChange={(answerResult) => setDetailFilters((current) => ({ ...current, answerResult }))}
              className="md:min-w-48"
              options={[
                { label: "All answer results", value: "all" },
                { label: "Has wrong answers", value: "has_wrong" },
                { label: "All attempted answers right", value: "all_right" },
                { label: "Needs manual review", value: "needs_review" },
              ]}
            />
          </div>
          <Table
            rowKey="_id"
            loading={detailAttemptsLoading}
            dataSource={visibleDetailAttempts}
            pagination={{ pageSize: 20, showSizeChanger: true }}
            scroll={{ x: "max-content", y: 560 }}
            expandable={{
              expandedRowRender: renderAttemptAnswers,
              rowExpandable: (attempt) => ["submitted", "auto_submitted", "graded"].includes(attempt.status),
            }}
            columns={[
              {
                title: "Position",
                render: (_, attempt) => {
                  const position = positionByAttemptId.get(String(attempt._id));
                  return position ? <Tag color={position === 1 ? "gold" : position === 2 ? "default" : "orange"}>{position === 1 ? "1st" : position === 2 ? "2nd" : "3rd"}</Tag> : "—";
                },
              },
              {
                title: "Student",
                render: (_, attempt) => (
                  <div>
                    <div className="font-semibold text-primary">{attempt.student?.studentName || "Student"}</div>
                    <div className="text-xs text-slate-500">{attempt.student?.registrationNo || "No registration"}</div>
                  </div>
                ),
              },
              { title: "Batch", render: (_, attempt) => attempt.batch?.batchName || "N/A" },
              {
                title: "Right / Wrong",
                render: (_, attempt) => {
                  const counts = getAttemptAnswerCounts(attempt);
                  return (
                    <Space size={4}>
                      <Tag color="green">{counts.right} right</Tag>
                      <Tag color="red">{counts.wrong} wrong</Tag>
                      {counts.needsReview ? <Tag color="orange">{counts.needsReview} review</Tag> : null}
                    </Space>
                  );
                },
              },
              {
                title: "Status",
                dataIndex: "status",
                render: (value) => {
                  const submitted = ["submitted", "auto_submitted", "graded"].includes(value);
                  return <Tag color={submitted ? "green" : value === "in_progress" ? "blue" : "orange"}>{value}</Tag>;
                },
              },
              { title: "Score", render: (_, attempt) => `${attempt.score || 0} (${attempt.percentage || 0}%)` },
              {
                title: "Result",
                render: (_, attempt) =>
                  ["submitted", "auto_submitted", "graded"].includes(attempt.status)
                    ? <Tag color={attempt.passed ? "green" : "red"}>{attempt.passed ? "Passed" : "Not Passed"}</Tag>
                    : <Tag color="orange">Remaining</Tag>,
              },
              { title: "Submitted", render: (_, attempt) => attempt.submittedAt ? dayjs(attempt.submittedAt).format("DD MMM YYYY, hh:mm A") : "Not submitted" },
            ]}
          />
        </Card>
        {renderReassignModal()}
      </div>
    );
  };

  const renderReassignModal = () => (
    <Modal
      title="Reassign Remaining Students"
      open={reassignOpen}
      onCancel={() => {
        setReassignOpen(false);
        setReassignTest(null);
      }}
      onOk={handleReassignRemaining}
      confirmLoading={reassigning}
      okText="Reassign Remaining"
    >
      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        This keeps submitted students completed and reopens the same test only for students who have not submitted yet.
      </div>
      <Form form={reassignForm} layout="vertical">
        <Form.Item name="startAt" label="New Start Date & Time" rules={[{ required: true, message: "Start time is required" }]}>
          <DatePicker showTime className="w-full" disabledDate={(current) => current && current < dayjs().startOf("day")} />
        </Form.Item>
        <Form.Item name="endAt" label="New End Date & Time" rules={[{ required: true, message: "End time is required" }]}>
          <DatePicker showTime className="w-full" disabledDate={(current) => current && current < dayjs().startOf("day")} />
        </Form.Item>
        <Form.Item name="durationMinutes" label="Duration (minutes)" rules={[{ required: true }]}>
          <InputNumber min={1} className="w-full" />
        </Form.Item>
      </Form>
    </Modal>
  );

  if (detailMode) {
    return renderTestDetailsContent();
  }

  const columns = [
    {
      title: "Test",
      key: "test",
      render: (_, test) => (
        <div>
          <div className="font-ArialBold text-primary">{test.title}</div>
          <div className="text-xs text-slate-500">{test.course?.courseName || "Course"} · {test.topic || "No topic"}</div>
        </div>
      ),
    },
    { title: "Status", dataIndex: "status", render: (value) => <Tag color={statusColors[value]}>{value}</Tag> },
    { title: "Marks", dataIndex: "totalMarks" },
    { title: "Students", dataIndex: "studentCount", render: (value) => value || 0 },
    { title: "Start", render: (_, test) => test.schedule?.startAt ? dayjs(test.schedule.startAt).format("DD MMM YYYY, hh:mm A") : "Not set" },
    { title: "Time Left", render: (_, test) => renderTimer(test) },
    {
      title: "Actions",
      render: (_, test) => (
        <Space>
          <Button size="small" onClick={() => navigate(`${testStudioBasePath}/${test._id}`)}>Details</Button>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadTestPaperPdf(test)}>
            PDF
          </Button>
          {canUpdateTest && !["live", "completed"].includes(test.status) ? (
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEditWizard(test)}
            >
              {test.status === "draft" ? "Continue Draft" : "Edit"}
            </Button>
          ) : null}
          {canCreateTest ? <Button size="small" icon={<CopyOutlined />} onClick={async () => { await duplicateTest(test._id); message.success("Test duplicated"); loadData(); }} /> : null}
          {canPublishTest && test.status === "draft" ? <Button size="small" icon={<SendOutlined />} onClick={async () => { await publishTest(test._id); message.success("Test published"); loadData(); }} /> : null}
          {canPublishTest && test.status === "live" ? (
            <Button
              size="small"
              icon={test.schedule?.isPaused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
              onClick={() => handleTimerControl(test)}
            >
              {test.schedule?.isPaused ? "Continue" : "Pause"}
            </Button>
          ) : null}
          {canPublishTest && ["completed", "live", "scheduled"].includes(test.status) ? (
            <Button size="small" onClick={() => openReassignRemaining(test)}>
              Reassign Remaining
            </Button>
          ) : null}
          {canDeleteTest && test.status === "draft" ? (
            <Popconfirm title="Delete draft test?" onConfirm={() => handleDeleteTest(test)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-accent">
            <ClipboardList size={22} />
          </div>
          <div>
            <h2 className="module-title">Test Studio</h2>
            <p className="module-subtitle">Create, schedule, assign, and publish online assessments</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<ReloadOutlined />} onClick={loadData}>Refresh</Button>
          {canCreateTest ? <Button type="primary" icon={<PlusOutlined />} className="btn-lg" onClick={() => navigate(`${testStudioBasePath}/create`)}>Setup / Create Test</Button> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card><Statistic title="Total Tests" value={summary.total} prefix={<FileQuestion size={16} />} /></Card>
        <Card><Statistic title="Upcoming" value={summary.upcoming} prefix={<Clock size={16} />} /></Card>
        <Card><Statistic title="Live" value={summary.live} prefix={<Users size={16} />} /></Card>
        <Card><Statistic title="Completed" value={summary.completed} /></Card>
      </div>

      <Card className="rounded-2xl">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Tabs
            activeKey={filters.status}
            onChange={(status) => setFilters((prev) => ({ ...prev, status }))}
            items={["all", "draft", "scheduled", "live", "completed"].map((status) => ({ key: status, label: status.toUpperCase() }))}
          />
          <Input.Search className="md:w-[360px]" allowClear placeholder="Search tests..." value={filters.search} onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))} />
        </div>
        {filters.status === "draft" && localRecoveryDraft ? (
          <Card
            size="small"
            className="mb-4 border-blue-200 bg-blue-50"
            title={localRecoveryDraft.values?.title || "Unsaved test"}
            extra={
              <Space>
                <Button type="primary" onClick={continueLocalRecoveryDraft}>Continue Recovery</Button>
                <Popconfirm
                  title="Discard this browser recovery draft?"
                  onConfirm={discardLocalRecoveryDraft}
                >
                  <Button danger>Discard</Button>
                </Popconfirm>
              </Space>
            }
          >
            <span className="text-sm text-slate-600">
              Unsaved browser recovery · Resume at {stepItems[localRecoveryDraft.currentStep]?.title || "Basic"} step
            </span>
          </Card>
        ) : null}
        {tests.length ? (
          <Table rowKey="_id" loading={loading} columns={columns} dataSource={filteredTests} scroll={{ x: "max-content" }} />
        ) : (
          <Empty
            description="No tests created yet"
            className="py-8"
          >
            {canCreateTest ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(`${testStudioBasePath}/create`)}>
                Setup / Create First Test
              </Button>
            ) : null}
          </Empty>
        )}
      </Card>

      <Modal
        title={editingTest ? "Edit Test" : "Create Test"}
        open={wizardOpen}
        onCancel={() => setWizardOpen(false)}
        className="test-studio-modal"
        width={1100}
        footer={[
          <Button key="back" disabled={currentStep === 0} onClick={() => setCurrentStep((prev) => prev - 1)}>Back</Button>,
          currentStep < stepItems.length - 1 ? <Button key="next" type="primary" onClick={handleNextStep}>Next</Button> : null,
          <Button key="draft" icon={<SaveOutlined />} loading={saving} onClick={handleSaveDraft}>Save Draft</Button>,
          <Button key="publish" type="primary" icon={<SendOutlined />} loading={saving} onClick={handlePublish}>Publish</Button>,
        ]}
      >
        <Steps current={currentStep} items={stepItems} className="mb-6" />
        <Form form={form} layout="vertical" onValuesChange={() => setFormRevision((revision) => revision + 1)}>
          {renderCurrentStep()}
        </Form>
      </Modal>

      <Modal title="Test Details" open={Boolean(detailTest)} onCancel={() => setDetailTest(null)} footer={null} width={820}>
        {detailTest ? (
          <div className="space-y-4">
            <Card>
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="m-0 text-lg font-ArialBold text-primary">{detailTest.title}</h3>
                  <p className="m-0 mt-1 text-sm text-slate-500">{detailTest.description || "No description"}</p>
                </div>
                <Tag color={statusColors[detailTest.status]}>{detailTest.status}</Tag>
              </div>
            </Card>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <Statistic title="Students" value={detailTest.studentCount || 0} />
              <Statistic title="Not Started" value={detailTest.attemptCounts?.not_started || 0} />
              <Statistic title="In Progress" value={detailTest.attemptCounts?.in_progress || 0} />
              <Statistic title="Submitted" value={(detailTest.attemptCounts?.submitted || 0) + (detailTest.attemptCounts?.auto_submitted || 0)} />
            </div>
            <Card title="Assigned Batches">
              <div className="flex flex-wrap gap-2">
                {(detailTest.assignedBatches || []).map((item) => <Tag key={item.batch?._id || item.batch}>{item.batch?.batchName || item.batch}</Tag>)}
              </div>
            </Card>
            <Card
              title="Student Test Completion"
              extra={
                canPublishTest ? (
                  <Button size="small" onClick={() => openReassignRemaining(detailTest)}>
                    Reassign Remaining
                  </Button>
                ) : null
              }
            >
              <Table
                rowKey="_id"
                loading={detailAttemptsLoading}
                dataSource={detailAttempts}
                pagination={{ pageSize: 5 }}
                scroll={{ x: "max-content" }}
                expandable={{
                  expandedRowRender: renderAttemptAnswers,
                  rowExpandable: (attempt) => ["submitted", "auto_submitted", "graded"].includes(attempt.status),
                }}
                columns={[
                  {
                    title: "Student",
                    render: (_, attempt) => (
                      <div>
                        <div className="font-semibold text-primary">{attempt.student?.studentName || "Student"}</div>
                        <div className="text-xs text-slate-500">{attempt.student?.registrationNo || "No registration"}</div>
                      </div>
                    ),
                  },
                  { title: "Batch", render: (_, attempt) => attempt.batch?.batchName || "N/A" },
                  {
                    title: "Status",
                    dataIndex: "status",
                    render: (value) => {
                      const submitted = ["submitted", "auto_submitted", "graded"].includes(value);
                      return <Tag color={submitted ? "green" : value === "in_progress" ? "blue" : "orange"}>{value}</Tag>;
                    },
                  },
                  { title: "Score", render: (_, attempt) => `${attempt.score || 0} (${attempt.percentage || 0}%)` },
                  {
                    title: "Result",
                    render: (_, attempt) =>
                      ["submitted", "auto_submitted", "graded"].includes(attempt.status)
                        ? <Tag color={attempt.passed ? "green" : "red"}>{attempt.passed ? "Passed" : "Not Passed"}</Tag>
                        : <Tag color="orange">Remaining</Tag>,
                  },
                  { title: "Submitted", render: (_, attempt) => attempt.submittedAt ? dayjs(attempt.submittedAt).format("DD MMM YYYY, hh:mm A") : "Not submitted" },
                ]}
              />
            </Card>
          </div>
        ) : null}
      </Modal>

      {renderReassignModal()}

    </div>
  );
};

export default TestStudio;
