import api from "../api/axiosInstance";

// Mark attendance for multiple persons in a batch on a date
// records: [{ personId, personType: 'student'|'teacher', status, notes }]
export const bulkMarkAttendance = async (batchIdOrPayload, date, records) => {
  const payload =
    typeof batchIdOrPayload === "object" && batchIdOrPayload !== null
      ? batchIdOrPayload
      : { batchId: batchIdOrPayload, date, records };
  const response = await api.post("/attendance/bulk", payload);
  return response.data;
};

export const markQrAttendance = async ({ date, studentId, studentCode }) => {
  const response = await api.post("/attendance/qr-mark", { date, studentId, studentCode });
  return response.data;
};

export const enrollFaceAttendance = async ({ studentId, faceHash, imageData, samplesCount }) => {
  const response = await api.post("/attendance/face/enroll", {
    studentId,
    faceHash,
    imageData,
    samplesCount,
  });
  return response.data;
};

export const markFaceAttendance = async ({ batchId, date, faceHash, faceHashes }) => {
  const response = await api.post("/attendance/face/mark", { batchId, date, faceHash, faceHashes });
  return response.data;
};

// Get attendance records for a batch on a specific date
export const getAttendanceByBatchAndDate = async (batchId, date) => {
  const response = await api.get(`/attendance/batch/${batchId}`, {
    params: { date },
  });
  return response.data;
};

// Get students + teachers of a batch
export const getBatchMembers = async (batchId) => {
  const response = await api.get(`/attendance/batch/${batchId}/members`);
  return response.data;
};

// Get per-date attendance counts for a calendar month
// Returns { "YYYY-MM-DD": { Present, Absent, "Half Day", Leave, total } }
export const getMonthCalendar = async (batchId, year, month) => {
  const response = await api.get(`/attendance/batch/${batchId}/calendar`, {
    params: { year, month },
  });
  return response.data;
};

// Get full attendance history for a batch over a date range
export const getAttendanceHistory = async (batchId, from, to, personType = "all") => {
  const response = await api.get(`/attendance/batch/${batchId}/history`, {
    params: { from, to, personType },
  });
  return response.data;
};

// Get attendance summary for a batch over a date range
export const getAttendanceSummary = async (batchId, from, to, personType) => {
  const response = await api.get(`/attendance/batch/${batchId}/summary`, {
    params: { from, to, personType },
  });
  return response.data;
};

// Get working days for a batch in a month
export const getWorkingDays = async (batchId, year, month) => {
  const response = await api.get(`/attendance/working-days/${batchId}`, {
    params: { year, month },
  });
  return response.data;
};

// Auto-mark all batch members as Holiday for a holiday date
export const markHolidayAttendance = async (holidayId) => {
  const response = await api.post("/attendance/mark-holiday", { holidayId });
  return response.data;
};

// Get all attendance for a specific person
export const getPersonAttendance = async (personId, personType, from, to) => {
  const response = await api.get(`/attendance/person/${personId}`, {
    params: { personType, from, to },
  });
  return response.data;
};
