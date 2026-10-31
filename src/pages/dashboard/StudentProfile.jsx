import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Tabs,
  Tag,
  Button,
  Radio,
  Descriptions,
  Row,
  Col,
  Statistic,
  Table,
  Space,
  Badge,
  Avatar,
  Divider,
  Progress,
  Empty,
  Spin,
  Tooltip,
  message,
  QRCode,
} from "antd";
import {
  ArrowLeftOutlined,
  UserOutlined,
  BookOutlined,
  DollarOutlined,
  SafetyCertificateOutlined,
  PhoneOutlined,
  MailOutlined,
  EnvironmentOutlined,
  IdcardOutlined,
  TeamOutlined,
  CalendarOutlined,
  ReloadOutlined,
  PrinterOutlined,
  GlobalOutlined,
} from "@ant-design/icons";
import {
  FaUser,
  FaPhone,
  FaEnvelope,
  FaMapMarkerAlt,
  FaIdCard,
  FaMale,
  FaFemale,
  FaGraduationCap,
  FaDollarSign,
  FaBookOpen,
  FaCheckCircle,
  FaTimesCircle,
  FaChalkboardTeacher,
  FaCertificate,
  FaCalendarAlt,
  FaRegIdCard,
} from "react-icons/fa";
import { MdPeople } from "react-icons/md";
import dayjs from "dayjs";
import api from "../../api/axiosInstance";
import StudentFeeProfile from "./StudentFeeProfile";
import jsPDF from "jspdf";
import "jspdf-autotable";
import odysseyLogo from "../../assets/images/logos/LOGO.png";
import sidebarLogo from "../../assets/images/logos/ODC-PNG.jpg";
import founderSignature from "../../assets/images/logos/founder-sig.png";
import academyConfig from "../../config/academyConfig";

const THEME = "#01134C";
const ACCENT = "#E8FC0A";
const MAX_PROFILE_PHOTO_SIZE = 5 * 1024 * 1024;

/* ──────────────────────────────────────────────────────────────────────────
   Small helpers
   ──────────────────────────────────────────────────────────────────────── */
const fmt = (v) => (v ? dayjs(v).format("DD MMM YYYY") : "—");
const fmtPKR = (n) => `PKR ${Number(n || 0).toLocaleString("en-PK")}`;
const fmtIdDate = (v) => (v ? dayjs(v).format("DD/MM/YYYY") : "00/00/0000");
const fmtIdCardLongDate = (v) => (v ? dayjs(v).format("D MMM YYYY") : "N/A");
const ACTIVE_ENROLLMENT_STATUS_SET = new Set(["active", "enrolled"]);

const getEnrollmentStartDate = (enrollment) =>
  enrollment?.batch?.startDate ||
  enrollment?.enrollmentDate ||
  enrollment?.createdAt ||
  null;

const getIdCardDisplayEnrollment = (enrollments = []) =>
  [...enrollments].sort((a, b) => {
    const durationDiff =
      Number(b?.course?.duration || 0) - Number(a?.course?.duration || 0);
    if (durationDiff !== 0) return durationDiff;

    return (
      dayjs(getEnrollmentStartDate(a)).valueOf() -
      dayjs(getEnrollmentStartDate(b)).valueOf()
    );
  })[0] || null;

const getStudentCourseIdsForIdCard = (enrollments = []) => {
  const courseIds = enrollments
    .map((enrollment) => String(enrollment?.course?.courseId || "").trim())
    .filter(Boolean);

  const uniqueCourseIds = Array.from(new Set(courseIds));
  return uniqueCourseIds.length ? uniqueCourseIds.join(", ") : "N/A";
};

const getStudentCardAddress = (student) => {
  const addressParts = [
    student?.address,
    student?.permanentAddress,
    student?.city,
    student?.tehsil,
    student?.district,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return addressParts.length ? addressParts.join(", ") : "N/A";
};

const statusColor = {
  active: "green",
  enrolled: "blue",
  completed: "cyan",
  dropped: "red",
  suspended: "orange",
};

/* ──────────────────────────────────────────────────────────────────────────
   Personal-tab sub-components
   ──────────────────────────────────────────────────────────────────────── */

/** Color-coded section card with gradient header */
const SectionCard = ({ title, icon: Icon, color = THEME, children }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden h-full flex flex-col">
    <div
      className="flex items-center gap-2.5 px-5 py-3"
      style={{
        background: `linear-gradient(120deg, ${color}18 0%, ${color}06 100%)`,
        borderBottom: `2px solid ${color}22`,
      }}
    >
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: color }}
      >
        {Icon && <Icon size={13} color="white" />}
      </div>
      <span className="font-bold text-sm" style={{ color }}>
        {title}
      </span>
    </div>
    <div className="p-4 flex-1">{children}</div>
  </div>
);

/** Single field row: icon left, small-caps label above, value below */
const FieldItem = ({
  icon: Icon,
  label,
  value,
  accent = false,
  iconColor,
  children,
}) => (
  <div className="flex gap-3 py-2.5 border-b border-gray-50 last:border-0">
    <div
      className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
      style={{ background: Icon ? `${iconColor || THEME}14` : "transparent" }}
    >
      {Icon && <Icon size={12} style={{ color: iconColor || THEME }} />}
    </div>
    <div className="min-w-0 flex-1">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 leading-none mb-0.5">
        {label}
      </div>
      {children ? (
        children
      ) : (
        <div
          className={`text-sm break-all leading-snug ${accent ? "font-bold" : "font-medium"} ${
            value ? "text-gray-800" : "text-gray-300"
          }`}
        >
          {value || "—"}
        </div>
      )}
    </div>
  </div>
);

/* ══════════════════════════════════════════════════════════════════════════
   Main Component
   ══════════════════════════════════════════════════════════════════════════ */
const StudentProfile = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [student, setStudent] = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [certifications, setCertifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("personal");
  const [profilePhotoMode, setProfilePhotoMode] = useState("upload");
  const [photoUpdating, setPhotoUpdating] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const uploadInputRef = React.useRef(null);
  const cameraVideoRef = React.useRef(null);
  const cameraStreamRef = React.useRef(null);

  /* ── Fetch all data ── */
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [stuRes, enrRes, certRes] = await Promise.all([
        api.get(`/student/admission/${id}`),
        api.get(`/enrollment/student/${id}`),
        api
          .get(`/student/certificate/${id}`)
          .catch(() => ({ data: { success: false, data: [] } })),
      ]);

      if (stuRes.data?.success) setStudent(stuRes.data.data);
      else message.error("Could not load student data");

      if (enrRes.data?.success) setEnrollments(enrRes.data.data);
      if (certRes.data?.success) setCertifications(certRes.data.data);
    } catch (err) {
      console.error(err);
      message.error("Error loading student profile");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const validateProfilePicture = (file) => {
    if (!file) {
      return false;
    }

    if (!file.type?.startsWith("image/")) {
      message.error("Please select a valid image file for the profile photo.");
      return false;
    }

    if (file.size > MAX_PROFILE_PHOTO_SIZE) {
      message.error("Profile photo must be smaller than 5 MB.");
      return false;
    }

    return true;
  };

  const updateProfilePhoto = async (file) => {
    if (!student?._id || !validateProfilePicture(file)) {
      return;
    }

    setPhotoUpdating(true);
    try {
      const formData = new FormData();
      formData.append("profilePicture", file);

      const response = await api.put(`/student/admission/${student._id}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (response.data?.success) {
        message.success("Profile photo updated successfully.");
        await fetchAll();
      } else {
        message.error("Failed to update profile photo.");
      }
    } catch (error) {
      message.error(error.response?.data?.message || "Failed to update profile photo.");
    } finally {
      setPhotoUpdating(false);
    }
  };

  const handleProfilePhotoChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    await updateProfilePhoto(file);
  };

  const triggerProfilePhotoInput = () => {
    if (profilePhotoMode === "camera") {
      startCamera();
      return;
    }

    uploadInputRef.current?.click();
  };

  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }

    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }

    setCameraOpen(false);
  };

  const bindStreamToCameraVideo = async (stream) => {
    let attempts = 0;

    while (!cameraVideoRef.current && attempts < 20) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      attempts += 1;
    }

    const videoElement = cameraVideoRef.current;

    if (!videoElement) {
      throw new Error("Camera preview element is not ready.");
    }

    videoElement.srcObject = stream;

    await new Promise((resolve, reject) => {
      const handleLoaded = () => {
        videoElement
          .play()
          .then(resolve)
          .catch(reject);
      };

      videoElement.onloadedmetadata = handleLoaded;
      videoElement.onerror = () => reject(new Error("Failed to load camera preview."));

      if (videoElement.readyState >= 1) {
        handleLoaded();
      }
    });
  };

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      message.error("Camera is not supported in this browser.");
      return;
    }

    try {
      stopCamera();
      let stream = null;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "user" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      cameraStreamRef.current = stream;
      setCameraOpen(true);
      await bindStreamToCameraVideo(stream);
    } catch (error) {
      console.error("Failed to open camera:", error);
      message.error("Could not open the system camera. Please allow camera access.");
    }
  };

  const captureCameraPhoto = async () => {
    const video = cameraVideoRef.current;

    if (!video || !video.videoWidth || !video.videoHeight) {
      message.error("Camera is not ready yet. Please try again.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          message.error("Failed to capture photo from camera.");
          return;
        }

        const capturedFile = new File(
          [blob],
          `student-profile-camera-${Date.now()}.jpg`,
          { type: "image/jpeg" },
        );

        stopCamera();
        await updateProfilePhoto(capturedFile);
      },
      "image/jpeg",
      0.92,
    );
  };

  useEffect(() => () => stopCamera(), []);

  /* ── Stats derived from enrollments ── */
  const totalPaid = enrollments.reduce((sum, e) => {
    if (!e.feeStructure?.installments) return sum;
    return (
      sum +
      e.feeStructure.installments
        .filter((i) => i.status?.toLowerCase() === "paid")
        .reduce((s, i) => s + (i.paidAmount || 0), 0)
    );
  }, 0);

  const totalDue = enrollments.reduce((sum, e) => {
    if (!e.feeStructure?.installments) return sum;
    return (
      sum +
      e.feeStructure.installments
        .filter((i) => i.status?.toLowerCase() !== "paid")
        .reduce((s, i) => s + (i.amount || 0), 0)
    );
  }, 0);

  const activeEnrollmentRecords = enrollments.filter((e) =>
    ACTIVE_ENROLLMENT_STATUS_SET.has(e.status?.toLowerCase()),
  );
  const activeEnrollments = activeEnrollmentRecords.length;
  const primaryEnrollment =
    getIdCardDisplayEnrollment(activeEnrollmentRecords) || enrollments[0] || null;

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <Spin size="large" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] gap-4">
        <Empty description="Student not found" />
        <Button onClick={() => navigate("/dashboard/students")}>
          Back to Students
        </Button>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════════
     TAB: Personal Information  — rich redesign
     ══════════════════════════════════════════════════════════════════════ */
  const PersonalTab = () => {
    const age = student.dateOfBirth
      ? dayjs().diff(dayjs(student.dateOfBirth), "year")
      : null;

    /* quick attribute chips — label + value + icon */
    const chips = [
      student.gender && {
        label: "Gender",
        value: student.gender,
        icon: student.gender === "Male" ? FaMale : FaFemale,
        color: student.gender === "Male" ? "#2563eb" : "#db2777",
        bg: student.gender === "Male" ? "#eff6ff" : "#fdf2f8",
        border: student.gender === "Male" ? "#bfdbfe" : "#fbcfe8",
      },
      age && {
        label: "Age",
        value: `${age} years`,
        icon: FaCalendarAlt,
        color: "#0891b2",
        bg: "#ecfeff",
        border: "#a5f3fc",
      },
      student.religion && {
        label: "Religion",
        value: student.religion,
        icon: null,
        color: "#7c3aed",
        bg: "#f5f3ff",
        border: "#ddd6fe",
      },
      student.district && {
        label: "District",
        value: student.district,
        icon: FaMapMarkerAlt,
        color: "#16a34a",
        bg: "#f0fdf4",
        border: "#bbf7d0",
      },
      student.reference && {
        label: "Reference",
        value: student.reference,
        icon: null,
        color: "#d97706",
        bg: "#fffbeb",
        border: "#fde68a",
      },
      {
        label: "Disability",
        value: student.disability ? "Has Disability" : "None",
        icon: student.disability ? FaTimesCircle : FaCheckCircle,
        color: student.disability ? "#ea580c" : "#16a34a",
        bg: student.disability ? "#fff7ed" : "#f0fdf4",
        border: student.disability ? "#fed7aa" : "#bbf7d0",
      },
    ].filter(Boolean);

    return (
      <div className="flex flex-col gap-5 pt-2">
        {/* ── Row 1: Personal / Contact / Address ── */}
        <Row gutter={[16, 16]}>
          {/* Personal Details */}
          <Col xs={24} md={12} xl={8}>
            <SectionCard title="Personal Details" icon={FaUser} color={THEME}>
              <FieldItem
                icon={FaRegIdCard}
                label="Registration No."
                value={student.registrationNo}
                accent
                iconColor={THEME}
              />
              <FieldItem
                icon={FaIdCard}
                label="CNIC / B-Form"
                value={student.cnicOrBForm}
                iconColor="#0891b2"
              />
              <FieldItem
                icon={FaCalendarAlt}
                label="Date of Birth"
                value={fmt(student.dateOfBirth)}
                iconColor="#7c3aed"
              />
              <FieldItem
                icon={FaCalendarAlt}
                label="Registration Date"
                value={fmt(student.registrationDate)}
                iconColor="#d97706"
              />
              <FieldItem icon={null} label="Caste" value={student.caste} />
              <FieldItem
                icon={null}
                label="Religion"
                value={student.religion}
              />
            </SectionCard>
          </Col>

          {/* Contact Information */}
          <Col xs={24} md={12} xl={8}>
            <SectionCard title="Contact" icon={FaPhone} color="#0891b2">
              <FieldItem
                icon={FaPhone}
                label="Mobile Number"
                value={student.mobileNumber}
                iconColor="#16a34a"
              />
              <FieldItem
                icon={FaPhone}
                label="WhatsApp"
                value={student.whatsappNumber}
                iconColor="#25d366"
              />
              <FieldItem
                icon={FaEnvelope}
                label="Email Address"
                value={student.emailAddress}
                iconColor="#2563eb"
              />
              <FieldItem
                icon={FaPhone}
                label="Emergency Contact"
                value={student.emergencyContactNumber}
                iconColor="#ef4444"
              />
            </SectionCard>
          </Col>

          {/* Address */}
          <Col xs={24} md={12} xl={8}>
            <SectionCard title="Address" icon={FaMapMarkerAlt} color="#16a34a">
              <FieldItem
                icon={FaMapMarkerAlt}
                label="Permanent Address"
                value={student.permanentAddress}
                iconColor="#16a34a"
              />
              <FieldItem
                icon={FaMapMarkerAlt}
                label="Current Address"
                value={student.currentAddress}
                iconColor="#0891b2"
              />
              <FieldItem
                icon={null}
                label="Union Council"
                value={student.unionCouncil}
              />
              <FieldItem icon={null} label="Tehsil" value={student.tehsil} />
              <FieldItem
                icon={null}
                label="District"
                value={student.district}
              />
            </SectionCard>
          </Col>
        </Row>

        {/* ── Row 2: Family / Academic / Quick Profile ── */}
        <Row gutter={[16, 16]}>
          {/* Family */}
          <Col xs={24} md={12}>
            <SectionCard
              title="Family Information"
              icon={FaUser}
              color="#7c3aed"
            >
              <Row gutter={[0, 0]}>
                <Col xs={24} sm={12}>
                  <FieldItem
                    icon={FaUser}
                    label="Father Name"
                    value={student.fatherName}
                    accent
                    iconColor="#7c3aed"
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <FieldItem
                    icon={FaIdCard}
                    label="Father CNIC"
                    value={student.fatherCnic}
                    iconColor="#0891b2"
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <FieldItem
                    icon={null}
                    label="Father Occupation"
                    value={student.fatherOccupation}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <FieldItem
                    icon={FaUser}
                    label="Guardian Name"
                    value={student.guardianName}
                    iconColor="#d97706"
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <FieldItem
                    icon={null}
                    label="Relationship"
                    value={student.relationshipWithStudent}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <FieldItem
                    icon={FaDollarSign}
                    label="Annual Income"
                    value={
                      student.annualIncome ? fmtPKR(student.annualIncome) : null
                    }
                    iconColor="#16a34a"
                  />
                </Col>
              </Row>
            </SectionCard>
          </Col>

          {/* Academic Background */}
          <Col xs={24} md={7}>
            <SectionCard
              title="Academic Background"
              icon={FaGraduationCap}
              color="#d97706"
            >
              <FieldItem
                icon={FaBookOpen}
                label="Previous School / College"
                value={student.previousSchoolCollege}
                iconColor="#d97706"
              />
              <FieldItem
                icon={FaGraduationCap}
                label="Last Class Attended"
                value={student.lastClassAttended}
                iconColor="#0891b2"
              />
              {student.enrolledCourses?.length > 0 && (
                <FieldItem
                  icon={FaBookOpen}
                  label="Enrolled Courses"
                  iconColor="#7c3aed"
                >
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {student.enrolledCourses.map((c, i) => (
                      <Tag key={i} color="purple" className="text-xs m-0">
                        {c.courseName || c}
                      </Tag>
                    ))}
                  </div>
                </FieldItem>
              )}
            </SectionCard>
          </Col>

          {/* Quick Profile Chips — beside Academic */}
          <Col xs={24} md={5}>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden h-full flex flex-col">
              <div
                className="flex items-center gap-2.5 px-4 py-3"
                style={{
                  background: `linear-gradient(120deg, ${THEME}18 0%, ${THEME}06 100%)`,
                  borderBottom: `2px solid ${THEME}22`,
                }}
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: THEME }}
                >
                  <FaUser size={12} color="white" />
                </div>
                <span className="font-bold text-sm" style={{ color: THEME }}>
                  Quick Info
                </span>
              </div>
              <div className="p-3 flex flex-col gap-2 flex-1">
                {chips.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 rounded-xl border px-3 py-2 w-full"
                    style={{ background: c.bg, borderColor: c.border }}
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${c.color}20` }}
                    >
                      {c.icon ? (
                        <c.icon size={12} style={{ color: c.color }} />
                      ) : (
                        <span
                          className="text-[10px] font-black"
                          style={{ color: c.color }}
                        >
                          {c.label[0]}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col leading-none min-w-0">
                      <span
                        className="text-[9px] font-bold uppercase tracking-widest truncate"
                        style={{ color: `${c.color}88` }}
                      >
                        {c.label}
                      </span>
                      <span
                        className="text-xs font-bold mt-0.5 truncate"
                        style={{ color: c.color }}
                      >
                        {c.value}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Col>
        </Row>
      </div>
    );
  };

  /* ══════════════════════════════════════════════════════════════════════
     TAB: Enrollments & Courses
     ══════════════════════════════════════════════════════════════════════ */
  const EnrollmentsTab = () => {
    const statusSummary = enrollments.reduce(
      (summary, enrollment) => {
        const status = String(enrollment?.status || "").toLowerCase();

        if (status === "completed") {
          summary.passout += 1;
        } else if (status === "dropped") {
          summary.dropout += 1;
        } else if (status === "active" || status === "enrolled") {
          summary.active += 1;
        } else {
          summary.other += 1;
        }

        return summary;
      },
      { active: 0, passout: 0, dropout: 0, other: 0 },
    );

    const installmentColumns = [
      {
        title: "#",
        dataIndex: "installmentNumber",
        key: "no",
        width: 50,
        render: (v) => <span className="font-semibold text-xs">#{v}</span>,
      },
      {
        title: "Amount",
        dataIndex: "amount",
        key: "amount",
        render: (v) => (
          <span className="font-semibold text-sm">{fmtPKR(v)}</span>
        ),
      },
      {
        title: "Paid",
        dataIndex: "paidAmount",
        key: "paid",
        render: (v) => (
          <span className="text-green-600 font-semibold text-sm">
            {v ? fmtPKR(v) : "—"}
          </span>
        ),
      },
      {
        title: "Due Date",
        dataIndex: "dueDate",
        key: "due",
        render: (v) => <span className="text-xs text-gray-500">{fmt(v)}</span>,
      },
      {
        title: "Status",
        dataIndex: "status",
        key: "status",
        render: (s) =>
          s?.toLowerCase() === "paid" ? (
            <Tag color="green" icon={<FaCheckCircle />}>
              Paid
            </Tag>
          ) : (
            <Tag color="red" icon={<FaTimesCircle />}>
              {s || "Pending"}
            </Tag>
          ),
      },
      {
        title: "Paid On",
        dataIndex: "paidDate",
        key: "paidDate",
        render: (v) => <span className="text-xs text-gray-500">{fmt(v)}</span>,
      },
    ];

    const columns = [
      {
        title: "Course",
        key: "course",
        render: (_, r) => (
          <div>
            <div className="font-semibold text-sm" style={{ color: THEME }}>
              {r.course?.courseName || "—"}
            </div>
            <div className="text-xs text-gray-400">{r.course?.courseId}</div>
          </div>
        ),
      },
      {
        title: "Teacher",
        key: "teacher",
        render: (_, r) => r.course?.teacherId?.fullName || "—",
      },
      {
        title: "Batch",
        key: "batch",
        render: (_, r) =>
          r.batch ? (
            <div>
              <div className="font-medium text-sm">{r.batch.batchName}</div>
              <div className="text-xs text-gray-400">{r.batch.batchCode}</div>
            </div>
          ) : (
            "—"
          ),
      },
      {
        title: "Shift",
        key: "shift",
        render: (_, r) => r.batch?.shift || r.course?.shift || "—",
      },
      {
        title: "Start Date",
        key: "start",
        render: (_, r) => (
          <span className="text-xs">{fmt(r.batch?.startDate)}</span>
        ),
      },
      {
        title: "Enrollment Date",
        dataIndex: "enrollmentDate",
        key: "enrDate",
        render: (v) => <span className="text-xs">{fmt(v)}</span>,
      },
      {
        title: "Status",
        dataIndex: "status",
        key: "status",
        render: (s) => (
          <Tag color={statusColor[s?.toLowerCase()] || "default"}>
            {s || "Unknown"}
          </Tag>
        ),
      },
      {
        title: "Total Fee",
        key: "fee",
        render: (_, r) => (
          <span className="font-semibold text-sm">
            {fmtPKR(r.feeStructure?.totalAmount || r.course?.totalFee)}
          </span>
        ),
      },
    ];

    return (
      <div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          {[
            {
              label: "Active Courses",
              value: statusSummary.active,
              color: "#16A34A",
              bg: "#F0FDF4",
            },
            {
              label: "Passout Courses",
              value: statusSummary.passout,
              color: "#7C3AED",
              bg: "#F5F3FF",
            },
            {
              label: "Dropout Courses",
              value: statusSummary.dropout,
              color: "#DC2626",
              bg: "#FEF2F2",
            },
            {
              label: "Other Status",
              value: statusSummary.other,
              color: "#475569",
              bg: "#F8FAFC",
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border px-4 py-3"
              style={{ background: item.bg, borderColor: `${item.color}22` }}
            >
              <div
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: item.color }}
              >
                {item.label}
              </div>
              <div
                className="text-2xl font-bold mt-1"
                style={{ color: item.color }}
              >
                {item.value}
              </div>
            </div>
          ))}
        </div>

        {enrollments.length === 0 ? (
          <Empty description="No enrollments found" />
        ) : (
          <Table
            dataSource={enrollments}
            columns={columns}
            rowKey="_id"
            pagination={false}
            size="small"
            scroll={{ x: 900 }}
            expandable={{
              expandedRowRender: (record) => {
                if (!record.feeStructure?.installments?.length) {
                  return (
                    <div className="p-3 text-gray-500 text-sm">
                      No installment data available
                    </div>
                  );
                }

                const paid = record.feeStructure.installments.filter(
                  (i) => i.status?.toLowerCase() === "paid",
                );
                const total = record.feeStructure.installments.length;
                const pct = total ? Math.round((paid.length / total) * 100) : 0;

                return (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold text-gray-700">
                        Installments ({paid.length}/{total} paid)
                      </span>
                      <Progress
                        percent={pct}
                        size="small"
                        style={{ width: 160 }}
                        strokeColor={THEME}
                      />
                    </div>
                    <Table
                      dataSource={[...record.feeStructure.installments].sort(
                        (left, right) =>
                          Number(left.installmentNumber || 0) -
                          Number(right.installmentNumber || 0),
                      )}
                      columns={installmentColumns}
                      rowKey="installmentNumber"
                      pagination={false}
                      size="small"
                    />
                  </div>
                );
              },
              rowExpandable: (r) => !!r.feeStructure?.installments?.length,
            }}
          />
        )}
      </div>
    );
  };

  /* ══════════════════════════════════════════════════════════════════════
     TAB: Certifications
     ══════════════════════════════════════════════════════════════════════ */
  const CertificationsTab = () => {
    const certColumns = [
      {
        title: "Certificate No.",
        dataIndex: "certificateNo",
        key: "certNo",
        render: (v) => (
          <span
            className="font-mono text-sm font-semibold"
            style={{ color: THEME }}
          >
            {v}
          </span>
        ),
      },
      {
        title: "Course",
        dataIndex: "courseName",
        key: "course",
        render: (v) => <span className="font-medium text-sm">{v || "—"}</span>,
      },
      {
        title: "Issue Date",
        dataIndex: "issueDate",
        key: "issue",
        render: (v) => <span className="text-sm">{fmt(v)}</span>,
      },
      {
        title: "Expiry Date",
        dataIndex: "expiryDate",
        key: "expiry",
        render: (v) => (
          <span className="text-sm">{v ? fmt(v) : "No Expiry"}</span>
        ),
      },
      {
        title: "Grade",
        dataIndex: "grade",
        key: "grade",
        render: (v) =>
          v ? (
            <Tag
              color={
                v === "A+" || v === "A"
                  ? "green"
                  : v === "B"
                    ? "blue"
                    : "default"
              }
            >
              {v}
            </Tag>
          ) : (
            "—"
          ),
      },
      {
        title: "Status",
        dataIndex: "status",
        key: "status",
        render: (s) =>
          s === "Active" ? (
            <Tag color="green">Active</Tag>
          ) : (
            <Tag color="red">{s || "—"}</Tag>
          ),
      },
    ];

    return certifications.length === 0 ? (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="No certifications issued yet"
      />
    ) : (
      <Table
        dataSource={certifications}
        columns={certColumns}
        rowKey="_id"
        pagination={{ pageSize: 10 }}
        size="small"
      />
    );
  };

  const IdCardTab = () => {
    if (!student?.isActive) {
      return (
        <div className="py-10">
          <Empty description="ID card is available for active students only" />
        </div>
      );
    }

    const courseIds = getStudentCourseIdsForIdCard(activeEnrollmentRecords);
    const studentCode = student?.registrationNo || "N/A";
    const joinBaseDate =
      getEnrollmentStartDate(primaryEnrollment) ||
      student?.registrationDate ||
      student?.createdAt;
    const joinDate = fmtIdDate(joinBaseDate);
    const expiryDate = fmtIdDate(
      joinBaseDate ? dayjs(joinBaseDate).add(2, "year").endOf("month") : null,
    );
    const contactNumber = "+92 349 2425428";
    const guardianName = student?.fatherName || student?.guardianName || "N/A";
    const cnicNumber = student?.cnicOrBForm || "N/A";
    const address = getStudentCardAddress(student);
    const rollNo =
      student?.rollNo || student?.studentRollNo || student?.registrationNo || "N/A";
    const attendanceQrValue = JSON.stringify({
      type: "student_attendance",
      studentId: student?._id || student?.id || "",
      studentCode,
      studentName: student?.studentName || "",
    });

    return (
      <div className="student-id-print-area py-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-5">
          <div>
            <div className="text-xl font-bold" style={{ color: THEME }}>
              Student ID Card
            </div>
            <div className="text-sm text-gray-500">
              Front and back print layout for active students
            </div>
          </div>
          <Button
            icon={<PrinterOutlined />}
            onClick={() => window.print()}
            style={{
              background: THEME,
              borderColor: THEME,
              color: ACCENT,
              fontWeight: 700,
            }}
          >
            Print ID Card
          </Button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 id-card-grid">
          <div className="id-card-shell">
            <div className="student-id-card student-id-front">
              <div className="id-card-lanyard-slot" />
              <div className="id-front-top-navy" />
              <div className="id-front-top-gold" />
              <div className="id-front-top-white-swoosh" />
              <div className="id-front-campus-fade" />
              <div className="id-front-bottom-gold-wave" />
              <div className="id-front-bottom-navy-band" />

              <div className="id-front-header">
                <div className="id-front-title-main !text-[30px]">ODYSSEY</div>
                <div className="id-front-title-sub">ACADEMY KHIPRO</div>
                <div className="id-front-title-rule">
                  <span />
                  <em>Where Success Begins!</em>
                  <span />
                </div>
              </div>

              <div className="id-card-photo-frame !h-[130px]">
                {student?.profilePicture ? (
                  <img
                    src={student.profilePicture}
                    alt={student.studentName}
                    className="id-card-photo"
                  />
                ) : (
                  <div className="id-card-photo id-card-photo-fallback">
                    <FaUser size={94} color="#a3a3a3" />
                  </div>
                )}
              </div>

              <div className="id-card-nameplate !text-[14px]">
                {student?.studentName || "STUDENT NAME"}
              </div>

              <div className="id-card-detail-lines">
                <div className="id-card-detail-row">
                  <span>FATHER&apos;S NAME</span>
                  <strong>{guardianName}</strong>
                </div>
                <div className="id-card-detail-row">
                  <span>COURSE ID</span>
                  <strong>{courseIds}</strong>
                </div>
                <div className="id-card-detail-row">
                  <span>CNIC / B-FORM</span>
                  <strong>{cnicNumber}</strong>
                </div>
                <div className="id-card-detail-row">
                  <span>ADDRESS</span>
                  <strong>{address}</strong>
                </div>
              </div>

              <div className="id-front-qr-block">
                <div className="id-front-qr-shell">
                  <QRCode
                    value={attendanceQrValue}
                    size={82}
                    bordered={false}
                    color="#152b57"
                    bgColor="#ffffff"
                  />
                </div>
                <div className="id-front-qr-id-number">ID: {studentCode}</div>
              </div>

              <div className="id-front-signature-block">
                <img
                  src={founderSignature}
                  alt="Founder signature"
                  className="id-front-signature-image"
                />
                <div className="id-front-signature-line" />
                <div className="id-front-signature-mark">Authorized Signature</div>
              </div>
            </div>
          </div>

          <div className="id-card-shell">
            <div className="student-id-card student-id-back">
              <div className="id-card-lanyard-slot id-card-lanyard-slot-back" />
              <div className="id-back-top-navy" />
              <div className="id-back-top-gold" />
              <div className="id-back-top-white-body" />
              <div className="id-back-bottom-navy-block" />

              <div className="id-back-logo-wrap">
                <div className="id-back-logo-ring">
                  <img
                    src={sidebarLogo}
                    alt="Odyssey Academy"
                    className="id-back-logo-large"
                  />
                </div>
              </div>

              <div className="id-card-back-title">
                <span />
                <strong>INSTRUCTIONS</strong>
                <span />
              </div>

              <div className="id-card-back-points">
                <div>This ID Card is the property of Odyssey Academy Khipro.</div>
                <div>This ID Card is non-transferable.</div>
                <div>Student must carry this ID Card during class hours.</div>
                <div>This ID Card must be shown on demand.</div>
                <div>Loss of this card must be reported immediately.</div>
              </div>

              <div className="id-back-divider" />

              <div className="id-back-contact-block">
                <div className="id-back-contact-row">
                  <EnvironmentOutlined />
                  <span className="id-back-address">{academyConfig.address}</span>
                </div>
                <div className="id-back-contact-row">
                  <PhoneOutlined />
                  <span>{contactNumber}</span>
                </div>
                <div className="id-back-contact-row">
                  <GlobalOutlined />
                  <span>odysseyacademy.education</span>
                </div>
                <div className="id-back-date-row">
                  <span>Issued: {fmtIdCardLongDate(joinBaseDate)}</span>
                  <span>Valid Till: {fmtIdCardLongDate(dayjs(joinBaseDate).add(2, "year").endOf("month").toDate())}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  /* ══════════════════════════════════════════════════════════════════════
     TAB items
     ══════════════════════════════════════════════════════════════════════ */
  const tabItems = [
    {
      key: "personal",
      label: (
        <span className="flex items-center gap-1.5">
          <FaUser size={13} />
          Personal Info
        </span>
      ),
      children: <PersonalTab />,
    },
    {
      key: "enrollments",
      label: (
        <span className="flex items-center gap-1.5">
          <FaBookOpen size={13} />
          Enrollments &amp; Courses
          <Badge count={enrollments.length} color={THEME} size="small" />
        </span>
      ),
      children: <EnrollmentsTab />,
    },
    {
      key: "fees",
      label: (
        <span className="flex items-center gap-1.5">
          <FaDollarSign size={13} />
          Fees &amp; Payments
        </span>
      ),
      children: (
        <StudentFeeProfile studentId={student._id} studentInfo={student} />
      ),
    },
    {
      key: "certifications",
      label: (
        <span className="flex items-center gap-1.5">
          <FaCertificate size={13} />
          Certifications
          <Badge count={certifications.length} color="cyan" size="small" />
        </span>
      ),
      children: <CertificationsTab />,
    },
    {
      key: "id-card",
      label: (
        <span className="flex items-center gap-1.5">
          <IdcardOutlined />
          ID Card
          {student?.isActive ? <Badge count="Active" color="green" size="small" /> : null}
        </span>
      ),
      children: <IdCardTab />,
    },
  ];

  /* ══════════════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* ── Back + Page Header ── */}
      <div className="flex items-center gap-3">
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate("/dashboard/students")}
          style={{ borderColor: THEME, color: THEME }}
        >
          Students
        </Button>
        <div className="h-6 w-px bg-gray-200" />
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: THEME }}
          >
            <MdPeople size={17} style={{ color: ACCENT }} />
          </div>
          <span className="text-base font-bold" style={{ color: THEME }}>
            Student Profile
          </span>
        </div>
        <div className="ml-auto">
          <Tooltip title="Refresh">
            <Button
              icon={<ReloadOutlined />}
              onClick={fetchAll}
              loading={loading}
              size="small"
              style={{ borderColor: THEME, color: THEME }}
            />
          </Tooltip>
        </div>
      </div>

      {/* ── Profile Hero Card ── */}
      <div
        className="rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center gap-6"
        style={{
          background: `linear-gradient(135deg, ${THEME} 0%, #0a2480 100%)`,
        }}
      >
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*"
          onChange={handleProfilePhotoChange}
          style={{ display: "none" }}
        />
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*"
          onChange={handleProfilePhotoChange}
          style={{ display: "none" }}
        />
        <div className="shrink-0 flex flex-col items-center gap-3">
          {student.profilePicture ? (
            <img
              src={student.profilePicture}
              alt={student.studentName}
              className="w-24 h-24 rounded-2xl object-cover border-4 border-white/20"
            />
          ) : (
            <div
              className="w-24 h-24 rounded-2xl flex items-center justify-center border-4 border-white/20"
              style={{ background: "rgba(255,255,255,0.15)" }}
            >
              <FaUser size={40} color="rgba(255,255,255,0.8)" />
            </div>
          )}
          <Radio.Group
            value={profilePhotoMode}
            onChange={(e) => {
              const nextMode = e.target.value;
              setProfilePhotoMode(nextMode);
              if (nextMode !== "camera") {
                stopCamera();
              }
            }}
            optionType="button"
            buttonStyle="solid"
            size="small"
          >
            <Radio.Button value="upload">System</Radio.Button>
            <Radio.Button value="camera">Camera</Radio.Button>
          </Radio.Group>
          <Button
            onClick={triggerProfilePhotoInput}
            loading={photoUpdating}
            size="small"
            style={{
              background: "#ffffff",
              borderColor: "#ffffff",
              color: THEME,
              fontWeight: 600,
            }}
          >
            {profilePhotoMode === "camera" ? "Capture & Update" : "Upload & Update"}
          </Button>
          {profilePhotoMode === "camera" && cameraOpen && (
            <div
              style={{
                width: "240px",
                background: "rgba(255,255,255,0.14)",
                borderRadius: "16px",
                padding: "12px",
              }}
            >
              <video
                ref={cameraVideoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: "100%",
                  minHeight: "220px",
                  objectFit: "cover",
                  borderRadius: "12px",
                  background: "#0f172a",
                }}
              />
              <div className="flex gap-2 justify-center mt-3 flex-wrap">
                <Button type="primary" size="small" onClick={captureCameraPhoto}>
                  Capture Photo
                </Button>
                <Button size="small" onClick={stopCamera}>
                  Close
                </Button>
              </div>
            </div>
          )}
          <span className="text-white/70 text-xs text-center">
            Max size 5 MB
          </span>
        </div>

        {/* Name + basic meta */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-white m-0 truncate">
              {student.studentName}
            </h1>
            {student.isActive ? (
              <Tag color="green" className="text-xs">
                Active
              </Tag>
            ) : (
              <Tag color="red" className="text-xs">
                Inactive
              </Tag>
            )}
          </div>
          <div className="flex flex-wrap gap-4 text-white/70 text-sm mt-1">
            <span className="flex items-center gap-1">
              <FaRegIdCard size={12} />
              {student.registrationNo}
            </span>
            {student.gender && (
              <span className="flex items-center gap-1">
                {student.gender === "Male" ? (
                  <FaMale size={12} />
                ) : (
                  <FaFemale size={12} />
                )}
                {student.gender}
              </span>
            )}
            {student.mobileNumber && (
              <span className="flex items-center gap-1">
                <FaPhone size={12} />
                {student.mobileNumber}
              </span>
            )}
            {student.emailAddress && (
              <span className="flex items-center gap-1">
                <FaEnvelope size={12} />
                {student.emailAddress}
              </span>
            )}
            {student.district && (
              <span className="flex items-center gap-1">
                <FaMapMarkerAlt size={12} />
                {student.district}
              </span>
            )}
          </div>
          <div className="mt-2 text-white/50 text-xs">
            Registered on {fmt(student.registrationDate || student.createdAt)}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="flex flex-wrap gap-3 shrink-0">
          {[
            {
              label: "Courses",
              value: enrollments.length,
              color: ACCENT,
            },
            {
              label: "Active",
              value: activeEnrollments,
              color: "#4ade80",
            },
            {
              label: "Total Paid",
              value: fmtPKR(totalPaid),
              color: "#60a5fa",
              small: true,
            },
            {
              label: "Outstanding",
              value: fmtPKR(totalDue),
              color: "#f87171",
              small: true,
            },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl px-4 py-3 min-w-[90px] text-center"
              style={{ background: "rgba(255,255,255,0.1)" }}
            >
              <div
                className={`font-bold ${s.small ? "text-sm" : "text-2xl"} leading-tight`}
                style={{ color: s.color }}
              >
                {s.value}
              </div>
              <div className="text-white/60 text-xs mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          size="middle"
          className="student-profile-tabs"
          tabBarStyle={{ padding: "0 24px", marginBottom: 0 }}
          style={{ "--tab-active-color": THEME }}
          tabBarExtraContent={null}
        />
      </div>

      {/* override tab active color */}
      <style>{`
        .student-profile-tabs .ant-tabs-tab.ant-tabs-tab-active .ant-tabs-tab-btn {
          color: ${THEME} !important;
        }
        .student-profile-tabs .ant-tabs-ink-bar {
          background: ${THEME} !important;
        }
        .student-profile-tabs .ant-tabs-tab:hover .ant-tabs-tab-btn {
          color: ${THEME} !important;
        }
        .student-profile-tabs .ant-tabs-content-holder {
          padding: 0 24px 24px;
        }
        .id-card-shell {
          display: flex;
          justify-content: center;
        }
        .student-id-card {
          position: relative;
          width: min(100%, 370px);
          min-height: 690px;
          background: #ffffff;
          border-radius: 26px;
          overflow: hidden;
          box-shadow: 0 24px 55px rgba(15, 23, 42, 0.2);
          border: 1px solid rgba(15, 23, 42, 0.1);
          padding: 0;
        }
        .student-id-front,
        .student-id-back {
          color: #0f172a;
        }
        .student-id-front {
          background:
            radial-gradient(circle at 15% 22%, rgba(212, 175, 55, 0.08) 0, rgba(212, 175, 55, 0) 18%),
            repeating-radial-gradient(circle at 50% 44%, rgba(20, 45, 120, 0.03) 0 2px, rgba(255, 255, 255, 0.95) 2px 8px),
            linear-gradient(180deg, #ffffff 0%, #fffef8 100%);
        }
        .student-id-back {
          background: #ffffff;
          color: #ffffff;
        }
        .id-card-lanyard-slot,
        .id-front-top-navy,
        .id-front-top-gold,
        .id-front-top-white-swoosh,
        .id-front-campus-fade,
        .id-front-bottom-gold-wave,
        .id-front-bottom-navy-band,
        .id-back-top-navy,
        .id-back-top-gold,
        .id-back-top-white-body,
        .id-back-bottom-navy-block {
          position: absolute;
          pointer-events: none;
        }
        .id-card-lanyard-slot {
          top: 28px;
          left: 50%;
          transform: translateX(-50%);
          width: 92px;
          height: 20px;
          border-radius: 999px;
          background: #ffffff;
          z-index: 5;
          box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.08), 0 3px 8px rgba(15, 23, 42, 0.1);
        }
        .id-card-lanyard-slot-back {
          background: #f8fafc;
        }
        .id-front-top-navy {
          top: 0;
          left: 0;
          right: 0;
          height: 144px;
          background: #112d68;
          clip-path: ellipse(128% 100% at 50% 0%);
        }
        .id-front-top-gold {
          top: 28px;
          left: -28px;
          right: -28px;
          height: 122px;
          background: linear-gradient(90deg, #c58b11 0%, #f0c75a 48%, #c58b11 100%);
          clip-path: ellipse(118% 100% at 50% 0%);
        }
        .id-front-top-white-swoosh {
          top: 33px;
          left: 6px;
          right: 6px;
          height: 120px;
          background: linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,1) 100%);
          clip-path: ellipse(120% 100% at 50% 0%);
        }
        .id-front-campus-fade {
          left: 0;
          right: 0;
          bottom: 176px;
          height: 220px;
          background:
            linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.85) 70%, #fff 100%),
            url("${odysseyLogo}") center 60% / 170px auto no-repeat;
          opacity: 0.08;
        }
        .id-front-bottom-gold-wave {
          left: -36px;
          right: -36px;
          bottom: 88px;
          height: 84px;
          background: linear-gradient(90deg, #e4af17 0%, #c99011 100%);
          border-top-left-radius: 58% 100%;
          border-top-right-radius: 58% 100%;
          border-bottom-left-radius: 0;
          border-bottom-right-radius: 0;
        }
        .id-front-bottom-navy-band {
          left: 0;
          right: 0;
          bottom: 0;
          height: 88px;
          background: #112d68;
        }
        .id-back-top-navy {
          top: 0;
          left: 0;
          right: 0;
          height: 250px;
          background: #112d68;
        }
        .id-back-top-gold {
          top: 136px;
          left: -34px;
          right: -34px;
          height: 92px;
          background: linear-gradient(90deg, #c58b11 0%, #f0c75a 48%, #c58b11 100%);
          border-top-left-radius: 58% 100%;
          border-top-right-radius: 58% 100%;
        }
        .id-back-top-white-body {
          top: 154px;
          left: 0;
          right: 0;
          bottom: 150px;
          background: #ffffff;
          border-top-left-radius: 58% 14%;
          border-top-right-radius: 58% 14%;
        }
        .id-back-bottom-navy-block {
          left: 0;
          right: 0;
          bottom: 0;
          height: 172px;
          background: #112d68;
        }
        .id-front-header {
          position: relative;
          z-index: 2;
          text-align: center;
          padding-top: 78px;
          color: #142d78;
        }
        .id-front-title-main {
          font-size: 60px;
          line-height: 0.95;
          font-weight: 900;
          letter-spacing: 0.03em;
          color: #112d68;
          font-family: Georgia, "Times New Roman", serif;
        }
        .id-front-title-sub {
          margin-top: 2px;
          font-size: 22px;
          line-height: 1.1;
          font-weight: 900;
          letter-spacing: 0.06em;
          color: #d1a12a;
        }
        .id-front-title-rule {
          margin-top: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          color: #1f2a56;
        }
        .id-front-title-rule span {
          width: 44px;
          height: 2px;
          background: #d1a12a;
          border-radius: 999px;
        }
        .id-front-title-rule em {
          font-size: 16px;
          font-style: italic;
          font-weight: 700;
          white-space: nowrap;
          font-family: Georgia, "Times New Roman", serif;
        }
        .id-card-photo-frame {
          position: relative;
          z-index: 2;
          width: 146px;
          height: 176px;
          margin: 14px auto 10px;
          border-radius: 16px;
          background: #f8fafc;
          border: 3px solid #20396f;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
          overflow: hidden;
        }
        .id-card-photo {
          width: 100%;
          height: 100%;
          border-radius: 13px;
          object-fit: cover;
          background: #f8fafc;
        }
        .id-card-photo-fallback {
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(180deg, #fafafa 0%, #ececec 100%);
        }
        .id-card-nameplate {
          position: relative;
          z-index: 2;
          text-align: center;
          width: fit-content;
          max-width: calc(100% - 60px);
          margin: 0 auto 18px;
          background: #112d68;
          color: #ffffff;
          padding: 7px 20px 8px;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 900;
          line-height: 1.1;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          box-shadow: 0 12px 22px rgba(17, 45, 104, 0.18);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .id-card-detail-lines {
          position: absolute;
          z-index: 2;
          left: 38px;
          right: 38px;
          top: 382px;
          display: grid;
          gap: 7px;
        }
        .id-card-detail-row {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          align-items: baseline;
          padding-bottom: 3px;
          border-bottom: 1px solid rgba(17, 45, 104, 0.22);
          width: 100%;
        }
        .id-card-detail-row span {
          font-size: 11px;
          color: #112d68;
          min-width: 108px;
          flex-shrink: 0;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 900;
        }
        .id-card-detail-row strong {
          font-size: 12px;
          font-weight: 700;
          color: #1f2937;
          text-align: left;
          word-break: break-word;
          flex: 1;
        }
        .id-back-logo-wrap {
          position: relative;
          z-index: 2;
          display: flex;
          justify-content: center;
          padding-top: 82px;
        }
        .id-back-logo-ring {
          width: 208px;
          height: 208px;
          border-radius: 999px;
          background: #112d68;
          border: 6px solid #ffffff;
          box-shadow: 0 14px 28px rgba(17, 45, 104, 0.22);
          padding: 16px;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        /* Keep the academy logo perfectly square so its intrinsic aspect ratio
           is preserved inside the circular badge without stretching. */
        .id-back-logo-large {
          width: 100%;
          height: 100%;
          max-width: 100%;
          max-height: 100%;
          aspect-ratio: 1 / 1;
          object-fit: contain;
          border-radius: 999px;
          display: block;
        }
        .id-card-back-title {
          position: relative;
          z-index: 2;
          margin: 38px 36px 18px;
          color: #112d68;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
        }
        .id-card-back-title span {
          width: 42px;
          height: 2px;
          border-radius: 999px;
          background: #d1a12a;
        }
        .id-card-back-title strong {
          font-size: 18px;
          font-weight: 900;
          letter-spacing: 0.03em;
        }
        .id-card-back-points {
          position: relative;
          z-index: 2;
          display: grid;
          gap: 8px;
          margin-bottom: 18px;
          padding: 0 38px;
        }
        .id-card-back-points div {
          position: relative;
          padding-left: 20px;
          color: #1f2937;
          font-size: 11px;
          line-height: 1.38;
          text-align: left;
          font-weight: 700;
        }
        .id-card-back-points div::before {
          content: "★";
          position: absolute;
          left: 0;
          top: 0;
          color: #d1a12a;
          font-size: 12px;
        }
        .id-back-divider {
          position: relative;
          z-index: 2;
          width: 128px;
          height: 2px;
          margin: 0 auto 18px;
          background: rgba(17, 45, 104, 0.65);
        }
        .id-front-qr-block {
          position: absolute;
          left: 24px;
          bottom: 18px;
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          justify-content: flex-start;
        }
        .id-front-qr-shell {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 7px;
          background: #ffffff;
          border-radius: 8px;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18);
          border: 2px solid rgba(17, 45, 104, 0.18);
        }
        .id-front-qr-shell canvas,
        .id-front-qr-shell svg {
          display: block;
        }
        .id-front-qr-id-number {
          color: #ffffff;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.02em;
          text-align: center;
          width: 100%;
          max-width: 118px;
          line-height: 1.15;
          word-break: break-word;
        }
        .id-front-signature-block {
          position: absolute;
          right: 22px;
          bottom: 24px;
          z-index: 2;
          width: 150px;
          text-align: center;
          overflow: hidden;
        }
        .id-front-signature-image {
          width: 100%;
          height: 42px;
          object-fit: contain;
          object-position: center center;
          display: block;
          margin: 0 auto 2px;
          filter: brightness(0) invert(1) contrast(1.55);
        }
        .id-front-signature-mark {
          color: #ffffff;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          margin-top: 1px;
          white-space: nowrap;
        }
        .id-front-signature-line {
          width: 100%;
          height: 2px;
          background: #d1a12a;
          border-radius: 999px;
        }
        .id-back-contact-block {
          position: absolute;
          left: 34px;
          right: 34px;
          bottom: 28px;
          z-index: 2;
          color: #ffffff;
          display: grid;
          gap: 8px;
          font-size: 12px;
          line-height: 1.45;
          font-weight: 700;
        }
        .id-back-contact-row {
          display: flex;
          align-items: flex-start;
          justify-content: flex-start;
          gap: 10px;
        }
        .id-back-contact-row .anticon {
          color: #e7b11e;
          font-size: 16px;
          margin-top: 1px;
          flex-shrink: 0;
        }
        .id-back-contact-row span {
          flex: 0 1 auto;
          text-align: left;
          line-height: 1.35;
        }
        .id-back-address {
          font-size: 10.5px;
          white-space: nowrap;
        }
        .id-back-date-row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding-top: 4px;
          color: #f3f4f6;
          font-size: 10.5px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        @media (max-width: 768px) {
          .student-id-card {
            width: min(100%, 344px);
            min-height: 640px;
          }
          .id-front-title-main {
            font-size: 52px;
          }
          .id-front-title-sub {
            font-size: 19px;
          }
          .id-front-title-rule em {
            font-size: 14px;
          }
          .id-card-photo-frame {
            width: 136px;
            height: 166px;
          }
          .id-card-nameplate {
            max-width: calc(100% - 42px);
          }
          .id-card-detail-lines {
            left: 28px;
            right: 28px;
            top: 358px;
          }
          .id-card-detail-row span {
            min-width: 94px;
            font-size: 10px;
          }
          .id-card-detail-row strong {
            font-size: 11px;
          }
          .id-back-logo-ring {
            width: 184px;
            height: 184px;
          }
          .id-card-back-points {
            padding: 0 28px;
          }
          .id-card-back-points div {
            font-size: 10.5px;
          }
          .id-back-contact-block {
            left: 24px;
            right: 24px;
            bottom: 24px;
            font-size: 11px;
          }
          .id-back-contact-row .anticon {
            font-size: 15px;
          }
        }
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
          body * {
            visibility: hidden !important;
          }
          html,
          body {
            width: 210mm;
            height: 297mm;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
          .student-id-print-area,
          .student-id-print-area * {
            visibility: visible !important;
          }
          .student-id-print-area {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            padding: 6mm !important;
            background: #ffffff !important;
            width: 100% !important;
            min-height: auto !important;
            overflow: hidden !important;
            z-index: 999999 !important;
          }
          .student-id-print-area > :not(.id-card-grid) {
            display: none !important;
          }
          .id-card-grid {
            display: grid !important;
            grid-template-columns: repeat(2, 86mm) !important;
            justify-content: center !important;
            align-items: start !important;
            gap: 8mm !important;
            width: 100% !important;
            margin: 0 !important;
          }
          .id-card-shell {
            display: flex !important;
            justify-content: center !important;
            align-items: flex-start !important;
            width: 86mm !important;
          }
          .student-id-card {
            width: 86mm !important;
            min-height: 160mm !important;
            max-height: 160mm !important;
            border-radius: 7mm !important;
            border: 0.35mm solid rgba(15, 23, 42, 0.12) !important;
            box-shadow: none !important;
            break-inside: avoid;
            page-break-inside: avoid;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            color-adjust: exact;
            transform: none !important;
            margin: 0 !important;
            overflow: hidden !important;
          }
          .student-id-front {
            background:
              radial-gradient(circle at 15% 22%, rgba(212, 175, 55, 0.08) 0, rgba(212, 175, 55, 0) 18%),
              repeating-radial-gradient(circle at 50% 44%, rgba(20, 45, 120, 0.03) 0 2px, rgba(255, 255, 255, 0.95) 2px 8px),
              linear-gradient(180deg, #ffffff 0%, #fffef8 100%) !important;
            background-size: auto, auto, auto !important;
            background-repeat: no-repeat, repeat, no-repeat !important;
          }
          .id-front-campus-fade {
            opacity: 0.06 !important;
          }
          .id-card-photo-frame {
            width: 33mm !important;
            height: 40mm !important;
            margin: 4mm auto 2mm !important;
          }
          .id-card-nameplate {
            margin: 0 auto 4.5mm !important;
            font-size: 10.5pt !important;
            max-width: calc(100% - 14mm) !important;
          }
          .id-card-detail-lines {
            left: 8mm !important;
            right: 8mm !important;
            top: 99mm !important;
            gap: 1.2mm !important;
          }
          .id-card-detail-row span {
            min-width: 22mm !important;
            font-size: 6.8pt !important;
          }
          .id-card-detail-row strong {
            font-size: 7.1pt !important;
          }
          .id-front-bottom-gold-wave {
            bottom: 22mm !important;
            left: -8mm !important;
            right: -8mm !important;
            height: 19mm !important;
            border-top-left-radius: 58% 100% !important;
            border-top-right-radius: 58% 100% !important;
            border-bottom-left-radius: 0 !important;
            border-bottom-right-radius: 0 !important;
          }
          .id-front-bottom-navy-band {
            height: 22mm !important;
          }
          .id-front-qr-block {
            left: 6mm !important;
            bottom: 4mm !important;
          }
          .id-front-qr-shell {
            padding: 1.2mm !important;
          }
          .id-front-signature-block {
            right: 6mm !important;
            bottom: 5mm !important;
            width: 36mm !important;
          }
          .id-front-signature-mark {
            font-size: 6.8pt !important;
          }
          .id-back-logo-wrap {
            padding-top: 21mm !important;
          }
          .id-back-top-gold {
            top: 36mm !important;
            left: -8mm !important;
            right: -8mm !important;
            height: 22mm !important;
            border-top-left-radius: 58% 100% !important;
            border-top-right-radius: 58% 100% !important;
          }
          .id-back-top-white-body {
            top: 41mm !important;
            border-top-left-radius: 58% 14% !important;
            border-top-right-radius: 58% 14% !important;
          }
          .id-back-logo-ring {
            width: 47mm !important;
            height: 47mm !important;
          }
          .id-card-back-title {
            margin: 7mm 8mm 3mm !important;
          }
          .id-card-back-title strong {
            font-size: 11pt !important;
          }
          .id-card-back-points {
            padding: 0 8mm !important;
            gap: 1.5mm !important;
            margin-bottom: 3mm !important;
          }
          .id-card-back-points div {
            font-size: 6.7pt !important;
            line-height: 1.3 !important;
            padding-left: 4.5mm !important;
          }
          .id-card-back-points div::before {
            font-size: 7pt !important;
          }
          .id-back-divider {
            margin: 0 auto 3mm !important;
          }
          .id-back-bottom-navy-block {
            height: 34mm !important;
          }
          .id-back-contact-block {
            left: 8mm !important;
            right: 8mm !important;
            bottom: 5mm !important;
            gap: 1.8mm !important;
            font-size: 6.8pt !important;
          }
          .id-back-contact-row .anticon {
            font-size: 8pt !important;
          }
          .id-back-date-row {
            font-size: 6.6pt !important;
            padding-top: 1mm !important;
          }
          .student-profile-tabs .ant-tabs-nav,
          .student-profile-tabs .ant-tabs-tabpane-hidden,
          .student-profile-tabs .ant-tabs-ink-bar,
          .student-profile-tabs .ant-tabs-extra-content,
          .student-profile-tabs .ant-tabs-tab,
          .student-profile-tabs .ant-tabs-nav-operations,
          .student-profile-tabs .ant-tabs-content-holder > :not(.ant-tabs-content) {
            display: none !important;
          }
          .student-profile-tabs .ant-tabs-content,
          .student-profile-tabs .ant-tabs-tabpane,
          .student-profile-tabs .ant-tabs-tabpane-active {
            display: block !important;
            overflow: visible !important;
          }
          .ant-btn {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
};

export default StudentProfile;
