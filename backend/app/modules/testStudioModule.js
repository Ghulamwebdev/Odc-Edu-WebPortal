import mongoose from "mongoose";

const optionSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    text: { type: String, required: true, trim: true },
    isCorrect: { type: Boolean, default: false },
  },
  { _id: false },
);

const sectionSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    title: { type: String, required: true, trim: true },
    questionType: { type: String, required: true },
    numberOfQuestions: { type: Number, default: 0, min: 0 },
    marksPerQuestion: { type: Number, default: 1, min: 0 },
    attemptAny: { type: Number, default: null, min: 0 },
  },
  { _id: false },
);

const testQuestionSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    bankQuestion: { type: String, ref: "QuestionBank" },
    sectionId: { type: String, default: null },
    order: { type: Number, default: 0 },
    questionType: { type: String, required: true },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "medium",
    },
    questionText: { type: String, required: true },
    imageUrl: { type: String, default: "" },
    options: { type: [optionSchema], default: [] },
    correctAnswers: { type: [String], default: [] },
    modelAnswer: { type: String, default: "" },
    explanation: { type: String, default: "" },
    marks: { type: Number, default: 1, min: 0 },
    negativeMarks: { type: Number, default: 0, min: 0 },
    tags: { type: [String], default: [] },
  },
  { _id: false },
);

const testBatchSchema = new mongoose.Schema(
  {
    batch: { type: String, ref: "Batch", required: true },
    course: { type: String, ref: "Course", required: true },
  },
  { _id: false },
);

const excludedStudentSchema = new mongoose.Schema(
  {
    student: { type: String, ref: "Admission", required: true },
    reason: { type: String, default: "" },
  },
  { _id: false },
);

const antiCheatingSchema = new mongoose.Schema(
  {
    requireFullScreen: { type: Boolean, default: false },
    trackTabSwitch: { type: Boolean, default: true },
    maxWarnings: { type: Number, default: 3, min: 0 },
    autoSubmitOnViolation: { type: Boolean, default: true },
    disableCopyPaste: { type: Boolean, default: true },
    disableRightClick: { type: Boolean, default: true },
  },
  { _id: false },
);

const settingsSchema = new mongoose.Schema(
  {
    shuffleQuestions: { type: Boolean, default: false },
    shuffleOptions: { type: Boolean, default: false },
    resultVisibility: {
      type: String,
      enum: ["immediate", "after_publish", "never"],
      default: "after_publish",
    },
    allowReview: { type: Boolean, default: false },
    attemptsAllowed: { type: Number, default: 1, min: 1 },
    layout: {
      type: String,
      enum: ["one_by_one", "all_questions"],
      default: "all_questions",
    },
    allowBackNavigation: { type: Boolean, default: true },
    antiCheating: { type: antiCheatingSchema, default: () => ({}) },
    paperHeader: {
      logo: { type: String, default: "" },
      academyName: { type: String, default: "" },
      address: { type: String, default: "" },
      phone: { type: String, default: "" },
      email: { type: String, default: "" },
      website: { type: String, default: "" },
      note: { type: String, default: "" },
    },
  },
  { _id: false },
);

const testSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    instructions: { type: String, default: "" },
    course: { type: String, ref: "Course", required: true, index: true },
    teacherUser: { type: String, ref: "User", required: true, index: true },
    topic: { type: String, default: "", trim: true },
    allowedQuestionTypes: { type: [String], default: [] },
    sections: { type: [sectionSchema], default: [] },
    questions: { type: [testQuestionSchema], default: [] },
    totalMarks: { type: Number, default: 0, min: 0 },
    passingMarks: { type: Number, default: 0, min: 0 },
    passingPercentage: { type: Number, default: null, min: 0, max: 100 },
    negativeMarking: {
      enabled: { type: Boolean, default: false },
      value: { type: Number, default: 0, min: 0 },
    },
    schedule: {
      timezone: { type: String, default: "Asia/Karachi" },
      startAt: { type: Date, default: null, index: true },
      endAt: { type: Date, default: null, index: true },
      durationMinutes: { type: Number, default: 60, min: 1 },
      allowLateEntry: { type: Boolean, default: true },
      graceMinutes: { type: Number, default: 0, min: 0 },
      publishAt: { type: Date, default: null },
      isPaused: { type: Boolean, default: false },
      pausedAt: { type: Date, default: null },
      totalPausedMs: { type: Number, default: 0, min: 0 },
    },
    assignedBatches: { type: [testBatchSchema], default: [] },
    excludedStudents: { type: [excludedStudentSchema], default: [] },
    settings: { type: settingsSchema, default: () => ({}) },
    wizardStep: { type: Number, default: 0, min: 0, max: 6 },
    status: {
      type: String,
      enum: ["draft", "scheduled", "live", "completed", "cancelled"],
      default: "draft",
      index: true,
    },
    publishedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

testSchema.index({ teacherUser: 1, status: 1, createdAt: -1 });
testSchema.index({ "assignedBatches.batch": 1 });

const questionBankSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    owner: { type: String, ref: "User", required: true, index: true },
    course: { type: String, ref: "Course", required: true, index: true },
    topic: { type: String, default: "", trim: true },
    questionType: { type: String, required: true },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "medium",
    },
    questionText: { type: String, required: true },
    imageUrl: { type: String, default: "" },
    options: { type: [optionSchema], default: [] },
    correctAnswers: { type: [String], default: [] },
    modelAnswer: { type: String, default: "" },
    explanation: { type: String, default: "" },
    defaultMarks: { type: Number, default: 1, min: 0 },
    tags: { type: [String], default: [] },
    isShared: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

questionBankSchema.index({ owner: 1, course: 1, questionType: 1 });

const attemptAnswerSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true },
    selectedOptions: { type: [String], default: [] },
    textAnswer: { type: String, default: "" },
    marksAwarded: { type: Number, default: 0, min: 0 },
    autoGraded: { type: Boolean, default: false },
    isCorrect: { type: Boolean, default: null },
    comments: { type: String, default: "" },
    savedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const testAttemptSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    test: { type: String, ref: "Test", required: true, index: true },
    student: { type: String, ref: "Admission", required: true, index: true },
    batch: { type: String, ref: "Batch", required: true },
    startedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["not_started", "in_progress", "submitted", "auto_submitted", "expired", "graded"],
      default: "not_started",
      index: true,
    },
    answers: { type: [attemptAnswerSchema], default: [] },
    score: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },
    lastAutosaveAt: { type: Date, default: null },
  },
  { timestamps: true },
);

testAttemptSchema.index({ test: 1, student: 1 }, { unique: true });
testAttemptSchema.index({ status: 1, expiresAt: 1 });

const testAuditLogSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    test: { type: String, ref: "Test", required: true, index: true },
    actor: { type: String, ref: "User" },
    action: { type: String, required: true },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    note: { type: String, default: "" },
  },
  { timestamps: true },
);

const testViolationSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    test: { type: String, ref: "Test", required: true, index: true },
    attempt: { type: String, ref: "TestAttempt", required: true, index: true },
    student: { type: String, ref: "Admission", required: true },
    type: { type: String, required: true },
    count: { type: Number, default: 1 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

export const Test = mongoose.model("Test", testSchema);
export const QuestionBank = mongoose.model("QuestionBank", questionBankSchema);
export const TestAttempt = mongoose.model("TestAttempt", testAttemptSchema);
export const TestAuditLog = mongoose.model("TestAuditLog", testAuditLogSchema);
export const TestViolation = mongoose.model("TestViolation", testViolationSchema);
