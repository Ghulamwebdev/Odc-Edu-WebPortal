import bcrypt from "bcrypt";
import mongoose from "mongoose";
import Role from "../modules/roleModule.js";
import UserAuth from "../modules/userAuthModal.js";
import Course from "../modules/courseModule.js";
import Batch from "../modules/batchModule.js";
import Enrollment from "../modules/enrollmentModule.js";
import EmployeeCourse from "../modules/employeeCourseModule.js";
import { normalizePermissions } from "../utils/rbac.js";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const toEmail = (value) => String(value || "").trim().toLowerCase();
const toText = (value) => String(value || "").trim();
const isEmployeeRoleName = (value) => String(value || "").trim().toLowerCase() === "employee";

const employeePermissions = () =>
  normalizePermissions([
    { module: "dashboard", actions: { view: true } },
    {
      module: "test_studio",
      actions: {
        view: true,
        create: true,
        update: true,
        delete: true,
        import: true,
        export: true,
        print: true,
        approve: true,
      },
    },
  ]);

const ensureEmployeeRole = async () => {
  const existingRole = await Role.findOne({ name: /^Employee$/i });
  if (existingRole) {
    existingRole.permissions = employeePermissions();
    existingRole.isSystem = true;
    existingRole.description =
      existingRole.description ||
      "Limited employee access for assigned courses, tests, batches, students, and own profile.";
    await existingRole.save();
    return existingRole;
  }

  return Role.create({
    name: "Employee",
    description: "Limited employee access for assigned courses, batches, students, and own profile.",
    isSystem: true,
    permissions: employeePermissions(),
  });
};

const validateProfileFile = (file) => {
  if (!file) return null;
  if (!allowedImageTypes.has(file.mimetype)) {
    return "Profile picture must be jpg, png, or webp.";
  }
  if (file.size > 2 * 1024 * 1024) {
    return "Profile picture must be 2MB or smaller.";
  }
  return null;
};

const parseCourseIds = (value) => {
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

const parsePermissionInput = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const validateCourseIds = async (courseIds = []) => {
  const uniqueIds = [...new Set(courseIds.map(String))];
  if (!uniqueIds.length) return [];

  const courses = await Course.find({ _id: { $in: uniqueIds } }, "_id").lean();
  if (courses.length !== uniqueIds.length) {
    throw new Error("One or more selected courses are invalid.");
  }
  return uniqueIds;
};

const syncEmployeeCourses = async (employeeId, courseIds = [], assignedBy) => {
  const validCourseIds = await validateCourseIds(courseIds);
  await EmployeeCourse.deleteMany({ employee: employeeId, course: { $nin: validCourseIds } });

  if (validCourseIds.length) {
    await EmployeeCourse.bulkWrite(
      validCourseIds.map((courseId) => ({
        updateOne: {
          filter: { employee: employeeId, course: courseId },
          update: { $setOnInsert: { employee: employeeId, course: courseId, assignedBy } },
          upsert: true,
        },
      })),
    );
  }
};

const serializeEmployee = async (user) => {
  const assignments = await EmployeeCourse.find({ employee: user._id })
    .populate("course", "courseId courseName courseCategory duration")
    .sort({ createdAt: -1 })
    .lean();

  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    phone: user.details?.phone || "",
    designation: user.details?.job || user.details?.designation || "",
    status: user.isActive ? "active" : "inactive",
    isActive: user.isActive,
    employeeModuleEnabled: user.permissions?.some(
      (permission) => permission.module === "employees" && permission.actions?.view,
    ) || false,
    profile: user.profile,
    joiningDate: user.createdAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    courseIds: assignments.map((item) => item.course?._id || item.course).filter(Boolean),
    courses: assignments.map((item) => item.course).filter(Boolean),
  };
};

const requireOwnEmployee = (req, res) => {
  const employeeId = req.currentUser?._id || req.user?._id || req.user?.id;
  if (!employeeId) {
    res.status(401).json({ status: "error", message: "Authentication required" });
    return null;
  }
  return employeeId;
};

export const getEmployeeRole = async (req, res) => {
  try {
    const role = await ensureEmployeeRole();
    res.status(200).json({ success: true, data: role });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to ensure employee role", error: error.message });
  }
};

export const listEmployees = async (req, res) => {
  try {
    const employeeRole = await ensureEmployeeRole();
    const users = await UserAuth.find({
      isSuperAdmin: { $ne: true },
      $or: [
        { role: employeeRole._id.toString() },
        { legacyRole: /^Employee$/i },
        { role: /^Employee$/i },
      ],
    }).sort({ createdAt: -1 });

    const data = await Promise.all(users.map((user) => serializeEmployee(user)));
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch employees", error: error.message });
  }
};

export const setEmployeeModuleAccess = async (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Employee module access must be a boolean.",
      });
    }

    const employee = await UserAuth.findOne({
      _id: req.params.id,
      accountType: "employee",
    });
    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee account not found." });
    }

    const permissions = (employee.permissions || []).map((permission) => ({
      module: permission.module,
      actions: permission.actions?.toObject
        ? permission.actions.toObject()
        : permission.actions,
    }));
    const employeeModulePermission = permissions.find(
      (permission) => permission.module === "employees",
    );
    if (employeeModulePermission) {
      employeeModulePermission.actions = {
        ...employeeModulePermission.actions,
        view: enabled,
      };
    } else {
      permissions.push({ module: "employees", actions: { view: enabled } });
    }

    employee.permissions = normalizePermissions(permissions);
    await employee.save();
    res.status(200).json({
      success: true,
      data: { _id: employee._id, employeeModuleEnabled: enabled },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update employee module access",
      error: error.message,
    });
  }
};

export const createEmployee = async (req, res) => {
  try {
    const fileError = validateProfileFile(req.file);
    if (fileError) return res.status(400).json({ success: false, message: fileError });
    const hasPermissions = Object.prototype.hasOwnProperty.call(req.body, "permissions");
    const submittedPermissions = hasPermissions
      ? parsePermissionInput(req.body.permissions)
      : null;
    if (hasPermissions && !submittedPermissions) {
      return res.status(400).json({ success: false, message: "Employee permissions are invalid." });
    }

    const name = toText(req.body.name || req.body.fullName);
    const email = toEmail(req.body.email);
    const password = String(req.body.password || "");
    const phone = toText(req.body.phone);
    const designation = toText(req.body.designation || req.body.role);
    const status = String(req.body.status || "active").toLowerCase();

    if (!name || !email || !password || !designation) {
      return res.status(400).json({ success: false, message: "Name, email, password, and designation are required." });
    }

    const existingUser = await UserAuth.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ success: false, message: "Employee email already exists." });
    }

    const employeeRole = await ensureEmployeeRole();
    const hashedPassword = await bcrypt.hash(password, await bcrypt.genSalt(10));
    const profile = req.file ? `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}` : undefined;

    const employee = await UserAuth.create({
      name,
      email,
      password: hashedPassword,
      role: employeeRole._id.toString(),
      legacyRole: employeeRole.name,
      accountType: "employee",
      isSuperAdmin: false,
      isActive: status !== "inactive",
      profile,
      details: {
        phone,
        job: designation,
        status: status === "inactive" ? "inactive" : "active",
      },
      permissions: hasPermissions
        ? normalizePermissions(submittedPermissions)
        : employeePermissions(),
    });

    await syncEmployeeCourses(employee._id, parseCourseIds(req.body.courseIds), req.user?._id || req.user?.id);
    res.status(201).json({ success: true, message: "Employee created successfully", data: await serializeEmployee(employee) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to create employee", error: error.message });
  }
};

export const updateEmployee = async (req, res) => {
  try {
    const fileError = validateProfileFile(req.file);
    if (fileError) return res.status(400).json({ success: false, message: fileError });
    const hasPermissions = Object.prototype.hasOwnProperty.call(req.body, "permissions");
    const submittedPermissions = hasPermissions
      ? parsePermissionInput(req.body.permissions)
      : null;
    if (hasPermissions && !submittedPermissions) {
      return res.status(400).json({ success: false, message: "Employee permissions are invalid." });
    }

    const employeeRole = await ensureEmployeeRole();
    const employee = await UserAuth.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: "Employee not found" });

    if (
      employee.isSuperAdmin ||
      (!isEmployeeRoleName(employee.legacyRole) && String(employee.role) !== String(employeeRole._id) && !isEmployeeRoleName(employee.role))
    ) {
      return res.status(403).json({ success: false, message: "Only employee accounts can be managed here." });
    }

    const nextEmail = req.body.email ? toEmail(req.body.email) : employee.email;
    if (nextEmail !== employee.email) {
      const duplicate = await UserAuth.findOne({ email: nextEmail, _id: { $ne: employee._id } });
      if (duplicate) return res.status(409).json({ success: false, message: "Email already exists." });
      employee.email = nextEmail;
    }

    if (req.body.name || req.body.fullName) employee.name = toText(req.body.name || req.body.fullName);
    if (req.body.password) employee.password = await bcrypt.hash(String(req.body.password), await bcrypt.genSalt(10));
    if (req.file) employee.profile = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;

    employee.role = employeeRole._id.toString();
    employee.legacyRole = employeeRole.name;
    employee.accountType = "employee";
    if (hasPermissions) {
      employee.permissions = normalizePermissions(submittedPermissions);
    }
    employee.isActive = String(req.body.status || (employee.isActive ? "active" : "inactive")).toLowerCase() !== "inactive";
    employee.details = {
      ...(employee.details?.toObject ? employee.details.toObject() : employee.details || {}),
      phone: req.body.phone !== undefined ? toText(req.body.phone) : employee.details?.phone,
      job: req.body.designation !== undefined ? toText(req.body.designation) : employee.details?.job,
      status: employee.isActive ? "active" : "inactive",
    };

    await employee.save();
    if (Object.prototype.hasOwnProperty.call(req.body, "courseIds")) {
      await syncEmployeeCourses(employee._id, parseCourseIds(req.body.courseIds), req.user?._id || req.user?.id);
    }

    res.status(200).json({ success: true, message: "Employee updated successfully", data: await serializeEmployee(employee) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update employee", error: error.message });
  }
};

export const setEmployeeStatus = async (req, res) => {
  try {
    const employee = await UserAuth.findById(req.params.id);
    if (!employee || employee.isSuperAdmin) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }

    employee.isActive = Boolean(req.body.isActive);
    employee.details = {
      ...(employee.details?.toObject ? employee.details.toObject() : employee.details || {}),
      status: employee.isActive ? "active" : "inactive",
    };
    if (employee.isActive) employee.failedLoginAttempts = 0;
    await employee.save();

    res.status(200).json({ success: true, message: "Employee status updated", data: await serializeEmployee(employee) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update status", error: error.message });
  }
};

export const deleteEmployee = async (req, res) => {
  try {
    const employee = await UserAuth.findById(req.params.id);
    if (!employee || employee.isSuperAdmin) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }

    await EmployeeCourse.deleteMany({ employee: employee._id });
    await employee.deleteOne();
    res.status(200).json({ success: true, message: "Employee deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete employee", error: error.message });
  }
};

export const getMyEmployeeProfile = async (req, res) => {
  try {
    const employeeId = requireOwnEmployee(req, res);
    if (!employeeId) return;
    const employee = await UserAuth.findById(employeeId);
    res.status(200).json({ success: true, data: await serializeEmployee(employee) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load profile", error: error.message });
  }
};

export const updateMyEmployeeProfile = async (req, res) => {
  try {
    const employeeId = requireOwnEmployee(req, res);
    if (!employeeId) return;

    const fileError = validateProfileFile(req.file);
    if (fileError) return res.status(400).json({ success: false, message: fileError });

    const employee = await UserAuth.findById(employeeId);
    if (req.body.name) employee.name = toText(req.body.name);
    if (req.body.phone !== undefined) {
      employee.details = {
        ...(employee.details?.toObject ? employee.details.toObject() : employee.details || {}),
        phone: toText(req.body.phone),
      };
    }
    if (req.file) employee.profile = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    await employee.save();

    res.status(200).json({ success: true, message: "Profile updated successfully", data: await serializeEmployee(employee) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update profile", error: error.message });
  }
};

export const changeMyEmployeePassword = async (req, res) => {
  try {
    const employeeId = requireOwnEmployee(req, res);
    if (!employeeId) return;

    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword !== confirmPassword || String(newPassword).length < 6) {
      return res.status(400).json({ success: false, message: "Provide current password and matching new password of at least 6 characters." });
    }

    const employee = await UserAuth.findById(employeeId);
    const isMatch = await bcrypt.compare(currentPassword, employee.password);
    if (!isMatch) return res.status(400).json({ success: false, message: "Current password is incorrect." });

    employee.password = await bcrypt.hash(newPassword, await bcrypt.genSalt(10));
    await employee.save();
    res.status(200).json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to change password", error: error.message });
  }
};

export const getMyEmployeeDashboard = async (req, res) => {
  try {
    const employeeId = requireOwnEmployee(req, res);
    if (!employeeId) return;

    const assignments = await EmployeeCourse.find({ employee: employeeId }).lean();
    const courseIds = assignments.map((item) => item.course);
    const [employee, courses, batches, enrollments] = await Promise.all([
      UserAuth.findById(employeeId),
      Course.find({ _id: { $in: courseIds } }).sort({ courseName: 1 }).lean(),
      Batch.find({ course: { $in: courseIds } }).sort({ startDate: -1 }).lean(),
      Enrollment.find({ course: { $in: courseIds } })
        .populate("student", "studentName registrationNo emailAddress mobileNumber isActive")
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const batchMap = new Map();
    batches.forEach((batch) => batchMap.set(String(batch._id), { ...batch, students: [] }));

    enrollments.forEach((enrollment) => {
      const batchKey = String(enrollment.batch || "");
      if (!batchMap.has(batchKey)) return;
      batchMap.get(batchKey).students.push({
        enrollmentId: enrollment._id,
        status: enrollment.status,
        studentId: enrollment.student?._id,
        name: enrollment.student?.studentName || "Unknown",
        registrationNo: enrollment.student?.registrationNo || "",
        email: enrollment.student?.emailAddress || "",
        phone: enrollment.student?.mobileNumber || "",
        isActive: enrollment.student?.isActive !== false,
      });
    });

    const coursesWithBatches = courses.map((course) => ({
      ...course,
      batches: batches
        .filter((batch) => String(batch.course) === String(course._id))
        .map((batch) => batchMap.get(String(batch._id))),
    }));

    const studentIds = new Set(
      enrollments.map((item) => item.student?._id).filter(Boolean).map(String),
    );

    res.status(200).json({
      success: true,
      data: {
        profile: await serializeEmployee(employee),
        summary: {
          totalCourses: courses.length,
          totalBatches: batches.length,
          totalStudents: studentIds.size,
        },
        courses: coursesWithBatches,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load employee dashboard", error: error.message });
  }
};
