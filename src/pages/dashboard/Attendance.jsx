import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Select, DatePicker, Tabs, Table, Tag, Spin,
  Button, message, Badge, Tooltip, Segmented, Modal, Input, Checkbox,
} from "antd";
import {
  MdCheckCircle, MdCancel, MdAccessTime, MdBeachAccess,
  MdSave, MdHistory, MdFactCheck, MdDownload, MdUpload, MdQrCodeScanner,
  MdFace, MdCameraAlt,
} from "react-icons/md";
import { FaFileExcel, FaFilePdf } from "react-icons/fa";
import dayjs from "dayjs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import jsQR from "jsqr";
import odysseyLogo from "../../assets/images/logos/LOGO.png";
import {
  getAttendanceBatches,
  getBatchMembers,
  getAttendanceByBatchAndDate,
  bulkMarkAttendance,
  markQrAttendance,
  enrollFaceAttendance,
  markFaceAttendance,
  getAttendanceHistory,
  getMonthCalendar,
  getPersonAttendance,
} from "../../services/attendanceService";
import { createHoliday, deleteHoliday, getHolidayDates, getHolidays } from "../../services/holidayService";
import MonthlyAttendanceReport from "./MonthlyAttendanceReport";

// ─── PDF Design Constants (matches Students.jsx) ──────────────────────────────
const PDF_COLORS = {
  primary:        [15,  40, 100],
  primaryLight:   [235, 240, 252],
  accent:         [0,   112, 186],
  dark:           [20,  20,  30],
  mid:            [80,  90, 110],
  rule:           [210, 215, 225],
  white:          [255, 255, 255],
  rowAlt:         [247, 249, 253],
  pageBannerBg:   [235, 241, 255],
  pageBannerTitle:[10,  30,  90],
  pageBannerSub:  [80,  100, 150],
  pillBg:         [30,  70, 160],
  pillTxt:        [255, 255, 255],
  presentBg:      [240, 253, 244],
  presentFg:      [22,  163, 74],
  absentBg:       [255, 241, 242],
  absentFg:       [220, 38,  38],
  halfDayBg:      [255, 253, 235],
  halfDayFg:      [161, 98,  7],
  leaveBg:        [239, 246, 255],
  leaveFg:        [37,  99,  235],
};
const setFill = (doc, rgb) => doc.setFillColor(rgb[0], rgb[1], rgb[2]);
const setDraw = (doc, rgb) => doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
const setTxt  = (doc, rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);

const loadLogoBase64 = async (logoSrc) => {
  try {
    const res  = await fetch(logoSrc);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => resolve(reader.result);
    });
  } catch { return null; }
};

const drawPdfHeader = (doc, logoDataUrl, subtitle = "") => {
  const pageWidth = doc.internal.pageSize.width;
  const margin = 14;
  const barH   = 50;

  setFill(doc, PDF_COLORS.pageBannerBg);
  doc.rect(0, 0, pageWidth, barH, "F");

  if (logoDataUrl) {
    const logoSize = 45;
    doc.addImage(logoDataUrl, "PNG", margin, (barH - logoSize) / 2, logoSize, logoSize);
  }

  const cx = pageWidth / 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  setTxt(doc, PDF_COLORS.pageBannerTitle);
  doc.text("ODYSSEY ACADEMY KHIPRO", cx, 16, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setTxt(doc, PDF_COLORS.pageBannerSub);
  doc.text("Bin Muqarab Colony, Main 7G Road, Khipro", cx, 22, { align: "center" });
  doc.text("Email: askodysseyacademy@gmail.com  |  Phone: +923492425428", cx, 28, { align: "center" });

  if (subtitle) {
    setFill(doc, PDF_COLORS.pillBg);
    const pillW = 100, pillH = 8;
    const pillX = (pageWidth - pillW) / 2;
    doc.roundedRect(pillX, 40, pillW, pillH, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    setTxt(doc, PDF_COLORS.pillTxt);
    doc.text(subtitle.toUpperCase(), cx, 45.2, { align: "center" });
  }

  return barH + 4;
};

// ─── STATUS fill colour for PDF cells ────────────────────────────────────────
const STATUS_CELL_COLOR = {
  Present:  PDF_COLORS.presentBg,
  Absent:   PDF_COLORS.absentBg,
  "Half Day": PDF_COLORS.halfDayBg,
  Leave:    PDF_COLORS.leaveBg,
};

const { RangePicker } = DatePicker;

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  Present:   { color: "bg-green-100 border-green-400 text-green-700",   activeColor: "bg-green-500 text-white border-green-600",   icon: <MdCheckCircle size={16} />, tag: "success",    dot: "🟢" },
  Absent:    { color: "bg-red-100 border-red-400 text-red-700",          activeColor: "bg-red-500 text-white border-red-600",      icon: <MdCancel size={16} />,      tag: "error",      dot: "🔴" },
  "Half Day":{ color: "bg-yellow-100 border-yellow-400 text-yellow-700", activeColor: "bg-yellow-400 text-white border-yellow-500", icon: <MdAccessTime size={16} />,  tag: "warning",    dot: "🟡" },
  Leave:     { color: "bg-blue-100 border-blue-400 text-blue-700",       activeColor: "bg-blue-500 text-white border-blue-600",    icon: <MdBeachAccess size={16} />,  tag: "processing", dot: "🔵" },
  Holiday:   { color: "bg-orange-100 border-orange-400 text-orange-700", activeColor: "bg-orange-500 text-white border-orange-600", icon: <MdBeachAccess size={16} />,  tag: "warning",    dot: "🟠" },
};
const STATUSES = ["Present", "Absent", "Half Day", "Leave"];
const ALL_BATCHES_VALUE = "__all_batches__";

const DOW_MAP = {
  "Monday to Saturday": [1, 2, 3, 4, 5, 6],
  "Monday to Thursday": [1, 2, 3, 4],
  "Saturday & Sunday":  [6, 0],
};

// holidayMap is a Map of "YYYY-MM-DD" → holiday info — passed in from panel state
// Only academy holidays are disabled; government holidays are selectable (academy may be open)
const isDisabledDate = (d, batchDays, holidayMap) => {
  if (!batchDays) return false;
  if (!(DOW_MAP[batchDays] || []).includes(d.day())) return true;
  return false;
};

const isWorkingDateForBatch = (date, batch) => {
  if (!date || !batch?.days) return true;
  const allowedDays = DOW_MAP[batch.days] || [];
  return allowedDays.includes(date.day());
};

const getBatchDateRange = (batch) => {
  const start = batch?.startDate ? dayjs(batch.startDate).startOf("day") : null;
  const end = batch?.endDate ? dayjs(batch.endDate).endOf("day") : null;
  return { start, end };
};

const clampDateToBatchRange = (date, batch) => {
  if (!date) return date;
  const { start, end } = getBatchDateRange(batch);
  let candidate = date;
  if (start && candidate.isBefore(start, "day")) candidate = start;
  if (end && candidate.isAfter(end, "day")) candidate = end.startOf("day");

  if (isWorkingDateForBatch(candidate, batch)) return candidate;

  for (let offset = 1; offset <= 14; offset += 1) {
    const next = candidate.add(offset, "day");
    if ((!end || !next.isAfter(end, "day")) && isWorkingDateForBatch(next, batch)) return next;

    const previous = candidate.subtract(offset, "day");
    if ((!start || !previous.isBefore(start, "day")) && isWorkingDateForBatch(previous, batch)) return previous;
  }

  return candidate;
};

const parseAttendanceQrPayload = (rawValue) => {
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(String(rawValue));
    if (
      parsed &&
      (parsed.type === "student_attendance" || parsed.type === "student_id_card") &&
      (parsed.studentId || parsed.studentCode)
    ) {
      return parsed;
    }
  } catch {
    // Ignore non-JSON QR codes.
  }

  return null;
};

const INVALID_QR_MESSAGE =
  "QR code detected, but it is not a valid student attendance ID card QR code.";

const FACE_DESCRIPTOR_SIZE = 128;
const FACE_MODEL_VERSION = "face-api-128-v1";
const FACE_CAPTURE_WIDTH = 320;
const FACE_CROP_PADDING = 0.28;
let faceRecognitionModelsPromise = null;
let faceRecognitionApi = null;

const createFaceDetector = async () => {
  if (!faceRecognitionModelsPromise) {
    const modelUrl = `${import.meta.env.BASE_URL}models/face-api`;
    faceRecognitionModelsPromise = (async () => {
      faceRecognitionApi = await import("@vladmandic/face-api");
      await Promise.all([
        faceRecognitionApi.nets.tinyFaceDetector.loadFromUri(modelUrl),
        faceRecognitionApi.nets.faceLandmark68TinyNet.loadFromUri(modelUrl),
        faceRecognitionApi.nets.faceRecognitionNet.loadFromUri(modelUrl),
      ]);
    })().catch((error) => {
      faceRecognitionModelsPromise = null;
      faceRecognitionApi = null;
      throw error;
    });
  }
  await faceRecognitionModelsPromise;

  return {
    detect: async (image) => {
      const detections = await faceRecognitionApi
        .detectAllFaces(
          image,
          new faceRecognitionApi.TinyFaceDetectorOptions({
            inputSize: 416,
            scoreThreshold: 0.45,
          }),
        )
        .withFaceLandmarks(true)
        .withFaceDescriptors();

      return detections.map(({ detection, descriptor }) => {
        return {
          boundingBox: {
            x: detection.box.x,
            y: detection.box.y,
            width: detection.box.width,
            height: detection.box.height,
          },
          score: detection.score,
          descriptor: Array.from(descriptor),
        };
      });
    },
    close: () => {},
  };
};

const createFaceCaptureError = (code, message) =>
  Object.assign(new Error(message), { code });

const getFaceDescriptorDistance = (left, right) => {
  if (
    !Array.isArray(left) ||
    !Array.isArray(right) ||
    left.length !== FACE_DESCRIPTOR_SIZE ||
    right.length !== FACE_DESCRIPTOR_SIZE
  ) {
    return Number.POSITIVE_INFINITY;
  }

  let squaredDistance = 0;
  for (let index = 0; index < FACE_DESCRIPTOR_SIZE; index += 1) {
    const difference = left[index] - right[index];
    squaredDistance += difference * difference;
  }
  return Math.sqrt(squaredDistance);
};

const clampFaceRect = (rect, width, height) => {
  if (!rect || width <= 0 || height <= 0) return null;

  const boxWidth = Math.max(Number(rect.width) || 0, 1);
  const boxHeight = Math.max(Number(rect.height) || 0, 1);
  const padding = Math.max(boxWidth, boxHeight) * FACE_CROP_PADDING;
  const x = Math.max(0, (Number(rect.x) || 0) - padding);
  const y = Math.max(0, (Number(rect.y) || 0) - padding);
  const right = Math.min(width, (Number(rect.x) || 0) + boxWidth + padding);
  const bottom = Math.min(height, (Number(rect.y) || 0) + boxHeight + padding);

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
};

const createPreviewImage = (canvas, sourceRect = null) => {
  const previewCanvas = document.createElement("canvas");
  const rect = sourceRect || { x: 0, y: 0, width: canvas.width, height: canvas.height };
  const ratio = rect.width > 0 ? rect.height / rect.width : 0.75;
  previewCanvas.width = FACE_CAPTURE_WIDTH;
  previewCanvas.height = Math.round(FACE_CAPTURE_WIDTH * ratio);
  const previewContext = previewCanvas.getContext("2d");
  if (!previewContext) return canvas.toDataURL("image/jpeg", 0.72);
  previewContext.drawImage(
    canvas,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    previewCanvas.width,
    previewCanvas.height,
  );
  return previewCanvas.toDataURL("image/jpeg", 0.72);
};

const captureFaceFrame = async ({ video, canvas, detector, includePreview = true }) => {
  if (!video || video.readyState < 2 || !canvas) {
    throw new Error("Camera is not ready yet. Please wait a moment and try again.");
  }
  if (!detector) {
    throw createFaceCaptureError(
      "FACE_DETECTOR_UNAVAILABLE",
      "Face recognition is not ready. Restart the camera and try again.",
    );
  }

  const width = video.videoWidth || 640;
  const height = video.videoHeight || 480;
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Unable to read camera frame.");
  context.drawImage(video, 0, 0, width, height);

  const faces = await detector.detect(canvas);
  if (faces.length === 0) {
    throw createFaceCaptureError(
      "FACE_NOT_VISIBLE",
      "No face is visible. Center one student's face in the camera.",
    );
  }
  if (faces.length > 1) {
    throw createFaceCaptureError(
      "MULTIPLE_FACES",
      "Multiple faces detected. Keep only one student in frame.",
    );
  }

  const face = faces[0];
  const faceRect = clampFaceRect(face?.boundingBox, width, height);
  if (!faceRect) {
    throw createFaceCaptureError(
      "FACE_NOT_VISIBLE",
      "A face could not be located. Center the student's face in the camera.",
    );
  }

  const minFaceWidth = width * 0.12;
  const maxFaceWidth = width * 0.72;
  if (faceRect.width < minFaceWidth) {
    throw createFaceCaptureError(
      "FACE_TOO_SMALL",
      "Move a little closer so your face is clearly visible.",
    );
  }
  if (faceRect.width > maxFaceWidth) {
    throw createFaceCaptureError(
      "FACE_TOO_CLOSE",
      "Move slightly away from the camera and keep your full face in frame.",
    );
  }
  if (
    faceRect.x < width * 0.015 ||
    faceRect.y < height * 0.015 ||
    faceRect.x + faceRect.width > width * 0.985 ||
    faceRect.y + faceRect.height > height * 0.985
  ) {
    throw createFaceCaptureError(
      "FACE_OUT_OF_FRAME",
      "Center your full face inside the camera frame.",
    );
  }
  if (
    !Array.isArray(face?.descriptor) ||
    face.descriptor.length !== FACE_DESCRIPTOR_SIZE ||
    !face.descriptor.every((value) => Number.isFinite(value))
  ) {
    throw createFaceCaptureError(
      "FACE_QUALITY_LOW",
      "The face could not be recognized clearly. Improve the lighting and try again.",
    );
  }

  const cropRect = faceRect;

  return {
    imageData: includePreview ? createPreviewImage(canvas, cropRect) : "",
    descriptor: face.descriptor,
    score: face.score,
    usedDetectedFace: true,
  };
};

const waitForFaceCapture = async (captureOptions, onRetry) => {
  const deadline = Date.now() + 10000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      return await captureFaceFrame(captureOptions);
    } catch (error) {
      lastError = error;
      if (
        ![
          "FACE_NOT_VISIBLE",
          "MULTIPLE_FACES",
          "FACE_TOO_SMALL",
          "FACE_TOO_CLOSE",
          "FACE_OUT_OF_FRAME",
          "FACE_QUALITY_LOW",
        ].includes(error?.code)
      ) {
        throw error;
      }
      onRetry?.(error);
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  throw lastError || createFaceCaptureError(
    "FACE_NOT_VISIBLE",
    "No face was detected. Center one student's face in the camera and try again.",
  );
};

// ─── StatusPicker ─────────────────────────────────────────────────────────────
const StatusPicker = ({ value, onChange, disabled = false }) => (
  <div className="flex gap-1 flex-wrap">
    {STATUSES.map((s) => {
      const cfg = STATUS_CONFIG[s];
      const active = value === s;
      return (
        <button key={s} type="button" disabled={disabled} onClick={() => onChange(s)}
          className={`flex items-center gap-1 px-2 py-1 rounded border text-xs font-medium transition-all
            ${active ? cfg.activeColor : cfg.color} ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}>
          {cfg.icon}{s}
        </button>
      );
    })}
  </div>
);

const isStudentAttendanceEligible = (student) =>
  student?.attendanceEligible !== false;

const getBatchOptionLabel = (batch) =>
  `${batch?.batchName || "Batch"}${batch?.batchCode ? ` (${batch.batchCode})` : ""}`;

const getAttendanceRowKey = (record, fallbackBatchId = "") =>
  `${record?.attendanceBatchId || record?.batchId || fallbackBatchId}:${record?._id}`;

// ─── Legend ───────────────────────────────────────────────────────────────────
const Legend = () => (
  <div className="flex gap-3 flex-wrap text-xs">
    {STATUSES.map((s) => (
      <span key={s} className={`flex items-center gap-1 px-2 py-1 rounded border ${STATUS_CONFIG[s].color}`}>
        {STATUS_CONFIG[s].icon}{s}
      </span>
    ))}
  </div>
);

// ─── StatusTag helper ─────────────────────────────────────────────────────────
const StatusTag = ({ status }) => {
  if (!status) {
    return <Tag>Not Marked</Tag>;
  }
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.Absent;
  return (
    <Tag color={cfg.tag} className="flex items-center gap-1 w-fit">
      {cfg.icon}{status || "Absent"}
    </Tag>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MARK ATTENDANCE PANEL
// ═══════════════════════════════════════════════════════════════════════════════

// Calendar cell letters + colors
const CALENDAR_LETTER = { Present: "P", Absent: "A", "Half Day": "H", Leave: "L", Holiday: "O" };
const CALENDAR_BG    = {
  Present:   "bg-green-500 text-white",
  Absent:    "bg-red-500 text-white",
  "Half Day":"bg-yellow-400 text-white",
  Leave:     "bg-blue-500 text-white",
  Holiday:   "bg-orange-500 text-white",
};
// Dot colors for DatePicker cell indicators (inline style — outside Tailwind scope)
const DOT_COLOR = {
  Present:   "#22c55e",
  Absent:    "#ef4444",
  "Half Day":"#eab308",
  Leave:     "#3b82f6",
  Holiday:   "#f97316",
};

function MarkAttendancePanel({ batches }) {
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [activeTab, setActiveTab] = useState("student");
  const [members, setMembers] = useState({ students: [], teachers: [], batch: null });
  const [qrRoster, setQrRoster] = useState([]);
  const [qrRosterLoading, setQrRosterLoading] = useState(false);
  const [faceSetupRoster, setFaceSetupRoster] = useState([]);
  const [faceRosterLoading, setFaceRosterLoading] = useState(false);
  const [attendanceMap, setAttendanceMap] = useState({});   // personId → status
  const [timeMap, setTimeMap] = useState({});               // personId → "HH:mm DD MMM"
  const [calendarData, setCalendarData] = useState({});     // "YYYY-MM-DD" → { Present, Absent, ... }
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  // ── Holiday data ─────────────────────────────────────────────────────────
  // Map of "YYYY-MM-DD" → { name, type, reason }
  const [holidayMap, setHolidayMap] = useState(new Map());
  const [holidayModalOpen, setHolidayModalOpen] = useState(false);
  const [holidayName, setHolidayName] = useState("");
  const [holidayReason, setHolidayReason] = useState("");
  const [holidaySaving, setHolidaySaving] = useState(false);
  // ── Person filter ────────────────────────────────────────────────────────────
  const [personTypeFilter, setPersonTypeFilter] = useState("all"); // "all"|"student"|"teacher"
  const [selectedPersonId, setSelectedPersonId] = useState(null);
  const [personCalendarData, setPersonCalendarData] = useState({}); // "YYYY-MM-DD" → status string
  const selectedBatchDetails = useMemo(
    () => selectedBatch === ALL_BATCHES_VALUE
      ? null
      : batches.find((batch) => batch._id === selectedBatch) || null,
    [batches, selectedBatch],
  );
  const isAllBatchesSelected = selectedBatch === ALL_BATCHES_VALUE;
  const [attendanceMode, setAttendanceMode] = useState("manual");
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [qrSupported, setQrSupported] = useState(false);
  const [qrInitializing, setQrInitializing] = useState(false);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrScanError, setQrScanError] = useState("");
  const [qrSuccessOpen, setQrSuccessOpen] = useState(false);
  const [qrSuccessData, setQrSuccessData] = useState(null);
  const qrVideoRef = useRef(null);
  const qrCanvasRef = useRef(null);
  const qrStreamRef = useRef(null);
  const qrAnimationFrameRef = useRef(null);
  const qrDetectorRef = useRef(null);
  const qrBusyRef = useRef(false);
  const qrLastScanRef = useRef({ key: "", at: 0 });
  const qrLastErrorRef = useRef({ key: "", at: 0 });
  const qrSuccessTimerRef = useRef(null);
  const [faceSupported, setFaceSupported] = useState(false);
  const [faceSetupOpen, setFaceSetupOpen] = useState(false);
  const [faceScannerOpen, setFaceScannerOpen] = useState(false);
  const [faceInitializing, setFaceInitializing] = useState(false);
  const [faceCameraActive, setFaceCameraActive] = useState(false);
  const [faceFacingMode, setFaceFacingMode] = useState("user");
  const [faceBusy, setFaceBusy] = useState(false);
  const [faceEnrollmentProgress, setFaceEnrollmentProgress] = useState("");
  const [faceSetupReadiness, setFaceSetupReadiness] = useState({
    ready: false,
    message: "Waiting for camera...",
  });
  const [faceScanError, setFaceScanError] = useState("");
  const [faceScanStatus, setFaceScanStatus] = useState("idle");
  const [faceSearch, setFaceSearch] = useState("");
  const [faceSuccessOpen, setFaceSuccessOpen] = useState(false);
  const [faceSuccessData, setFaceSuccessData] = useState(null);
  const [faceNoMatchOpen, setFaceNoMatchOpen] = useState(false);
  const [faceNoMatchData, setFaceNoMatchData] = useState(null);
  const [faceSetupCandidateId, setFaceSetupCandidateId] = useState(null);
  const [faceSetupSuccessOpen, setFaceSetupSuccessOpen] = useState(false);
  const [faceSetupSuccessData, setFaceSetupSuccessData] = useState(null);
  const [faceEnrollmentStudent, setFaceEnrollmentStudent] = useState(null);
  const faceVideoRef = useRef(null);
  const faceCanvasRef = useRef(null);
  const faceStreamRef = useRef(null);
  const faceDetectorRef = useRef(null);
  const faceScanTimerRef = useRef(null);
  const faceBusyRef = useRef(false);
  const faceScanHandlerRef = useRef(null);
  const faceLastMatchRef = useRef({ key: "", at: 0, descriptor: null });
  const faceSetupThenMarkRef = useRef(false);
  const faceSuccessTimerRef = useRef(null);
  const faceNoMatchTimerRef = useRef(null);
  const loadCalendarRef = useRef(async () => {});
  const isQrMode = attendanceMode === "qr";
  const isFaceMode = attendanceMode === "face";

  useEffect(() => {
    faceLastMatchRef.current = { key: "", at: 0, descriptor: null };
  }, [selectedBatch, selectedDate]);

  useEffect(() => {
    if (!isQrMode) return;
    setSelectedBatch(null);
    setMembers({ students: [], teachers: [], batch: null });
    setAttendanceMap({});
    setTimeMap({});
    setDirty(false);
  }, [isQrMode]);

  // ── Load members when batch changes ────────────────────────────────────────
  useEffect(() => {
    if (!selectedBatch) return;
    setLoading(true);
    if (selectedBatch === ALL_BATCHES_VALUE) {
      Promise.all(
        batches.map((batch) =>
          getBatchMembers(batch._id)
            .then((res) => ({ batch, data: res.data || { students: [], teachers: [], batch: null } }))
            .catch(() => ({ batch, data: { students: [], teachers: [], batch: null } })),
        ),
      )
        .then((responses) => {
          const students = responses.flatMap(({ batch, data }) => {
            const batchDetails = data.batch || batch;
            const batchLabel = getBatchOptionLabel(batchDetails);

            return (data.students || []).map((student) => ({
              ...student,
              attendanceBatchId: batchDetails?._id || batch._id,
              attendanceBatchName: batchDetails?.batchName || batch.batchName,
              attendanceBatchLabel: batchLabel,
              attendanceBatchCode: batchDetails?.batchCode || batch.batchCode,
              attendanceBatchDays: batchDetails?.days || batch.days,
              attendanceBatchShift: batchDetails?.shift || batch.shift,
              attendanceBatchHoursPerDay: batchDetails?.hoursPerDay || batch.hoursPerDay,
              attendanceBatchStartDate: batchDetails?.startDate || batch.startDate,
              attendanceBatchEndDate: batchDetails?.endDate || batch.endDate,
              attendanceKey: `${batchDetails?._id || batch._id}:${student._id}`,
            }));
          });

          setMembers({ students, teachers: [], batch: null });
          setActiveTab("student");
          setPersonTypeFilter("student");
        })
        .catch(() => message.error("Failed to load batch members"))
        .finally(() => setLoading(false));
      return;
    }

    getBatchMembers(selectedBatch)
      .then((res) => {
        const data = res.data || { students: [], teachers: [], batch: null };
        const batchId = data.batch?._id || selectedBatch;
        setMembers({
          ...data,
          students: (data.students || []).map((student) => ({
            ...student,
            attendanceBatchId: batchId,
            attendanceBatchName: data.batch?.batchName,
            attendanceBatchLabel: getBatchOptionLabel(data.batch),
            attendanceBatchCode: data.batch?.batchCode,
            attendanceBatchDays: data.batch?.days,
            attendanceBatchShift: data.batch?.shift,
            attendanceBatchHoursPerDay: data.batch?.hoursPerDay,
            attendanceBatchStartDate: data.batch?.startDate,
            attendanceBatchEndDate: data.batch?.endDate,
            attendanceKey: `${batchId}:${student._id}`,
          })),
          teachers: (data.teachers || []).map((teacher) => ({
            ...teacher,
            attendanceBatchId: batchId,
            attendanceKey: `${batchId}:${teacher._id}`,
          })),
        });
      })
      .catch(() => message.error("Failed to load batch members"))
      .finally(() => setLoading(false));
  }, [batches, selectedBatch]);

  useEffect(() => {
    if (!members.teachers.length && activeTab !== "student") {
      setActiveTab("student");
    }
  }, [activeTab, members.teachers.length]);

  useEffect(() => {
    if (!selectedBatchDetails) return;
    setSelectedDate((current) => clampDateToBatchRange(current, selectedBatchDetails));
  }, [selectedBatchDetails]);

  useEffect(() => {
    faceLastMatchRef.current = { key: "", at: 0, descriptor: null };
  }, [selectedBatch, selectedDate]);

  useEffect(() => {
    if (!isQrMode || !batches.length) return;

    let cancelled = false;

    const loadQrRoster = async () => {
      setQrRosterLoading(true);

      try {
        const responses = await Promise.all(
          batches.map((batch) =>
            getBatchMembers(batch._id)
              .then((res) => ({ batch, data: res.data || { students: [], teachers: [], batch: null } }))
              .catch(() => ({ batch, data: { students: [], teachers: [], batch: null } })),
          ),
        );

        const rosterMap = new Map();

        responses.forEach(({ batch, data }) => {
          (data.students || [])
            .filter((student) => student.enrollmentStatus === "Active")
            .forEach((student) => {
              const key = String(student._id);
              const existing = rosterMap.get(key);
              const batchDetails = data.batch || batch;
              const batchLabel = batchDetails?.batchName
                ? `${batchDetails.batchName}${batchDetails.batchCode ? ` (${batchDetails.batchCode})` : ""}`
                : batch.batchName;

              if (!existing) {
                rosterMap.set(key, {
                  ...student,
                  batchLabels: [batchLabel],
                  batchIds: [batchDetails?._id || batch._id],
                });
                return;
              }

              if (!existing.batchIds.includes(batchDetails?._id || batch._id)) {
                existing.batchIds.push(batchDetails?._id || batch._id);
                existing.batchLabels.push(batchLabel);
              }
            });
        });

        if (!cancelled) {
          setQrRoster(
            Array.from(rosterMap.values()).sort((a, b) =>
              String(a.name || "").localeCompare(String(b.name || "")),
            ),
          );
        }
      } finally {
        if (!cancelled) {
          setQrRosterLoading(false);
        }
      }
    };

    loadQrRoster();

    return () => {
      cancelled = true;
    };
  }, [batches, isQrMode]);

  useEffect(() => {
    if (!isFaceMode || !batches.length) return undefined;

    let cancelled = false;
    setFaceRosterLoading(true);

    Promise.all(
      batches.map(async (batch) => {
        const response = await getBatchMembers(batch._id);
        return { batch, data: response.data || { students: [], batch: null } };
      }),
    )
      .then((responses) => {
        const rosterMap = new Map();
        responses.forEach(({ batch, data }) => {
          const batchDetails = data.batch || batch;
          const batchId = batchDetails?._id || batch._id;
          const batchLabel = getBatchOptionLabel(batchDetails);
          (data.students || [])
            .filter((student) => ["Active", "Enrolled"].includes(student.enrollmentStatus))
            .forEach((student) => {
              const key = String(student._id);
              const existing = rosterMap.get(key);
              if (!existing) {
                rosterMap.set(key, {
                  ...student,
                  attendanceKeys: [`${batchId}:${student._id}`],
                  batchLabels: [batchLabel],
                });
                return;
              }
              existing.attendanceKeys.push(`${batchId}:${student._id}`);
              if (!existing.batchLabels.includes(batchLabel)) {
                existing.batchLabels.push(batchLabel);
              }
              if (
                student.faceAttendance?.updatedAt &&
                (!existing.faceAttendance?.updatedAt ||
                  new Date(student.faceAttendance.updatedAt) >
                    new Date(existing.faceAttendance.updatedAt))
              ) {
                existing.faceAttendance = student.faceAttendance;
              }
            });
        });

        if (!cancelled) {
          setFaceSetupRoster(
            Array.from(rosterMap.values()).sort((left, right) =>
              String(left.name || "").localeCompare(String(right.name || "")),
            ),
          );
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setFaceSetupRoster([]);
          message.error(
            error?.response?.data?.message || "Unable to load face attendance students.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setFaceRosterLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [batches, isFaceMode]);

  useEffect(() => {
    setQrSupported(
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function",
    );
    setFaceSupported(
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function",
    );
  }, []);

  const stopQrScanner = useCallback(() => {
    if (qrAnimationFrameRef.current) {
      cancelAnimationFrame(qrAnimationFrameRef.current);
      qrAnimationFrameRef.current = null;
    }

    if (qrStreamRef.current) {
      qrStreamRef.current.getTracks().forEach((track) => track.stop());
      qrStreamRef.current = null;
    }

    if (qrVideoRef.current) {
      qrVideoRef.current.srcObject = null;
    }

    qrBusyRef.current = false;
    setQrBusy(false);
    setQrInitializing(false);
  }, []);

  useEffect(() => () => {
    stopQrScanner();
    if (qrSuccessTimerRef.current) {
      clearTimeout(qrSuccessTimerRef.current);
    }
  }, [stopQrScanner]);

  const handleQrAttendanceMarked = useCallback((studentRecord) => {
    const timestamp = dayjs().format("HH:mm, DD MMM");

    setAttendanceMap((prev) => ({
      ...prev,
      [studentRecord._id]: "Present",
    }));
    setTimeMap((prev) => ({
      ...prev,
      [studentRecord._id]: timestamp,
    }));
    setDirty(false);
    setQrSuccessData({
      ...studentRecord,
      markedAt: timestamp,
      attendanceDate: selectedDate.format("DD MMM YYYY"),
      batchName:
        studentRecord.batchName ||
        members.batch?.batchName ||
        selectedBatchDetails?.batchName ||
        "",
    });
    setQrSuccessOpen(true);

    if (qrSuccessTimerRef.current) {
      clearTimeout(qrSuccessTimerRef.current);
    }

    qrSuccessTimerRef.current = setTimeout(() => {
      setQrSuccessOpen(false);
    }, 5000);
  }, [members.batch?.batchName, selectedBatchDetails?.batchName, selectedDate]);

  const handleQrPayload = useCallback(async (payload) => {
    const studentRecord = qrRoster.find(
      (student) =>
        String(student._id || "") === String(payload.studentId || "") ||
        String(student.registrationNo || "").trim() === String(payload.studentCode || "").trim(),
    );

    if (!studentRecord) {
      const missingMessage =
        "This QR code does not match any active student in the current QR attendance roster.";
      setQrScanError(missingMessage);
      message.error(missingMessage);
      return;
    }

    const scanKey = String(studentRecord._id);
    const now = Date.now();
    if (
      qrLastScanRef.current.key === scanKey &&
      now - qrLastScanRef.current.at < 4000
    ) {
      return;
    }

    qrBusyRef.current = true;
    setQrBusy(true);
    setQrScanError("");

    try {
      setQrScanError("");
      const response = await markQrAttendance({
        date: selectedDate.format("YYYY-MM-DD"),
        studentId: payload.studentId,
        studentCode: payload.studentCode,
      });

      qrLastScanRef.current = { key: scanKey, at: now };
      const markedStudent = response?.data?.student || studentRecord;
      const batchesMarked = response?.data?.batchesMarked || [];

      handleQrAttendanceMarked({
        ...studentRecord,
        ...markedStudent,
        batchName:
          batchesMarked.length > 1
            ? `${batchesMarked.length} batches marked`
            : batchesMarked[0]?.batchName || studentRecord.batchLabels?.[0] || "",
      });

      message.success(
        response?.message ||
          "Attendance marked successfully.",
      );
    } catch (error) {
      const serverMessage = error?.response?.data?.message || "Failed to mark QR attendance";
      setQrScanError(serverMessage);
      message.error(serverMessage);
    } finally {
      qrBusyRef.current = false;
      setQrBusy(false);
    }
  }, [handleQrAttendanceMarked, qrRoster, selectedDate]);

  const reportQrScanError = useCallback((errorKey, errorMessage) => {
    const now = Date.now();
    if (
      qrLastErrorRef.current.key === errorKey &&
      now - qrLastErrorRef.current.at < 3000
    ) {
      return;
    }

    qrLastErrorRef.current = { key: errorKey, at: now };
    setQrScanError(errorMessage);
    message.error(errorMessage);
  }, []);

  const startQrScanner = useCallback(async () => {
    if (!qrSupported) {
      setQrScanError("This browser does not allow camera access for QR attendance.");
      return;
    }

    setQrScanError("");
    setQrInitializing(true);

    try {
      stopQrScanner();

      if (
        typeof window !== "undefined" &&
        typeof window.BarcodeDetector !== "undefined" &&
        !qrDetectorRef.current
      ) {
        qrDetectorRef.current = new window.BarcodeDetector({ formats: ["qr_code"] });
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
        },
        audio: false,
      });

      qrStreamRef.current = stream;

      if (qrVideoRef.current) {
        qrVideoRef.current.srcObject = stream;
        await qrVideoRef.current.play();
      }

      const scanFrame = async () => {
        const video = qrVideoRef.current;
        const detector = qrDetectorRef.current;
        const canvas = qrCanvasRef.current;

        if (!video || video.readyState < 2) {
          qrAnimationFrameRef.current = requestAnimationFrame(scanFrame);
          return;
        }

        try {
          let rawValue = "";

          if (detector) {
            const barcodes = await detector.detect(video);
            rawValue = barcodes[0]?.rawValue || "";
          } else if (canvas) {
            const context = canvas.getContext("2d", { willReadFrequently: true });
            if (context) {
              canvas.width = video.videoWidth || 1280;
              canvas.height = video.videoHeight || 720;
              context.drawImage(video, 0, 0, canvas.width, canvas.height);
              const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
              const qrCode = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "attemptBoth",
              });
              rawValue = qrCode?.data || "";
            }
          }

          if (rawValue && !qrBusyRef.current) {
            const payload = parseAttendanceQrPayload(rawValue);
            if (payload) {
              setQrScanError("");
              await handleQrPayload(payload);
            } else {
              reportQrScanError("invalid-qr", INVALID_QR_MESSAGE);
            }
          }
        } catch (error) {
          setQrScanError(error?.message || "Unable to read QR code from camera.");
        }

        qrAnimationFrameRef.current = requestAnimationFrame(scanFrame);
      };

      qrAnimationFrameRef.current = requestAnimationFrame(scanFrame);
    } catch (error) {
      setQrScanError(
        error?.message || "Camera access failed. Please allow camera permission and try again.",
      );
    } finally {
      setQrInitializing(false);
    }
  }, [handleQrPayload, qrSupported, reportQrScanError, stopQrScanner]);

  const closeQrScanner = useCallback(() => {
    setQrScannerOpen(false);
    stopQrScanner();
  }, [stopQrScanner]);

  const stopFaceCamera = useCallback(() => {
    if (faceScanTimerRef.current) {
      clearTimeout(faceScanTimerRef.current);
      faceScanTimerRef.current = null;
    }

    if (faceStreamRef.current) {
      faceStreamRef.current.getTracks().forEach((track) => track.stop());
      faceStreamRef.current = null;
    }

    if (faceVideoRef.current) {
      faceVideoRef.current.srcObject = null;
    }

    faceDetectorRef.current?.close?.();
    faceDetectorRef.current = null;
    faceBusyRef.current = false;
    setFaceBusy(false);
    setFaceInitializing(false);
    setFaceCameraActive(false);
    setFaceScanStatus("idle");
  }, []);

  const startFaceCamera = useCallback(async () => {
    if (!faceSupported) {
      setFaceScanError("Camera access is not available in this browser. Use Chrome/Edge on HTTPS or localhost.");
      return;
    }

    stopFaceCamera();
    setFaceScanError("");
    setFaceScanStatus("starting");
    setFaceInitializing(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: faceFacingMode },
          width: { ideal: 960 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      faceStreamRef.current = stream;

      if (faceVideoRef.current) {
        faceVideoRef.current.srcObject = stream;
        await faceVideoRef.current.play();
      }

      setFaceScanError("Camera opened. Loading face detection...");
      faceDetectorRef.current = await createFaceDetector();
      setFaceScanError("");
      setFaceCameraActive(true);
      setFaceScanStatus("scanning");
    } catch (error) {
      const permissionMessage =
        error?.name === "NotAllowedError" || error?.message === "Permission denied"
          ? "Camera permission was denied. Click the camera/lock icon near the address bar, allow Camera for this site, then press Start Camera again. Camera also requires HTTPS or localhost."
          : error?.name === "NotFoundError"
            ? "No camera was found on this device. Please connect or enable a camera and try again."
            : error?.message || "Camera access failed. Please allow camera permission and try again.";
      setFaceScanError(
        faceStreamRef.current
          ? `Camera is open, but face recognition could not start. Check that the local model files are served correctly, then restart the camera. ${error?.message || ""}`
          : permissionMessage,
      );
      setFaceCameraActive(false);
      setFaceScanStatus("error");
    } finally {
      setFaceInitializing(false);
    }
  }, [faceFacingMode, faceSupported, stopFaceCamera]);

  const closeFaceCameraModal = useCallback(() => {
    faceSetupThenMarkRef.current = false;
    setFaceSetupOpen(false);
    setFaceScannerOpen(false);
    stopFaceCamera();
  }, [stopFaceCamera]);

  const cancelFaceSetup = useCallback(() => {
    const shouldResumeScanner =
      faceSetupThenMarkRef.current && attendanceMode === "face";
    faceSetupThenMarkRef.current = false;
    setFaceSetupOpen(false);
    setFaceScannerOpen(shouldResumeScanner);
    stopFaceCamera();
  }, [attendanceMode, stopFaceCamera]);

  useEffect(() => {
    if (attendanceMode !== "qr") {
      closeQrScanner();
      return;
    }

    setQrScannerOpen(true);
  }, [attendanceMode, closeQrScanner]);

  useEffect(() => {
    if (attendanceMode !== "face") {
      closeFaceCameraModal();
      return;
    }

    if (!selectedBatch) {
      setSelectedBatch(ALL_BATCHES_VALUE);
      setFaceScanError("");
      setFaceCameraActive(false);
      setFaceScannerOpen(true);
      return;
    }

    setFaceScanError("");
    setFaceCameraActive(false);
    setFaceScannerOpen(true);
  }, [attendanceMode, selectedBatch, closeFaceCameraModal]);

  useEffect(() => {
    if (!qrScannerOpen) return;
    startQrScanner();
    return () => stopQrScanner();
  }, [qrScannerOpen, startQrScanner, stopQrScanner]);

  useEffect(() => {
    if (!faceSetupOpen && !faceScannerOpen) return;
    startFaceCamera();
    return () => stopFaceCamera();
  }, [faceSetupOpen, faceScannerOpen, startFaceCamera, stopFaceCamera]);

  useEffect(() => {
    if (!faceSetupOpen || !faceCameraActive || faceBusy) {
      if (faceSetupOpen && !faceBusy) {
        setFaceSetupReadiness({
          ready: false,
          message: faceInitializing ? "Starting camera..." : "Waiting for camera...",
        });
      }
      return undefined;
    }

    let active = true;
    let timer;
    const checkFace = async () => {
      if (!active) return;
      try {
        await captureFaceFrame({
          video: faceVideoRef.current,
          canvas: faceCanvasRef.current,
          detector: faceDetectorRef.current,
          includePreview: false,
        });
        if (active) {
          setFaceSetupReadiness({ ready: true, message: "Face ready - click Capture to save." });
        }
      } catch (error) {
        if (active) {
          setFaceSetupReadiness({
            ready: false,
            message: error?.message || "Center one student's face in the camera.",
          });
        }
      } finally {
        if (active) timer = setTimeout(checkFace, 500);
      }
    };

    setFaceSetupReadiness({ ready: false, message: "Looking for one face..." });
    checkFace();

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [faceSetupOpen, faceCameraActive, faceBusy, faceInitializing]);

  useEffect(() => () => {
    stopFaceCamera();
    if (faceSuccessTimerRef.current) {
      clearTimeout(faceSuccessTimerRef.current);
    }
    if (faceNoMatchTimerRef.current) {
      clearTimeout(faceNoMatchTimerRef.current);
    }
  }, [stopFaceCamera]);

  // ── Load calendar data for a given month ───────────────────────────────────
  // MERGE into existing map so navigating months keeps previous months' dots
  const loadCalendar = useCallback(async (batchId, dayjsDate) => {
    if (!batchId || !dayjsDate) return;
    try {
      // If batch info is available, avoid loading months that are completely
      // outside the batch start/end date range.
      if (members.batch) {
        const monthStart = dayjsDate.startOf("month");
        const monthEnd = dayjsDate.endOf("month");
        const batchStart = members.batch.startDate ? dayjs(members.batch.startDate).startOf("day") : null;
        const batchEnd = members.batch.endDate ? dayjs(members.batch.endDate).endOf("day") : null;
        if (batchStart && monthEnd.isBefore(batchStart, "day")) return;
        if (batchEnd && monthStart.isAfter(batchEnd, "day")) return;
      }

      const res = await getMonthCalendar(batchId, dayjsDate.year(), dayjsDate.month() + 1);
      setCalendarData((prev) => ({ ...prev, ...(res.data || {}) }));
    } catch { /* silent — calendar is decorative */ }
  }, [members.batch]);

  // ── Load holidays for a 2-year window when batch changes ────────────────
  useEffect(() => {
    loadCalendarRef.current = loadCalendar;
  }, [loadCalendar]);

  const loadHolidays = useCallback(async (batchId) => {
    if (!batchId) return;
    try {
      let from, to;
      if (members.batch && (members.batch.startDate || members.batch.endDate)) {
        const bs = members.batch.startDate ? dayjs(members.batch.startDate).format("YYYY-MM-DD") : null;
        const be = members.batch.endDate ? dayjs(members.batch.endDate).format("YYYY-MM-DD") : null;
        // Expand a little to include multi-day holidays that start/end near boundaries
        from = bs || `${new Date().getFullYear() - 1}-01-01`;
        to = be || `${new Date().getFullYear() + 2}-12-31`;
      } else {
        const year  = new Date().getFullYear();
        from = `${year - 1}-01-01`;
        to   = `${year + 2}-12-31`;
      }

      const res   = await getHolidayDates(from, to, batchId);
      const map   = new Map();
      (res.data || []).forEach((h) => {
        const existing = map.get(h.date);
        if (!existing || existing.type !== "academy" || h.type === "academy") {
          map.set(h.date, h);
        }
      });
      setHolidayMap(map);
    } catch { /* silent */ }
  }, [members.batch]);

  // Reload calendar when batch changes (clear old data first)
  useEffect(() => {
    if (!selectedBatch || selectedBatch === ALL_BATCHES_VALUE) return;
    setCalendarData({});
    setPersonCalendarData({});
    setSelectedPersonId(null);
    setPersonTypeFilter("all");
    loadCalendar(selectedBatch, selectedDate);
    loadHolidays(selectedBatch);
  }, [selectedBatch]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load all attendance records for a specific person → build date→status map ─
  const loadPersonCalendar = useCallback(async (personId, personType) => {
    if (!personId) { setPersonCalendarData({}); return; }
    try {
      const res = await getPersonAttendance(personId, personType);
      const map = {};
      (res.data || []).forEach((r) => {
        const d = new Date(r.date);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        map[dateStr] = r.status;
      });
      setPersonCalendarData(map);
    } catch { /* silent */ }
  }, []);

  // Person dropdown options based on type filter
  const personDropdownOptions = useMemo(() => {
    if (personTypeFilter === "student") {
      const studentMap = new Map();
      members.students.forEach((student) => {
        if (!studentMap.has(student._id)) studentMap.set(student._id, student);
      });
      return Array.from(studentMap.values());
    }
    if (personTypeFilter === "teacher") return members.teachers;
    const studentMap = new Map();
    members.students.forEach((student) => {
      if (!studentMap.has(student._id)) studentMap.set(student._id, student);
    });
    return [
      ...Array.from(studentMap.values()).map((s) => ({ ...s, _group: "Students" })),
      ...members.teachers.map((t) => ({ ...t, _group: "Teachers" })),
    ];
  }, [members, personTypeFilter]);

  const handlePersonTypeChange = (type) => {
    setPersonTypeFilter(type);
    setSelectedPersonId(null);
    setPersonCalendarData({});
    if (type !== "all") setActiveTab(type);
  };

  const handlePersonSelect = (personId) => {
    setSelectedPersonId(personId);
    if (!personId) { setPersonCalendarData({}); return; }
    const allPeople = [...members.students, ...members.teachers];
    const person = allPeople.find((p) => p._id === personId);
    if (person) loadPersonCalendar(personId, person.personType);
  };

  // ── Load existing attendance for the selected date ────────────────────────
  const loadAttendance = useCallback(async () => {
    if (!selectedBatch || !selectedDate) return;
    setLoading(true);
    try {
      const targetBatches =
        selectedBatch === ALL_BATCHES_VALUE
          ? batches
          : batches.filter((batch) => batch._id === selectedBatch);
      const responses = await Promise.all(
        targetBatches.map((batch) =>
          getAttendanceByBatchAndDate(batch._id, selectedDate.format("YYYY-MM-DD"))
            .then((res) => ({ batchId: batch._id, records: res.data || [] }))
            .catch(() => ({ batchId: batch._id, records: [] })),
        ),
      );
      const map = {};
      const tmap = {};
      responses.forEach(({ batchId, records }) => {
        records.forEach((r) => {
          const pid = r.person?._id || r.person;
          const key = `${batchId}:${pid}`;
          map[key] = r.status;
          if (r.updatedAt) {
            tmap[key] = dayjs(r.updatedAt).format("HH:mm, DD MMM");
          }
        });
      });
      setAttendanceMap(map);
      setTimeMap(tmap);
      setDirty(false);
    } catch { message.error("Failed to load attendance"); }
    finally { setLoading(false); }
  }, [batches, selectedBatch, selectedDate]);

  useEffect(() => { loadAttendance(); }, [loadAttendance]);

  const handleStatusChange = (personId, status) => {
    setAttendanceMap((prev) => ({ ...prev, [personId]: status }));
    setDirty(true);
  };

  const selectedDateKey = selectedDate?.format("YYYY-MM-DD");
  const selectedHoliday = selectedDateKey ? holidayMap.get(selectedDateKey) : null;
  const selectedDow = selectedDate?.day?.();
  const isScheduledWorkingDay = !!members.batch?.days && (DOW_MAP[members.batch.days] || []).includes(selectedDow);
  const isAcademyHoliday = selectedHoliday?.type === "academy";
  const isGovernmentHoliday = selectedHoliday?.type === "government";

  const openHolidayModal = () => {
    if (!selectedBatch || !selectedDate || !members.batch) return;
    setHolidayName(`${members.batch.batchName} Custom Holiday`);
    setHolidayReason("");
    setHolidayModalOpen(true);
  };

  const handleCreateBatchHoliday = async () => {
    if (!selectedBatch || !selectedDate) {
      message.warning("Select a batch and date first");
      return;
    }
    if (!holidayName.trim()) {
      message.warning("Enter a holiday name");
      return;
    }

    setHolidaySaving(true);
    try {
      const payload = {
        date: selectedDate.format("YYYY-MM-DD"),
        endDate: selectedDate.format("YYYY-MM-DD"),
        name: holidayName.trim(),
        type: "academy",
        reason: holidayReason.trim(),
        affectedBatches: [],
      };
      const res = await createHoliday(payload);
      message.success(res.message || "Holiday created for all batches and attendance marked as Holiday");
      setHolidayModalOpen(false);
      setHolidayReason("");
      setDirty(false);
      await Promise.all([
        loadHolidays(selectedBatch),
        loadAttendance(),
        loadCalendar(selectedBatch, selectedDate),
      ]);
    } catch (err) {
      message.error(err?.response?.data?.message || "Failed to create batch holiday");
    } finally {
      setHolidaySaving(false);
    }
  };

  const handleRemoveBatchHoliday = () => {
    Modal.confirm({
      title: "Unmark Global Holiday",
      content: `This will remove the academy holiday for ${selectedDate.format("DD MMM YYYY")} and restore attendance to Present for this date. Do you want to continue?`,
      okText: "Unmark Holiday",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: async () => {
        try {
          let holidayId = selectedHoliday?._id || null;

          // Re-resolve the holiday from the backend so unmark still works even
          // if the lightweight holiday-date cache missed the id for this date.
          if (!holidayId && selectedDate && selectedBatch) {
            const from = selectedDate.format("YYYY-MM-DD");
            const lookup = await getHolidays({
              from,
              to: from,
              batchId: selectedBatch,
              type: "academy",
            });

            const matchedHoliday = (lookup?.data || []).find((holiday) => {
              const holidayDate = holiday?.date
                ? dayjs(holiday.date).format("YYYY-MM-DD")
                : null;
              const holidayEndDate = holiday?.endDate
                ? dayjs(holiday.endDate).format("YYYY-MM-DD")
                : holidayDate;
              const targetDate = selectedDate.format("YYYY-MM-DD");

              return (
                holiday?.type === "academy" &&
                holidayDate &&
                holidayDate <= targetDate &&
                holidayEndDate >= targetDate
              );
            });

            holidayId = matchedHoliday?._id || null;
          }

          if (!holidayId) {
            message.warning("No holiday found for the selected date");
            return;
          }

          const res = await deleteHoliday(holidayId);
          message.success(res.message || "Holiday removed successfully");
          setDirty(false);
          await Promise.all([
            loadHolidays(selectedBatch),
            loadAttendance(),
            loadCalendar(selectedBatch, selectedDate),
          ]);
        } catch (err) {
          message.error(err?.response?.data?.message || "Failed to remove holiday");
        }
      },
    });
  };

  const handleSave = async () => {
    if (!selectedBatch || !selectedDate) { message.warning("Select a batch and date first"); return; }
    setSaving(true);
    try {
      const list = activeTab === "student" ? members.students : members.teachers;
      const recordsByBatch = list
        .filter((p) => p.personType !== "student" || isStudentAttendanceEligible(p))
        .filter(isAttendanceOpenForRow)
        .reduce((acc, p) => {
          const batchId = p.attendanceBatchId || selectedBatch;
          if (!batchId || batchId === ALL_BATCHES_VALUE) return acc;
          const key = p.attendanceKey || getAttendanceRowKey(p, batchId);
          if (!acc[batchId]) acc[batchId] = [];
          acc[batchId].push({
            personId: p._id,
            personType: p.personType,
            status: attendanceMap[key] || "Absent",
            notes: "",
          });
          return acc;
        }, {});

      const batchEntries = Object.entries(recordsByBatch).filter(([, records]) => records.length);
      if (!batchEntries.length) {
        message.warning("No attendance records available to save");
        return;
      }

      await Promise.all(
        batchEntries.map(([batchId, records]) =>
          bulkMarkAttendance(batchId, selectedDate.format("YYYY-MM-DD"), records),
        ),
      );
      message.success("Attendance saved successfully!");
      setDirty(false);
      // Refresh time stamps + calendar
      await loadAttendance();
      if (selectedBatch !== ALL_BATCHES_VALUE) {
        await loadCalendar(selectedBatch, selectedDate);
      }
    } catch (err) {
      message.error(err?.response?.data?.message || "Failed to save attendance");
    } finally { setSaving(false); }
  };

  const refreshFaceStudentInState = (studentId, faceAttendance) => {
    const updateStudent = (student) =>
      student._id === studentId
        ? {
            ...student,
            faceAttendance: {
              ...(student.faceAttendance || {}),
              ...faceAttendance,
              enabled: true,
              matcherVersion: 3,
              modelVersion: FACE_MODEL_VERSION,
            },
          }
        : student;

    setMembers((prev) => ({
      ...prev,
      students: (prev.students || []).map(updateStudent),
    }));
    setFaceSetupRoster((previous) => previous.map(updateStudent));
  };

  const openFaceSetup = (student, markAttendanceAfterSetup = false) => {
    faceSetupThenMarkRef.current = markAttendanceAfterSetup;
    setFaceEnrollmentStudent(student);
    setFaceScanError("");
    setFaceCameraActive(false);
    setFaceScannerOpen(false);
    setFaceSetupOpen(true);
  };

  const handleFaceEnrollmentCapture = async () => {
    if (!faceEnrollmentStudent?._id) {
      message.warning("Select a student first");
      return;
    }
    if (!faceCameraActive) {
      message.warning("Start the camera first, then capture the face.");
      return;
    }

    setFaceBusy(true);
    setFaceEnrollmentProgress("Preparing face registration...");
    faceBusyRef.current = true;
    setFaceScanStatus("scanning");

    try {
      const captures = [];
      for (let index = 0; index < 3; index += 1) {
        setFaceEnrollmentProgress(
          index === 0
            ? "Look straight at the camera for sample 1 of 3."
            : `Turn your face slightly, then hold still for sample ${index + 1} of 3.`,
        );
        if (index > 0) {
          await new Promise((resolve) => setTimeout(resolve, 750));
        }
        captures.push(
          await waitForFaceCapture({
            video: faceVideoRef.current,
            canvas: faceCanvasRef.current,
            detector: faceDetectorRef.current,
          }, (error) => {
            setFaceSetupReadiness({
              ready: false,
              message: error.message || "Hold still and center one face in the camera.",
            });
          }),
        );
        setFaceSetupReadiness({ ready: true, message: `Sample ${index + 1} captured.` });
      }
      const capture = captures[captures.length - 1];

      const enrollmentResponse = await enrollFaceAttendance({
        studentId: faceEnrollmentStudent._id,
        faceDescriptors: captures.map((sample) => sample.descriptor),
      });

      refreshFaceStudentInState(faceEnrollmentStudent._id, enrollmentResponse?.data?.student?.faceAttendance || {
        modelVersion: FACE_MODEL_VERSION,
        matcherVersion: 3,
        samplesCount: captures.length,
        updatedAt: new Date().toISOString(),
      });

      if (faceSetupThenMarkRef.current) {
        faceSetupThenMarkRef.current = false;
        try {
          const attendanceResponse = await markFaceAttendance({
            batchId: selectedBatch,
            date: selectedDate.format("YYYY-MM-DD"),
            faceDescriptor: capture.descriptor,
          });
          const markedStudent = attendanceResponse?.data?.student || {
            _id: faceEnrollmentStudent._id,
            name: faceEnrollmentStudent.name,
            registrationNo: faceEnrollmentStudent.registrationNo,
            gender: faceEnrollmentStudent.gender,
            profilePicture: faceEnrollmentStudent.profilePicture,
          };
          faceLastMatchRef.current = {
            key: String(markedStudent._id),
            at: Date.now(),
            descriptor: capture.descriptor,
            alreadyMarked: false,
          };
          handleFaceAttendanceMarked(
            markedStudent,
            attendanceResponse?.data?.confidence,
            attendanceResponse?.data?.batchesMarked || [],
            {
              capturedFaceImage: capture.imageData,
              attendanceRecords: attendanceResponse?.data?.attendanceRecords || [],
            },
          );
          message.success(attendanceResponse?.message || "Face saved and attendance marked.");
        } catch (attendanceError) {
          const alreadyMarkedData = attendanceError?.response?.data;
          if (alreadyMarkedData?.code === "ATTENDANCE_ALREADY_MARKED" && alreadyMarkedData.data?.student) {
            faceLastMatchRef.current = {
              key: String(alreadyMarkedData.data.student._id),
              at: Date.now(),
              descriptor: capture.descriptor,
              alreadyMarked: true,
            };
            handleFaceAttendanceMarked(
              alreadyMarkedData.data.student,
              alreadyMarkedData.data.confidence,
              alreadyMarkedData.data.batchesMarked || [],
              {
                capturedFaceImage: capture.imageData,
                alreadyMarked: true,
                attendanceRecords: alreadyMarkedData.data.attendanceRecords || [],
              },
            );
            message.info("Face setup saved; this student's attendance was already marked.");
          } else {
            const attendanceErrorMessage =
              alreadyMarkedData?.message ||
              attendanceError?.message ||
              "Face setup was saved, but attendance could not be marked. Retry the face scan.";
            setFaceScanError(attendanceErrorMessage);
            message.error(attendanceErrorMessage);
          }
        }

        setFaceSetupOpen(false);
        setFaceScannerOpen(true);
      } else {
        setFaceSetupSuccessData({
          ...(enrollmentResponse?.data?.student || faceEnrollmentStudent),
          name: enrollmentResponse?.data?.student?.name || faceEnrollmentStudent.name,
          registrationNo: enrollmentResponse?.data?.student?.registrationNo || faceEnrollmentStudent.registrationNo,
          capturedFaceImage: capture.imageData,
          batchName:
            faceEnrollmentStudent.batchLabels?.join(", ") ||
            faceEnrollmentStudent.attendanceBatchLabel ||
            faceEnrollmentStudent.attendanceBatchName ||
            "Face attendance roster",
        });
        setFaceSetupSuccessOpen(true);
        message.success(enrollmentResponse?.message || "Face setup saved successfully");
        setFaceSetupOpen(false);
        setFaceScannerOpen(true);
      }
    } catch (error) {
      faceSetupThenMarkRef.current = false;
      const errorMessage = error?.response?.data?.message || error?.message || "Failed to save face setup";
      setFaceScanError(errorMessage);
      Modal.error({
        title: error?.response?.data?.code === "FACE_ALREADY_ENROLLED"
          ? "Face Already Setup"
          : "Face Setup Failed",
        content: errorMessage,
      });
    } finally {
      faceBusyRef.current = false;
      setFaceBusy(false);
      setFaceEnrollmentProgress("");
      if (faceCameraActive && faceSetupOpen) {
        setFaceScanStatus("scanning");
      }
    }
  };

  const handleFaceAttendanceMarked = (studentRecord, confidence, batchesMarked = [], options = {}) => {
    const timestamp = dayjs().format("HH:mm, DD MMM");
    const records = options.attendanceRecords || [];
    const statusByBatch = new Map(
      records.map((record) => [String(record.batch), record.status]),
    );
    const timeByBatch = new Map(
      records.map((record) => [
        String(record.batch),
        record.createdAt ? dayjs(record.createdAt).format("HH:mm, DD MMM") : timestamp,
      ]),
    );
    const targetBatchIds = batchesMarked.length
      ? batchesMarked.map((batch) => batch._id)
      : records.map((record) => record.batch);

    setAttendanceMap((prev) => ({
      ...prev,
      ...targetBatchIds.reduce((acc, batchId) => {
        acc[`${batchId}:${studentRecord._id}`] =
          statusByBatch.get(String(batchId)) || "Present";
        return acc;
      }, {}),
    }));
    setTimeMap((prev) => ({
      ...prev,
      ...targetBatchIds.reduce((acc, batchId) => {
        acc[`${batchId}:${studentRecord._id}`] =
          timeByBatch.get(String(batchId)) || timestamp;
        return acc;
      }, {}),
    }));
    setDirty(false);
    setFaceSuccessData({
      ...studentRecord,
      confidence,
      capturedFaceImage: options.capturedFaceImage || "",
      alreadyMarked: !!options.alreadyMarked,
      attendanceRecords: records,
      markedAt: timestamp,
      attendanceDate: selectedDate.format("DD MMM YYYY"),
      batchName: batchesMarked.length > 1
        ? `${batchesMarked.length} batches marked`
        : batchesMarked[0]?.batchName || members.batch?.batchName || selectedBatchDetails?.batchName || "",
    });
    setFaceSuccessOpen(true);

    if (faceSuccessTimerRef.current) {
      clearTimeout(faceSuccessTimerRef.current);
    }

    faceSuccessTimerRef.current = setTimeout(() => {
      setFaceSuccessOpen(false);
      setFaceScanStatus("scanning");
    }, 2000);
  };

  const showFaceNoMatchPopup = ({ message: popupMessage, capturedFaceImage, title, code }) => {
    setFaceNoMatchData({
      title: title || "Face Not Matched",
      message: popupMessage,
      capturedFaceImage,
      code,
      attendanceDate: selectedDate.format("DD MMM YYYY"),
    });
    setFaceSetupCandidateId(null);
    setFaceNoMatchOpen(true);

    if (faceNoMatchTimerRef.current) {
      clearTimeout(faceNoMatchTimerRef.current);
      faceNoMatchTimerRef.current = null;
    }
  };

  const handleFaceScanAndMark = async ({ showToast = true } = {}) => {
    if (faceSetupOpen) return;
    if (!selectedBatch) {
      if (showToast) message.warning("Select a batch before using face attendance");
      return;
    }
    if (!faceCameraActive) {
      if (showToast) message.warning("Start the camera first, then scan the face.");
      return;
    }

    setFaceBusy(true);
    faceBusyRef.current = true;
    setFaceScanStatus("matching");
    let capture = null;

    try {
      capture = await captureFaceFrame({
        video: faceVideoRef.current,
        canvas: faceCanvasRef.current,
        detector: faceDetectorRef.current,
      });

      if (
        faceLastMatchRef.current.descriptor &&
        getFaceDescriptorDistance(
          capture.descriptor,
          faceLastMatchRef.current.descriptor,
        ) <= 0.1
      ) {
        return;
      }

      const response = await markFaceAttendance({
        batchId: selectedBatch,
        date: selectedDate.format("YYYY-MM-DD"),
        faceDescriptor: capture.descriptor,
      });
      if (faceSetupOpen) return;

      const matchedStudent = response?.data?.student;
      const matchKey = String(matchedStudent?._id || "");
      const now = Date.now();

      if (!matchKey) {
        throw new Error("The face scan matched, but no student record was returned.");
      }

      faceLastMatchRef.current = {
        key: matchKey,
        at: now,
        descriptor: capture.descriptor,
        alreadyMarked: false,
      };
      handleFaceAttendanceMarked(
        matchedStudent,
        response?.data?.confidence,
        response?.data?.batchesMarked || [],
        {
          capturedFaceImage: capture.imageData,
          attendanceRecords: response?.data?.attendanceRecords || [],
        },
      );
      setFaceScanError("");
      setFaceScanStatus("success");
      if (showToast) {
        message.success(response?.message || "Face attendance marked successfully.");
      }
      await loadAttendance();
    } catch (error) {
      if (faceSetupOpen) return;
      if (error?.response?.data?.code === "ATTENDANCE_ALREADY_MARKED") {
        const data = error.response.data.data || {};
        const matchedStudent = data.student;
        if (matchedStudent?._id) {
          const matchKey = String(matchedStudent._id);
          const now = Date.now();
          faceLastMatchRef.current = {
            key: matchKey,
            at: now,
            descriptor: capture?.descriptor || null,
            alreadyMarked: true,
          };
          handleFaceAttendanceMarked(
            matchedStudent,
            data.confidence,
            data.batchesMarked || [],
            {
              capturedFaceImage: capture?.imageData,
              alreadyMarked: true,
              attendanceRecords: data.attendanceRecords || [],
            },
          );
          setFaceScanError("");
          setFaceScanStatus("success");
          return;
        }
      }

      const errorCode = error?.response?.data?.code || error?.code;
      if (errorCode === "FACE_NOT_VISIBLE") {
        faceLastMatchRef.current = { key: "", at: 0, descriptor: null };
        setFaceScanError("");
        setFaceScanStatus("scanning");
        return;
      }

      const errorMessage = error?.response?.data?.message || error?.message || "Failed to mark face attendance";
      const isUnmatchedFace = ["FACE_MATCH_NOT_CONFIDENT", "FACE_NOT_SETUP"].includes(errorCode);
      if (isUnmatchedFace) {
        setFaceScanError(errorMessage);
        setFaceScanStatus("error");
        showFaceNoMatchPopup({
          title: errorCode === "FACE_NOT_SETUP" ? "Face Not Registered" : "Face Not Matched",
          message: errorCode === "FACE_NOT_SETUP"
            ? "This face is not registered. Select the existing student in front of the camera to complete face setup."
            : "A face was detected, but the match was inconclusive. The student may already be enrolled. Retry with the face centered and good lighting, or select the student to refresh their face setup.",
          capturedFaceImage: capture?.imageData,
          code: errorCode,
        });
      } else if (
        [
          "MULTIPLE_FACES",
          "FACE_TOO_SMALL",
          "FACE_TOO_CLOSE",
          "FACE_OUT_OF_FRAME",
          "FACE_QUALITY_LOW",
        ].includes(errorCode)
      ) {
        setFaceScanStatus("scanning");
        setFaceScanError(errorMessage);
      } else if (errorCode === "FACE_NO_ACTIVE_ENROLLMENT") {
        setFaceScanStatus("error");
        setFaceScanError(errorMessage);
        if (showToast) message.warning(errorMessage);
      } else if (errorCode === "FACE_DETECTOR_UNAVAILABLE") {
        setFaceScanStatus("error");
        setFaceScanError(errorMessage);
      } else {
        setFaceScanStatus("error");
        setFaceScanError(errorMessage);
      }
      if (
        showToast &&
        ![
          "MULTIPLE_FACES",
          "FACE_TOO_SMALL",
          "FACE_TOO_CLOSE",
          "FACE_OUT_OF_FRAME",
          "FACE_QUALITY_LOW",
          "FACE_NO_ACTIVE_ENROLLMENT",
        ].includes(errorCode)
      ) {
        message.error(errorMessage);
      }
    } finally {
      faceBusyRef.current = false;
      setFaceBusy(false);
      if (!faceSuccessOpen) {
        setFaceScanStatus("scanning");
      }
    }
  };

  // ── DatePicker: calendar cell renderer ────────────────────────────────────
  useEffect(() => {
    faceScanHandlerRef.current = handleFaceScanAndMark;
  });

  useEffect(() => {
    if (!faceScannerOpen || faceSetupOpen || !faceCameraActive || faceSuccessOpen || faceNoMatchOpen) return;

    faceScanHandlerRef.current?.({ showToast: false });

    faceScanTimerRef.current = setInterval(() => {
      if (!faceScannerOpen || faceSetupOpen || !faceCameraActive || faceSuccessOpen || faceNoMatchOpen) {
        return;
      }
      if (faceBusyRef.current) {
        return;
      }
      faceScanHandlerRef.current?.({ showToast: false });
    }, 1800);

    return () => {
      if (faceScanTimerRef.current) {
        clearInterval(faceScanTimerRef.current);
        faceScanTimerRef.current = null;
      }
    };
  }, [faceScannerOpen, faceSetupOpen, faceCameraActive, faceSuccessOpen, faceNoMatchOpen]);

  const cellRender = useCallback((current, info) => {
    if (info.type !== "date") return info.originNode;
    const dateStr = current.format("YYYY-MM-DD");

    const holiday = holidayMap.get(dateStr);

    // ── Academy holiday: disabled cell — show "SH" overlay only ───────────
    if (holiday && holiday.type === "academy") {
      const label = `Academy Holiday – ${holiday.name || holiday.reason || ""}${holiday.reason && holiday.name ? ` (${holiday.reason})` : ""}`;
      return React.cloneElement(info.originNode, {
        style: { height: "auto", lineHeight: "18px", padding: "2px 0" },
        children: (
          <Tooltip title={label} placement="top">
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
              <span>{current.date()}</span>
              <span style={{ fontSize: 7, color: "#2563eb", fontWeight: 700 }}>SH</span>
            </div>
          </Tooltip>
        ),
      });
    }

    // Government holiday badge — shown alongside attendance data (date is selectable)
    const govtBadge = holiday && holiday.type === "government" ? (
      <Tooltip title={`Public Holiday – ${holiday.name}`} placement="top">
        <span style={{ fontSize: 7, color: "#ea580c", fontWeight: 700, cursor: "default" }}>PH</span>
      </Tooltip>
    ) : null;

    // ── No filter selected: show plain date (+ PH badge if govt holiday) ──
    if (personTypeFilter === "all" && !selectedPersonId) {
      if (!govtBadge) return info.originNode;
      return React.cloneElement(info.originNode, {
        style: { height: "auto", lineHeight: "18px", padding: "2px 0" },
        children: (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
            <span>{current.date()}</span>
            {govtBadge}
          </div>
        ),
      });
    }

    if (selectedPersonId) {
      // ── Single-person view: show that person's status badge ──────────────
      const status = personCalendarData[dateStr];
      return React.cloneElement(info.originNode, {
        style: { height: "auto", lineHeight: "18px", padding: "3px 0 2px" },
        children: (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <span>{current.date()}</span>
            {govtBadge}
            {status && (
              <span
                title={status}
                style={{
                  backgroundColor: DOT_COLOR[status] || DOT_COLOR.Absent,
                  color: "#fff",
                  fontSize: 8,
                  fontWeight: 700,
                  lineHeight: "11px",
                  padding: "0 3px",
                  borderRadius: 2,
                }}
              >
                {CALENDAR_LETTER[status] || "?"}
              </span>
            )}
          </div>
        ),
      });
    }

    // ── Type filter selected: show combined counts (includes Holiday) ──────
    const dayData = calendarData[dateStr];
    const activeBadges = [...STATUSES, "Holiday"].filter((s) => (dayData?.[s] || 0) > 0);

    return React.cloneElement(info.originNode, {
      style: { height: "auto", lineHeight: "18px", padding: "3px 0 2px" },
      children: (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <span>{current.date()}</span>
          {govtBadge}
          {activeBadges.length > 0 && (
            <div style={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center" }}>
              {activeBadges.map((s) => (
                <span
                  key={s}
                  title={`${s}: ${dayData[s]}`}
                  style={{
                    backgroundColor: DOT_COLOR[s] || DOT_COLOR.Absent,
                    color: "#fff",
                    fontSize: 7,
                    fontWeight: 700,
                    lineHeight: "10px",
                    padding: "0 2px",
                    borderRadius: 2,
                    letterSpacing: 0,
                  }}
                >
                  {CALENDAR_LETTER[s] || "?"}{dayData[s]}
                </span>
              ))}
            </div>
          )}
        </div>
      ),
    });
  }, [calendarData, selectedPersonId, personCalendarData, personTypeFilter, holidayMap]);

  const batchInfo = members.batch || selectedBatchDetails;
  const batchDateRange = useMemo(() => getBatchDateRange(batchInfo), [batchInfo]);
  const formattedBatchDateRange = useMemo(() => {
    if (!batchInfo?.startDate && !batchInfo?.endDate) return null;
    const startLabel = batchInfo?.startDate
      ? dayjs(batchInfo.startDate).format("DD MMM YYYY")
      : "Open";
    const endLabel = batchInfo?.endDate
      ? dayjs(batchInfo.endDate).format("DD MMM YYYY")
      : "Open";
    return `${startLabel} to ${endLabel}`;
  }, [batchInfo]);
  // If a person is selected, filter the table to show only that person
  const filteredStudents = useMemo(() => {
    if (!selectedPersonId) return members.students;
    const found = members.students.filter((s) => s._id === selectedPersonId);
    return found.length ? found : members.students;
  }, [members.students, selectedPersonId]);

  const filteredTeachers = useMemo(() => {
    if (!selectedPersonId) return members.teachers;
    const found = members.teachers.filter((t) => t._id === selectedPersonId);
    return found.length ? found : members.teachers;
  }, [members.teachers, selectedPersonId]);

  const isAttendanceOpenForRow = (record) => {
    if (!isAllBatchesSelected || !selectedDate) return true;

    if (record.attendanceBatchStartDate) {
      const start = dayjs(record.attendanceBatchStartDate).startOf("day");
      if (selectedDate.isBefore(start, "day")) return false;
    }

    if (record.attendanceBatchEndDate) {
      const end = dayjs(record.attendanceBatchEndDate).endOf("day");
      if (selectedDate.isAfter(end, "day")) return false;
    }

    const allowedDays = DOW_MAP[record.attendanceBatchDays] || [];
    return allowedDays.includes(selectedDate.day());
  };

  const areAllVisibleStudentsPresent = useMemo(() => {
    const eligibleStudents = filteredStudents
      .filter(isStudentAttendanceEligible)
      .filter(isAttendanceOpenForRow);
    if (eligibleStudents.length === 0) return false;
    return eligibleStudents.every(
      (student) => (attendanceMap[student.attendanceKey] || "Absent") === "Present",
    );
  }, [attendanceMap, filteredStudents, selectedDate, isAllBatchesSelected]);

  const areAllVisibleTeachersPresent = useMemo(() => {
    const eligibleTeachers = filteredTeachers.filter(isAttendanceOpenForRow);
    if (eligibleTeachers.length === 0) return false;
    return eligibleTeachers.every(
      (teacher) => (attendanceMap[teacher.attendanceKey] || "Absent") === "Present",
    );
  }, [attendanceMap, filteredTeachers, selectedDate, isAllBatchesSelected]);

  const handleMarkAllVisibleStudentsPresent = (event) => {
    const shouldMarkPresent = Boolean(event?.target?.checked);

    setAttendanceMap((prev) => {
      const next = { ...prev };
      filteredStudents
        .filter(isStudentAttendanceEligible)
        .filter(isAttendanceOpenForRow)
        .forEach((student) => {
        next[student.attendanceKey] = shouldMarkPresent ? "Present" : "Absent";
        });
      return next;
    });
    setDirty(true);
  };

  const handleMarkAllVisibleTeachersPresent = (event) => {
    const shouldMarkPresent = Boolean(event?.target?.checked);

    setAttendanceMap((prev) => {
      const next = { ...prev };
      filteredTeachers
        .filter(isAttendanceOpenForRow)
        .forEach((teacher) => {
          next[teacher.attendanceKey] = shouldMarkPresent ? "Present" : "Absent";
        });
      return next;
    });
    setDirty(true);
  };

  const currentList = useMemo(() => {
    if (personTypeFilter === "student") return filteredStudents;
    if (personTypeFilter === "teacher") return filteredTeachers;
    return activeTab === "student" ? filteredStudents : filteredTeachers;
  }, [activeTab, personTypeFilter, filteredStudents, filteredTeachers]);
  const unmarkedCount = useMemo(
    () => currentList.filter((p) => !attendanceMap[p.attendanceKey]).length,
    [attendanceMap, currentList],
  );
  const hasSavedRecordsForSelection = useMemo(
    () => Object.keys(attendanceMap).length > 0,
    [attendanceMap],
  );
  const counts = [...STATUSES, "Holiday"].reduce((acc, s) => {
    acc[s] = currentList.filter((p) => attendanceMap[p.attendanceKey] === s).length;
    return acc;
  }, {});

  const studentCols = [
    { title: "#", width: 50, render: (_, __, i) => i + 1 },
    { title: "Name", dataIndex: "name", render: (v) => <span className="font-medium">{v}</span> },
    { title: "Reg. No", dataIndex: "registrationNo" },
    ...(isAllBatchesSelected || isFaceMode ? [{
      title: "Batch",
      dataIndex: "attendanceBatchLabel",
      render: (label, record) => (
        <div className="flex flex-col gap-1">
          <Tag color="processing">{label || record.attendanceBatchName || "Batch"}</Tag>
          <span className="text-[11px] text-slate-400">{record.attendanceBatchDays || ""}</span>
          {!isAttendanceOpenForRow(record) && (
            <Tag color="default" className="w-fit">Not scheduled today</Tag>
          )}
        </div>
      ),
    }] : []),
    { title: "Gender", dataIndex: "gender", render: (g) => <Tag color={g === "Male" ? "blue" : "pink"}>{g}</Tag> },
    {
      title: "Enrollment",
      dataIndex: "enrollmentStatus",
      render: (status, record) => {
        const color =
          status === "Active" ? "green" :
          status === "On Hold" ? "orange" :
          status === "Completed" ? "blue" :
          status === "Dropped" ? "red" : "default";
        return (
          <div className="flex flex-col gap-1">
            <Tag color={color}>{status || "Unknown"}</Tag>
            {!isStudentAttendanceEligible(record) && (
              <span className="text-[11px] font-medium text-amber-700">
                Attendance locked
              </span>
            )}
          </div>
        );
      },
    },
    {
      title: "Mark Attendance",
      render: (_, r) => (
        <StatusPicker
          disabled={isAcademyHoliday || !isStudentAttendanceEligible(r) || !isAttendanceOpenForRow(r)}
          value={attendanceMap[r.attendanceKey]}
          onChange={(s) => handleStatusChange(r.attendanceKey, s)}
        />
      ),
    },
    {
      title: "Note",
      dataIndex: "enrollmentNotes",
      render: (note, record) =>
        !isStudentAttendanceEligible(record) ? (
          <span className="text-xs text-slate-600">
            {note || "No note added"}
          </span>
        ) : (
          <span className="text-xs text-slate-400">-</span>
        ),
    },
    {
      title: "Status", width: 130,
      render: (_, r) => (
        <div className="flex flex-col gap-1">
          <StatusTag status={attendanceMap[r.attendanceKey]} />
          {timeMap[r.attendanceKey] && (
            <span className="text-[10px] text-gray-400">🕐 {timeMap[r.attendanceKey]}</span>
          )}
        </div>
      ),
    },
  ];

  const teacherCols = [
    { title: "#", width: 50, render: (_, __, i) => i + 1 },
    { title: "Name", dataIndex: "name", render: (v) => <span className="font-medium">{v}</span> },
    { title: "ID", dataIndex: "teacherId" },
    { title: "Designation", dataIndex: "designation", render: (d) => d || "—" },
    { title: "Gender", dataIndex: "gender", render: (g) => <Tag color={g === "Male" ? "blue" : "pink"}>{g}</Tag> },
    { title: "Mark Attendance", render: (_, r) => <StatusPicker disabled={isAcademyHoliday} value={attendanceMap[r.attendanceKey]} onChange={(s) => handleStatusChange(r.attendanceKey, s)} /> },
    {
      title: "Status", width: 130,
      render: (_, r) => (
        <div className="flex flex-col gap-1">
          <StatusTag status={attendanceMap[r.attendanceKey]} />
          {timeMap[r.attendanceKey] && (
            <span className="text-[10px] text-gray-400">🕐 {timeMap[r.attendanceKey]}</span>
          )}
        </div>
      ),
    },
  ];

  const qrStudentCols = [
    { title: "#", width: 50, render: (_, __, i) => i + 1 },
    { title: "Name", dataIndex: "name", render: (v) => <span className="font-medium">{v}</span> },
    { title: "Reg. No", dataIndex: "registrationNo" },
    { title: "Gender", dataIndex: "gender", render: (g) => <Tag color={g === "Male" ? "blue" : "pink"}>{g}</Tag> },
    {
      title: "Active Batches",
      dataIndex: "batchLabels",
      render: (labels = []) => (
        <div className="flex flex-wrap gap-1">
          {labels.map((label) => (
            <Tag key={label} color="processing">{label}</Tag>
          ))}
        </div>
      ),
    },
    {
      title: "QR Status",
      width: 150,
      render: (_, r) => (
        <div className="flex flex-col gap-1">
          <StatusTag status={attendanceMap[r._id]} />
          {timeMap[r._id] && (
            <span className="text-[10px] text-gray-400">🕐 {timeMap[r._id]}</span>
          )}
        </div>
      ),
    },
  ];

  const faceRoster = useMemo(() => {
    const rosterMap = new Map();
    const rosterStudents = isFaceMode ? faceSetupRoster : members.students;
    rosterStudents.forEach((student) => {
      const key = String(student._id);
      const batchLabels = student.batchLabels?.length
        ? student.batchLabels
        : [student.attendanceBatchLabel || student.attendanceBatchName].filter(Boolean);
      const existing = rosterMap.get(key);

      if (!existing) {
        rosterMap.set(key, {
          ...student,
          attendanceKeys: student.attendanceKeys?.length
            ? [...student.attendanceKeys]
            : student.attendanceKey
              ? [student.attendanceKey]
              : [],
          batchLabels: [...batchLabels],
        });
        return;
      }

      for (const attendanceKey of student.attendanceKeys || [student.attendanceKey].filter(Boolean)) {
        if (!existing.attendanceKeys.includes(attendanceKey)) {
          existing.attendanceKeys.push(attendanceKey);
        }
      }
      for (const batchLabel of batchLabels) {
        if (!existing.batchLabels.includes(batchLabel)) {
          existing.batchLabels.push(batchLabel);
        }
      }
      if (!existing.faceAttendance?.enabled && student.faceAttendance?.enabled) {
        existing.faceAttendance = student.faceAttendance;
      }
    });

    const query = faceSearch.trim().toLowerCase();
    return Array.from(rosterMap.values())
      .filter((student) => {
        if (!query) return true;
        return [
          student.name,
          student.registrationNo,
          student.gender,
          ...(student.batchLabels || []),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      })
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }, [faceSearch, faceSetupRoster, isFaceMode, members.students]);

  const getFaceRosterAttendanceStatus = (student) => {
    const keys = student.attendanceKeys?.length ? student.attendanceKeys : [student.attendanceKey].filter(Boolean);
    if (keys.some((key) => attendanceMap[key] === "Present")) return "Present";
    return keys.map((key) => attendanceMap[key]).find(Boolean);
  };

  const getFaceRosterAttendanceTime = (student) => {
    const keys = student.attendanceKeys?.length ? student.attendanceKeys : [student.attendanceKey].filter(Boolean);
    return keys.map((key) => timeMap[key]).find(Boolean);
  };

  const faceStudentCols = [
    { title: "#", width: 50, render: (_, __, i) => i + 1 },
    { title: "Name", dataIndex: "name", render: (v) => <span className="font-medium">{v}</span> },
    { title: "Reg. No", dataIndex: "registrationNo" },
    ...(isAllBatchesSelected ? [{
      title: "Batches",
      dataIndex: "batchLabels",
      render: (labels = []) => (
        <div className="flex flex-wrap gap-1">
          {labels.map((label) => (
            <Tag key={label} color="processing">{label}</Tag>
          ))}
        </div>
      ),
    }] : []),
    { title: "Gender", dataIndex: "gender", render: (g) => <Tag color={g === "Male" ? "blue" : "pink"}>{g}</Tag> },
    {
      title: "Face Setup",
      width: 180,
      render: (_, r) => {
        const enabled = !!r.faceAttendance?.enabled;
        const currentMatcher = r.faceAttendance?.modelVersion === FACE_MODEL_VERSION;
        return (
          <div className="flex flex-col gap-2">
            <Tag color={currentMatcher ? "green" : "orange"} className="w-fit">
              {currentMatcher ? "Ready" : enabled ? "Refresh Needed" : "Not Setup"}
            </Tag>
            {r.faceAttendance?.updatedAt && (
              <span className="text-[10px] text-slate-400">
                Updated {dayjs(r.faceAttendance.updatedAt).format("DD MMM, HH:mm")}
              </span>
            )}
          </div>
        );
      },
    },
    {
      title: "Today's Status",
      width: 150,
      render: (_, r) => (
        <div className="flex flex-col gap-1">
          <StatusTag status={getFaceRosterAttendanceStatus(r)} />
          {getFaceRosterAttendanceTime(r) && (
            <span className="text-[10px] text-gray-400">Marked {getFaceRosterAttendanceTime(r)}</span>
          )}
        </div>
      ),
    },
    {
      title: "Action",
      width: 170,
      render: (_, r) => (
        <Button
          icon={<MdCameraAlt size={16} />}
          onClick={() => openFaceSetup(r)}
          disabled={!isStudentAttendanceEligible(r)}
        >
          {!r.faceAttendance?.enabled
            ? "Setup Face"
            : r.faceAttendance?.modelVersion === FACE_MODEL_VERSION
              ? "Re-Setup Face"
              : "Refresh Face Setup"}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* CSS for the attendance DatePicker portal — targets .attend-cal class */}
      <style>{`
        .attend-cal .ant-picker-cell-inner { height: auto !important; min-height: 24px; overflow: visible !important; }
        .attend-cal td.ant-picker-cell { height: auto !important; overflow: visible !important; vertical-align: top !important; }
        .attend-cal .ant-picker-body tbody tr { height: auto !important; }
        .face-scan-frame::before {
          content: "";
          position: absolute;
          inset: 28px;
          border: 2px solid rgba(45, 212, 191, 0.9);
          border-radius: 28px;
          box-shadow: 0 0 0 999px rgba(15, 23, 42, 0.18), 0 0 24px rgba(45, 212, 191, 0.35);
          pointer-events: none;
        }
        .face-scan-frame.face-setup-ready::before {
          border-color: rgba(52, 211, 153, 0.95);
          box-shadow: 0 0 0 999px rgba(15, 23, 42, 0.18), 0 0 28px rgba(52, 211, 153, 0.5);
        }
        .face-scan-frame::after {
          content: "";
          position: absolute;
          left: 44px;
          right: 44px;
          top: 38px;
          height: 3px;
          border-radius: 999px;
          background: linear-gradient(90deg, transparent, #67e8f9, transparent);
          animation: faceScanSweep 1.7s ease-in-out infinite;
          pointer-events: none;
        }
        .face-scan-frame.face-setup-ready::after {
          background: linear-gradient(90deg, transparent, #34d399, transparent);
        }
        @keyframes faceScanSweep {
          0% { transform: translateY(0); opacity: 0.25; }
          50% { transform: translateY(270px); opacity: 1; }
          100% { transform: translateY(0); opacity: 0.25; }
        }
      `}</style>
      {/* Controls */}
      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1 min-w-[220px]">
          <label className="text-xs font-semibold text-gray-600">Select Batch</label>
          <Select placeholder="Choose a batch" value={selectedBatch}
            onChange={(v) => {
              const nextBatch = v === ALL_BATCHES_VALUE
                ? null
                : batches.find((batch) => batch._id === v) || null;
              setSelectedBatch(v);
              if (nextBatch) {
                setSelectedDate((current) => clampDateToBatchRange(current, nextBatch));
              }
              setAttendanceMap({});
              setTimeMap({});
              setCalendarData({});
              setHolidayMap(new Map());
              setFaceSearch("");
              setDirty(false);
            }}
            disabled={isQrMode}
            showSearch filterOption={(input, o) => o?.label?.toLowerCase().includes(input.toLowerCase())}
            options={[
              { value: ALL_BATCHES_VALUE, label: "All batches" },
              ...batches.map((b) => ({ value: b._id, label: getBatchOptionLabel(b) })),
            ]}
            className="w-full" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">
            Select Date {batchInfo && <span className="ml-1 text-blue-500 font-normal">({batchInfo.days})</span>}
          </label>
          <DatePicker
            value={selectedDate}
            onChange={(d) => {
              if (d) {
                setSelectedDate(isQrMode ? d : clampDateToBatchRange(d, batchInfo));
                setDirty(false);
              }
            }}
            onPanelChange={(d) => { if (d && selectedBatch && !isQrMode) loadCalendar(selectedBatch, d); }}
            onOpenChange={(open) => { if (open && selectedBatch && !isQrMode) loadCalendar(selectedBatch, selectedDate); }}
            minDate={isQrMode ? undefined : batchDateRange.start || undefined}
            maxDate={isQrMode ? undefined : batchDateRange.end || undefined}
            disabledDate={(d) => {
              if (!d) return true;
              if (isQrMode) return false;
              // Disable dates outside the batch's start/end date range
              if (batchInfo) {
                if (batchInfo.startDate) {
                  const bs = dayjs(batchInfo.startDate).startOf("day");
                  if (d.isBefore(bs, "day")) return true;
                }
                if (batchInfo.endDate) {
                  const be = dayjs(batchInfo.endDate).endOf("day");
                  if (d.isAfter(be, "day")) return true;
                }
              }
              return isDisabledDate(d, batchInfo?.days, holidayMap);
            }}
            renderExtraFooter={() =>
              holidayMap.size > 0 ? (
                <div className="text-xs text-gray-500 px-2 py-1">
                  Academy holidays (SH) stay selectable so admins can unmark them. Government holidays (PH) also stay selectable when the academy is open.
                </div>
              ) : null
            }
            cellRender={cellRender}
            classNames={{ popup: { root: "attend-cal" } }}
            format="DD MMM YYYY"
            allowClear={false}
          />
          {!isQrMode && formattedBatchDateRange && (
            <span className="text-[11px] text-slate-500">
              Attendance available only from {formattedBatchDateRange}
            </span>
          )}
        </div>
        {!isQrMode && batchInfo && (
          <div className="flex flex-wrap gap-2 items-center text-xs">
            <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded">{batchInfo.shift} Shift</span>
            <span className="bg-purple-50 text-purple-700 border border-purple-200 px-2 py-1 rounded">{batchInfo.days}</span>
            <span className="bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded">{batchInfo.hoursPerDay}h/day</span>
            {formattedBatchDateRange && (
              <span className="bg-slate-50 text-slate-700 border border-slate-200 px-2 py-1 rounded">
                {formattedBatchDateRange}
              </span>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Attendance Mode</label>
          <Segmented
            value={attendanceMode}
            onChange={setAttendanceMode}
            options={[
              { label: "Manual", value: "manual" },
              { label: "QR Scan", value: "qr" },
              { label: "Face Scan", value: "face" },
            ]}
          />
        </div>
        {attendanceMode === "qr" && (
          <div className="flex flex-col gap-1 min-w-[220px]">
            <label className="text-xs font-semibold text-gray-600">QR Attendance</label>
            <Button
              type="primary"
              icon={<MdQrCodeScanner size={18} />}
              onClick={() => setQrScannerOpen(true)}
              className="!h-[42px] !rounded-xl !border-0 !font-medium"
              style={{
                background: "linear-gradient(135deg, #0f766e 0%, #14532d 100%)",
              }}
            >
              Open Scanner
            </Button>
            <span className="text-[11px] text-slate-500">
              Scan the student ID card QR code. The system will detect the correct active batch automatically.
            </span>
          </div>
        )}

        {/* ── Person filter: type + name dropdown ── */}
        {selectedBatch && !isQrMode && !isFaceMode && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Filter by Type</label>
              <Segmented
                value={personTypeFilter}
                onChange={handlePersonTypeChange}
                options={[
                  { label: "All", value: "all" },
                  { label: "Students", value: "student" },
                  { label: "Teachers", value: "teacher" },
                ]}
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[200px]">
              <label className="text-xs font-semibold text-gray-600">
                Filter by Name
                {selectedPersonId && (
                  <button
                    className="ml-2 text-blue-500 font-normal hover:underline"
                    onClick={() => handlePersonSelect(null)}
                  >
                    Clear
                  </button>
                )}
              </label>
              <Select
                placeholder="All people (show combined)"
                value={selectedPersonId}
                onChange={handlePersonSelect}
                allowClear
                showSearch
                filterOption={(input, o) => o?.label?.toLowerCase().includes(input.toLowerCase())}
                options={personDropdownOptions.map((p) => ({
                  value: p._id,
                  label: p.name,
                  title: p.personType === "student"
                    ? `Student · Reg: ${p.registrationNo || "—"}`
                    : `Teacher · ID: ${p.teacherId || "—"}`,
                }))}
                optionRender={(opt) => (
                  <div className="flex flex-col">
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-[10px] text-gray-400">{opt.data.title}</span>
                  </div>
                )}
                className="w-full"
              />
            </div>
          </>
        )}

      </div>

      {!isQrMode && !isFaceMode && selectedBatch && batchInfo && (
        <div className="bg-white rounded-xl shadow p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-gray-700">
                {selectedDate.format("dddd, DD MMMM YYYY")}
              </span>
              {isScheduledWorkingDay ? (
                <Tag color="green">Scheduled Working Day</Tag>
              ) : (
                <Tag color="default">Non-Working Day</Tag>
              )}
              {isGovernmentHoliday && <Tag color="orange">Government Holiday</Tag>}
              {isAcademyHoliday && <Tag color="blue">Academy Holiday</Tag>}
            </div>
            <p className="text-sm text-gray-600">
              {isAcademyHoliday
                ? `Attendance is closed for this batch because "${selectedHoliday?.name}" is marked as an academy holiday. All students and teachers are shown as Holiday.`
                : isGovernmentHoliday
                  ? `This date is a government holiday${selectedHoliday?.name ? `: ${selectedHoliday.name}` : ""}, but attendance is still allowed because the academy can remain open.`
                  : isScheduledWorkingDay
                    ? "This is a normal working day for the selected batch. You can mark attendance or turn this date into a holiday for all batches."
                    : "This date is outside the batch schedule, so attendance should not be marked here."}
            </p>
            {selectedHoliday?.reason && (
              <p className="text-xs text-gray-500">Reason: {selectedHoliday.reason}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {isScheduledWorkingDay && !isAcademyHoliday && (
              <Button onClick={openHolidayModal} className="border-orange-300 text-orange-600">
                Mark This Day as Global Holiday
              </Button>
            )}
            {isAcademyHoliday && (
              <Button danger onClick={handleRemoveBatchHoliday}>
                Unmark Global Holiday
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Summary counts */}
      {!isQrMode && !isFaceMode && selectedBatch && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {unmarkedCount > 0 && (
            <div className="rounded-xl border px-4 py-3 flex items-center gap-3 bg-gray-50 border-gray-300 text-gray-700">
              <span className="text-2xl font-bold">{unmarkedCount}</span>
              <div className="flex flex-col">
                <span className="text-xs font-semibold">Not Marked</span>
                <span className="text-[11px] opacity-70">of {currentList.length}</span>
              </div>
              <span className="text-lg font-semibold">?</span>
            </div>
          )}
          {STATUSES.map((s) => (
            <div key={s} className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${STATUS_CONFIG[s].color}`}>
              <span className="text-2xl font-bold">{counts[s]}</span>
              <div className="flex flex-col">
                <span className="text-xs font-semibold">{s}</span>
                <span className="text-[11px] opacity-70">of {currentList.length}</span>
              </div>
              {STATUS_CONFIG[s].icon}
            </div>
          ))}
          {counts.Holiday > 0 && (
            <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${STATUS_CONFIG.Holiday.color}`}>
              <span className="text-2xl font-bold">{counts.Holiday}</span>
              <div className="flex flex-col">
                <span className="text-xs font-semibold">Holiday</span>
                <span className="text-[11px] opacity-70">of {currentList.length}</span>
              </div>
              {STATUS_CONFIG.Holiday.icon}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      {isQrMode ? (
        <div className="bg-white rounded-xl shadow">
          <div className="border-b border-slate-100 px-4 py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-800">QR Attendance Roster</div>
              <div className="text-xs text-slate-500">
                All active students across batches are listed here. Scan a student ID card and the system will mark that student present in the correct active batch for {selectedDate.format("DD MMM YYYY")}.
              </div>
            </div>
            <div className="text-xs text-slate-500">
              {qrRoster.length} active students available
            </div>
          </div>
          <Spin spinning={qrRosterLoading || loading}>
            <Table
              dataSource={qrRoster}
              columns={qrStudentCols}
              rowKey="_id"
              pagination={false}
              size="middle"
              locale={{ emptyText: "No active students were found across batches" }}
            />
          </Spin>
        </div>
      ) : isFaceMode && selectedBatch ? (
        <div className="bg-white rounded-xl shadow">
          <div className="border-b border-slate-100 px-4 py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-800">Face Attendance Setup</div>
              <div className="text-xs text-slate-500">
                Enroll each student's face once. Selecting Face Scan opens the camera automatically for {selectedDate.format("DD MMM YYYY")}.
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Tag color="green">
                {faceRoster.filter((student) => student.faceAttendance?.modelVersion === FACE_MODEL_VERSION).length} ready
              </Tag>
              <Tag color="orange">
                {faceRoster.filter((student) => student.faceAttendance?.modelVersion !== FACE_MODEL_VERSION).length} pending
              </Tag>
            </div>
          </div>
          <div className="border-b border-slate-100 px-4 py-3">
            <Input
              allowClear
              value={faceSearch}
              onChange={(event) => setFaceSearch(event.target.value)}
              placeholder="Search student by name, registration no, gender, or batch"
              className="max-w-md"
            />
          </div>
          <Spin spinning={loading || faceRosterLoading}>
            <Table
              dataSource={faceRoster}
              columns={faceStudentCols}
              rowKey="_id"
              pagination={false}
              size="middle"
              locale={{ emptyText: "No students enrolled in this batch" }}
            />
          </Spin>
        </div>
      ) : !isFaceMode && selectedBatch ? (
        <div className="bg-white rounded-xl shadow">
          {!isAcademyHoliday && !hasSavedRecordsForSelection && (
            <div className="mx-4 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              No saved attendance record was found for {selectedDate.format("DD MMM YYYY")} in this batch yet. If you expected previous-month data here, check the backup or source database because the local <code>attendances</code> collection is currently empty.
            </div>
          )}
          <Tabs activeKey={activeTab}
            onChange={(k) => { setActiveTab(k); setDirty(false); }}
            className="px-4 pt-2"
            tabBarExtraContent={
              <Button type="primary" icon={<MdSave size={16} />} onClick={handleSave}
                loading={saving} disabled={!dirty || isAcademyHoliday} className="mb-2">
                Save Attendance
              </Button>
            }
            items={[
              {
                key: "student",
                label: <span className="flex items-center gap-1">Students <Badge count={members.students.length} showZero color="#3b82f6" /></span>,
                children: (
                  <Spin spinning={loading}>
                    <div className="mb-3 flex items-center justify-between gap-3 px-1">
                      <Checkbox
                        checked={areAllVisibleStudentsPresent}
                        disabled={isAcademyHoliday || filteredStudents.length === 0}
                        onChange={handleMarkAllVisibleStudentsPresent}
                      >
                        Mark all visible students present for today
                      </Checkbox>
                      <span className="text-xs text-gray-500">
                        If you change any student to absent, half day, or leave, this will turn off automatically.
                      </span>
                    </div>
                    <Table dataSource={filteredStudents} columns={studentCols} rowKey="attendanceKey"
                      pagination={false} size="middle" locale={{ emptyText: "No students enrolled in this batch" }} />
                  </Spin>
                ),
              },
              ...(members.teachers.length
                ? [{
                    key: "teacher",
                    label: <span className="flex items-center gap-1">Teachers <Badge count={members.teachers.length} showZero color="#8b5cf6" /></span>,
                    children: (
                      <Spin spinning={loading}>
                        <div className="mb-3 flex items-center justify-between gap-3 px-1">
                          <Checkbox
                            checked={areAllVisibleTeachersPresent}
                            disabled={isAcademyHoliday || filteredTeachers.length === 0}
                            onChange={handleMarkAllVisibleTeachersPresent}
                          >
                            Mark all visible teachers present for today
                          </Checkbox>
                          <span className="text-xs text-gray-500">
                            If you change any teacher to absent, half day, or leave, this will turn off automatically.
                          </span>
                        </div>
                        <Table dataSource={filteredTeachers} columns={teacherCols} rowKey="attendanceKey"
                          pagination={false} size="middle" locale={{ emptyText: "No teachers assigned to this batch's course" }} />
                      </Spin>
                    ),
                  }]
                : []),
            ]}
          />
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow p-16 flex flex-col items-center justify-center gap-3 text-gray-400">
          <span className="text-5xl">📋</span>
          <p className="text-lg font-medium">Select a batch to mark attendance</p>
          <p className="text-sm">Only working days based on batch schedule are selectable</p>
        </div>
      )}
      <Modal
        title="QR Attendance Scanner"
        open={qrScannerOpen}
        onCancel={() => {
          closeQrScanner();
          setAttendanceMode("manual");
        }}
        footer={null}
        width={720}
        destroyOnClose
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm text-slate-700">
              Scan the QR code printed on the student ID card. Attendance will be marked instantly as <span className="font-semibold text-emerald-700">Present</span> for <span className="font-semibold">{selectedDate.format("DD MMM YYYY")}</span>.
            </div>
            <div className="mt-2 text-xs text-slate-500">
              No batch selection is required. The scanner will automatically detect the student's correct active batch.
            </div>
          </div>

          {!qrSupported && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              QR camera scanning is not available because camera access is missing in this browser or device.
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-[#0f172a]">
            <video
              ref={qrVideoRef}
              autoPlay
              playsInline
              muted
              className="h-[360px] w-full object-cover"
            />
            <canvas ref={qrCanvasRef} className="hidden" />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mode</div>
              <div className="mt-1 font-medium text-slate-800">QR Scan Attendance</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Students</div>
              <div className="mt-1 font-medium text-slate-800">{qrRoster.length} active across batches</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Scan Status</div>
              <div className="mt-1 font-medium text-slate-800">
                {qrInitializing ? "Starting camera..." : qrBusy ? "Saving attendance..." : "Ready to scan"}
              </div>
            </div>
          </div>

          {qrScanError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {qrScanError}
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        title="Attendance Marked Successfully"
        open={qrSuccessOpen}
        footer={null}
        closable={false}
        maskClosable={false}
        onCancel={() => setQrSuccessOpen(false)}
      >
        {qrSuccessData ? (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              {qrSuccessData.profilePicture ? (
                <img
                  src={qrSuccessData.profilePicture}
                  alt={qrSuccessData.name}
                  className="h-16 w-16 rounded-2xl object-cover ring-2 ring-white"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 text-xl font-bold text-white">
                  {String(qrSuccessData.name || "S").charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <div className="text-lg font-semibold text-slate-900">{qrSuccessData.name}</div>
                <div className="text-sm text-slate-600">Registration No: {qrSuccessData.registrationNo || "N/A"}</div>
                <div className="text-sm text-emerald-700 font-medium">Status: Present</div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attendance Date</div>
                <div className="mt-1 font-medium text-slate-800">{qrSuccessData.attendanceDate}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Marked At</div>
                <div className="mt-1 font-medium text-slate-800">{qrSuccessData.markedAt}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Batch</div>
                <div className="mt-1 font-medium text-slate-800">{qrSuccessData.batchName || "Selected Batch"}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attendance Method</div>
                <div className="mt-1 font-medium text-slate-800">Student ID Card QR Scan</div>
              </div>
            </div>
            <div className="text-center text-xs text-slate-500">
              This popup will close automatically in 5 seconds. Camera stays ready for the next student.
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        title={faceEnrollmentStudent ? `Setup Face: ${faceEnrollmentStudent.name}` : "Setup Face Attendance"}
        open={faceSetupOpen}
        onCancel={cancelFaceSetup}
        footer={[
          <Button key="cancel" onClick={cancelFaceSetup}>
            Cancel
          </Button>,
          <Button
            key="start"
            icon={<MdCameraAlt size={16} />}
            loading={faceInitializing}
            onClick={startFaceCamera}
          >
            {faceCameraActive ? "Restart Camera" : "Start Camera"}
          </Button>,
          <Button
            key="capture"
            type="primary"
            icon={<MdCameraAlt size={16} />}
            loading={faceBusy}
            disabled={!faceCameraActive}
            onClick={handleFaceEnrollmentCapture}
          >
            Capture 3 Samples & Save Face
          </Button>,
        ]}
        width={720}
        destroyOnClose
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-slate-700">Camera</span>
            <Segmented
              aria-label="Face setup camera"
              value={faceFacingMode}
              onChange={setFaceFacingMode}
              disabled={faceInitializing}
              options={[
                { label: "Front camera", value: "user" },
                { label: "Back camera", value: "environment" },
              ]}
            />
          </div>
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            Keep only the selected student in view. Face setup captures three live samples; look straight ahead, then turn slightly between samples. Face descriptors are encrypted before storage, and the camera images are not saved.
          </div>
          {!faceSupported && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Camera access is not available in this browser or device.
            </div>
          )}
          <div className={`face-scan-frame relative overflow-hidden rounded-2xl border bg-[#0f172a] ${
            faceSetupReadiness.ready ? "border-emerald-400 face-setup-ready" : "border-slate-200"
          }`}>
            <video
              ref={faceVideoRef}
              autoPlay
              playsInline
              muted
              className="h-[360px] w-full object-cover"
            />
            <div className={`absolute bottom-4 left-4 rounded-full px-4 py-2 text-xs font-semibold ${
              faceSetupReadiness.ready ? "bg-emerald-700/90 text-emerald-50" : "bg-slate-950/80 text-cyan-100"
            }`}>
              {faceEnrollmentProgress || (faceBusy
                ? "Saving face setup..."
                : faceCameraActive
                  ? faceSetupReadiness.message
                  : faceScanError
                    ? "Check camera message"
                    : "Opening camera...")}
            </div>
            <canvas ref={faceCanvasRef} className="hidden" />
          </div>
          {!faceCameraActive && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {faceScanError
                ? "See the camera message above. If the camera is open but detection failed, check your connection and restart the camera."
                : "Camera is not started yet. If your browser asks for permission, choose Allow."}
            </div>
          )}
          {faceScanError && !faceNoMatchOpen && !faceSuccessOpen ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {faceScanError}
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        title="Face Setup Completed"
        open={faceSetupSuccessOpen}
        zIndex={1200}
        footer={[
          <Button key="ok" type="primary" onClick={() => setFaceSetupSuccessOpen(false)}>
            OK
          </Button>,
        ]}
        onCancel={() => setFaceSetupSuccessOpen(false)}
      >
        {faceSetupSuccessData ? (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
              {faceSetupSuccessData.capturedFaceImage ? (
                <img
                  src={faceSetupSuccessData.capturedFaceImage}
                  alt={faceSetupSuccessData.name}
                  className="h-20 w-20 rounded-2xl object-cover ring-2 ring-white"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-600 text-xl font-bold text-white">
                  {String(faceSetupSuccessData.name || "S").charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <div className="text-lg font-semibold text-slate-900">{faceSetupSuccessData.name}</div>
                <div className="text-sm text-slate-600">Registration No: {faceSetupSuccessData.registrationNo || "N/A"}</div>
                <div className="text-sm font-medium text-blue-700">Face attendance is ready</div>
                <div className="text-xs text-slate-500">Captured from the camera during setup</div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Batch / Roster</div>
              <div className="mt-1 font-medium text-slate-800">{faceSetupSuccessData.batchName}</div>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        title="Face Attendance Scanner"
        open={faceScannerOpen}
        onCancel={closeFaceCameraModal}
        footer={[
          <Button key="cancel" onClick={closeFaceCameraModal}>
            Close
          </Button>,
          <Button
            key="start"
            icon={<MdCameraAlt size={16} />}
            loading={faceInitializing}
            onClick={startFaceCamera}
          >
            {faceCameraActive ? "Restart Camera" : "Start Camera"}
          </Button>,
          <Button
            key="scan"
            type="primary"
            icon={<MdFace size={16} />}
            loading={faceBusy}
            disabled={!faceCameraActive || !selectedBatch}
            onClick={() => handleFaceScanAndMark({ showToast: true })}
          >
            Retry Scan Now
          </Button>,
        ]}
        width={720}
        destroyOnClose
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-slate-700">Camera</span>
            <Segmented
              aria-label="Face attendance camera"
              value={faceFacingMode}
              onChange={setFaceFacingMode}
              disabled={faceInitializing}
              options={[
                { label: "Front camera", value: "user" },
                { label: "Back camera", value: "environment" },
              ]}
            />
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            Face scan checks registered students and marks attendance for all eligible active batches on <span className="font-semibold">{selectedDate.format("DD MMM YYYY")}</span>.
          </div>
          <div className="face-scan-frame relative overflow-hidden rounded-2xl border border-slate-200 bg-[#0f172a]">
            <video
              ref={faceVideoRef}
              autoPlay
              playsInline
              muted
              className="h-[360px] w-full object-cover"
            />
            <div className="absolute bottom-4 left-4 rounded-full bg-slate-950/80 px-4 py-2 text-xs font-semibold text-cyan-100">
              {faceScanStatus === "matching"
                ? "Matching face..."
                : faceScanStatus === "success"
                  ? "Attendance marked"
                  : faceScanStatus === "error"
                    ? "Face scan needs attention"
                    : faceCameraActive
                      ? "Waiting for one face in frame..."
                      : "Opening camera..."}
            </div>
            <canvas ref={faceCanvasRef} className="hidden" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mode</div>
              <div className="mt-1 font-medium text-slate-800">Face Scan</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ready Students</div>
              <div className="mt-1 font-medium text-slate-800">
                {members.students.filter((student) => student.faceAttendance?.modelVersion === FACE_MODEL_VERSION).length}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Camera</div>
              <div className="mt-1 font-medium text-slate-800">
                {faceInitializing
                  ? "Opening..."
                  : faceScanStatus === "matching"
                    ? "Matching face..."
                    : faceScanStatus === "error"
                      ? "Check scanner message"
                      : faceCameraActive
                        ? "Waiting for a face"
                        : "Opening camera"}
              </div>
            </div>
          </div>
          {faceScanError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {faceScanError}
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        title={faceNoMatchData?.title || "Face Not Matched"}
        open={faceNoMatchOpen}
        zIndex={1300}
        footer={[
          <Button
            key="setup"
            type="primary"
            disabled={!faceSetupCandidateId}
            onClick={() => {
              if (faceNoMatchTimerRef.current) {
                clearTimeout(faceNoMatchTimerRef.current);
                faceNoMatchTimerRef.current = null;
              }
              setFaceNoMatchOpen(false);
              setFaceScanError("");
              const student = faceRoster.find(
                (record) => String(record._id) === String(faceSetupCandidateId),
              );
              if (student) {
                openFaceSetup(student, true);
              }
            }}
          >
            {faceNoMatchData?.code === "FACE_NOT_SETUP"
              ? "Setup Face & Mark Attendance"
              : "Refresh Face Setup & Mark Attendance"}
          </Button>,
          <Button
            key="close"
            onClick={() => {
              if (faceNoMatchTimerRef.current) {
                clearTimeout(faceNoMatchTimerRef.current);
                faceNoMatchTimerRef.current = null;
              }
              setFaceNoMatchOpen(false);
              setFaceScanError("");
              setFaceScanStatus("scanning");
            }}
          >
            Continue Scanning
          </Button>,
        ]}
        onCancel={() => {
          if (faceNoMatchTimerRef.current) {
            clearTimeout(faceNoMatchTimerRef.current);
            faceNoMatchTimerRef.current = null;
          }
          setFaceNoMatchOpen(false);
          setFaceScanError("");
          setFaceScanStatus("scanning");
        }}
      >
        {faceNoMatchData ? (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              {faceNoMatchData.capturedFaceImage ? (
                <img
                  src={faceNoMatchData.capturedFaceImage}
                  alt="Unmatched face"
                  className="h-20 w-20 rounded-2xl object-cover ring-2 ring-white"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-500 text-xl font-bold text-white">
                  ?
                </div>
              )}
              <div>
                <div className="text-lg font-semibold text-slate-900">{faceNoMatchData.title}</div>
                <div className="text-sm text-amber-800">{faceNoMatchData.message}</div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attendance Date</div>
                <div className="mt-1 font-medium text-slate-800">{faceNoMatchData.attendanceDate}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Next Step</div>
                  <div className="mt-1 font-medium text-slate-800">
                    {faceNoMatchData?.code === "FACE_NOT_SETUP"
                      ? "Set up the student's face"
                      : "Retry or refresh the selected student's setup"}
                  </div>
                </div>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                {faceNoMatchData?.code === "FACE_NOT_SETUP"
                  ? "Select the existing student whose face is in front of the camera. Setup will capture three fresh samples and retry attendance for that student."
                  : "This does not mean the student has no face setup. Retry the scan first; if it still fails, verify the student before refreshing their saved face."}
            </div>
            <Select
              showSearch
              allowClear
              value={faceSetupCandidateId}
              onChange={setFaceSetupCandidateId}
              optionFilterProp="label"
              placeholder="Select the student in front of the camera"
              className="w-full"
              options={faceRoster
                .filter(
                  (student) => isStudentAttendanceEligible(student),
                )
                .map((student) => ({
                  value: student._id,
                  label: `${student.name}${student.registrationNo ? ` (${student.registrationNo})` : ""}`,
                }))}
            />
          </div>
        ) : null}
      </Modal>

      <Modal
        title={faceSuccessData?.alreadyMarked ? "Attendance Already Marked Today" : "Face Attendance Marked"}
        open={faceSuccessOpen}
        zIndex={1300}
        footer={[
          <Button
            key="close"
            type="primary"
            onClick={() => {
              if (faceSuccessTimerRef.current) {
                clearTimeout(faceSuccessTimerRef.current);
                faceSuccessTimerRef.current = null;
              }
              setFaceSuccessOpen(false);
              setFaceScanStatus("scanning");
            }}
          >
            Close
          </Button>,
        ]}
        closable={false}
        maskClosable={false}
        onCancel={() => setFaceSuccessOpen(false)}
      >
        {faceSuccessData ? (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              {(faceSuccessData.profilePicture || faceSuccessData.capturedFaceImage) ? (
                <img
                  src={faceSuccessData.profilePicture || faceSuccessData.capturedFaceImage}
                  alt={faceSuccessData.name}
                  className="h-20 w-20 rounded-2xl object-cover ring-2 ring-white"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-600 text-xl font-bold text-white">
                  {String(faceSuccessData.name || "S").charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <div className="text-lg font-semibold text-slate-900">{faceSuccessData.name}</div>
                <div className="text-sm text-slate-600">Registration No: {faceSuccessData.registrationNo || "N/A"}</div>
                <div className="text-sm text-emerald-700 font-medium">
                  {faceSuccessData.alreadyMarked ? "Attendance already exists" : "Face recognized"}
                </div>
                {faceSuccessData.profilePicture && (
                  <div className="text-xs text-slate-500">Student profile photo</div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Batch</div>
                <div className="mt-1 font-medium text-slate-800">{faceSuccessData.batchName || "Selected batch"}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attendance Date</div>
                <div className="mt-1 font-medium text-slate-800">{faceSuccessData.attendanceDate}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Confidence</div>
                <div className="mt-1 font-medium text-slate-800">{faceSuccessData.confidence || 0}%</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Marked At</div>
                <div className="mt-1 font-medium text-slate-800">{faceSuccessData.markedAt}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Method</div>
                <div className="mt-1 font-medium text-slate-800">Face Scan</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Result</div>
                <div className="mt-1 font-medium text-slate-800">
                  {faceSuccessData.alreadyMarked ? "Already marked today" : "Attendance saved"}
                </div>
              </div>
              {faceSuccessData.attendanceRecords?.length ? (
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Course and batch attendance
                  </div>
                  <div className="space-y-2">
                    {faceSuccessData.attendanceRecords.map((record) => (
                      <div
                        key={`${record.batch}:${record.date}`}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm"
                      >
                        <span className="font-medium text-slate-800">
                          {[record.courseName, record.batchName].filter(Boolean).join(" — ") || "Active batch"}
                        </span>
                        <span className="text-slate-600">
                          {record.status} · {record.method === "face" ? "Face Scan" : record.method || "Manual"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="text-center text-xs text-slate-500">
              This popup closes automatically in 2 seconds, then the camera continues scanning for the next student.
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        title="Create Global Holiday"
        open={holidayModalOpen}
        onOk={handleCreateBatchHoliday}
        onCancel={() => setHolidayModalOpen(false)}
        okText="Create Global Holiday"
        confirmLoading={holidaySaving}
      >
        <div className="space-y-4 pt-2">
          <div className="text-sm text-gray-600">
            This will mark <span className="font-semibold">{selectedDate.format("DD MMM YYYY")}</span> as an academy holiday for <span className="font-semibold">all batches</span> and update all student and teacher attendance records to <span className="font-semibold">Holiday</span>.
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">Holiday Name</label>
            <Input
              value={holidayName}
              onChange={(e) => setHolidayName(e.target.value)}
              placeholder="e.g. Emergency Closure, Special Event, Local Holiday"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">Reason</label>
            <Input.TextArea
              rows={3}
              value={holidayReason}
              onChange={(e) => setHolidayReason(e.target.value)}
              placeholder="Optional note for why this working day is being converted into a holiday"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ATTENDANCE HISTORY PANEL
// ═══════════════════════════════════════════════════════════════════════════════

// ── PDF Export ────────────────────────────────────────────────────────────────
const exportAttendancePDF = async ({ historyData, dateRange, batchName, personType }) => {
  try {
    const logoDataUrl = await loadLogoBase64(odysseyLogo);
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.width;
    const margin = 14;
    const colW = pageWidth - margin * 2;

    const fromLabel = dateRange[0].format("DD MMM YYYY");
    const toLabel   = dateRange[1].format("DD MMM YYYY");
    const subtitle  = `Attendance Report — ${batchName}`;

    let y = drawPdfHeader(doc, logoDataUrl, subtitle);

    // ── Meta info strip ──
    setFill(doc, [245, 247, 255]);
    doc.rect(margin, y, colW, 11, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    setTxt(doc, PDF_COLORS.primary);
    doc.text("Period:", margin + 3, y + 4.5);
    doc.setFont("helvetica", "normal");
    setTxt(doc, PDF_COLORS.dark);
    doc.text(`${fromLabel}  →  ${toLabel}`, margin + 18, y + 4.5);

    doc.setFont("helvetica", "bold");
    setTxt(doc, PDF_COLORS.primary);
    doc.text("Type:", margin + 100, y + 4.5);
    doc.setFont("helvetica", "normal");
    setTxt(doc, PDF_COLORS.dark);
    const typeLabel = personType === "student" ? "Students" : personType === "teacher" ? "Teachers" : "All";
    doc.text(typeLabel, margin + 113, y + 4.5);

    doc.setFont("helvetica", "bold");
    setTxt(doc, PDF_COLORS.primary);
    doc.text("Generated:", margin + 3, y + 9);
    doc.setFont("helvetica", "normal");
    setTxt(doc, PDF_COLORS.dark);
    doc.text(dayjs().format("DD MMM YYYY, HH:mm"), margin + 25, y + 9);
    y += 15;

    // ── Aggregate stat boxes ──
    const stats = (historyData.summary || []).reduce(
      (acc, r) => { acc.Present += r.Present || 0; acc.Absent += r.Absent || 0; acc["Half Day"] += r["Half Day"] || 0; acc.Leave += r.Leave || 0; return acc; },
      { Present: 0, Absent: 0, "Half Day": 0, Leave: 0 }
    );
    const total = Object.values(stats).reduce((a, b) => a + b, 0);
    const boxes = [
      { label: "Present",  value: stats.Present,      color: PDF_COLORS.presentBg,  fg: PDF_COLORS.presentFg },
      { label: "Absent",   value: stats.Absent,       color: PDF_COLORS.absentBg,   fg: PDF_COLORS.absentFg },
      { label: "Half Day", value: stats["Half Day"],   color: PDF_COLORS.halfDayBg,  fg: PDF_COLORS.halfDayFg },
      { label: "Leave",    value: stats.Leave,         color: PDF_COLORS.leaveBg,    fg: PDF_COLORS.leaveFg },
      { label: "Total",    value: total,               color: PDF_COLORS.primaryLight, fg: PDF_COLORS.primary },
    ];
    const boxW = (colW - 4 * 3) / 5;
    boxes.forEach(({ label, value, color, fg }, i) => {
      const bx = margin + i * (boxW + 3);
      setFill(doc, color);
      doc.roundedRect(bx, y, boxW, 20, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      setTxt(doc, fg);
      doc.text(String(value), bx + boxW / 2, y + 11, { align: "center" });
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      setTxt(doc, fg);
      doc.text(label.toUpperCase(), bx + boxW / 2, y + 17, { align: "center" });
    });
    y += 25;

    // ── Summary table (per-person) ──
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    setTxt(doc, PDF_COLORS.primary);
    doc.text("ATTENDANCE SUMMARY — PER PERSON", margin, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["#", "Name", "ID / Reg No", "Type", "Present", "Absent", "Half Day", "Leave", "Total", "Att. %"]],
      body: (historyData.summary || []).map((r, i) => {
        const pct = r.total ? Math.round(((r.Present || 0) + (r["Half Day"] || 0) * 0.5) / r.total * 100) : 0;
        return [
          i + 1,
          r.name || "—",
          r.identifier || "—",
          r.personType === "student" ? "Student" : "Teacher",
          r.Present || 0,
          r.Absent || 0,
          r["Half Day"] || 0,
          r.Leave || 0,
          r.total || 0,
          `${pct}%`,
        ];
      }),
      styles: { fontSize: 7, cellPadding: 2.5 },
      headStyles: { fillColor: PDF_COLORS.primary, textColor: PDF_COLORS.white, fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: PDF_COLORS.rowAlt },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 9) {
          const pct = parseInt(data.cell.text[0]);
          data.cell.styles.textColor = pct >= 75 ? PDF_COLORS.presentFg : pct >= 50 ? PDF_COLORS.halfDayFg : PDF_COLORS.absentFg;
          data.cell.styles.fontStyle = "bold";
        }
      },
      columnStyles: {
        0: { cellWidth: 8 },
        4: { halign: "center", fillColor: PDF_COLORS.presentBg, textColor: PDF_COLORS.presentFg, fontStyle: "bold" },
        5: { halign: "center", fillColor: PDF_COLORS.absentBg,  textColor: PDF_COLORS.absentFg,  fontStyle: "bold" },
        6: { halign: "center", fillColor: PDF_COLORS.halfDayBg, textColor: PDF_COLORS.halfDayFg, fontStyle: "bold" },
        7: { halign: "center", fillColor: PDF_COLORS.leaveBg,   textColor: PDF_COLORS.leaveFg,   fontStyle: "bold" },
        8: { halign: "center" },
        9: { halign: "center" },
      },
    });

    // ── Day-by-day records (new page) ──
    if ((historyData.records || []).length > 0) {
      doc.addPage();
      let y2 = drawPdfHeader(doc, logoDataUrl, `Day-by-Day Records — ${batchName}`);
      y2 += 4;

      autoTable(doc, {
        startY: y2,
        margin: { left: margin, right: margin },
        head: [["#", "Date", "Name", "ID / Reg No", "Type", "Status", "Notes"]],
        body: (historyData.records || []).map((r, i) => {
          const p = r.person || {};
          return [
            i + 1,
            dayjs(r.date).format("ddd, DD MMM YYYY"),
            p.studentName || p.fullName || "—",
            p.registrationNo || p.teacherId || "—",
            r.personType === "student" ? "Student" : "Teacher",
            r.status || "—",
            r.notes || "",
          ];
        }),
        styles: { fontSize: 7, cellPadding: 2.5 },
        headStyles: { fillColor: PDF_COLORS.primary, textColor: PDF_COLORS.white, fontStyle: "bold", fontSize: 7 },
        alternateRowStyles: { fillColor: PDF_COLORS.rowAlt },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 5) {
            const status = data.cell.text[0];
            if (STATUS_CELL_COLOR[status]) {
              data.cell.styles.fillColor = STATUS_CELL_COLOR[status];
              data.cell.styles.fontStyle = "bold";
            }
          }
        },
      });
    }

    // ── Footer on each page ──
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      const pageH = doc.internal.pageSize.height;
      setFill(doc, PDF_COLORS.pageBannerBg);
      doc.rect(0, pageH - 10, pageWidth, 10, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      setTxt(doc, PDF_COLORS.pageBannerSub);
      doc.text("ODYSSEY ACADEMY KHIPRO — Confidential", margin, pageH - 4);
      doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageH - 4, { align: "right" });
    }

    doc.save(`Attendance_${batchName.replace(/\s+/g, "_")}_${fromLabel.replace(/\s+/g, "")}_${toLabel.replace(/\s+/g, "")}.pdf`);
    message.success("Attendance PDF downloaded successfully");
  } catch (err) {
    console.error(err);
    message.error("Failed to generate PDF report");
  }
};

// ── Excel Export ──────────────────────────────────────────────────────────────
const exportAttendanceExcel = ({ historyData, dateRange, batchName, personType }) => {
  try {
    const wb = XLSX.utils.book_new();
    const typeLabel = personType === "student" ? "Students" : personType === "teacher" ? "Teachers" : "All";

    // Sheet 1: Summary
    const summaryRows = (historyData.summary || []).map((r, i) => {
      const pct = r.total ? Math.round(((r.Present || 0) + (r["Half Day"] || 0) * 0.5) / r.total * 100) : 0;
      return {
        "#": i + 1,
        "Name": r.name || "—",
        "ID / Reg No": r.identifier || "—",
        "Type": r.personType === "student" ? "Student" : "Teacher",
        "Present": r.Present || 0,
        "Absent": r.Absent || 0,
        "Half Day": r["Half Day"] || 0,
        "Leave": r.Leave || 0,
        "Total Days": r.total || 0,
        "Attendance %": `${pct}%`,
      };
    });
    const ws1 = XLSX.utils.json_to_sheet(summaryRows);
    ws1["!cols"] = [{ wch: 4 }, { wch: 28 }, { wch: 16 }, { wch: 10 }, { wch: 9 }, { wch: 9 }, { wch: 10 }, { wch: 9 }, { wch: 11 }, { wch: 13 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Summary");

    // Sheet 2: Day-by-day
    const recordRows = (historyData.records || []).map((r, i) => {
      const p = r.person || {};
      return {
        "#": i + 1,
        "Date": dayjs(r.date).format("DD MMM YYYY"),
        "Day": dayjs(r.date).format("ddd"),
        "Name": p.studentName || p.fullName || "—",
        "ID / Reg No": p.registrationNo || p.teacherId || "—",
        "Type": r.personType === "student" ? "Student" : "Teacher",
        "Status": r.status || "—",
        "Notes": r.notes || "",
      };
    });
    const ws2 = XLSX.utils.json_to_sheet(recordRows);
    ws2["!cols"] = [{ wch: 4 }, { wch: 16 }, { wch: 6 }, { wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Day-by-Day Records");

    // Sheet 3: Meta
    const meta = [
      ["Batch", batchName],
      ["Period", `${dateRange[0].format("DD MMM YYYY")} → ${dateRange[1].format("DD MMM YYYY")}`],
      ["Person Type", typeLabel],
      ["Generated", dayjs().format("DD MMM YYYY, HH:mm")],
      ["Academy", "ODYSSEY ACADEMY KHIPRO"],
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(meta);
    XLSX.utils.book_append_sheet(wb, ws3, "Report Info");

    XLSX.writeFile(wb, `Attendance_${batchName.replace(/\s+/g, "_")}_${dateRange[0].format("DDMMMYYYY")}_${dateRange[1].format("DDMMMYYYY")}.xlsx`);
    message.success("Excel report downloaded successfully");
  } catch (err) {
    console.error(err);
    message.error("Failed to generate Excel report");
  }
};

// ── Excel Upload (bulk mark from file) ───────────────────────────────────────
const parseAttendanceExcel = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb   = XLSX.read(e.target.result, { type: "array" });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws);
        resolve(rows);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

// ── Single-Person PDF Export ──────────────────────────────────────────────────
const exportSinglePersonPDF = async ({ personSummary, personRecords, dateRange, batchName }) => {
  try {
    const logoDataUrl = await loadLogoBase64(odysseyLogo);
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.width;
    const margin = 14;
    const colW = pageWidth - margin * 2;

    const fromLabel = dateRange[0].format("DD MMM YYYY");
    const toLabel   = dateRange[1].format("DD MMM YYYY");
    const name       = personSummary?.name       || "Unknown";
    const identifier = personSummary?.identifier || "—";
    const pType      = personSummary?.personType === "student" ? "Student" : "Teacher";

    let y = drawPdfHeader(doc, logoDataUrl, `Personal Attendance Report`);

    // ── Person info strip ──
    setFill(doc, [245, 247, 255]);
    doc.rect(margin, y, colW, 22, "F");
    const infoFields = [
      { label: "Name",   value: name,       x: margin + 3,   row: 1 },
      { label: pType === "Student" ? "Reg. No" : "Teacher ID", value: identifier, x: margin + 75, row: 1 },
      { label: "Type",   value: pType,       x: margin + 135, row: 1 },
      { label: "Batch",  value: batchName,   x: margin + 3,   row: 2 },
      { label: "Period", value: `${fromLabel}  →  ${toLabel}`, x: margin + 75, row: 2 },
    ];
    infoFields.forEach(({ label, value, x, row }) => {
      const ry = y + (row === 1 ? 6 : 15);
      doc.setFont("helvetica", "bold"); doc.setFontSize(7);
      setTxt(doc, PDF_COLORS.primary);
      doc.text(label + ":", x, ry);
      doc.setFont("helvetica", "normal");
      setTxt(doc, PDF_COLORS.dark);
      doc.text(value, x + (label.length > 6 ? 18 : 12), ry);
    });
    y += 27;

    // ── Stat boxes ──
    const Present  = personSummary?.Present       || 0;
    const Absent   = personSummary?.Absent        || 0;
    const HalfDay  = personSummary?.["Half Day"]  || 0;
    const Leave    = personSummary?.Leave         || 0;
    const total    = personSummary?.total         || 0;
    const pct      = total ? Math.round((Present + HalfDay * 0.5) / total * 100) : 0;

    const statBoxes = [
      { label: "Present",  value: Present,  color: PDF_COLORS.presentBg,   fg: PDF_COLORS.presentFg },
      { label: "Absent",   value: Absent,   color: PDF_COLORS.absentBg,    fg: PDF_COLORS.absentFg },
      { label: "Half Day", value: HalfDay,  color: PDF_COLORS.halfDayBg,   fg: PDF_COLORS.halfDayFg },
      { label: "Leave",    value: Leave,    color: PDF_COLORS.leaveBg,     fg: PDF_COLORS.leaveFg },
      { label: "Total",    value: total,    color: PDF_COLORS.primaryLight, fg: PDF_COLORS.primary },
    ];
    const boxW = (colW - 4 * 3) / 5;
    statBoxes.forEach(({ label, value, color, fg }, i) => {
      const bx = margin + i * (boxW + 3);
      setFill(doc, color);
      doc.roundedRect(bx, y, boxW, 22, 2, 2, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(18);
      setTxt(doc, fg);
      doc.text(String(value), bx + boxW / 2, y + 12, { align: "center" });
      doc.setFontSize(6.5); doc.setFont("helvetica", "normal");
      setTxt(doc, fg);
      doc.text(label.toUpperCase(), bx + boxW / 2, y + 19, { align: "center" });
    });
    y += 28;

    // ── Attendance % bar ──
    const barColor = pct >= 75 ? PDF_COLORS.presentFg : pct >= 50 ? PDF_COLORS.halfDayFg : PDF_COLORS.absentFg;
    setFill(doc, [220, 220, 220]);
    doc.roundedRect(margin, y, colW, 7, 1, 1, "F");
    setFill(doc, barColor);
    if (pct > 0) doc.roundedRect(margin, y, Math.round(colW * pct / 100), 7, 1, 1, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7);
    setTxt(doc, PDF_COLORS.white);
    doc.text(`Attendance Rate: ${pct}%`, margin + colW / 2, y + 5, { align: "center" });
    y += 13;

    // ── Day-by-day table ──
    doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    setTxt(doc, PDF_COLORS.primary);
    doc.text("DAY-BY-DAY ATTENDANCE RECORDS", margin, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["#", "Date", "Day", "Status", "Notes"]],
      body: (personRecords || []).map((r, i) => [
        i + 1,
        dayjs(r.date).format("DD MMM YYYY"),
        dayjs(r.date).format("dddd"),
        r.status || "—",
        r.notes || "",
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: PDF_COLORS.primary, textColor: PDF_COLORS.white, fontStyle: "bold" },
      alternateRowStyles: { fillColor: PDF_COLORS.rowAlt },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 3) {
          const s = data.cell.text[0];
          if (STATUS_CELL_COLOR[s]) { data.cell.styles.fillColor = STATUS_CELL_COLOR[s]; data.cell.styles.fontStyle = "bold"; }
        }
      },
      columnStyles: { 0: { cellWidth: 8 }, 3: { halign: "center", cellWidth: 24 } },
    });

    // ── Footer ──
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      const pageH = doc.internal.pageSize.height;
      setFill(doc, PDF_COLORS.pageBannerBg);
      doc.rect(0, pageH - 10, pageWidth, 10, "F");
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
      setTxt(doc, PDF_COLORS.pageBannerSub);
      doc.text("ODYSSEY ACADEMY KHIPRO — Confidential", margin, pageH - 4);
      doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageH - 4, { align: "right" });
    }

    doc.save(`Attendance_${name.replace(/\s+/g, "_")}_${fromLabel.replace(/\s+/g, "")}_${toLabel.replace(/\s+/g, "")}.pdf`);
    message.success(`Attendance report for ${name} downloaded successfully`);
  } catch (err) {
    console.error(err);
    message.error("Failed to generate personal attendance PDF");
  }
};

function HistoryPanel({ batches }) {
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [batchName, setBatchName]         = useState("");
  const [dateRange, setDateRange] = useState([dayjs().startOf("month"), dayjs()]);
  const [personType, setPersonType] = useState("all");
  const [historyData, setHistoryData] = useState(null);
  const [loading, setLoading]     = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [xlsLoading, setXlsLoading] = useState(false);
  const [uploadVisible, setUploadVisible] = useState(false);
  const [uploadPreview, setUploadPreview] = useState([]);
  const [uploadError, setUploadError]     = useState("");
  const [uploadSaving, setUploadSaving]   = useState(false);
  const [view, setView] = useState("summary");
  const [selectedPersonSearch, setSelectedPersonSearch] = useState(null);
  const [batchMembers, setBatchMembers] = useState({ students: [], teachers: [] });
  const [personPdfLoading, setPersonPdfLoading] = useState(false);
  const fileInputRef = useRef(null);

  // Load batch members when batch changes
  useEffect(() => {
    if (!selectedBatch) { setBatchMembers({ students: [], teachers: [] }); return; }
    getBatchMembers(selectedBatch)
      .then((res) => setBatchMembers(res.data || { students: [], teachers: [] }))
      .catch(() => {});
  }, [selectedBatch]);

  // Person search dropdown options filtered by personType
  const personSearchOptions = useMemo(() => {
    const students = (batchMembers.students || []).map((p) => ({
      value: p._id, label: p.studentName || p.name || "Unknown",
      identifier: p.registrationNo || "", pType: "student",
    }));
    const teachers = (batchMembers.teachers || []).map((p) => ({
      value: p._id, label: p.fullName || p.name || "Unknown",
      identifier: p.teacherId || "", pType: "teacher",
    }));
    if (personType === "student") return students;
    if (personType === "teacher") return teachers;
    return [
      ...students.map((s) => ({ ...s, group: "Students" })),
      ...teachers.map((t) => ({ ...t, group: "Teachers" })),
    ];
  }, [batchMembers, personType]);

  // Filtered history data for selected person
  const filteredSummary = useMemo(() => {
    if (!historyData) return [];
    if (!selectedPersonSearch) return historyData.summary || [];
    return (historyData.summary || []).filter((r) => String(r._id) === String(selectedPersonSearch));
  }, [historyData, selectedPersonSearch]);

  const filteredRecords = useMemo(() => {
    if (!historyData) return [];
    if (!selectedPersonSearch) return historyData.records || [];
    return (historyData.records || []).filter((r) => {
      const pid = typeof r.person === "object" ? r.person?._id : r.person;
      return String(pid) === String(selectedPersonSearch);
    });
  }, [historyData, selectedPersonSearch]);

  const filteredTotalStats = useMemo(() => filteredSummary.reduce(
    (acc, r) => { acc.Present += r.Present || 0; acc.Absent += r.Absent || 0; acc["Half Day"] += r["Half Day"] || 0; acc.Leave += r.Leave || 0; return acc; },
    { Present: 0, Absent: 0, "Half Day": 0, Leave: 0 }
  ), [filteredSummary]);

  const getExportArgs = () => ({
    historyData: { summary: filteredSummary, records: filteredRecords, total: filteredRecords.length },
    dateRange, batchName, personType,
  });

  const fetchHistory = async () => {
    if (!selectedBatch || !dateRange || !dateRange[0] || !dateRange[1]) {
      message.warning("Please select a batch and date range");
      return;
    }
    setLoading(true);
    try {
      const res = await getAttendanceHistory(
        selectedBatch,
        dateRange[0].format("YYYY-MM-DD"),
        dateRange[1].format("YYYY-MM-DD"),
        personType
      );
      setHistoryData(res.data || { records: [], summary: [] });
    } catch (err) {
      message.error(err?.response?.data?.message || "Failed to fetch history");
    } finally { setLoading(false); }
  };

  // ── Summary table columns (per-person totals) ─────────────────────────────
  const summaryCols = [
    { title: "#", width: 50, render: (_, __, i) => i + 1 },
    {
      title: "Name", dataIndex: "name",
      render: (v) => <span className="font-semibold">{v}</span>,
    },
    {
      title: "ID / Reg No", dataIndex: "identifier",
      render: (v) => <span className="text-gray-500 text-xs">{v || "—"}</span>,
    },
    {
      title: "Type", dataIndex: "personType",
      render: (t) => <Tag color={t === "student" ? "blue" : "purple"}>{t === "student" ? "Student" : "Teacher"}</Tag>,
    },
    {
      title: <span className="text-green-600">✅ Present</span>,
      dataIndex: "Present",
      render: (v) => <span className="font-bold text-green-600">{v || 0}</span>,
      sorter: (a, b) => (a.Present || 0) - (b.Present || 0),
    },
    {
      title: <span className="text-red-500">❌ Absent</span>,
      dataIndex: "Absent",
      render: (v) => <span className="font-bold text-red-500">{v || 0}</span>,
      sorter: (a, b) => (a.Absent || 0) - (b.Absent || 0),
    },
    {
      title: <span className="text-yellow-500">🕐 Half Day</span>,
      dataIndex: "Half Day",
      render: (v) => <span className="font-bold text-yellow-500">{v || 0}</span>,
    },
    {
      title: <span className="text-blue-500">🏖 Leave</span>,
      dataIndex: "Leave",
      render: (v) => <span className="font-bold text-blue-500">{v || 0}</span>,
    },
    {
      title: "Total Days",
      dataIndex: "total",
      render: (v) => <Tag>{v}</Tag>,
    },
    {
      title: "Attendance %",
      render: (_, r) => {
        const total = r.total || 0;
        if (!total) return "—";
        const pct = Math.round(((r.Present || 0) + (r["Half Day"] || 0) * 0.5) / total * 100);
        const color = pct >= 75 ? "green" : pct >= 50 ? "orange" : "red";
        return <Tag color={color}>{pct}%</Tag>;
      },
      sorter: (a, b) => {
        const pctA = a.total ? ((a.Present || 0) + (a["Half Day"] || 0) * 0.5) / a.total : 0;
        const pctB = b.total ? ((b.Present || 0) + (b["Half Day"] || 0) * 0.5) / b.total : 0;
        return pctA - pctB;
      },
    },
  ];

  // ── Day-by-day records table ──────────────────────────────────────────────
  const recordsCols = [
    { title: "#", width: 50, render: (_, __, i) => i + 1 },
    {
      title: "Date & Status",
      dataIndex: "date",
      render: (d, r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{dayjs(d).format("ddd, DD MMM YYYY")}</span>
          <StatusTag status={r.status} />
        </div>
      ),
      sorter: (a, b) => new Date(a.date) - new Date(b.date),
      filters: STATUSES.map((s) => ({ text: s, value: s })),
      onFilter: (value, record) => record.status === value,
    },
    {
      title: "Name",
      render: (_, r) => {
        const p = r.person || {};
        return <span className="font-medium">{p.studentName || p.fullName || "—"}</span>;
      },
    },
    {
      title: "ID / Reg No",
      render: (_, r) => {
        const p = r.person || {};
        return <span className="text-gray-500 text-xs">{p.registrationNo || p.teacherId || "—"}</span>;
      },
    },
    {
      title: "Type", dataIndex: "personType",
      render: (t) => <Tag color={t === "student" ? "blue" : "purple"}>{t === "student" ? "Student" : "Teacher"}</Tag>,
    },
    {
      title: "Notes", dataIndex: "notes",
      render: (n) => n || <span className="text-gray-300">—</span>,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1 min-w-[220px]">
          <label className="text-xs font-semibold text-gray-600">Select Batch</label>
          <Select placeholder="Choose a batch" value={selectedBatch}
            onChange={(v, opt) => { setSelectedBatch(v); setBatchName(opt?.label || ""); setHistoryData(null); }}
            showSearch filterOption={(input, o) => o?.label?.toLowerCase().includes(input.toLowerCase())}
            options={batches.map((b) => ({ value: b._id, label: `${b.batchName} (${b.batchCode})` }))}
            className="w-full" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Date Range (From → To)</label>
          <RangePicker value={dateRange} onChange={(r) => { setDateRange(r); setHistoryData(null); }}
            format="DD MMM YYYY" allowClear={false} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Person Type</label>
          <Segmented value={personType} onChange={(v) => { setPersonType(v); setSelectedPersonSearch(null); setHistoryData(null); }}
            options={[
              { label: "All", value: "all" },
              { label: "Students", value: "student" },
              { label: "Teachers", value: "teacher" },
            ]} />
        </div>
        <div className="flex flex-col gap-1 min-w-[220px]">
          <label className="text-xs font-semibold text-gray-600">
            Search Person
            {selectedPersonSearch && (
              <span
                className="ml-2 text-blue-500 cursor-pointer font-normal"
                onClick={() => setSelectedPersonSearch(null)}
              >✕ Clear</span>
            )}
          </label>
          <Select
            allowClear
            showSearch
            placeholder={selectedBatch ? "All people (optional)" : "Select a batch first"}
            disabled={!selectedBatch}
            value={selectedPersonSearch}
            onChange={(v) => setSelectedPersonSearch(v || null)}
            filterOption={(input, o) =>
              o?.label?.toLowerCase().includes(input.toLowerCase()) ||
              o?.identifier?.toLowerCase().includes(input.toLowerCase())
            }
            options={personSearchOptions}
            optionRender={(opt) => (
              <div>
                <div className="font-medium text-sm">{opt.data.label}</div>
                <div className="text-[11px] text-gray-400">{opt.data.identifier} · {opt.data.pType === "student" ? "Student" : "Teacher"}</div>
              </div>
            )}
            className="w-full"
          />
        </div>
        <Button type="primary" icon={<MdHistory size={16} />} onClick={fetchHistory} loading={loading}>
          View History
        </Button>
        {historyData && (
          <div className="flex gap-2 flex-wrap">
            <Button
              icon={<FaFilePdf size={14} />}
              loading={pdfLoading}
              style={{ background: "#ef4444", color: "#fff", border: "none" }}
              onClick={async () => { setPdfLoading(true); await exportAttendancePDF(getExportArgs()); setPdfLoading(false); }}
            >
              {selectedPersonSearch ? "Person PDF" : "PDF Report"}
            </Button>
            <Button
              icon={<FaFileExcel size={14} />}
              loading={xlsLoading}
              style={{ background: "#16a34a", color: "#fff", border: "none" }}
              onClick={() => { setXlsLoading(true); exportAttendanceExcel(getExportArgs()); setXlsLoading(false); }}
            >
              Excel Report
            </Button>
            {selectedPersonSearch && filteredSummary.length > 0 && (
              <Button
                icon={<FaFilePdf size={14} />}
                loading={personPdfLoading}
                style={{ background: "#7c3aed", color: "#fff", border: "none" }}
                onClick={async () => {
                  setPersonPdfLoading(true);
                  await exportSinglePersonPDF({
                    personSummary: filteredSummary[0],
                    personRecords: filteredRecords,
                    dateRange,
                    batchName,
                  });
                  setPersonPdfLoading(false);
                }}
              >
                Detailed Person PDF
              </Button>
            )}
          </div>
        )}
        <Button
          icon={<MdUpload size={16} />}
          onClick={() => setUploadVisible(true)}
          disabled={!selectedBatch}
          className="ml-auto"
        >
          Upload Attendance (Excel)
        </Button>
      </div>

      {/* ── Excel Upload Modal ─────────────────────────────────────────────── */}
      <Modal
        open={uploadVisible}
        onCancel={() => { setUploadVisible(false); setUploadPreview([]); setUploadError(""); }}
        title={<span className="flex items-center gap-2"><FaFileExcel className="text-green-600" /> Upload Attendance via Excel</span>}
        width={700}
        footer={null}
      >
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
            <b>Required columns:</b> <code>date</code> (YYYY-MM-DD), <code>personId</code>, <code>personType</code> (student/teacher), <code>status</code> (Present/Absent/Half Day/Leave)
          </div>
          <div className="flex gap-3 items-center">
            <Button icon={<FaFileExcel size={14} />} onClick={() => {
              const ws = XLSX.utils.aoa_to_sheet([
                ["date", "personId", "personType", "status", "notes"],
                ["2026-04-21", "PERSON_ID_HERE", "student", "Present", ""],
              ]);
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, "Attendance");
              XLSX.writeFile(wb, "attendance_upload_template.xlsx");
            }}>Download Template</Button>
            <Button type="primary" icon={<MdUpload size={16} />} onClick={() => fileInputRef.current?.click()}>
              Choose Excel File
            </Button>
          </div>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploadError("");
              try {
                const rows = await parseAttendanceExcel(file);
                const required = ["date", "personId", "personType", "status"];
                const keys = Object.keys(rows[0] || {});
                const missing = required.filter((k) => !keys.includes(k));
                if (missing.length) { setUploadError(`Missing columns: ${missing.join(", ")}`); setUploadPreview([]); return; }
                setUploadPreview(rows.slice(0, 10));
              } catch { setUploadError("Failed to parse file. Please use the provided template."); }
              e.target.value = "";
            }} />
          {uploadError && <div className="text-red-500 text-sm bg-red-50 border border-red-200 rounded p-2">{uploadError}</div>}
          {uploadPreview.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Preview (first {uploadPreview.length} rows):</p>
              <Table
                size="small"
                pagination={false}
                dataSource={uploadPreview.map((r, i) => ({ key: i, ...r }))}
                columns={Object.keys(uploadPreview[0]).map((k) => ({ title: k, dataIndex: k, key: k, ellipsis: true }))}
                scroll={{ x: true }}
              />
              <div className="flex justify-end mt-3">
                <Button type="primary" loading={uploadSaving}
                  onClick={async () => {
                    setUploadSaving(true);
                    try {
                      // Group by date and submit as bulk
                      const byDate = {};
                      uploadPreview.forEach((r) => {
                        if (!byDate[r.date]) byDate[r.date] = [];
                        byDate[r.date].push({ personId: r.personId, personType: r.personType, status: r.status, notes: r.notes || "" });
                      });
                      for (const [date, records] of Object.entries(byDate)) {
                        await bulkMarkAttendance({ batchId: selectedBatch, date, records });
                      }
                      message.success("Attendance uploaded successfully");
                      setUploadVisible(false);
                      setUploadPreview([]);
                    } catch (err) {
                      message.error(err?.response?.data?.message || "Upload failed");
                    } finally { setUploadSaving(false); }
                  }}
                >Save Uploaded Attendance</Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Results */}
      {loading && (
        <div className="bg-white rounded-xl shadow p-16 flex justify-center">
          <Spin size="large" />
        </div>
      )}

      {!loading && historyData && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {STATUSES.map((s) => (
              <div key={s} className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${STATUS_CONFIG[s].color}`}>
                <span className="text-2xl font-bold">{filteredTotalStats[s]}</span>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold">{s}</span>
                  <span className="text-[11px] opacity-70">total entries</span>
                </div>
                {STATUS_CONFIG[s].icon}
              </div>
            ))}
          </div>

          {/* View switcher + table */}
          <div className="bg-white rounded-xl shadow">
            <div className="px-4 pt-4 pb-2 flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="font-semibold text-gray-700">
                  {dateRange[0].format("DD MMM YYYY")} → {dateRange[1].format("DD MMM YYYY")}
                </span>
                <span className="ml-3 text-gray-400 text-sm">
                  {filteredSummary.length} person(s) · {filteredRecords.length} records
                  {selectedPersonSearch && filteredSummary[0] && (
                    <Tag color="purple" className="ml-2">{filteredSummary[0].name}</Tag>
                  )}
                </span>
              </div>
              <Segmented value={view} onChange={setView}
                options={[
                  { label: "📊 Summary (per person)", value: "summary" },
                  { label: "📅 Day-by-Day Records", value: "records" },
                ]} />
            </div>

            {view === "summary" ? (
              <Table
                dataSource={filteredSummary}
                columns={summaryCols}
                rowKey="_id"
                pagination={{ pageSize: 20 }}
                size="middle"
                locale={{ emptyText: "No attendance records found for this range" }}
              />
            ) : (
              <Table
                dataSource={filteredRecords}
                columns={recordsCols}
                rowKey={(r) => `${r._id}`}
                pagination={{ pageSize: 20 }}
                size="middle"
                locale={{ emptyText: "No attendance records found for this range" }}
              />
            )}
          </div>
        </>
      )}

      {!loading && !historyData && (
        <div className="bg-white rounded-xl shadow p-16 flex flex-col items-center justify-center gap-3 text-gray-400">
          <span className="text-5xl">🗓️</span>
          <p className="text-lg font-medium">Select a batch and date range, then click "View History"</p>
          <p className="text-sm">You can view per-person summaries or day-by-day records</p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function Attendance() {
  const [batches, setBatches] = useState([]);
  const [batchesLoaded, setBatchesLoaded] = useState(false);
  const [mainTab, setMainTab] = useState("mark");

  useEffect(() => {
    getAttendanceBatches()
      .then((res) => setBatches(res.data || res.batches || []))
      .catch(() => message.error("Failed to load attendance batches"))
      .finally(() => setBatchesLoaded(true));
  }, []);

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="module-title">Attendance</h2>
          <p className="module-subtitle">Mark and review student & teacher attendance per batch</p>
        </div>
      </div>
      {batchesLoaded && !batches.length ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No attendance batches are assigned to this account. Ask a super admin to assign batches in the account settings.
        </div>
      ) : null}

      {/* Main tab switcher */}
      <Tabs activeKey={mainTab} onChange={setMainTab}
        type="card"
        items={[
          {
            key: "mark",
            label: <span className="flex items-center gap-2"><MdFactCheck size={18} />Mark Attendance</span>,
            children: <MarkAttendancePanel batches={batches} />,
          },
          {
            key: "history",
            label: <span className="flex items-center gap-2"><MdHistory size={18} />Attendance History</span>,
            children: <HistoryPanel batches={batches} />,
          },
          {
            key: "monthly",
            label: <span className="flex items-center gap-2"><MdDownload size={18} />Monthly Report</span>,
            children: <MonthlyAttendanceReport batches={batches} />,
          },
        ]}
      />
    </div>
  );
}
