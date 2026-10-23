import express from "express";
import multer from "multer";
import authMiddleware from "../midlewear/authMiddleware.js";
import authorize from "../midlewear/authorize.js";
import requireAuth from "../midlewear/requireAuth.js";
import {
  deleteTest,
  duplicateTest,
  getMyStudentTests,
  getMyStudentTestReview,
  getTeacherPaperHeader,
  getQuestionBank,
  getStudentTestHistory,
  getTeacherTestStudioOptions,
  getTestById,
  getTestAttempts,
  getTests,
  importQuestionBank,
  pauseTestTimer,
  previewTestAssignment,
  publishTest,
  publishTestResults,
  reassignRemainingStudents,
  resumeTestTimer,
  saveTest,
  startMyStudentTest,
  submitMyStudentTest,
  updateTeacherPaperHeader,
  updateTest,
  updateTestPaperHeader,
} from "../controller/testStudioController.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.use(authMiddleware);

router.get("/student/tests", requireAuth, getMyStudentTests);
router.get("/student/tests/:id/review", requireAuth, getMyStudentTestReview);
router.post("/student/tests/:id/start", requireAuth, startMyStudentTest);
router.post("/student/tests/:id/submit", requireAuth, submitMyStudentTest);

router.get("/options", authorize("test_studio", "view"), getTeacherTestStudioOptions);
router.get("/students/:studentId/history", authorize("test_studio", "view"), getStudentTestHistory);
router.get("/paper-header", authorize("test_studio", "view"), getTeacherPaperHeader);
router.put("/paper-header", authorize("test_studio", "update"), updateTeacherPaperHeader);
router.post("/assignments/preview", authorize("test_studio", "view"), previewTestAssignment);
router.get("/tests", authorize("test_studio", "view"), getTests);
router.post("/tests", authorize("test_studio", "create"), saveTest);
router.get("/tests/:id", authorize("test_studio", "view"), getTestById);
router.get("/tests/:id/attempts", authorize("test_studio", "view"), getTestAttempts);
router.put("/tests/:id", authorize("test_studio", "update"), updateTest);
router.post("/tests/:id/publish", authorize("test_studio", "approve"), publishTest);
router.post("/tests/:id/publish-results", authorize("test_studio", "approve"), publishTestResults);
router.post("/tests/:id/pause", authorize("test_studio", "approve"), pauseTestTimer);
router.post("/tests/:id/resume", authorize("test_studio", "approve"), resumeTestTimer);
router.post("/tests/:id/reassign-remaining", authorize("test_studio", "approve"), reassignRemainingStudents);
router.put("/tests/:id/paper-header", authorize("test_studio", "update"), updateTestPaperHeader);
router.post("/tests/:id/duplicate", authorize("test_studio", "create"), duplicateTest);
router.delete("/tests/:id", authorize("test_studio", "delete"), deleteTest);
router.get("/question-bank", authorize("test_studio", "view"), getQuestionBank);
router.post(
  "/question-bank/import",
  authorize("test_studio", "import"),
  upload.single("file"),
  importQuestionBank,
);

export default router;
