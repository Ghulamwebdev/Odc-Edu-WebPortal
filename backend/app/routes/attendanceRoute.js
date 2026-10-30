import express from "express";
import authMiddleware from "../midlewear/authMiddleware.js";
import authorize from "../midlewear/authorize.js";
import attendanceBatchScope from "../midlewear/attendanceBatchScope.js";
import {
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
  getAttendanceBatches,
} from "../controller/attendanceController.js";

const router = express.Router();

router.use(authMiddleware);

// Mark / update attendance in bulk for a batch+date
router.post("/bulk", authorize("attendance", "create"), attendanceBatchScope, bulkMarkAttendance);
router.post("/qr-mark", authorize("attendance", "create"), markQrAttendance);
router.post("/face/enroll", authorize("attendance", "create"), enrollFaceAttendance);
router.post("/face/mark", authorize("attendance", "create"), attendanceBatchScope, markFaceAttendance);

router.get("/batches", authorize("attendance", "view"), getAttendanceBatches);

// Get batch members (students + teachers)
router.get("/batch/:batchId/members", authorize("attendance", "view"), attendanceBatchScope, getBatchMembers);

// Calendar view: per-date attendance counts for a month
router.get("/batch/:batchId/calendar", authorize("attendance", "view"), attendanceBatchScope, getMonthCalendar);

// Full history with per-person summary (date range)
router.get("/batch/:batchId/history", authorize("attendance", "view"), attendanceBatchScope, getAttendanceHistory);

// Get attendance records for a batch on a specific date
router.get("/batch/:batchId", authorize("attendance", "view"), attendanceBatchScope, getAttendanceByBatchAndDate);

// Get attendance summary for a batch over a date range
router.get("/batch/:batchId/summary", authorize("attendance", "view"), attendanceBatchScope, getAttendanceSummary);

// Get working days for a batch in a given month
router.get("/working-days/:batchId", authorize("attendance", "view"), attendanceBatchScope, getWorkingDays);

// Get all attendance for a specific person
router.get("/person/:personId", authorize("attendance", "view"), getPersonAttendance);

// Auto-mark all batch members as Holiday for a holiday date
router.post("/mark-holiday", authorize("attendance", "approve"), markHolidayAttendance);

export default router;
