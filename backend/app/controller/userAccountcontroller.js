import bcrypt from "bcrypt";
import Role from "../modules/roleModule.js";
import UserAuth from "../modules/userAuthModal.js";
import Admission from "../modules/AdmissionModule.js";
import Batch from "../modules/batchModule.js";
import Course from "../modules/courseModule.js";
import Enrollment from "../modules/enrollmentModule.js";
import {
  buildPermissionsMap,
  isLegacyAdminUser,
  normalizePermissions,
  resolveRoleForUser,
  serializeRoleForClient,
} from "../utils/rbac.js";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const toArray = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};
const unique = (values = []) => [...new Set(values.filter(Boolean).map(String))];
const studentNameSlug = (value) => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ".")
  .replace(/^\.+|\.+$/g, "");

const studentPermissions = () => normalizePermissions([{ module: "dashboard", actions: { view: true } }]);

const ensureStudentRole = async () => {
  const existingRole = await Role.findOne({ name: /^Student$/i });
  if (existingRole) {
    existingRole.isSystem = true;
    existingRole.description =
      existingRole.description || "Student portal access for profile and password management.";
    existingRole.permissions = studentPermissions();
    await existingRole.save();
    return existingRole;
  }

  return Role.create({
    name: "Student",
    description: "Student portal access for profile and password management.",
    isSystem: true,
    permissions: studentPermissions(),
  });
};

const buildStudentEmail = (student, suffix = "") =>
  `odc${studentNameSlug(student?.studentName) || "student"}${suffix ? `.${suffix}` : ""}@gmail.com`;

const buildStudentPassword = (student) =>
  `odc${(studentNameSlug(student?.studentName) || "student").replace(/\./g, "")}`;

const getSelectedEnrollmentStudents = async ({ courseIds = [], batchIds = [] }) => {
  const courseFilter = unique(courseIds);
  const batchFilter = unique(batchIds);
  const query = { status: "Active" };
  if (courseFilter.length) query.course = { $in: courseFilter };
  if (batchFilter.length) query.batch = { $in: batchFilter };

  const enrollments = await Enrollment.find(query)
    .populate("student", "studentName registrationNo emailAddress mobileNumber profilePicture isActive")
    .populate("course", "courseName courseId")
    .populate("batch", "batchName batchCode")
    .lean();

  const students = new Map();
  enrollments.forEach((enrollment) => {
    const student = enrollment.student;
    if (!student?._id || student.isActive === false) return;
    const key = String(student._id);
    if (!students.has(key)) {
      students.set(key, {
        student,
        courseIds: new Set(),
        batchIds: new Set(),
        courses: [],
        batches: [],
      });
    }
    const item = students.get(key);
    if (enrollment.course?._id && !item.courseIds.has(String(enrollment.course._id))) {
      item.courseIds.add(String(enrollment.course._id));
      item.courses.push(enrollment.course);
    }
    if (enrollment.batch?._id && !item.batchIds.has(String(enrollment.batch._id))) {
      item.batchIds.add(String(enrollment.batch._id));
      item.batches.push(enrollment.batch);
    }
  });

  return [...students.values()].map((item) => ({
    ...item,
    courseIds: [...item.courseIds],
    batchIds: [...item.batchIds],
  }));
};

const serializeStudentAccount = async (user) => {
  const [student, courses, batches] = await Promise.all([
    user.student ? Admission.findById(user.student).lean() : null,
    Course.find({ _id: { $in: user.studentPortal?.courseIds || [] } }, "courseName courseId").lean(),
    Batch.find({ _id: { $in: user.studentPortal?.batchIds || [] } }, "batchName batchCode").lean(),
  ]);

  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.legacyRole || "Student",
    accountType: user.accountType,
    studentId: user.student,
    registrationNo: student?.registrationNo || "",
    phone: student?.mobileNumber || user.details?.phone || "",
    isActive: user.isActive,
    profile: user.profile,
    academyEmail: user.studentPortal?.academyEmail || "",
    initialPassword: user.studentPortal?.initialPassword || "",
    courses,
    batches,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

const findUserByAuthContext = async (authUser) => {
  const authId = authUser?._id || authUser?.id;
  let user = null;

  if (authId) {
    user = await UserAuth.findById(authId);
  }

  if (!user && authUser?.email) {
    user = await UserAuth.findOne({ email: normalizeEmail(authUser.email) });
  }

  return user;
};

const findLeanUserByAuthContext = async (authUser) => {
  const user = await findUserByAuthContext(authUser);
  return user?.toObject ? user.toObject() : user;
};

const findTargetUser = async (targetId, authUser) => {
  let user = null;

  if (targetId) {
    user = await UserAuth.findById(targetId);
  }

  const authId = authUser?._id || authUser?.id;
  if (
    !user &&
    authUser?.email &&
    authId &&
    String(targetId) === String(authId)
  ) {
    user = await UserAuth.findOne({ email: normalizeEmail(authUser.email) });
  }

  return user;
};

const canManageAllUsers = async (authUser) => {
  if (!authUser?._id && !authUser?.id) return false;
  const currentUser = await findLeanUserByAuthContext(authUser);
  if (!currentUser) return false;
  const resolvedRole = await resolveRoleForUser(currentUser);
  return currentUser.isSuperAdmin || isLegacyAdminUser(currentUser, resolvedRole);
};

const serializeUser = async (user) => {
  const resolvedRole = await resolveRoleForUser(user);
  const isStudentAccount = user.accountType === "student";
  const [studentRecord, studentCourses, studentBatches] = isStudentAccount
    ? await Promise.all([
        user.student ? Admission.findById(user.student).lean() : null,
        Course.find({ _id: { $in: user.studentPortal?.courseIds || [] } }, "courseName courseId courseCategory duration totalFee").lean(),
        Batch.find({ _id: { $in: user.studentPortal?.batchIds || [] } }, "batchName batchCode course shift days status startDate endDate").lean(),
      ])
    : [null, [], []];

  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: serializeRoleForClient(user, resolvedRole),
    roleId: typeof user.role === "string" ? user.role : user.role?._id || user.role || null,
    accountType: user.accountType,
    student: user.student,
    studentInfo: studentRecord
      ? {
          _id: studentRecord._id,
          registrationNo: studentRecord.registrationNo,
          studentName: studentRecord.studentName,
          fatherName: studentRecord.fatherName,
          mobileNumber: studentRecord.mobileNumber,
          emailAddress: studentRecord.emailAddress,
          currentAddress: studentRecord.currentAddress,
          permanentAddress: studentRecord.permanentAddress,
        }
      : null,
    studentPortal: isStudentAccount
      ? {
          academyEmail: user.studentPortal?.academyEmail || "",
          courses: studentCourses,
          batches: studentBatches,
        }
      : null,
    profile: user.profile,
    details: user.details,
    isSuperAdmin: user.isSuperAdmin,
    isActive: user.isActive,
    lastLogin: user.lastLogin,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    permissions: buildPermissionsMap(user, resolvedRole),
  };
};

const getUserAccount = async (req, res) => {
  try {
    const userId = req.params.id;
    const currentUserId = req.user?._id || req.user?.id;

    if (!userId || !currentUserId) {
      return res.status(401).json({
        status: 401,
        message: "Unauthorized",
      });
    }

    const authContext = {
      _id: currentUserId,
      id: currentUserId,
      email: req.user?.email,
    };
    const canViewAll = await canManageAllUsers(authContext);
    if (!canViewAll && String(userId) !== String(currentUserId)) {
      return res.status(403).json({
        status: 403,
        message: "You can only view your own account",
      });
    }

    const userData = await findTargetUser(userId, authContext);
    if (!userData) {
      return res.status(404).json({ status: 404, message: "User not found!" });
    }

    res.status(200).json({
      status: 200,
      message: "User account information",
      userData: await serializeUser(userData),
    });
  } catch (error) {
    res.status(500).json({
      status: 500,
      message: "Server error",
      error: error.message,
    });
  }
};

const updateUserAccount = async (req, res) => {
  try {
    const userId = req.params.id;
    const currentUserId = req.user?._id || req.user?.id;

    if (!userId || !currentUserId) {
      return res.status(404).json({ status: "error", message: "User ID missing" });
    }

    const authContext = {
      _id: currentUserId,
      id: currentUserId,
      email: req.user?.email,
    };
    const canViewAll = await canManageAllUsers(authContext);
    if (!canViewAll && String(userId) !== String(currentUserId)) {
      return res.status(403).json({
        status: "error",
        message: "You can only update your own account",
      });
    }

    const user = await findTargetUser(userId, authContext);
    if (!user) {
      return res.status(404).json({ status: "error", message: "User not found!" });
    }

    const updatedData = {
      name: req.body.name,
      email: req.body.email?.trim()?.toLowerCase(),
    };

    if (canViewAll && Object.prototype.hasOwnProperty.call(req.body, "roleId")) {
      if (req.body.roleId) {
        const role = await Role.findById(req.body.roleId);
        if (!role) {
          return res.status(400).json({ status: "error", message: "Selected role not found" });
        }
        updatedData.role = role._id.toString();
        updatedData.legacyRole = role.name;
      } else {
        updatedData.role = null;
        updatedData.legacyRole = "";
      }
    } else if (canViewAll && typeof req.body.role === "string") {
      updatedData.role = req.body.role;
      updatedData.legacyRole = req.body.role;
    }

    if (canViewAll && Array.isArray(req.body.permissions)) {
      updatedData.permissions = normalizePermissions(req.body.permissions);
    }

    if (req.body.password) {
      const isSamePassword = await bcrypt.compare(req.body.password, user.password);
      updatedData.password = isSamePassword
        ? user.password
        : await bcrypt.hash(req.body.password, await bcrypt.genSalt(10));
      if (!canViewAll && user.accountType === "student") {
        updatedData["studentPortal.initialPassword"] = "";
      }
    }

    const detailFields = ["phone", "city", "address", "age", "gender", "education"];
    const nextDetails = {
      ...(user.details?.toObject ? user.details.toObject() : user.details || {}),
    };
    let hasDetailUpdate = false;
    detailFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        nextDetails[field] = req.body[field];
        hasDetailUpdate = true;
      }
    });
    if (hasDetailUpdate) {
      updatedData.details = nextDetails;
    }

    if (req.file) {
      updatedData.profile = req.file.buffer.toString("base64");
    }

    await UserAuth.updateOne({ email: normalizeEmail(user.email) }, { $set: updatedData });
    const updatedUser = await UserAuth.findOne({ email: normalizeEmail(user.email) });

    return res.status(200).json({
      status: "success",
      message: "User updated successfully",
      updatedUser: await serializeUser(updatedUser),
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Server error",
      error: error.message,
    });
  }
};

const deleteUserAccount = async (req, res) => {
  try {
    const userId = req.params.id;
    const currentUserId = req.user?._id || req.user?.id;
    const authContext = {
      _id: currentUserId,
      id: currentUserId,
      email: req.user?.email,
    };
    const canViewAll = await canManageAllUsers(authContext);

    if (!canViewAll && String(userId) !== String(currentUserId)) {
      return res.status(403).json({
        status: 403,
        message: "You can only delete your own account",
      });
    }

    const userToDelete = await findTargetUser(userId, authContext);
    if (!userToDelete) {
      return res.status(404).json({ status: 404, message: "User not found!" });
    }

    if (userToDelete.isSuperAdmin) {
      return res.status(400).json({
        status: 400,
        message: "Super admin account cannot be deleted.",
      });
    }

    const deletedUser = await UserAuth.findOneAndDelete({
      email: normalizeEmail(userToDelete.email),
    });

    return res.status(200).json({
      status: 200,
      message: "User account deleted successfully",
      deletedUser: await serializeUser(deletedUser),
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      message: "Server error",
      error: error.message,
    });
  }
};

const getAllProfileData = async (req, res) => {
  try {
    const currentUserId = req.user?._id || req.user?.id;
    const authContext = {
      _id: currentUserId,
      id: currentUserId,
      email: req.user?.email,
    };
    const canViewAll = await canManageAllUsers(authContext);

    const currentUser = canViewAll
      ? null
      : await findTargetUser(currentUserId, authContext);
    const query = canViewAll ? {} : currentUser ? { email: normalizeEmail(currentUser.email) } : { _id: currentUserId };
    const users = await UserAuth.find(query).sort({ createdAt: -1 });
    const data = await Promise.all(users.map((user) => serializeUser(user)));

    return res.status(200).json({
      success: true,
      message: "Profile data fetched",
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const previewStudentPortalAccounts = async (req, res) => {
  try {
    const courseIds = toArray(req.body.courseIds);
    const batchIds = toArray(req.body.batchIds);

    if (!courseIds.length && !batchIds.length) {
      return res.status(400).json({
        success: false,
        message: "Select at least one course or batch.",
      });
    }

    const selectedStudents = await getSelectedEnrollmentStudents({ courseIds, batchIds });
    const studentIds = selectedStudents.map((item) => String(item.student._id));
    const enrollmentFilter = { status: { $in: ["Completed", "Dropped"] } };
    const courseFilter = unique(courseIds);
    const batchFilter = unique(batchIds);
    if (courseFilter.length) enrollmentFilter.course = { $in: courseFilter };
    if (batchFilter.length) enrollmentFilter.batch = { $in: batchFilter };
    const inactiveEnrollments = await Enrollment.find(enrollmentFilter)
      .select("student status")
      .lean();
    const completedStudentIds = new Set();
    const droppedStudentIds = new Set();
    inactiveEnrollments.forEach((enrollment) => {
      const studentId = String(enrollment.student || "");
      if (!studentId) return;
      if (enrollment.status === "Completed") completedStudentIds.add(studentId);
      if (enrollment.status === "Dropped") droppedStudentIds.add(studentId);
    });
    studentIds.forEach((studentId) => {
      completedStudentIds.delete(studentId);
      droppedStudentIds.delete(studentId);
    });
    const existingAccounts = await UserAuth.find({
      accountType: "student",
      student: { $in: studentIds },
    }).lean();
    const existingByStudent = new Map(existingAccounts.map((account) => [String(account.student), account]));

    const rows = selectedStudents.map((item) => {
      const existing = existingByStudent.get(String(item.student._id));
      return {
        studentId: item.student._id,
        studentName: item.student.studentName,
        registrationNo: item.student.registrationNo || "",
        alreadyCreated: Boolean(existing),
        email: existing?.email || "",
        courses: item.courses,
        batches: item.batches,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        totalStudents: rows.length,
        newAccounts: rows.filter((row) => !row.alreadyCreated).length,
        existingAccounts: rows.filter((row) => row.alreadyCreated).length,
        skippedEnrollments: {
          completed: completedStudentIds.size,
          dropped: droppedStudentIds.size,
          total: new Set([...completedStudentIds, ...droppedStudentIds]).size,
        },
        students: rows,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to preview student accounts", error: error.message });
  }
};

const createStudentPortalAccounts = async (req, res) => {
  try {
    const courseIds = toArray(req.body.courseIds);
    const batchIds = toArray(req.body.batchIds);
    const academyEmail = "odcacdemy@gmail.com";

    if (!courseIds.length && !batchIds.length) {
      return res.status(400).json({
        success: false,
        message: "Select at least one course or batch.",
      });
    }

    const selectedStudents = await getSelectedEnrollmentStudents({ courseIds, batchIds });
    const studentIds = selectedStudents.map((item) => String(item.student._id));
    const existingAccounts = await UserAuth.find({
      accountType: "student",
      student: { $in: studentIds },
    });
    const existingByStudent = new Map(existingAccounts.map((account) => [String(account.student), account]));
    const studentsNeedingAccounts = selectedStudents.filter(
      (item) => !existingByStudent.has(String(item.student._id)),
    );
    const nameCounts = new Map();
    studentsNeedingAccounts.forEach(({ student }) => {
      const name = studentNameSlug(student.studentName) || "student";
      nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
    });
    const emailByStudent = new Map();
    const reservedEmails = new Set();
    for (const { student } of studentsNeedingAccounts) {
      const name = studentNameSlug(student.studentName) || "student";
      const registrationSuffix = String(student.registrationNo || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const fallbackSuffix = String(student._id).replace(/[^a-z0-9]/gi, "").slice(-8);
      const stableSuffix = registrationSuffix || fallbackSuffix;
      let suffix = nameCounts.get(name) > 1 ? stableSuffix : "";
      let email = buildStudentEmail(student, suffix);
      let counter = 2;

      while (reservedEmails.has(email) || await UserAuth.exists({ email })) {
        suffix = `${stableSuffix}${counter}`;
        email = buildStudentEmail(student, suffix);
        counter += 1;
      }

      reservedEmails.add(email);
      emailByStudent.set(String(student._id), email);
    }
    const studentRole = await ensureStudentRole();
    const created = [];
    const skipped = [];

    for (const item of selectedStudents) {
      const studentId = String(item.student._id);
      const existing = existingByStudent.get(studentId);
      if (existing) {
        const mergedCourses = unique([...(existing.studentPortal?.courseIds || []), ...item.courseIds]);
        const mergedBatches = unique([...(existing.studentPortal?.batchIds || []), ...item.batchIds]);
        existing.studentPortal = {
          ...(existing.studentPortal?.toObject ? existing.studentPortal.toObject() : existing.studentPortal || {}),
          academyEmail: existing.studentPortal?.academyEmail || academyEmail,
          courseIds: mergedCourses,
          batchIds: mergedBatches,
        };
        await existing.save();
        skipped.push(await serializeStudentAccount(existing));
        continue;
      }

      const initialPassword = buildStudentPassword(item.student);
      const email = emailByStudent.get(studentId);
      const hashedPassword = await bcrypt.hash(initialPassword, await bcrypt.genSalt(10));
      const firstName = String(item.student.studentName || "Student").split(/\s+/)[0];
      const user = await UserAuth.create({
        name: item.student.studentName || firstName,
        email,
        password: hashedPassword,
        role: studentRole._id.toString(),
        legacyRole: studentRole.name,
        accountType: "student",
        student: studentId,
        isSuperAdmin: false,
        isActive: true,
        profile: item.student.profilePicture || undefined,
        details: {
          phone: item.student.mobileNumber || "",
          status: "active",
        },
        permissions: studentPermissions(),
        studentPortal: {
          academyEmail,
          initialPassword,
          courseIds: item.courseIds,
          batchIds: item.batchIds,
          createdBy: req.user?._id || req.user?.id,
        },
      });

      created.push(await serializeStudentAccount(user));
    }

    res.status(201).json({
      success: true,
      message: `${created.length} student portal account${created.length === 1 ? "" : "s"} created.`,
      data: {
        created,
        skipped,
        totalSelected: selectedStudents.length,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to create student portal accounts", error: error.message });
  }
};

const listStudentPortalAccounts = async (req, res) => {
  try {
    const accounts = await UserAuth.find({ accountType: "student" }).sort({ createdAt: -1 });
    const data = await Promise.all(accounts.map((account) => serializeStudentAccount(account)));
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch student portal accounts", error: error.message });
  }
};

const deleteAllStudentPortalAccounts = async (req, res) => {
  try {
    const result = await UserAuth.deleteMany({ accountType: "student" });
    res.status(200).json({
      success: true,
      message: `${result.deletedCount} student portal account${result.deletedCount === 1 ? "" : "s"} deleted. Student records and enrollments were not changed.`,
      data: { deletedCount: result.deletedCount },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete student portal accounts",
      error: error.message,
    });
  }
};

const updateStudentPortalAccountStatus = async (req, res) => {
  try {
    const account = await UserAuth.findOne({ _id: req.params.id, accountType: "student" });
    if (!account) {
      return res.status(404).json({ success: false, message: "Student portal account not found." });
    }
    account.isActive = Boolean(req.body.isActive);
    account.details = {
      ...(account.details?.toObject ? account.details.toObject() : account.details || {}),
      status: account.isActive ? "active" : "blocked",
    };
    if (account.isActive) account.failedLoginAttempts = 0;
    await account.save();
    res.status(200).json({ success: true, message: "Student account status updated.", data: await serializeStudentAccount(account) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update student account status", error: error.message });
  }
};

const completeUserProfile = async (req, res) => {
  try {
    const userId = req.params.id;
    const currentUserId = req.user?._id || req.user?.id;
    const authContext = {
      _id: currentUserId,
      id: currentUserId,
      email: req.user?.email,
    };
    const canViewAll = await canManageAllUsers(authContext);

    if (!canViewAll && String(userId) !== String(currentUserId)) {
      return res.status(403).json({
        status: 403,
        message: "You can only update your own profile",
      });
    }

    const user = await findTargetUser(userId, authContext);
    if (!user) {
      return res.status(404).json({ status: 404, message: "User not found!" });
    }

    await UserAuth.updateOne(
      { email: normalizeEmail(user.email) },
      { $set: { details: req.body } },
    );
    const updatedUser = await UserAuth.findOne({ email: normalizeEmail(user.email) });

    res.status(200).json({
      status: 200,
      message: "Profile completed successfully",
      data: await serializeUser(updatedUser),
    });
  } catch (error) {
    res.status(500).json({
      status: 500,
      message: "Server error",
      error: error.message,
    });
  }
};

const updateUserRole = async (req, res) => {
  try {
    const { roleId } = req.body;
    const user = await findTargetUser(req.params.id, req.user);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!roleId) {
      user.role = null;
      user.legacyRole = "";
    } else {
      const role = await Role.findById(roleId);
      if (!role) {
        return res.status(400).json({ success: false, message: "Selected role not found" });
      }
      user.role = role._id.toString();
      user.legacyRole = role.name;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: "User role updated successfully",
      data: await serializeUser(user),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update user role",
      error: error.message,
    });
  }
};

const updateUserStatus = async (req, res) => {
  try {
    const user = await findTargetUser(req.params.id, req.user);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.isSuperAdmin && req.body.isActive === false) {
      user.isActive = true;
      await user.save();

      return res.status(400).json({
        success: false,
        message: "Super admin accounts must always remain active.",
        data: await serializeUser(user),
      });
    }

    user.isActive = Boolean(req.body.isActive);

    if (user.isActive) {
      user.failedLoginAttempts = 0;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: "User status updated successfully",
      data: await serializeUser(user),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update user status",
      error: error.message,
    });
  }
};

const getMyPermissions = async (req, res) => {
  try {
    const user = await findUserByAuthContext(req.user);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const resolvedRole = await resolveRoleForUser(user);

    res.status(200).json({
      success: true,
      data: {
        isSuperAdmin: user.isSuperAdmin,
        role: serializeRoleForClient(user, resolvedRole),
        permissions: buildPermissionsMap(user, resolvedRole),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch permissions",
      error: error.message,
    });
  }
};

export {
  getUserAccount,
  updateUserAccount,
  deleteUserAccount,
  completeUserProfile,
  getAllProfileData,
  updateUserRole,
  updateUserStatus,
  getMyPermissions,
  previewStudentPortalAccounts,
  createStudentPortalAccounts,
  listStudentPortalAccounts,
  deleteAllStudentPortalAccounts,
  updateStudentPortalAccountStatus,
};
