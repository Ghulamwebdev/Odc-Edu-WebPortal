import {
  Button,
  Modal,
  message,
  Form,
  Card,
  Tag,
  Tooltip,
  Popconfirm,
  Empty,
  Avatar,
  Pagination,
  Input,
  Upload,
  Tabs,
  Spin,
  InputNumber,
  DatePicker,
  Select,
} from "antd";
import LoaderSpnar from "../../components/loader/loaderSpnar";
import React, { useState, useEffect } from "react";
import {
  FaPlus,
  FaEdit,
  FaTrash,
  FaPhone,
  FaIdCard,
  FaBook,
  FaCalendar,
  FaUser,
  FaMale,
  FaFemale,
  FaEnvelope,
  FaBriefcase,
  FaPrint,
  FaHome,
  FaFileExcel,
  FaFileImport,
  FaFileDownload,
} from "react-icons/fa";
import { UserOutlined, MailOutlined, PhoneOutlined } from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import TeacherForm from "../../components/forms/TeacherForm";
import {
  createTeacher,
  getAllTeachers,
  updateTeacher,
  deleteTeacher,
  getCourses,
  bulkImportTeachers,
  getTeacherCompensationDetails,
  updateTeacherStudentCompensation,
  updateTeacherMonthlySalaryConfig,
  transferTeacherStudent,
} from "../../services/feeService";
import dayjs from "dayjs";
import * as XLSX from "xlsx";
import odcLogo from "../../assets/images/logos/new logo.png";
import { MdPeopleAlt } from "react-icons/md";
import { useModulePermissions } from "../../hooks/usePermissions";
import { getBatchesByCourse } from "../../services/batchService";

const TEACHERS_PER_PAGE = 10;

const getSalaryMonthBounds = (teacher) => {
  const now = dayjs();
  const currentMonthStart = now.startOf("month");
  const nextMonthStart = currentMonthStart.add(1, "month");

  return {
    hasVisibleMonth: true,
    firstMonth: null,
    lastMonth: nextMonthStart,
  };
};

const Teachers = () => {
  const permissions = useModulePermissions("employees");
  const navigate = useNavigate();
  const { teacherId } = useParams();
  const [openModal, setOpenModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [loading, setLoading] = useState(false);
  const [teachers, setTeachers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [fetchingTeachers, setFetchingTeachers] = useState(true);
  const [form] = Form.useForm();
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importingEmployees, setImportingEmployees] = useState(false);
  const [exportingEmployees, setExportingEmployees] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [teacherCompensation, setTeacherCompensation] = useState(null);
  const [loadingTeacherCompensation, setLoadingTeacherCompensation] =
    useState(false);
  const [savingSalaryConfig, setSavingSalaryConfig] = useState(false);
  const [salaryModeDraft, setSalaryModeDraft] = useState("fixed");
  const [fixedSalaryDraft, setFixedSalaryDraft] = useState(null);
  const [salaryConfigDraft, setSalaryConfigDraft] = useState({
    salaryPerStudent: null,
    attendanceThreshold: 50,
    deductionAmount: 0,
    deductionNote: "",
    bonusAmount: 0,
    bonusNote: "",
  });
  const [selectedCompensationMonth, setSelectedCompensationMonth] = useState(null);
  const [studentCompensationModalOpen, setStudentCompensationModalOpen] = useState(false);
  const [selectedStudentCompensation, setSelectedStudentCompensation] = useState(null);
  const [savingStudentCompensation, setSavingStudentCompensation] = useState(false);
  const [studentCompensationForm] = Form.useForm();
  const [studentTransferModalOpen, setStudentTransferModalOpen] = useState(false);
  const [selectedStudentTransfer, setSelectedStudentTransfer] = useState(null);
  const [savingStudentTransfer, setSavingStudentTransfer] = useState(false);
  const [transferTargetBatches, setTransferTargetBatches] = useState([]);
  const [loadingTransferTargetBatches, setLoadingTransferTargetBatches] = useState(false);
  const [studentTransferForm] = Form.useForm();

  // Fetch teachers and courses on mount
  useEffect(() => {
    fetchTeachers();
    fetchCourses();
  }, []);

  useEffect(() => {
    if (!teacherId) {
      setSelectedTeacher(null);
      setTeacherCompensation(null);
      return;
    }

    const teacher = teachers.find((item) => String(item._id) === String(teacherId));
    if (!teacher) return;

    if (String(selectedTeacher?._id) === String(teacherId)) {
      setSelectedTeacher(teacher);
      return;
    }

    setSelectedTeacher(teacher);
    setSalaryModeDraft(teacher.salaryType || "fixed");
    const salaryValue = Number.parseFloat(
      String(teacher.monthlySalary ?? "").replace(/,/g, ""),
    );
    setFixedSalaryDraft(Number.isFinite(salaryValue) ? salaryValue : null);
    setSelectedCompensationMonth(
      (currentMonth) => currentMonth || dayjs().format("YYYY-MM"),
    );
  }, [teacherId, teachers, selectedTeacher?._id]);

  useEffect(() => {
    if (!teacherId || !selectedTeacher?._id || !selectedCompensationMonth) {
      return;
    }

    setTeacherCompensation(null);
    setSalaryConfigDraft({
      salaryPerStudent: null,
      attendanceThreshold: 50,
      deductionAmount: 0,
      deductionNote: "",
      bonusAmount: 0,
      bonusNote: "",
    });
    fetchTeacherCompensation(selectedTeacher._id, selectedCompensationMonth);

    const refreshCompensationOnFocus = () => {
      fetchTeacherCompensation(selectedTeacher._id, selectedCompensationMonth);
    };
    window.addEventListener("focus", refreshCompensationOnFocus);
    return () => window.removeEventListener("focus", refreshCompensationOnFocus);
  }, [teacherId, selectedTeacher?._id, selectedCompensationMonth]);

  const fetchTeachers = async () => {
    setFetchingTeachers(true);
    try {
      const response = await getAllTeachers();
      if (response.success) {
        setTeachers(response.data);
        setCurrentPage(1);
      }
    } catch (error) {
      message.error("Failed to fetch teachers");
    } finally {
      setFetchingTeachers(false);
    }
  };

  const fetchCourses = async () => {
    try {
      const response = await getCourses();
      if (response.success) {
        setCourses(response.data);
      }
    } catch (error) {
      console.error("Failed to fetch courses");
    }
  };

  const fetchTeacherCompensation = async (teacherId, monthValue) => {
    setLoadingTeacherCompensation(true);
    try {
      const resolvedMonthValue =
        monthValue || selectedCompensationMonth || dayjs().format("YYYY-MM");
      const selectedMonth = dayjs(`${resolvedMonthValue}-01`);
      const response = await getTeacherCompensationDetails(teacherId, {
        year: selectedMonth.year(),
        month: selectedMonth.month() + 1,
      });
      if (response.success) {
        setSelectedCompensationMonth(resolvedMonthValue);
        setTeacherCompensation(response.data);
        setSalaryConfigDraft({
          salaryPerStudent: response.data?.salaryConfig?.salaryPerStudent ?? null,
          attendanceThreshold:
            response.data?.salaryConfig?.attendanceThreshold ?? 50,
          deductionAmount: response.data?.salaryConfig?.deductionAmount ?? 0,
          deductionNote: response.data?.salaryConfig?.deductionNote ?? "",
          bonusAmount: response.data?.salaryConfig?.bonusAmount ?? 0,
          bonusNote: response.data?.salaryConfig?.bonusNote ?? "",
        });
        return response.data;
      }
      return null;
    } catch (error) {
      setTeacherCompensation(null);
      message.error(
        error.message || "Failed to load course and student attendance details",
      );
      return null;
    } finally {
      setLoadingTeacherCompensation(false);
    }
  };

  const isCompensationResponseShape = (payload) =>
    Boolean(
      payload &&
        payload.month &&
        (payload.month.displayLabel || payload.month.label) &&
        payload.salaryConfig &&
        payload.summary &&
        Array.isArray(payload.studentsForSalary) &&
        Array.isArray(payload.courses),
    );

  const handleSaveSalaryConfig = async () => {
    if (!selectedTeacher?._id) return;
    if (!permissions.update) {
      message.warning("You do not have permission to update employees.");
      return;
    }
    if (
      salaryConfigDraft.salaryPerStudent === null ||
      salaryConfigDraft.salaryPerStudent === undefined
    ) {
      message.warning("Please enter salary amount per student.");
      return;
    }

    const normalizedAttendanceThreshold =
      salaryConfigDraft.attendanceThreshold === null ||
      salaryConfigDraft.attendanceThreshold === undefined
        ? 50
        : Number(salaryConfigDraft.attendanceThreshold);
    const resolvedMonthValue =
      selectedCompensationMonth || dayjs().format("YYYY-MM");
    const selectedMonth = dayjs(`${resolvedMonthValue}-01`);

    setSavingSalaryConfig(true);
    try {
      const payload = {
        year: selectedMonth.year(),
        month: selectedMonth.month() + 1,
        salaryType: "per_student",
        salaryPerStudent: salaryConfigDraft.salaryPerStudent,
        attendanceThreshold: normalizedAttendanceThreshold,
        deductionAmount: Number(salaryConfigDraft.deductionAmount || 0),
        deductionNote: salaryConfigDraft.deductionNote || "",
        bonusAmount: Number(salaryConfigDraft.bonusAmount || 0),
        bonusNote: salaryConfigDraft.bonusNote || "",
      };
      const response = await updateTeacherMonthlySalaryConfig(
        selectedTeacher._id,
        payload,
      );
      if (response.success) {
        message.success("Teacher salary rule updated successfully!");
        await fetchTeachers();
        const updatedTeacher = {
          ...selectedTeacher,
          salaryType: "per_student",
          salaryPerStudent: salaryConfigDraft.salaryPerStudent,
          attendanceThreshold: normalizedAttendanceThreshold,
        };
        setSelectedTeacher(updatedTeacher);
        setSalaryModeDraft("per_student");
        await fetchTeacherCompensation(selectedTeacher._id, resolvedMonthValue);
      }
    } catch (error) {
      message.error(error.message || "Failed to update teacher salary rule");
    } finally {
      setSavingSalaryConfig(false);
    }
  };

  const handleSaveFixedSalary = async () => {
    if (!selectedTeacher?._id) return;
    if (!permissions.update) {
      message.warning("You do not have permission to update employees.");
      return;
    }
    if (fixedSalaryDraft === null || fixedSalaryDraft === undefined) {
      message.warning("Please enter the monthly fixed salary.");
      return;
    }

    const resolvedMonthValue =
      selectedCompensationMonth || dayjs().format("YYYY-MM");
    const selectedMonth = dayjs(`${resolvedMonthValue}-01`);

    setSavingSalaryConfig(true);
    try {
      const response = await updateTeacherMonthlySalaryConfig(
        selectedTeacher._id,
        {
          year: selectedMonth.year(),
          month: selectedMonth.month() + 1,
          salaryType: "fixed",
          monthlySalary: String(fixedSalaryDraft),
        },
      );
      if (response.success) {
        message.success("Fixed monthly salary saved successfully.");
        const updatedTeacher = {
          ...selectedTeacher,
          salaryType: "fixed",
          monthlySalary: String(fixedSalaryDraft),
          salaryPerStudent: null,
        };
        setSelectedTeacher(updatedTeacher);
        setSalaryModeDraft("fixed");
        await fetchTeachers();
        await fetchTeacherCompensation(selectedTeacher._id, resolvedMonthValue);
      }
    } catch (error) {
      message.error(error.message || "Failed to save fixed salary");
    } finally {
      setSavingSalaryConfig(false);
    }
  };

  const openStudentCompensationModal = (student) => {
    setSelectedStudentCompensation(student);
    studentCompensationForm.setFieldsValue({
      amount:
        student.manualAdjustedAmount ?? student.calculatedSalaryAmount ?? student.defaultCalculatedSalaryAmount ?? 0,
      note: student.manualAdjustmentNote || "",
    });
    setStudentCompensationModalOpen(true);
  };

  const closeStudentCompensationModal = () => {
    setStudentCompensationModalOpen(false);
    setSelectedStudentCompensation(null);
    studentCompensationForm.resetFields();
  };

  const getTeacherCourseOptions = (teacherId) => {
    const teacher = teachers.find((item) => String(item._id) === String(teacherId));
    return (teacher?.courseId || [])
      .map((course) => ({
        label: `${course?.courseName || "Course"}${course?.courseId ? ` (${course.courseId})` : ""}`,
        value: course?._id,
      }))
      .filter((course) => course.value);
  };

  const getStudentTransferSourceOptions = (studentId) => {
    if (!isCompensationResponseShape(teacherCompensation)) return [];

    return (teacherCompensation.courses || []).flatMap((course) =>
      (course.activeStudents || [])
        .filter((student) => String(student.studentId) === String(studentId))
        .map((student) => ({
          label: `${course.courseName} (${course.courseId}) - ${student.batchName} (${student.batchCode})`,
          value: student.enrollmentId,
          student,
          course,
        })),
    );
  };

  const openStudentTransferModal = (student) => {
    const sourceOptions = getStudentTransferSourceOptions(student.studentId);
    setSelectedStudentTransfer(student);
    studentTransferForm.setFieldsValue({
      sourceEnrollmentId: sourceOptions.length === 1 ? sourceOptions[0].value : undefined,
      targetTeacherId: undefined,
      targetCourseId: undefined,
      targetBatchId: undefined,
      transferDate: dayjs(),
      reason: "",
    });
    setStudentTransferModalOpen(true);
  };

  const closeStudentTransferModal = () => {
    setStudentTransferModalOpen(false);
    setSelectedStudentTransfer(null);
    setTransferTargetBatches([]);
    studentTransferForm.resetFields();
  };

  const fetchTransferTargetBatches = async (courseId) => {
    if (!courseId) {
      setTransferTargetBatches([]);
      return;
    }

    setLoadingTransferTargetBatches(true);
    try {
      const response = await getBatchesByCourse(courseId);
      const batches = (response.data || []).filter(
        (batch) => batch.isActive !== false && ["Active", "Upcoming"].includes(batch.status),
      );
      setTransferTargetBatches(batches);
      if (batches.length === 1) {
        studentTransferForm.setFieldValue("targetBatchId", batches[0]._id);
      }
    } catch (error) {
      setTransferTargetBatches([]);
      message.error(error.response?.data?.message || "Failed to load course batches");
    } finally {
      setLoadingTransferTargetBatches(false);
    }
  };

  const handleTransferStudent = async () => {
    if (!selectedTeacher?._id || !selectedStudentTransfer || !selectedCompensationMonth) {
      return;
    }

    setSavingStudentTransfer(true);
    try {
      const values = await studentTransferForm.validateFields();
      const selectedMonth = dayjs(`${selectedCompensationMonth}-01`);
      const response = await transferTeacherStudent(selectedTeacher._id, {
        enrollmentId: values.sourceEnrollmentId,
        studentId: selectedStudentTransfer.studentId,
        targetTeacherId: values.targetTeacherId,
        targetCourseId: values.targetCourseId,
        targetBatchId: values.targetBatchId,
        transferDate: values.transferDate.format("YYYY-MM-DD"),
        reason: values.reason,
        year: selectedMonth.year(),
        month: selectedMonth.month() + 1,
      });

      if (response.success) {
        if (isCompensationResponseShape(response.data)) {
          setTeacherCompensation(response.data);
        } else {
          await fetchTeacherCompensation(selectedTeacher._id, selectedCompensationMonth);
        }
        await fetchTeachers();
        message.success(response.message || "Student moved successfully");
        closeStudentTransferModal();
      }
    } catch (error) {
      message.error(error.message || "Failed to move student");
    } finally {
      setSavingStudentTransfer(false);
    }
  };

  const didStudentCompensationUpdatePersist = (compensationData, studentId, expectedAmount) => {
    const student = (compensationData?.studentsForSalary || []).find(
      (item) => String(item.studentId) === String(studentId),
    );

    if (!student) return false;

    if (expectedAmount === null) {
      return !student.hasManualAdjustment;
    }

    return (
      Number(student.calculatedSalaryAmount || 0) === Number(expectedAmount) &&
      student.hasManualAdjustment
    );
  };

  const handleSaveStudentCompensation = async () => {
    if (!selectedTeacher?._id || !selectedStudentCompensation || !selectedCompensationMonth) {
      return;
    }

    setSavingStudentCompensation(true);
    try {
      const values = await studentCompensationForm.validateFields();
      const selectedMonth = dayjs(`${selectedCompensationMonth}-01`);
      const payload = {
        year: selectedMonth.year(),
        month: selectedMonth.month() + 1,
        studentId: selectedStudentCompensation.studentId,
        amount: Number(values.amount || 0),
        note: values.note || "",
      };
      let response;
      let usedLegacyFallback = false;
      try {
        response = await updateTeacherStudentCompensation(selectedTeacher._id, payload);
      } catch (error) {
        if (error?.message === "Route not found") {
          usedLegacyFallback = true;
          response = await updateTeacher(selectedTeacher._id, payload);
        } else {
          throw error;
        }
      }

      if (response.success) {
        if (isCompensationResponseShape(response.data)) {
          setTeacherCompensation(response.data);
          message.success("Student salary amount updated successfully");
          closeStudentCompensationModal();
          return;
        }

        const refreshedCompensation = await fetchTeacherCompensation(
          selectedTeacher._id,
          selectedCompensationMonth,
        );

        if (
          usedLegacyFallback &&
          !didStudentCompensationUpdatePersist(
            refreshedCompensation,
            selectedStudentCompensation.studentId,
            payload.amount,
          )
        ) {
          throw new Error("Student salary update route is unavailable on the server");
        }

        message.success("Student salary amount updated successfully");
        closeStudentCompensationModal();
      }
    } catch (error) {
      message.error(error.message || "Failed to update student salary amount");
    } finally {
      setSavingStudentCompensation(false);
    }
  };

  const handleResetStudentCompensation = async () => {
    if (!selectedTeacher?._id || !selectedStudentCompensation || !selectedCompensationMonth) {
      return;
    }

    setSavingStudentCompensation(true);
    try {
      const selectedMonth = dayjs(`${selectedCompensationMonth}-01`);
      const payload = {
        year: selectedMonth.year(),
        month: selectedMonth.month() + 1,
        studentId: selectedStudentCompensation.studentId,
        amount: null,
        note: "",
      };
      let response;
      let usedLegacyFallback = false;
      try {
        response = await updateTeacherStudentCompensation(selectedTeacher._id, payload);
      } catch (error) {
        if (error?.message === "Route not found") {
          usedLegacyFallback = true;
          response = await updateTeacher(selectedTeacher._id, payload);
        } else {
          throw error;
        }
      }

      if (response.success) {
        if (isCompensationResponseShape(response.data)) {
          setTeacherCompensation(response.data);
          message.success("Student salary amount reset to default calculation");
          closeStudentCompensationModal();
          return;
        }

        const refreshedCompensation = await fetchTeacherCompensation(
          selectedTeacher._id,
          selectedCompensationMonth,
        );

        if (
          usedLegacyFallback &&
          !didStudentCompensationUpdatePersist(
            refreshedCompensation,
            selectedStudentCompensation.studentId,
            null,
          )
        ) {
          throw new Error("Student salary reset route is unavailable on the server");
        }

        message.success("Student salary amount reset to default calculation");
        closeStudentCompensationModal();
      }
    } catch (error) {
      message.error(error.message || "Failed to reset student salary amount");
    } finally {
      setSavingStudentCompensation(false);
    }
  };

  const handleCreateTeacher = async (values) => {
    if (!permissions.create) {
      message.warning("You do not have permission to create employees.");
      return;
    }
    setLoading(true);
    try {
      const response = await createTeacher(values);
      if (response.success) {
        message.success("Teacher created successfully!");
        form.resetFields();
        setOpenModal(false);
        fetchTeachers();
      }
    } catch (error) {
      message.error(error.message || "Failed to create teacher");
    } finally {
      setLoading(false);
    }
  };

  const handleEditTeacher = async (values) => {
    if (!permissions.update) {
      message.warning("You do not have permission to update employees.");
      return;
    }
    setLoading(true);
    try {
      const response = await updateTeacher(editingTeacher._id, values);
      if (response.success) {
        message.success("Teacher updated successfully!");
        form.resetFields();
        setOpenModal(false);
        setEditMode(false);
        setEditingTeacher(null);
        fetchTeachers();
      }
    } catch (error) {
      message.error(error.message || "Failed to update teacher");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTeacher = async (teacherId) => {
    if (!permissions.delete) {
      message.warning("You do not have permission to delete employees.");
      return;
    }
    try {
      const response = await deleteTeacher(teacherId);
      if (response.success) {
        message.success("Teacher deleted successfully!");
        fetchTeachers();
      }
    } catch (error) {
      message.error(error.message || "Failed to delete teacher");
    }
  };

  const downloadEmployeeTemplate = () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet([
      {
        "Employee ID": "ODC/HR-2026-01",
        "Full Name": "Azeem Khan",
        "Father Name": "Abdul Kareem",
        Gender: "Male",
        "Appointment Date": "2026-06-01",
        "Contact Number": "03354587898",
        "Contract Period": "1 Year",
        "CNIC Number": "4210112345671",
        Address: "Khipro, Sindh",
        Designation: "Director",
        "Highest Qualification": "Master",
        "Degree Title": "MBA",
        "Major Subject": "Business Management",
        Experience: "10+",
        "Other Skills": "MS Office, Management",
        "Monthly Salary": "85000",
        "Assigned Courses": "",
      },
      {
        "Employee ID": "ODC/HR-2026-02",
        "Full Name": "Asad Ali",
        "Father Name": "Nazeer Ahmed",
        Gender: "Male",
        "Appointment Date": "2026-06-02",
        "Contact Number": "03331238691",
        "Contract Period": "6 Months",
        "CNIC Number": "4210112345672",
        Address: "Sanghar, Sindh",
        Designation: "Trainer",
        "Highest Qualification": "Master",
        "Degree Title": "MSc",
        "Major Subject": "Computer Science",
        Experience: "3",
        "Other Skills": "CIT, DIT, Web Development",
        "Monthly Salary": "50000",
        "Assigned Courses": "English Language",
      },
    ]);

    XLSX.utils.book_append_sheet(workbook, worksheet, "Employees");
    XLSX.writeFile(
      workbook,
      `employees-import-template-${dayjs().format("YYYY-MM-DD")}.xlsx`,
    );
  };

  const downloadEmployeesWorkbook = () => {
    setExportingEmployees(true);
    try {
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(
        teachers.map((teacher) => ({
          "Employee ID": teacher.teacherId || "",
          "Full Name": teacher.fullName || "",
          "Father Name": teacher.fatherName || "",
          Gender: teacher.gender || "",
          "Appointment Date": teacher.appointmentDate
            ? dayjs(teacher.appointmentDate).format("YYYY-MM-DD")
            : "",
          "Contact Number": teacher.contactNo || "",
          "Contract Period": teacher.contractPeriod || "",
          "CNIC Number": teacher.cnicNo || "",
          Address: teacher.address || "",
          Designation: teacher.designation || "",
          "Highest Qualification": teacher.highestQualification || "",
          "Degree Title": teacher.degreeTitle || "",
          "Major Subject": teacher.majorSubject || "",
          Experience: teacher.teachingExperience || "",
          "Other Skills": Array.isArray(teacher.computerSkills)
            ? teacher.computerSkills.join(", ")
            : "",
          "Monthly Salary": teacher.monthlySalary || "",
          "Assigned Courses": Array.isArray(teacher.courseId)
            ? teacher.courseId
                .map((course) => course?.courseName || course?.courseId || "")
                .filter(Boolean)
                .join(", ")
            : "",
        })),
      );

      XLSX.utils.book_append_sheet(workbook, worksheet, "Employees");
      XLSX.writeFile(
        workbook,
        `employees-export-${dayjs().format("YYYY-MM-DD")}.xlsx`,
      );
    } catch (error) {
      message.error("Failed to export employees workbook");
    } finally {
      setExportingEmployees(false);
    }
  };

  const handleEmployeeImport = async (file) => {
    if (!permissions.import) {
      message.warning("You do not have permission to import employees.");
      return Upload.LIST_IGNORE;
    }

    setImportingEmployees(true);
    try {
      const response = await bulkImportTeachers(file);
      if (response.success) {
        setImportResult(response.data);
        message.success(
          `Import completed: ${response.data.imported} new, ${response.data.updated} updated`,
        );
        await fetchTeachers();
      } else {
        message.error(response.message || "Import failed");
      }
    } catch (error) {
      message.error(error.message || "Failed to import employees");
    } finally {
      setImportingEmployees(false);
    }

    return false;
  };

  const openEditModal = (teacher) => {
    if (!permissions.update) {
      message.warning("You do not have permission to edit employees.");
      return;
    }
    setEditMode(true);
    setEditingTeacher(teacher);
    form.setFieldsValue({
      teacherId: teacher.teacherId,
      fullName: teacher.fullName,
      fatherName: teacher.fatherName,
      gender: teacher.gender,
      appointmentDate: teacher.appointmentDate
        ? dayjs(teacher.appointmentDate)
        : null,
      contactNo: teacher.contactNo,
      contractPeriod: teacher.contractPeriod,
      cnicNo: teacher.cnicNo,
      address: teacher.address,
      courseId: teacher.courseId?.map((c) => c._id) || [],
      // New fields
      designation: teacher.designation,
      highestQualification: teacher.highestQualification,
      degreeTitle: teacher.degreeTitle,
      majorSubject: teacher.majorSubject,
      teachingExperience: teacher.teachingExperience,
      computerSkills: teacher.computerSkills || [],
      monthlySalary: teacher.monthlySalary,
      salaryType: teacher.salaryType || "fixed",
      salaryPerStudent: teacher.salaryPerStudent ?? null,
      attendanceThreshold: teacher.attendanceThreshold ?? 50,
    });
    setOpenModal(true);
  };

  const openCreateModal = () => {
    if (!permissions.create) {
      message.warning("You do not have permission to create employees.");
      return;
    }
    setEditMode(false);
    setEditingTeacher(null);
    form.resetFields();
    form.setFieldsValue({
      salaryType: "fixed",
      attendanceThreshold: 50,
      salaryPerStudent: null,
    });
    setOpenModal(true);
  };

  const openIdCardModal = (teacher) => {
    if (!permissions.view) {
      message.warning("You do not have permission to view employees.");
      return;
    }
    setSelectedTeacher(teacher);
    setTeacherCompensation(null);
    setSalaryModeDraft(teacher.salaryType || "fixed");
    const salaryValue = Number.parseFloat(
      String(teacher.monthlySalary ?? "").replace(/,/g, ""),
    );
    setFixedSalaryDraft(Number.isFinite(salaryValue) ? salaryValue : null);
    setSalaryConfigDraft({
      salaryPerStudent: teacher.salaryPerStudent ?? null,
      attendanceThreshold: teacher.attendanceThreshold ?? 50,
      deductionAmount: 0,
      deductionNote: "",
      bonusAmount: 0,
      bonusNote: "",
    });
    const { hasVisibleMonth } = getSalaryMonthBounds(teacher);
    const defaultMonth = hasVisibleMonth ? dayjs().startOf("month").format("YYYY-MM") : null;
    setSelectedCompensationMonth(defaultMonth);
    navigate(`/dashboard/employees/${encodeURIComponent(teacher._id)}`);
  };

  // Get teacher initials for avatar fallback
  const getInitials = (name) => {
    if (!name) return "NA";
    return name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const formatExperience = (value) => {
    if (!value) return "N/A";
    if (value === "Fresh") return "Fresh";
    if (value === "1") return "1 Year";
    return `${value} Years`;
  };

  const formatCurrency = (value) => {
    const amount = Number(value);
    if (Number.isNaN(amount)) return value || "N/A";
    return new Intl.NumberFormat("en-PK", {
      style: "currency",
      currency: "PKR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getTeacherSalaryText = (teacher) => {
    if (!teacher) return "N/A";
    if (teacher.salaryType === "per_student") {
      const perStudent =
        teacher.salaryPerStudent !== null && teacher.salaryPerStudent !== undefined
          ? `${formatCurrency(teacher.salaryPerStudent)} / student`
          : "Per student";
      const threshold = teacher.attendanceThreshold ?? 50;
      return `${perStudent} (${threshold}% min attendance)`;
    }
    return teacher.monthlySalary || "N/A";
  };

  const renderTeacherDetailRow = (label, value) => (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        marginBottom: "14px",
      }}
    >
      <span
        style={{
          fontSize: "13px",
          color: "#666",
          fontWeight: "800",
          minWidth: "130px",
          fontFamily: "Inter, sans-serif",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: "13px",
          color: "#333",
          fontWeight: "400",
          flex: 1,
          lineHeight: "1.5",
        }}
      >
        {value ?? "N/A"}
      </span>
    </div>
  );

  const renderPersonalInfoTab = () => {
    if (!selectedTeacher) return null;

    return (
      <div
        style={{
          display: "flex",
          minHeight: "400px",
          background: "linear-gradient(135deg, #E8F0FE 0%, #F0F4FF 100%)",
          borderRadius: "16px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            flex: 1,
            background: "white",
            padding: "24px",
            overflowY: "auto",
          }}
        >
          {renderTeacherDetailRow("Employee ID:", selectedTeacher.teacherId)}
          {renderTeacherDetailRow("Father Name:", selectedTeacher.fatherName)}
          {renderTeacherDetailRow("Gender:", selectedTeacher.gender)}
          {renderTeacherDetailRow("Contact Number:", selectedTeacher.contactNo)}
          {renderTeacherDetailRow("CNIC:", selectedTeacher.cnicNo)}
          {renderTeacherDetailRow("Designation:", selectedTeacher.designation)}
          {renderTeacherDetailRow(
            "Appointment Date:",
            selectedTeacher.appointmentDate
              ? dayjs(selectedTeacher.appointmentDate).format("DD-MMM-YYYY")
              : "N/A",
          )}
          {renderTeacherDetailRow("Contract Period:", selectedTeacher.contractPeriod)}
          {renderTeacherDetailRow(
            "Qualification:",
            selectedTeacher.highestQualification,
          )}
          {selectedTeacher.degreeTitle &&
            renderTeacherDetailRow("Degree Title:", selectedTeacher.degreeTitle)}
          {renderTeacherDetailRow("Major Subject:", selectedTeacher.majorSubject)}
          {renderTeacherDetailRow(
            "Experience:",
            formatExperience(selectedTeacher.teachingExperience),
          )}
          {selectedTeacher.computerSkills?.length > 0 &&
            renderTeacherDetailRow(
              "Skills:",
              selectedTeacher.computerSkills.join(", "),
            )}
          {renderTeacherDetailRow(
            "Salary Setup:",
            getTeacherSalaryText(selectedTeacher),
          )}
          {renderTeacherDetailRow("Address:", selectedTeacher.address)}
          {selectedTeacher.courseId?.length > 0 &&
            renderTeacherDetailRow(
              "Assigned Courses:",
              selectedTeacher.courseId.map((course) => course.courseName).join(", "),
            )}
        </div>

        <div
          style={{
            width: "260px",
            background: "#fff",
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "16px",
            borderLeft: "1px solid #edf2fb",
          }}
        >
          <div
            style={{
              width: "200px",
              height: "200px",
              overflow: "hidden",
              border: "4px solid rgba(255,255,255,0.5)",
              borderRadius: "16px",
              background: "#fff",
            }}
          >
            {selectedTeacher.profilePicture ? (
              <img
                src={selectedTeacher.profilePicture}
                alt={selectedTeacher.fullName}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background: "#01134C",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "60px",
                  color: "white",
                  fontWeight: "bold",
                }}
              >
                {getInitials(selectedTeacher.fullName)}
              </div>
            )}
          </div>

          <div style={{ textAlign: "center" }}>
            <h4
              style={{
                margin: 0,
                fontSize: "20px",
                fontWeight: "bold",
                color: "#01134C",
              }}
            >
              {selectedTeacher.fullName}
            </h4>
            <p
              style={{
                margin: "8px 0 0 0",
                fontSize: "14px",
                color: "#5b6780",
              }}
            >
              {selectedTeacher.designation ||
                selectedTeacher.majorSubject ||
                "Employee"}
            </p>
          </div>
        </div>
      </div>
    );
  };

  const renderCourseAndStudentTab = () => {
    const salaryModePicker = (
      <Card size="small" title="Salary Mode">
        <Select
          value={salaryModeDraft}
          className="w-full md:max-w-md"
          size="large"
          onChange={setSalaryModeDraft}
          options={[
            { value: "fixed", label: "Fixed Monthly Salary" },
            { value: "per_student", label: "Student Attendance Based" },
          ]}
          disabled={!permissions.update}
        />
      </Card>
    );

    if (salaryModeDraft === "fixed") {
      return (
        <div className="space-y-4">
          {salaryModePicker}
          <Card size="small" title="Fixed Monthly Salary">
            <div className="max-w-xl space-y-4">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Monthly Salary (PKR)
                </div>
                <InputNumber
                  size="large"
                  min={0}
                  precision={2}
                  className="!w-full"
                  placeholder="Enter monthly fixed salary"
                  value={fixedSalaryDraft}
                  onChange={setFixedSalaryDraft}
                  disabled={!permissions.update}
                />
              </div>
              <div className="text-sm text-slate-500">
                This amount is used as the teacher&apos;s monthly payroll salary.
              </div>
              <Button
                type="primary"
                size="large"
                loading={savingSalaryConfig}
                onClick={handleSaveFixedSalary}
                disabled={!permissions.update}
                className="!bg-[#01134C]"
              >
                Save Fixed Salary
              </Button>
            </div>
          </Card>
        </div>
      );
    }

    if (loadingTeacherCompensation) {
      return (
        <div className="space-y-4">
          {salaryModePicker}
          <div className="flex min-h-[320px] items-center justify-center">
            <Spin size="large" />
          </div>
        </div>
      );
    }

    if (!isCompensationResponseShape(teacherCompensation)) {
      const { hasVisibleMonth } = getSalaryMonthBounds(selectedTeacher);
      return (
        <div className="space-y-4">
          {salaryModePicker}
          <Empty
            description={
              !hasVisibleMonth
                ? "Salary months will appear here once the employee appointment month becomes available."
                : "Course and attendance details are not available yet"
            }
          />
        </div>
      );
    }

    const { salaryConfig, summary, courses: teacherCourses, studentsForSalary, month } =
      teacherCompensation;
    const { firstMonth, lastMonth } = getSalaryMonthBounds(selectedTeacher);
    const selectedMonthLabel = month.displayLabel || month.label;
    const effectiveRate =
      salaryConfigDraft.salaryPerStudent ?? salaryConfig.salaryPerStudent ?? 0;
    const effectiveThreshold =
      salaryConfigDraft.attendanceThreshold ?? salaryConfig.attendanceThreshold ?? 50;
    const isMonthConfigured =
      salaryConfig.isConfigured !== false && Number(effectiveRate || 0) > 0;
    const projectedEligibleStudents = isMonthConfigured
      ? studentsForSalary.filter(
          (student) => student.monthlyAttendancePercentage >= effectiveThreshold,
        ).length
      : 0;
    const projectedMonthlySalary = isMonthConfigured
      ? projectedEligibleStudents * effectiveRate
      : 0;
    const payrollDeductionAmount = Math.max(
      0,
      Number(
        salaryConfigDraft.deductionAmount ??
          salaryConfig.deductionAmount ??
          0,
      ),
    );
    const payrollBonusAmount = Math.max(
      0,
      Number(
        salaryConfigDraft.bonusAmount ?? salaryConfig.bonusAmount ?? 0,
      ),
    );
    const hasManualAdjustedStudents = studentsForSalary.some(
      (student) => student.hasManualAdjustment,
    );
    const displayedEligibleStudents = hasManualAdjustedStudents
      ? studentsForSalary.filter((student) => Number(student.calculatedSalaryAmount || 0) > 0).length
      : projectedEligibleStudents;
    const displayedProjectedMonthlySalary = hasManualAdjustedStudents
      ? studentsForSalary.reduce(
          (sum, student) => sum + Number(student.calculatedSalaryAmount || 0),
          0,
        )
      : projectedMonthlySalary;
    const displayedFinalMonthlySalary = Math.max(
      0,
      displayedProjectedMonthlySalary - payrollDeductionAmount,
    ) + payrollBonusAmount;
    const regularSalaryStudents = studentsForSalary.filter(
      (student) => student.isMovedStudent !== true,
    );
    const movedSalaryStudents = studentsForSalary.filter(
      (student) => student.isMovedStudent === true,
    );
    const renderSalaryStudentRow = (student) => (
      <div
        key={student.studentId}
        className={`rounded-xl border p-3 ${
          student.isMovedStudent
            ? "border-blue-200 bg-blue-50"
            : "border-slate-200 bg-slate-50"
        }`}
      >
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-[#01134C]">
                {student.studentName}
              </span>
              {student.isMovedStudent ? <Tag color="blue">Moved Student</Tag> : null}
            </div>
            <div className="text-xs text-slate-500">
              Reg #: {student.registrationNo} | Working Days:{" "}
              {student.totalWorkingDays}
            </div>
            {student.isMovedStudent && student.transferReason ? (
              <div className="mt-1 text-xs text-blue-700">
                Reason: {student.transferReason}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Tag
              color={
                student.isSalaryEligible
                  ? "green"
                  : "red"
              }
            >
              {student.monthlyAttendancePercentage}%
            </Tag>
            <Tag
              color={
                student.isSalaryEligible
                  ? "blue"
                  : "default"
              }
            >
              {Number(student.calculatedSalaryAmount || 0) > 0
                ? formatCurrency(student.calculatedSalaryAmount)
                : "Not counted"}
            </Tag>
            {student.hasManualAdjustment ? (
              <Tag color="purple">Manual</Tag>
            ) : null}
            <Button
              size="small"
              icon={<FaEdit />}
              onClick={() => openStudentCompensationModal(student)}
              disabled={!permissions.update}
            >
              Edit
            </Button>
            <Button
              size="small"
              disabled={!permissions.update}
              onClick={() => openStudentTransferModal(student)}
            >
              Move
            </Button>
          </div>
        </div>
        {student.hasManualAdjustment ? (
          <div className="mt-2 text-xs text-slate-500">
            Manual override active
            {student.manualAdjustmentNote
              ? ` - ${student.manualAdjustmentNote}`
              : ""}
          </div>
        ) : null}
      </div>
    );

    return (
      <div className="space-y-4">
        {salaryModePicker}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <Card size="small">
            <div className="text-xs text-slate-500">Assigned Courses</div>
            <div className="mt-1 text-xl font-bold text-[#01134C]">
              {summary.totalAssignedCourses}
            </div>
          </Card>
          <Card size="small">
            <div className="text-xs text-slate-500">All Students</div>
            <div className="mt-1 text-xl font-bold text-[#01134C]">
              {summary.totalActiveStudents}
            </div>
          </Card>
          <Card size="small">
            <div className="text-xs text-slate-500">Moved Students</div>
            <div className="mt-1 text-xl font-bold text-blue-700">
              {summary.movedStudents || 0}
            </div>
          </Card>
          <Card size="small">
            <div className="text-xs text-slate-500">
              Salary Eligible Students
            </div>
            <div className="mt-1 text-xl font-bold text-[#01134C]">
              {summary.eligibleStudents}
            </div>
          </Card>
          <Card size="small">
            <div className="text-xs text-slate-500">
              {salaryConfig.salaryType === "per_student"
                ? `Final Salary (${selectedMonthLabel})`
                : "Projected Salary"}
            </div>
            <div className="mt-1 text-xl font-bold text-[#01134C]">
              {formatCurrency(
                salaryConfig.salaryType === "per_student"
                  ? displayedFinalMonthlySalary
                  : projectedMonthlySalary,
              )}
            </div>
          </Card>
        </div>

        <Card size="small" title="Salary Rule">
          <div className="grid grid-cols-1 gap-3 text-sm text-slate-600 md:grid-cols-3">
            <div>
              <span className="font-semibold text-[#01134C]">Mode:</span>{" "}
              Per student attendance based
            </div>
            <div>
              <span className="font-semibold text-[#01134C]">Rate:</span>{" "}
              {formatCurrency(effectiveRate)}
            </div>
            <div>
              <span className="font-semibold text-[#01134C]">
                Minimum Attendance:
              </span>{" "}
              {effectiveThreshold}%
            </div>
            <div>
              <span className="font-semibold text-[#01134C]">Deduction:</span>{" "}
              {formatCurrency(payrollDeductionAmount)}
            </div>
            <div>
              <span className="font-semibold text-[#01134C]">Bonus:</span>{" "}
              {formatCurrency(payrollBonusAmount)}
            </div>
            <div>
              <span className="font-semibold text-[#01134C]">Final Salary:</span>{" "}
              {formatCurrency(displayedFinalMonthlySalary)}
            </div>
          </div>
        </Card>

        <Card size="small" title="Admin Salary Setup">
          <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                Salary Month
              </div>
              <DatePicker
                size="large"
                className="w-full"
                picker="month"
                format="MMMM YYYY"
                allowClear={false}
                placeholder="Select salary month"
                value={
                  selectedCompensationMonth
                    ? dayjs(`${selectedCompensationMonth}-01`)
                    : null
                }
                disabledDate={(current) => {
                  if (!current) return false;
                  if (!lastMonth) return true;
                  return current.isAfter(lastMonth, "month");
                }}
                onChange={(value) => {
                  const monthValue = value ? value.format("YYYY-MM") : null;
                  setSelectedCompensationMonth(monthValue);
                }}
              />
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                Amount Per Student
              </div>
              <InputNumber
                size="large"
                min={0}
                className="!w-full"
                placeholder="Enter amount per student"
                value={salaryConfigDraft.salaryPerStudent}
                onChange={(value) =>
                  setSalaryConfigDraft((prev) => ({
                    ...prev,
                    salaryPerStudent: value,
                  }))
                }
              />
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                Minimum Attendance %
              </div>
              <InputNumber
                size="large"
                min={0}
                max={100}
                className="!w-full"
                value={salaryConfigDraft.attendanceThreshold}
                onChange={(value) =>
                  setSalaryConfigDraft((prev) => ({
                    ...prev,
                    attendanceThreshold: value ?? 50,
                  }))
                }
              />
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                Deduction Amount
              </div>
              <InputNumber
                size="large"
                min={0}
                className="!w-full"
                placeholder="Enter deduction amount"
                value={salaryConfigDraft.deductionAmount}
                onChange={(value) =>
                  setSalaryConfigDraft((prev) => ({
                    ...prev,
                    deductionAmount: value ?? 0,
                  }))
                }
              />
              <div className="mb-2 mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                Deduction Note
              </div>
              <Input.TextArea
                rows={2}
                placeholder="Reason for deduction"
                value={salaryConfigDraft.deductionNote}
                onChange={(event) =>
                  setSalaryConfigDraft((prev) => ({
                    ...prev,
                    deductionNote: event.target.value,
                  }))
                }
              />
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                Bonus / Extra Amount
              </div>
              <InputNumber
                size="large"
                min={0}
                className="!w-full"
                placeholder="Enter bonus or extra amount"
                value={salaryConfigDraft.bonusAmount}
                onChange={(value) =>
                  setSalaryConfigDraft((prev) => ({
                    ...prev,
                    bonusAmount: value ?? 0,
                  }))
                }
              />
              <div className="mb-2 mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                Bonus / Extra Note
              </div>
              <Input.TextArea
                rows={2}
                placeholder="Reason for bonus or extra amount"
                value={salaryConfigDraft.bonusNote}
                onChange={(event) =>
                  setSalaryConfigDraft((prev) => ({
                    ...prev,
                    bonusNote: event.target.value,
                  }))
                }
              />
            </div>
            <div className="flex items-end">
              <Button
                type="primary"
                loading={savingSalaryConfig}
                onClick={handleSaveSalaryConfig}
                disabled={!permissions.update}
                style={{
                  background: "#01134C",
                  borderColor: "#01134C",
                  height: "40px",
                  fontWeight: 600,
                  width: "100%",
                }}
              >
                Save Salary Rule
              </Button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Total Students</div>
              <div className="mt-1 text-lg font-bold text-[#01134C]">
                {summary.totalActiveStudents}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Eligible Students</div>
              <div className="mt-1 text-lg font-bold text-[#01134C]">
                {displayedEligibleStudents}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Projected Monthly Salary</div>
              <div className="mt-1 text-lg font-bold text-[#01134C]">
                {formatCurrency(displayedProjectedMonthlySalary)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Final Monthly Salary</div>
              <div className="mt-1 text-lg font-bold text-[#01134C]">
                {formatCurrency(displayedFinalMonthlySalary)}
              </div>
            </div>
          </div>

          <div className="mt-3 text-xs font-medium text-slate-500">
            Attendance and salary calculations below are showing only for{" "}
            <span className="font-semibold text-[#01134C]">{selectedMonthLabel}</span>.
          </div>
        </Card>

        <Card size="small" title={`Monthly Student Salary Check (${selectedMonthLabel})`}>
          {studentsForSalary.length === 0 ? (
            <Empty description="No active students linked to this teacher" />
          ) : (
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                Active Students ({regularSalaryStudents.length})
              </div>
              {regularSalaryStudents.length ? (
                regularSalaryStudents.map(renderSalaryStudentRow)
              ) : (
                <Empty description="No regular active students linked to this teacher" />
              )}

              {movedSalaryStudents.length ? (
                <>
                  <div className="pt-3 text-xs font-semibold uppercase tracking-[0.08em] text-blue-700">
                    Moved Students ({movedSalaryStudents.length})
                  </div>
                  {movedSalaryStudents.map(renderSalaryStudentRow)}
                </>
              ) : null}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          {teacherCourses.map((course) => (
            <Card
              key={course._id}
              size="small"
              title={`${course.courseName} (${course.courseId})`}
              extra={
                <span className="text-xs font-medium text-slate-500">
                  Attendance for {selectedMonthLabel}
                </span>
              }
            >
              {course.activeStudents.length === 0 ? (
                <Empty description="No active students in this course" />
              ) : (
                <div className="space-y-3">
                  {course.activeStudents.map((student) => (
                    <div
                      key={student.enrollmentId}
                      className="rounded-xl border border-slate-200 p-3"
                    >
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-[#01134C]">
                            {student.studentName}
                          </div>
                          <div className="text-xs text-slate-500">
                            Reg #: {student.registrationNo} | Batch:{" "}
                            {student.batchName} ({student.batchCode})
                          </div>
                        </div>
                        <Tag
                          color={
                            student.attendancePercentage >= effectiveThreshold
                              ? "green"
                              : "orange"
                          }
                        >
                          {student.attendancePercentage}% Attendance
                        </Tag>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 md:grid-cols-6">
                        <div className="rounded-lg bg-slate-50 p-2">
                          Working Days: {student.totalWorkingDays}
                        </div>
                        <div className="rounded-lg bg-slate-50 p-2">
                          Present: {student.presentDays}
                        </div>
                        <div className="rounded-lg bg-slate-50 p-2">
                          Half Day: {student.halfDays}
                        </div>
                        <div className="rounded-lg bg-slate-50 p-2">
                          Absent: {student.absentDays}
                        </div>
                        <div className="rounded-lg bg-slate-50 p-2">
                          Leave: {student.leaveDays}
                        </div>
                        <div className="rounded-lg bg-slate-50 p-2">
                          Holiday: {student.holidayDays}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    );
  };

  const filteredTeachers = teachers.filter((teacher) => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return true;

    const searchableText = [
      teacher.fullName,
      teacher.teacherId,
      teacher.designation,
      teacher.contactNo,
      teacher.highestQualification,
      teacher.degreeTitle,
      teacher.majorSubject,
      teacher.teachingExperience,
      teacher.gender,
      teacher.email,
      teacher.address,
      ...(teacher.computerSkills || []),
      ...(teacher.courseId || []).map((course) => course?.courseName),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchableText.includes(keyword);
  });

  const paginatedTeachers = filteredTeachers.slice(
    (currentPage - 1) * TEACHERS_PER_PAGE,
    currentPage * TEACHERS_PER_PAGE,
  );

  if (teacherId) {
    if (fetchingTeachers && !selectedTeacher) {
      return (
        <div className="flex min-h-[50vh] items-center justify-center">
          <Spin size="large" />
        </div>
      );
    }

    if (!selectedTeacher || String(selectedTeacher._id) !== String(teacherId)) {
      return (
        <div className="space-y-4">
          <Button onClick={() => navigate("/dashboard/employees")}>
            Back to Employees
          </Button>
          <Empty description="This teacher could not be found." />
        </div>
      );
    }

    return (
      <div className="w-full space-y-6">
        <Button
          onClick={() => navigate("/dashboard/employees")}
          className="!rounded-lg"
        >
          Back to Employees
        </Button>
        <Card className="overflow-hidden !rounded-2xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <Avatar
                size={76}
                src={selectedTeacher.profilePicture || undefined}
                icon={<UserOutlined />}
                className="!bg-[#01134C]"
              >
                {getInitials(selectedTeacher.fullName)}
              </Avatar>
              <div>
                <h1 className="m-0 text-2xl font-bold text-[#01134C]">
                  {selectedTeacher.fullName}
                </h1>
                <div className="mt-1 text-sm text-slate-500">
                  {selectedTeacher.designation ||
                    selectedTeacher.majorSubject ||
                    "Teacher"}
                  {selectedTeacher.teacherId
                    ? ` · ${selectedTeacher.teacherId}`
                    : ""}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Tag color="blue">
                    {selectedTeacher.salaryType === "per_student"
                      ? "Student attendance based"
                      : "Fixed monthly salary"}
                  </Tag>
                  {selectedTeacher.contactNo ? (
                    <Tag>{selectedTeacher.contactNo}</Tag>
                  ) : null}
                </div>
              </div>
            </div>
            {permissions.update ? (
              <Button
                icon={<FaEdit />}
                onClick={() => openEditModal(selectedTeacher)}
              >
                Edit Teacher
              </Button>
            ) : null}
          </div>
        </Card>
        <Card className="!rounded-2xl">
          <Tabs
            defaultActiveKey="personal"
            items={[
              {
                key: "personal",
                label: "Personal Information",
                children: renderPersonalInfoTab(),
              },
              {
                key: "courses",
                label: "Courses, Students & Salary",
                children: renderCourseAndStudentTab(),
              },
            ]}
          />
        </Card>
      </div>
    );
  }

  return (
    <>
      <Modal
        title={
          <h4 className="h4 py-[12px]">
            {editMode ? "Edit Teacher" : "Create Employee"}
          </h4>
        }
        open={openModal}
        onCancel={() => {
          setOpenModal(false);
          setEditMode(false);
          setEditingTeacher(null);
          form.resetFields();
        }}
        mask={{ closable: true }}
        footer={null}
        width={900}
        centered
        >
          <div
            style={{ maxHeight: "800px", overflowY: "auto", paddingRight: "8px" }}
          >
          <TeacherForm
            form={form}
            loading={loading}
            onSubmit={editMode ? handleEditTeacher : handleCreateTeacher}
            courses={courses}
            initialImage={editingTeacher?.profilePicture || null}
            initialTeacher={editingTeacher}
          />
        </div>
      </Modal>

      <Modal
        title={
          selectedStudentCompensation
            ? `Edit Student Salary - ${selectedStudentCompensation.studentName}`
            : "Edit Student Salary"
        }
        open={studentCompensationModalOpen}
        onCancel={() => {
          setStudentCompensationModalOpen(false);
          setSelectedStudentCompensation(null);
          studentCompensationForm.resetFields();
        }}
        onOk={handleSaveStudentCompensation}
        okText="Save Amount"
        confirmLoading={savingStudentCompensation}
        footer={[
          <Button
            key="reset"
            onClick={handleResetStudentCompensation}
            disabled={!selectedStudentCompensation?.hasManualAdjustment || savingStudentCompensation}
          >
            Reset Auto
          </Button>,
          <Button
            key="cancel"
            onClick={() => {
              setStudentCompensationModalOpen(false);
              setSelectedStudentCompensation(null);
              studentCompensationForm.resetFields();
            }}
          >
            Cancel
          </Button>,
          <Button
            key="save"
            type="primary"
            loading={savingStudentCompensation}
            onClick={handleSaveStudentCompensation}
          >
            Save Amount
          </Button>,
        ]}
      >
        <Form form={studentCompensationForm} layout="vertical">
          <Form.Item label="Student">
            <Input
              value={
                selectedStudentCompensation
                  ? `${selectedStudentCompensation.studentName} (${selectedStudentCompensation.registrationNo})`
                  : ""
              }
              disabled
            />
          </Form.Item>
          <Form.Item label="Default Calculated Amount">
            <Input
              value={
                selectedStudentCompensation
                  ? formatCurrency(selectedStudentCompensation.defaultCalculatedSalaryAmount || 0)
                  : ""
              }
              disabled
            />
          </Form.Item>
          <Form.Item
            label="Edit Amount"
            name="amount"
            rules={[{ required: true, message: "Please enter student salary amount" }]}
          >
            <InputNumber min={0} className="!w-full" />
          </Form.Item>
          <Form.Item label="Note" name="note">
            <Input.TextArea
              rows={3}
              placeholder="Optional note for this student's salary adjustment"
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Move Student To Another Teacher"
        open={studentTransferModalOpen}
        onCancel={closeStudentTransferModal}
        width={620}
        footer={[
          <Button key="cancel" onClick={closeStudentTransferModal}>
            Cancel
          </Button>,
          <Button
            key="move"
            type="primary"
            loading={savingStudentTransfer}
            onClick={handleTransferStudent}
            style={{ background: "#01134C", borderColor: "#01134C" }}
          >
            Move Student
          </Button>,
        ]}
      >
        <Form form={studentTransferForm} layout="vertical">
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="font-semibold text-[#01134C]">
              {selectedStudentTransfer?.studentName || "Selected student"}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Reg #: {selectedStudentTransfer?.registrationNo || "N/A"} | Choose the current course/batch below, then select the new teacher.
            </div>
          </div>

          <Form.Item
            label="Current Course / Batch"
            name="sourceEnrollmentId"
            rules={[{ required: true, message: "Please select the current course and batch" }]}
          >
            <Select
              placeholder="Select course and batch to move"
              options={getStudentTransferSourceOptions(selectedStudentTransfer?.studentId)}
            />
          </Form.Item>

          <Form.Item
            label="Move To Teacher"
            name="targetTeacherId"
            rules={[{ required: true, message: "Please select target teacher" }]}
          >
            <Select
              showSearch
              placeholder="Select teacher"
              options={teachers
                .filter((teacher) => String(teacher._id) !== String(selectedTeacher?._id))
                .map((teacher) => ({
                  label: `${teacher.fullName} (${teacher.teacherId || "No ID"})`,
                  value: teacher._id,
                }))}
              filterOption={(input, option) =>
                String(option?.label || "").toLowerCase().includes(input.toLowerCase())
              }
              onChange={() => {
                studentTransferForm.setFieldsValue({
                  targetCourseId: undefined,
                  targetBatchId: undefined,
                });
                setTransferTargetBatches([]);
              }}
            />
          </Form.Item>

          <Form.Item shouldUpdate={(prev, next) => prev.targetTeacherId !== next.targetTeacherId}>
            {({ getFieldValue }) => (
              <Form.Item
                label="Teacher Course"
                name="targetCourseId"
                rules={[{ required: true, message: "Please select teacher course" }]}
              >
                <Select
                  placeholder="Select target teacher first"
                  disabled={!getFieldValue("targetTeacherId")}
                  options={getTeacherCourseOptions(getFieldValue("targetTeacherId"))}
                  onChange={(courseId) => {
                    studentTransferForm.setFieldValue("targetBatchId", undefined);
                    fetchTransferTargetBatches(courseId);
                  }}
                />
              </Form.Item>
            )}
          </Form.Item>

          <Form.Item
            label="Teacher Course Batch"
            name="targetBatchId"
            rules={[{ required: true, message: "Please select target batch" }]}
          >
            <Select
              showSearch
              loading={loadingTransferTargetBatches}
              disabled={!studentTransferForm.getFieldValue("targetCourseId")}
              placeholder={
                studentTransferForm.getFieldValue("targetCourseId")
                  ? "Select batch for attendance"
                  : "Select teacher course first"
              }
              options={transferTargetBatches.map((batch) => ({
                label: `${batch.batchName || "Batch"}${batch.batchCode ? ` (${batch.batchCode})` : ""} - ${batch.status || "Active"}`,
                value: batch._id,
              }))}
              filterOption={(input, option) =>
                String(option?.label || "").toLowerCase().includes(input.toLowerCase())
              }
              notFoundContent={
                loadingTransferTargetBatches
                  ? "Loading batches..."
                  : "No active batch found for this course"
              }
            />
          </Form.Item>

          <Form.Item
            label="Transfer Date"
            name="transferDate"
            rules={[{ required: true, message: "Please select transfer date" }]}
          >
            <DatePicker className="w-full" format="DD MMM YYYY" />
          </Form.Item>

          <Form.Item
            label="Reason"
            name="reason"
            rules={[{ required: true, message: "Please enter transfer reason" }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="Why is this student being moved to another teacher?"
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={importModalVisible}
        onCancel={() => setImportModalVisible(false)}
        footer={null}
        centered
        width={620}
        title={
          <div className="flex items-center gap-2 text-[#166534]">
            <FaFileExcel />
            <span style={{ fontSize: "18px", fontWeight: 700 }}>
              Import Employees Workbook
            </span>
          </div>
        }
      >
        <div
          style={{
            border: "2px dashed #16A34A",
            borderRadius: "18px",
            padding: "28px 22px",
            background: "linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 100%)",
            textAlign: "center",
          }}
        >
          <div className="flex justify-center mb-4 text-[#15803D] text-[54px]">
            <FaFileExcel />
          </div>
          <div style={{ fontSize: "15px", color: "#166534", fontWeight: 600 }}>
            Upload employee Excel/CSV file or download a ready-made template
          </div>
          <div style={{ fontSize: "13px", color: "#15803D", marginTop: "8px" }}>
            Supported formats: `.xlsx`, `.xls`, `.csv`
          </div>

          <div className="flex justify-center gap-3 mt-6 flex-wrap">
            <Upload
              accept=".xlsx,.xls,.csv"
              beforeUpload={handleEmployeeImport}
              showUploadList={false}
            >
              <Button
                type="primary"
                icon={<FaFileImport />}
                loading={importingEmployees}
                style={{
                  background: "#15803D",
                  borderColor: "#15803D",
                  borderRadius: "10px",
                  height: "40px",
                  paddingInline: "18px",
                  fontWeight: 600,
                }}
              >
                Upload File
              </Button>
            </Upload>
            <Button
              icon={<FaFileDownload />}
              onClick={downloadEmployeeTemplate}
              style={{
                borderColor: "#16A34A",
                color: "#166534",
                borderRadius: "10px",
                height: "40px",
                paddingInline: "18px",
                fontWeight: 600,
              }}
            >
              Download Template
            </Button>
          </div>
        </div>

        <div
          style={{
            marginTop: "18px",
            padding: "16px",
            borderRadius: "14px",
            background: "#F8FAFC",
            border: "1px solid #E2E8F0",
          }}
        >
          <div style={{ fontWeight: 700, color: "#334155", marginBottom: "8px" }}>
            Template Columns
          </div>
          <div style={{ fontSize: "13px", color: "#64748B", lineHeight: 1.7 }}>
            Employee ID, Full Name, Father Name, Gender, Appointment Date,
            Contact Number, Contract Period, CNIC Number, Address, Designation,
            Highest Qualification, Degree Title, Major Subject, Experience,
            Other Skills, Monthly Salary, Assigned Courses
          </div>
        </div>

        {importResult && (
          <div
            style={{
              marginTop: "18px",
              padding: "16px",
              borderRadius: "14px",
              background: "#FEFCE8",
              border: "1px solid #FACC15",
            }}
          >
            <div style={{ fontWeight: 700, color: "#92400E", marginBottom: "10px" }}>
              Import Summary
            </div>
            <div style={{ color: "#713F12", fontSize: "14px", lineHeight: 1.8 }}>
              <div>{importResult.imported || 0} new employees imported</div>
              <div>{importResult.updated || 0} existing employees updated</div>
              <div>{importResult.errors?.length || 0} errors</div>
            </div>
            {importResult.errors?.length > 0 && (
              <div
                style={{
                  marginTop: "12px",
                  maxHeight: "160px",
                  overflowY: "auto",
                  background: "white",
                  borderRadius: "10px",
                  border: "1px solid #FDE68A",
                  padding: "10px 12px",
                  color: "#B91C1C",
                  fontSize: "13px",
                  lineHeight: 1.7,
                }}
              >
                {importResult.errors.map((error, index) => (
                  <div key={`${error}-${index}`}>{error}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: "#01134C" }}
          >
            <MdPeopleAlt size={22} style={{ color: "#E8FC0A" }} />
          </div>
          <div>
            <h2 className="module-title">Employees</h2>
            <p className="module-subtitle">
              Manage staff & teacher profiles
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {permissions.export && (
            <Button
              onClick={downloadEmployeesWorkbook}
              icon={<FaFileDownload />}
              size="large"
              loading={exportingEmployees}
              style={{
                background: "#EFF6FF",
                borderColor: "#BFDBFE",
                color: "#1D4ED8",
                borderRadius: "12px",
                fontWeight: 600,
              }}
            >
              Download Excel
            </Button>
          )}
          {permissions.import && (
            <Button
              onClick={() => {
                setImportResult(null);
                setImportModalVisible(true);
              }}
              icon={<FaFileImport />}
              size="large"
              style={{
                background: "#F0FDF4",
                borderColor: "#BBF7D0",
                color: "#166534",
                borderRadius: "12px",
                fontWeight: 600,
              }}
            >
              Import Excel
            </Button>
          )}
          {permissions.create && (
            <Button
              onClick={openCreateModal}
              type="primary"
              icon={<FaPlus />}
              size="large"
              className="btn-lg"
            >
              Create Employee
            </Button>
          )}
        </div>
      </div>

      <div className="p-2">
        {fetchingTeachers ? (
          <div className="flex justify-center items-center h-64">
            <LoaderSpnar />
          </div>
        ) : teachers.length === 0 ? (
          <Empty
            description="No teachers found. Add your first teacher!"
            className="mt-20"
          />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0">
                <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#8ea2c4]">
                  Employee Search
                </div>
                <div className="mt-1 text-[11px] leading-5 text-[#64748b]">
                  Search by name, ID, designation, subject, phone, qualification, or related keywords.
                </div>
              </div>
              <div className="flex w-full flex-col gap-1 md:w-[430px] md:shrink-0">
                <Input.Search
                  allowClear
                  placeholder="Search employees by name, designation, subject, phone..."
                  size="small"
                  value={searchTerm}
                  className="w-full"
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                />
                <div className="text-right text-[10px] font-medium text-[#64748b]">
                  {filteredTeachers.length} employee{filteredTeachers.length === 1 ? "" : "s"} found
                </div>
              </div>
            </div>

            {filteredTeachers.length === 0 ? (
              <Empty
                description="No employees match your search"
                className="mt-10"
              />
            ) : (
              <>
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
            {paginatedTeachers.map((teacher) => {
              return (
                <div
                  key={teacher._id}
                  className="flex h-full min-h-[124px] flex-col rounded-[18px] border border-[#dbe4f0] bg-white p-2.5 shadow-[0_4px_14px_rgba(15,23,42,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_7px_16px_rgba(15,23,42,0.08)]"
                >
                  <div
                    className="mb-2 flex items-start justify-between gap-2 rounded-[14px] border border-[#e6edf7] bg-[#f8fbff] px-2.5 py-2"
                  >
                    <div
                      className="flex min-w-0 flex-1 flex-col"
                      style={{ fontFamily: "'Inter-sans', Arial, sans-serif" }}
                    >
                      <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#8ea2c4]">
                        Employee
                      </span>
                      <h3 className="mt-1 line-clamp-2 text-[12px] font-bold leading-[1.15] text-[#0f172a]">
                        {teacher.fullName || "Unknown"}
                      </h3>
                      <span className="mt-0.5 text-[9px] font-medium text-[#64748b]">
                        {teacher.teacherId || "No ID"}
                      </span>
                      <div className="mt-1 inline-flex w-fit rounded-full bg-white px-2 py-0.5 text-[8px] font-semibold text-[#01134C] shadow-sm">
                        {teacher.designation || "Employee"}
                      </div>
                    </div>

                    <div
                      className="flex h-[50px] w-[50px] shrink-0 items-center justify-center overflow-hidden rounded-full border-[3px] border-white bg-[#01134C] text-[18px] font-bold uppercase text-white shadow-[0_8px_18px_rgba(1,19,76,0.16)]"
                      style={{ fontFamily: "'Inter-sans', Arial, sans-serif" }}
                    >
                      {teacher.profilePicture ? (
                        <img
                          src={teacher.profilePicture}
                          alt={teacher.fullName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        getInitials(teacher.fullName)
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="rounded-[10px] border border-[#e6edf7] bg-white px-2 py-1.5">
                      <div className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#8ea2c4]">
                        Phone
                      </div>
                      <div className="mt-0.5 truncate text-[10px] font-semibold text-[#0f172a]">
                        {teacher.contactNo || "N/A"}
                      </div>
                    </div>
                    <div className="rounded-[10px] border border-[#e6edf7] bg-white px-2 py-1.5">
                      <div className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#8ea2c4]">
                        Education
                      </div>
                      <div className="mt-0.5 truncate text-[10px] font-semibold text-[#0f172a]">
                        {teacher.highestQualification || "N/A"}
                      </div>
                    </div>
                    <div className="rounded-[10px] border border-[#e6edf7] bg-white px-2 py-1.5">
                      <div className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#8ea2c4]">
                        Subject
                      </div>
                      <div className="mt-0.5 truncate text-[10px] font-semibold text-[#0f172a]">
                        {teacher.majorSubject || "N/A"}
                      </div>
                    </div>
                    <div className="rounded-[10px] border border-[#e6edf7] bg-white px-2 py-1.5">
                      <div className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#8ea2c4]">
                        Experience
                      </div>
                      <div className="mt-0.5 truncate text-[10px] font-semibold text-[#0f172a]">
                        {formatExperience(teacher.teachingExperience)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between rounded-[10px] border border-[#e6edf7] bg-[#f8fbff] px-2 py-1.5">
                    {permissions.view && (
                      <Button
                        type="primary"
                        icon={<FaPrint />}
                        onClick={() => openIdCardModal(teacher)}
                        style={{
                          background: "#01134C",
                          borderColor: "#01134C",
                          fontWeight: "600",
                          fontSize: "9px",
                          height: "24px",
                          borderRadius: "8px",
                        }}
                        size="small"
                      >
                        View Details
                      </Button>
                    )}
                    <div className="flex gap-[5px]">
                      {permissions.update && (
                        <Button
                          icon={<FaEdit />}
                          onClick={() => openEditModal(teacher)}
                          size="small"
                          style={{
                            background: "white",
                            borderColor: "#01134C",
                            color: "#01134C",
                            height: "22px",
                            width: "22px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: "8px",
                          }}
                        />
                      )}
                      {permissions.delete && (
                        <Popconfirm
                          title="Delete Teacher"
                          description="Are you sure you want to delete this teacher?"
                          onConfirm={() => handleDeleteTeacher(teacher._id)}
                          okText="Yes"
                          cancelText="No"
                          okButtonProps={{ danger: true }}
                        >
                          <Button
                            danger
                            icon={<FaTrash />}
                            size="small"
                            style={{ width: "22px", height: "22px", borderRadius: "8px" }}
                          />
                        </Popconfirm>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            </div>

            {filteredTeachers.length > TEACHERS_PER_PAGE && (
              <div className="flex justify-end">
                <Pagination
                  current={currentPage}
                  pageSize={TEACHERS_PER_PAGE}
                  total={filteredTeachers.length}
                  onChange={setCurrentPage}
                  showSizeChanger={false}
                />
              </div>
            )}
              </>
            )}
          </div>
        )}
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .id-card-container, .id-card-container * {
            visibility: visible;
          }
          .id-card-container {
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
          }
          .ant-modal-wrap {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
};

export default Teachers;
