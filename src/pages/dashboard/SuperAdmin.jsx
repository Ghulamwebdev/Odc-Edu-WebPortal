import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  DatePicker,
  Button,
  Card,
  Checkbox,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Upload,
  message,
  Statistic,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  Award,
  BookOpen,
  CalendarCheck,
  ClipboardList,
  DollarSign,
  GraduationCap,
  LayoutDashboard,
  Megaphone,
  Users,
} from "lucide-react";
import dayjs from "dayjs";
import {
  RBAC_ACTIONS,
  RBAC_MODULES,
  createPermissionTemplate,
  normalizePermissionTemplate,
} from "../../config/rbac";
import {
  createRole,
  deleteRole,
  getRoles,
  updateRole,
} from "../../services/roleService";
import { createNewAdmin } from "../../services/authService";
import { getCourses } from "../../services/feeService";
import { getAllBatches } from "../../services/batchService";
import {
  createEmployee,
  deleteEmployee,
  getEmployees,
  updateEmployee,
} from "../../services/employeeService";
import {
  deleteAdmin,
  getAllAdminInfo,
  updateAdminInfo,
  updateUserStatus,
} from "../../services/adminService";
import { getSuperAdminFinanceMonitor } from "../../services/accountingService";

const moduleLabels = {
  dashboard: "Dashboard",
  courses: "Courses",
  employees: "Employees",
  test_studio: "Test Studio",
  students: "Students",
  attendance: "Attendance",
  accounting: "Accounting",
  certifications: "Certifications",
  announcements: "Announcements",
};
const moduleVisuals = {
  dashboard: { icon: LayoutDashboard, accent: "indigo" },
  courses: { icon: BookOpen, accent: "blue" },
  employees: { icon: Users, accent: "cyan" },
  test_studio: { icon: ClipboardList, accent: "violet" },
  students: { icon: GraduationCap, accent: "emerald" },
  attendance: { icon: CalendarCheck, accent: "teal" },
  accounting: { icon: DollarSign, accent: "amber" },
  certifications: { icon: Award, accent: "rose" },
  announcements: { icon: Megaphone, accent: "sky" },
};
const moduleAccentClasses = {
  indigo: "border-t-indigo-400 bg-indigo-50/35",
  blue: "border-t-blue-400 bg-blue-50/35",
  cyan: "border-t-cyan-500 bg-cyan-50/35",
  violet: "border-t-violet-400 bg-violet-50/35",
  emerald: "border-t-emerald-500 bg-emerald-50/35",
  teal: "border-t-teal-500 bg-teal-50/35",
  amber: "border-t-amber-400 bg-amber-50/35",
  rose: "border-t-rose-400 bg-rose-50/35",
  sky: "border-t-sky-400 bg-sky-50/35",
};
const moduleIconClasses = {
  indigo: "bg-indigo-100 text-indigo-700",
  blue: "bg-blue-100 text-blue-700",
  cyan: "bg-cyan-100 text-cyan-700",
  violet: "bg-violet-100 text-violet-700",
  emerald: "bg-emerald-100 text-emerald-700",
  teal: "bg-teal-100 text-teal-700",
  amber: "bg-amber-100 text-amber-700",
  rose: "bg-rose-100 text-rose-700",
  sky: "bg-sky-100 text-sky-700",
};
const rolesViewOptions = [
  { key: "roles", label: "Roles Table" },
  { key: "users", label: "Users Table" },
];

const normalizePermissionsState = (permissions = {}) => {
  const base = createPermissionTemplate();

  if (Array.isArray(permissions)) {
    permissions.forEach((item) => {
      if (!item?.module || !base[item.module]) {
        return;
      }

      base[item.module] = {
        ...base[item.module],
        ...(item.actions || {}),
      };
    });

    return base;
  }

  return normalizePermissionTemplate(permissions);
};

const buildPermissionsFromRole = (role) => {
  const base = createPermissionTemplate();

  role?.permissions?.forEach((item) => {
    base[item.module] = {
      ...base[item.module],
      ...(item.actions || {}),
    };
  });
  return base;
};

const toRolePayload = (permissions) =>
  RBAC_MODULES.map((moduleKey) => ({
    module: moduleKey,
    actions: permissions[moduleKey],
  }));

const countEnabledModules = (permissions = {}) =>
  Object.values(permissions).filter((actions) => actions?.view).length;

const formatActionLabel = (action) => action.charAt(0).toUpperCase() + action.slice(1);

const getRolePreviewModules = (role) =>
  RBAC_MODULES.filter((moduleKey) => buildPermissionsFromRole(role)?.[moduleKey]?.view);

const getEnabledUserModules = (permissions = {}) =>
  RBAC_MODULES.filter((moduleKey) => permissions?.[moduleKey]?.view);

const getEnabledUserActions = (permissions = {}, moduleKey) =>
  RBAC_ACTIONS.filter((action) => permissions?.[moduleKey]?.[action]);

const canDeleteRole = (role) =>
  Number(role?.userCount || 0) === 0;

const shouldShowRoleInTable = (role) => Boolean(role?._id || role?.name);

const extractRolesPayload = (response) => {
  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response?.data)) {
    return response.data;
  }

  if (Array.isArray(response?.roles)) {
    return response.roles;
  }

  if (Array.isArray(response?.result)) {
    return response.result;
  }

  return [];
};

const extractRoleRecord = (response) => {
  if (response?.data && !Array.isArray(response.data)) {
    return response.data;
  }

  if (response?.role && !Array.isArray(response.role)) {
    return response.role;
  }

  if (response && !Array.isArray(response) && response._id) {
    return response;
  }

  return null;
};

const isCustomRoleUser = (user, roles) =>
  roles.some((role) => !role.isSystem && role._id === user?.roleId);

const isEmployeeAccount = (user) =>
  user?.accountType === "employee" ||
  String(user?.role || "").toLowerCase() === "employee";

const getBatchCourseId = (batch) => String(batch?.course?._id || batch?.course || "");

const getBatchIdsForCourseIds = (batches, courseIds = []) => {
  const selectedCourseIds = new Set(courseIds.map(String));
  return batches
    .filter((batch) => selectedCourseIds.has(getBatchCourseId(batch)))
    .map((batch) => String(batch._id));
};

const shouldShowUserInTable = (user, roles) =>
  user?.isSuperAdmin === true ||
  isEmployeeAccount(user) ||
  isCustomRoleUser(user, roles);

const overviewTablePagination = false;

const tableScrollConfig = {
  x: "max-content",
  y: 360,
};

const beforeUploadEmployeeProfile = (file) => {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    message.error("Profile picture must be JPG, PNG, or WEBP.");
    return Upload.LIST_IGNORE;
  }
  if (file.size > 2 * 1024 * 1024) {
    message.error("Profile picture must be 2MB or smaller.");
    return Upload.LIST_IGNORE;
  }
  return false;
};

const PermissionModuleCard = ({ moduleKey, permissions, setPermissions }) => {
  const currentActions = permissions[moduleKey];
  const isEnabled = currentActions.view;
  const moduleLabel = moduleLabels[moduleKey];
  const moduleVisual = moduleVisuals[moduleKey];
  const ModuleIcon = moduleVisual.icon;

  const updateModule = (nextActions) => {
    setPermissions((prev) => ({
      ...prev,
      [moduleKey]: {
        ...prev[moduleKey],
        ...nextActions,
      },
    }));
  };

  const setAll = (value) => {
    if (value && !isEnabled) {
      message.warning(`First enable the ${moduleLabel} module, then choose permissions.`);
      return;
    }

    const nextActions = RBAC_ACTIONS.reduce((acc, action) => {
      acc[action] = value;
      return acc;
    }, {});

    updateModule(nextActions);
  };

  return (
    <div className={`flex h-full min-h-[258px] flex-col rounded-2xl border border-slate-200 border-t-4 p-5 shadow-sm transition-shadow hover:shadow-md ${moduleAccentClasses[moduleVisual.accent]}`}>
      <div className="mb-4 flex min-h-[58px] items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${moduleIconClasses[moduleVisual.accent]}`}>
            <ModuleIcon size={19} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h4 className="m-0 text-base font-ArialBold leading-6 text-primary">{moduleLabel}</h4>
            <p className="m-0 mt-1 text-xs leading-5 text-slate-500">
            Enable module access and choose allowed actions
            </p>
          </div>
        </div>
        <Switch
          checked={isEnabled}
          onChange={(checked) =>
            updateModule(
              checked
                ? {
                    ...currentActions,
                    view: true,
                  }
                : RBAC_ACTIONS.reduce((acc, action) => {
                    acc[action] = false;
                    return acc;
                  }, {}),
            )
          }
        />
      </div>

      <div className="mb-4 flex min-h-8 flex-wrap items-center gap-2">
        <Button size="small" className="min-w-[88px]" onClick={() => setAll(true)}>
          Select All
        </Button>
        <Button size="small" className="min-w-[88px]" onClick={() => setAll(false)}>
          Clear All
        </Button>
      </div>

      <div className="mt-auto grid grid-cols-2 auto-rows-fr gap-2">
        {RBAC_ACTIONS.map((action) => (
          <label
            key={action}
            className={`flex min-h-[42px] cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
              currentActions[action]
                ? "border-primary bg-slate-50 text-primary"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            <Checkbox
              checked={currentActions[action]}
              onChange={(event) => {
                const checked = event.target.checked;
                if (action !== "view" && !isEnabled) {
                  message.warning(`First enable the ${moduleLabel} module, then choose permissions.`);
                  return;
                }

                updateModule({
                  ...(action === "view" && !checked
                    ? RBAC_ACTIONS.reduce((acc, item) => {
                        acc[item] = false;
                        return acc;
                      }, {})
                    : {
                        ...currentActions,
                        [action]: checked,
                        view: action === "view" ? checked : currentActions.view || checked,
                      }),
                });
              }}
            />
            <span>{formatActionLabel(action)}</span>
          </label>
        ))}
      </div>
    </div>
  );
};

const SuperAdmin = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [employeeRecords, setEmployeeRecords] = useState([]);
  const [courses, setCourses] = useState([]);
  const [batches, setBatches] = useState([]);
  const [batchesLoaded, setBatchesLoaded] = useState(false);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [savingRole, setSavingRole] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [savingUser, setSavingUser] = useState(false);
  const [accountPermissionState, setAccountPermissionState] = useState(createPermissionTemplate());
  const [activeRolesView, setActiveRolesView] = useState("roles");
  const [activePermissionRoleId, setActivePermissionRoleId] = useState(null);
  const [permissionEditorState, setPermissionEditorState] = useState(createPermissionTemplate());
  const [savingPermissionPanel, setSavingPermissionPanel] = useState(false);
  const [viewRoleOpen, setViewRoleOpen] = useState(false);
  const [userPermissionEditorState, setUserPermissionEditorState] = useState(
    createPermissionTemplate(),
  );
  const [savingUserAccess, setSavingUserAccess] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [viewUserId, setViewUserId] = useState(null);
  const [selectedRole, setSelectedRole] = useState(null);
  const [financeMonth, setFinanceMonth] = useState(dayjs());
  const [financeLoading, setFinanceLoading] = useState(false);
  const [financeData, setFinanceData] = useState(null);
  const [form] = Form.useForm();
  const [userForm] = Form.useForm();
  const selectedAccountType = Form.useWatch("accountType", userForm) || "employee";
  const selectedEmployeeCourseIds = Form.useWatch("courseIds", userForm);

  const currentSection = ["overview", "roles", "permissions", "finance"].includes(
    searchParams.get("section"),
  )
    ? searchParams.get("section")
    : "overview";
  const isUserDetailsPage = searchParams.get("view") === "user";

  const loadRoles = async () => {
    setLoadingRoles(true);
    try {
      const response = await getRoles();
      const nextRoles = extractRolesPayload(response);
      setRoles(nextRoles);
      return nextRoles;
    } catch (error) {
      message.error(error?.message || "Failed to load roles");
      return [];
    } finally {
      setLoadingRoles(false);
    }
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await getAllAdminInfo();
      const nextUsers = response?.data || [];
      setUsers(nextUsers);
      return nextUsers;
    } catch (error) {
      message.error(error?.message || "Failed to load users");
      return [];
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadEmployeeRecords = async () => {
    try {
      const response = await getEmployees();
      setEmployeeRecords(response?.data || []);
    } catch (error) {
      message.error(error?.message || "Failed to load employee details");
    }
  };

  const loadCourses = async () => {
    try {
      const response = await getCourses();
      setCourses(response?.data || []);
    } catch (error) {
      message.error(error?.message || "Failed to load courses");
    }
  };

  const loadBatches = async () => {
    try {
      const response = await getAllBatches();
      setBatches(response?.data || response?.batches || []);
    } catch (error) {
      message.error(error?.message || "Failed to load batches");
    } finally {
      setBatchesLoaded(true);
    }
  };

  useEffect(() => {
    loadRoles();
    loadUsers();
    loadEmployeeRecords();
    loadCourses();
    loadBatches();
  }, []);

  useEffect(() => {
    if (searchParams.get("view") === "users") {
      setActiveRolesView("users");
    }
  }, [searchParams]);

  useEffect(() => {
    const nextViewUserId = searchParams.get("view") === "user"
      ? searchParams.get("userId")
      : null;
    setViewUserId(nextViewUserId);
    if (nextViewUserId) {
      setActiveRolesView("users");
    }
  }, [searchParams]);

  useEffect(() => {
    if (viewUserId) {
      const user = users.find((item) => String(item._id) === String(viewUserId));
      if (user) setSelectedUser(user);
    } else {
      setSelectedUser(null);
    }
  }, [users, viewUserId]);

  const loadFinanceMonitor = async (monthValue = financeMonth) => {
    setFinanceLoading(true);
    try {
      const response = await getSuperAdminFinanceMonitor({
        month: monthValue.format("YYYY-MM"),
        months: 6,
      });
      setFinanceData(response.data || null);
    } catch (error) {
      message.error(error?.message || "Failed to load finance monitor");
    } finally {
      setFinanceLoading(false);
    }
  };

  useEffect(() => {
    if (currentSection === "finance") {
      loadFinanceMonitor(financeMonth);
    }
  }, [currentSection, financeMonth]);

  useEffect(() => {
    const customRoles = roles.filter((role) => !role.isSystem);

    if (!customRoles.length) {
      setActivePermissionRoleId(null);
      setPermissionEditorState(createPermissionTemplate());
      return;
    }

    const stillExists = customRoles.some((role) => role._id === activePermissionRoleId);
    if (!activePermissionRoleId || !stillExists) {
      setActivePermissionRoleId(customRoles[0]._id);
    }
  }, [roles, activePermissionRoleId]);

  const activePermissionRole = useMemo(
    () =>
      roles.find((role) => !role.isSystem && role._id === activePermissionRoleId) || null,
    [roles, activePermissionRoleId],
  );

  useEffect(() => {
    if (activePermissionRole) {
      setPermissionEditorState(buildPermissionsFromRole(activePermissionRole));
    }
  }, [activePermissionRole]);

  useEffect(() => {
    if (selectedUser) {
      setUserPermissionEditorState(normalizePermissionsState(selectedUser.permissions));
    } else {
      setUserPermissionEditorState(createPermissionTemplate());
    }
  }, [selectedUser]);

  useEffect(() => {
    if (
      userModalOpen &&
      selectedAccountType === "employee" &&
      batchesLoaded &&
      selectedEmployeeCourseIds?.length
    ) {
      userForm.setFieldValue(
        "attendanceBatchIds",
        getBatchIdsForCourseIds(batches, selectedEmployeeCourseIds),
      );
    }
  }, [
    batches,
    batchesLoaded,
    selectedAccountType,
    selectedEmployeeCourseIds,
    userForm,
    userModalOpen,
  ]);

  const setSection = (sectionKey) => {
    setSearchParams({ section: sectionKey });
  };

  const openCreateModal = () => {
    setEditingRole(null);
    form.resetFields();
    setRoleModalOpen(true);
  };

  const openCreateUserModal = () => {
    setEditingUser(null);
    userForm.resetFields();
    userForm.setFieldsValue({
      accountType: "employee",
      status: "active",
      courseIds: [],
      attendanceBatchIds: [],
    });
    setAccountPermissionState(createPermissionTemplate());
    setUserModalOpen(true);
  };

  const openEditUserModal = (user) => {
    setEditingUser(user);
    const employee = isEmployeeAccount(user)
      ? employeeRecords.find((record) => record._id === user._id)
      : null;
    userForm.setFieldsValue({
      name: user.name,
      email: user.email,
      accountType: isEmployeeAccount(user) ? "employee" : "admin",
      roleId: customRoleOptions.some((option) => option.value === user.roleId)
        ? user.roleId
        : undefined,
      phone: employee?.phone || user.details?.phone || "",
      designation: employee?.designation || user.details?.job || "",
      status: user.isActive ? "active" : "inactive",
      courseIds: employee?.courseIds || [],
      attendanceBatchIds: employee?.attendanceBatchIds || user.attendanceBatchIds || [],
      profile: [],
      password: "",
    });
    setAccountPermissionState(normalizePermissionsState(user.permissions));
    setUserModalOpen(true);
  };

  const openEditModal = (role) => {
    setEditingRole(role);
    form.setFieldsValue({
      name: role.name,
      description: role.description,
    });
    setRoleModalOpen(true);
  };

  const handleSaveRole = async (values) => {
    setSavingRole(true);
    try {
      const payload = {
        ...values,
        permissions: editingRole
          ? editingRole.permissions || []
          : toRolePayload(createPermissionTemplate()),
      };

      if (editingRole) {
        const response = await updateRole(editingRole._id, payload);
        const savedRole = extractRoleRecord(response);
        if (savedRole?._id) {
          setRoles((prev) =>
            prev.map((role) => (role._id === savedRole._id ? { ...role, ...savedRole } : role)),
          );
        }
        message.success("Role updated successfully");
      } else {
        const response = await createRole(payload);
        const savedRole = extractRoleRecord(response);
        if (savedRole?._id) {
          setRoles((prev) => {
            const exists = prev.some((role) => role._id === savedRole._id);
            if (exists) {
              return prev.map((role) => (role._id === savedRole._id ? { ...role, ...savedRole } : role));
            }

            return [savedRole, ...prev];
          });
        }
        message.success("Role created successfully");
      }

      setRoleModalOpen(false);
      form.resetFields();
      await loadRoles();
    } catch (error) {
      message.error(error?.message || "Failed to save role");
    } finally {
      setSavingRole(false);
    }
  };

  const handleDeleteRole = async (roleId) => {
    try {
      await deleteRole(roleId);
      message.success("Role deleted successfully");
      await Promise.all([loadRoles(), loadUsers()]);
    } catch (error) {
      message.error(error?.message || "Failed to delete role");
    }
  };

  const handleCreateUser = async (values) => {
    setSavingUser(true);
    try {
      const permissions = toRolePayload(normalizePermissionsState(accountPermissionState));
      if (values.accountType === "employee") {
        const payload = {
          name: values.name,
          email: values.email,
          phone: values.phone || "",
          designation: values.designation,
          status: values.status || "active",
          courseIds: values.courseIds || [],
          attendanceBatchIds: values.attendanceBatchIds || [],
          profile: values.profile?.fileList || values.profile || [],
          permissions,
        };
        if (values.password) payload.password = values.password;

        if (editingUser) {
          await updateEmployee(editingUser._id, payload);
          message.success("Employee account updated successfully");
        } else {
          await createEmployee(payload);
          message.success("Employee account created successfully");
        }
      } else {
        const payload = {
          name: values.name,
          email: values.email,
          roleId: values.roleId,
          attendanceBatchIds: values.attendanceBatchIds || [],
          permissions,
        };
        if (values.password) payload.password = values.password;

        if (editingUser) {
          await updateAdminInfo(editingUser._id, payload);
          message.success("User updated successfully");
        } else {
          await createNewAdmin({ ...payload, password: values.password });
          message.success("User created successfully");
        }
      }

      setUserModalOpen(false);
      setEditingUser(null);
      userForm.resetFields();
      await Promise.all([loadUsers(), loadRoles(), loadEmployeeRecords()]);
    } catch (error) {
      message.error(error?.message || "Failed to save user");
    } finally {
      setSavingUser(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    try {
      const user = users.find((item) => item._id === userId);
      if (isEmployeeAccount(user)) {
        await deleteEmployee(userId);
      } else {
        await deleteAdmin(userId);
      }
      message.success("User deleted successfully");
      await Promise.all([loadUsers(), loadEmployeeRecords()]);
    } catch (error) {
      message.error(error?.message || "Failed to delete user");
    }
  };

  const handleSavePermissionPanel = async () => {
    if (!activePermissionRole) return;

    setSavingPermissionPanel(true);
    try {
      await updateRole(activePermissionRole._id, {
        name: activePermissionRole.name,
        description: activePermissionRole.description || "",
        permissions: toRolePayload(permissionEditorState),
      });

      message.success("Permissions updated successfully");
      const [, refreshedUsers] = await Promise.all([loadRoles(), loadUsers()]);

      if (selectedUser?.roleId === activePermissionRole._id) {
        const refreshedUser = refreshedUsers.find((user) => user._id === selectedUser._id);
        if (refreshedUser) {
          setSelectedUser(refreshedUser);
        }
      }
    } catch (error) {
      message.error(error?.message || "Failed to update permissions");
    } finally {
      setSavingPermissionPanel(false);
    }
  };

  const handleSaveUserAccess = async () => {
    if (!selectedUser) return;

    setSavingUserAccess(true);
    try {
      const normalizedPermissions = normalizePermissionsState(userPermissionEditorState);

      await updateAdminInfo(selectedUser._id, {
        name: selectedUser.name,
        email: selectedUser.email,
        roleId: selectedUser.isSuperAdmin ? selectedUser.roleId : selectedUser.roleId || null,
        permissions: toRolePayload(normalizedPermissions),
      });

      message.success("User access updated successfully");
      const [, refreshedUsers] = await Promise.all([loadRoles(), loadUsers()]);
      const refreshedUser = refreshedUsers.find((user) => user._id === selectedUser._id);

      if (refreshedUser) {
        setSelectedUser(refreshedUser);
      } else {
        setSelectedUser((prev) =>
          prev
            ? {
                ...prev,
                permissions: normalizedPermissions,
              }
            : prev,
        );
      }

      if (selectedUser.roleId) {
        setActivePermissionRoleId(selectedUser.roleId);
      }
    } catch (error) {
      message.error(error?.message || "Failed to update user access");
    } finally {
      setSavingUserAccess(false);
    }
  };

  const customRoleOptions = useMemo(
    () =>
      roles
        .filter((role) => !role.isSystem)
        .map((role) => ({ label: role.name, value: role._id })),
    [roles],
  );

  const visibleRoles = useMemo(
    () => roles.filter((role) => shouldShowRoleInTable(role)),
    [roles],
  );

  const managedRoles = useMemo(
    () => roles.filter((role) => !role.isSystem),
    [roles],
  );

  const visibleUsers = useMemo(
    () => users.filter((user) => shouldShowUserInTable(user, roles)),
    [users, roles],
  );

  const overviewCards = useMemo(() => {
    const activeUsers = visibleUsers.filter((user) => user.isActive).length;
    const activeModules = RBAC_MODULES.filter((moduleKey) =>
      visibleRoles.some((role) => buildPermissionsFromRole(role)?.[moduleKey]?.view),
    ).length;

    return [
      {
        label: "Total Roles",
        value: visibleRoles.length,
        note: "Available access roles",
      },
      {
        label: "Total Users",
        value: visibleUsers.length,
        note: "Accounts managed here",
      },
      {
        label: "Active Users",
        value: activeUsers,
        note: "Users currently enabled",
      },
      {
        label: "Active Modules",
        value: activeModules,
        note: "Modules assigned to roles",
      },
    ];
  }, [visibleRoles, visibleUsers]);

  const moduleOverviewCards = useMemo(
    () =>
      RBAC_MODULES.map((moduleKey) => ({
        moduleKey,
        roleCount: visibleRoles.filter((role) => buildPermissionsFromRole(role)?.[moduleKey]?.view)
          .length,
      })),
    [visibleRoles],
  );

  const roleColumns = [
    {
      title: "Role",
      dataIndex: "name",
      key: "name",
      render: (value, record) => (
        <Space>
          <span className="font-semibold text-primary">{value}</span>
          {record.isSystem ? <Tag color="blue">System</Tag> : null}
        </Space>
      ),
    },
    {
      title: "Description",
      dataIndex: "description",
      key: "description",
      render: (value) => value || "No description",
    },
    {
      title: "Users",
      dataIndex: "userCount",
      key: "userCount",
    },
    {
      title: "Modules",
      key: "modules",
      render: (_, record) => countEnabledModules(buildPermissionsFromRole(record)),
    },
    {
      title: "Access Preview",
      key: "preview",
      render: (_, record) => {
        const previewModules = getRolePreviewModules(record);

        if (!previewModules.length) {
          return <span className="text-slate-400">No modules assigned</span>;
        }

        return (
          <div className="flex flex-wrap gap-1">
            {previewModules.slice(0, 3).map((moduleKey) => (
              <Tag key={moduleKey} color="geekblue">
                {moduleLabels[moduleKey]}
              </Tag>
            ))}
            {previewModules.length > 3 ? (
              <Tag color="default">+{previewModules.length - 3} more</Tag>
            ) : null}
          </div>
        );
      },
    },
    {
      title: "Actions",
      key: "actions",
      render: (_, record) => {
        const deletable = canDeleteRole(record);

        return (
          <Space wrap>
            <Button
              size="small"
              className="!border-primary !text-primary hover:!border-primary hover:!text-primary"
              icon={<EyeOutlined />}
              onClick={() => {
                setSelectedRole(record);
                setViewRoleOpen(true);
              }}
            >
              View
            </Button>
            <Button size="small" onClick={() => openEditModal(record)}>
              Edit
            </Button>
            <Button
              size="small"
              icon={<SafetyOutlined />}
              onClick={() => {
                setSection("permissions");
                setActivePermissionRoleId(record._id);
              }}
            >
              Permissions
            </Button>
            {deletable ? (
              <Button
                size="small"
                danger
                onClick={() => handleDeleteRole(record._id)}
              >
                Delete
              </Button>
            ) : null}
          </Space>
        );
      },
    },
  ];

  const userColumns = [
    {
      title: "User",
      dataIndex: "name",
      key: "name",
      render: (value, record) => (
        <Space>
          <span className="font-semibold text-primary">{value}</span>
          {record.isSuperAdmin ? <Tag color="gold">Super Admin</Tag> : null}
        </Space>
      ),
    },
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
    },
    {
      title: "Assigned Role",
      key: "role",
      render: (_, record) => {
        if (record.isSuperAdmin) {
          return (
            <Tag color="gold" className="!px-3 !py-1">
              Super Admin
            </Tag>
          );
        }
        if (isEmployeeAccount(record)) {
          return (
            <Tag color="cyan" className="!px-3 !py-1">
              Employee{record.details?.job ? ` · ${record.details.job}` : ""}
            </Tag>
          );
        }

        return (
          <span className="text-sm text-slate-700">
            {record.role || "No role assigned"}
          </span>
        );
      },
    },
    {
      title: "Status",
      key: "status",
      render: (_, record) => (
        <Switch
          checked={record.isActive}
          className="theme-switch"
          style={{
            backgroundColor: record.isActive ? "var(--primary-color, #01134c)" : "#d1d5db",
          }}
          onChange={async (checked) => {
            if (record.isSuperAdmin && checked === false) {
              Modal.warning({
                title: "Super Admin Cannot Be Deactivated",
                content:
                  "Your account is inactive. Please contact the super admin.",
                okText: "Close",
              });
              return;
            }

            try {
              await updateUserStatus(record._id, checked);
              message.success("User status updated");
              await loadUsers();
            } catch (error) {
              message.error(error?.message || "Failed to update status");
            }
          }}
        />
      ),
    },
    {
      title: "Last Login",
      dataIndex: "lastLogin",
      key: "lastLogin",
      render: (value) => (value ? new Date(value).toLocaleString() : "Never"),
    },
    {
      title: "Actions",
      key: "actions",
      render: (_, record) => (
        <Space wrap>
          <Button
            size="small"
            className="!border-primary !text-primary hover:!border-primary hover:!text-primary"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedUser(record);
              setViewUserId(String(record._id));
              setSearchParams({
                section: "roles",
                view: "user",
                userId: String(record._id),
              });
            }}
          >
            View
          </Button>
          <Button
            size="small"
            className="!border-primary !text-primary hover:!border-primary hover:!text-primary"
            icon={<EditOutlined />}
            onClick={() => openEditUserModal(record)}
          >
            Edit
          </Button>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            disabled={record.isSuperAdmin}
            onClick={() => {
              Modal.confirm({
                title: "Delete User?",
                content: `Are you sure you want to delete ${record.name}? This action cannot be undone.`,
                okText: "Yes, Delete",
                cancelText: "Cancel",
                okButtonProps: {
                  danger: true,
                },
                onOk: () => handleDeleteUser(record._id),
              });
            }}
          >
            Delete
          </Button>
        </Space>
      ),
    },
  ];

  const permissionColumns = [
    {
      title: "Role",
      dataIndex: "name",
      key: "name",
      render: (value, record) => (
        <button
          type="button"
          onClick={() => setActivePermissionRoleId(record._id)}
          className="text-left font-semibold text-primary underline-offset-4 hover:underline"
        >
          {value}
        </button>
      ),
    },
    {
      title: "Assigned Users",
      dataIndex: "userCount",
      key: "userCount",
    },
    {
      title: "Enabled Modules",
      key: "modules",
      render: (_, record) => countEnabledModules(buildPermissionsFromRole(record)),
    },
    {
      title: "Visible Modules",
      key: "preview",
      width: 280,
      render: (_, record) => {
        const previewModules = getRolePreviewModules(record);
        return (
          <div className="grid grid-cols-2 gap-2 min-w-[240px]">
            {previewModules.length ? (
              previewModules.map((moduleKey) => (
                <div key={moduleKey} className="min-w-0">
                  <Tag color="blue" className="m-0 inline-flex max-w-full truncate">
                    {moduleLabels[moduleKey]}
                  </Tag>
                </div>
              ))
            ) : (
              <span className="text-slate-400">No modules assigned</span>
            )}
          </div>
        );
      },
    },
    {
      title: "Action",
      key: "action",
      render: (_, record) => (
        <Button
          size="small"
          type={record._id === activePermissionRoleId ? "primary" : "default"}
          onClick={() => setActivePermissionRoleId(record._id)}
        >
          Manage
        </Button>
      ),
    },
  ];

  const overviewRoleColumns = [
    {
      title: "Role",
      dataIndex: "name",
      key: "name",
      render: (value) => <span className="font-semibold text-primary">{value}</span>,
    },
    {
      title: "Users",
      dataIndex: "userCount",
      key: "userCount",
    },
    {
      title: "Modules",
      key: "modules",
      render: (_, record) => countEnabledModules(buildPermissionsFromRole(record)),
    },
    {
      title: "Preview",
      key: "preview",
      render: (_, record) => {
        const previewModules = getRolePreviewModules(record);
        return previewModules.length ? (
          <div className="flex flex-wrap gap-1">
            {previewModules.slice(0, 2).map((moduleKey) => (
              <Tag key={moduleKey} color="blue">
                {moduleLabels[moduleKey]}
              </Tag>
            ))}
          </div>
        ) : (
          <span className="text-slate-400">No modules assigned</span>
        );
      },
    },
  ];

  const overviewUserColumns = [
    {
      title: "User",
      dataIndex: "name",
      key: "name",
      render: (value) => <span className="font-semibold text-primary">{value}</span>,
    },
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
    },
    {
      title: "Role",
      dataIndex: "role",
      key: "role",
      render: (value) => value || "No role",
    },
    {
      title: "Status",
      key: "status",
      render: (_, record) => (
        <Tag color={record.isActive ? "green" : "red"}>
          {record.isActive ? "Active" : "Inactive"}
        </Tag>
      ),
    },
  ];

  const renderOverviewWorkspace = () => (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="m-0 text-lg font-ArialBold text-primary">Super Admin Dashboard</h3>
            <p className="m-0 mt-1 text-sm text-slate-500">
              Overview of roles, users, active modules, and system access
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="primary"
              onClick={() => {
                setSection("roles");
                setActiveRolesView("users");
                openCreateUserModal();
              }}
            >
              Create Account
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => Promise.all([loadRoles(), loadUsers()])}>
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {overviewCards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="text-sm text-slate-500">{card.label}</div>
            <div className="mt-2 text-3xl font-ArialBold text-primary">{card.value}</div>
            <div className="mt-1 text-xs text-slate-400">{card.note}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {moduleOverviewCards.map((item) => (
          <div
            key={item.moduleKey}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="text-sm text-slate-500">{moduleLabels[item.moduleKey]}</div>
            <div className="mt-2 text-2xl font-ArialBold text-primary">{item.roleCount}</div>
            <div className="mt-1 text-xs text-slate-400">roles using this module</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card
          title="Role Snapshot"
          extra={
            <Button size="small" onClick={() => setSection("roles")}>
              Open Roles
            </Button>
          }
          className="rounded-2xl shadow-sm"
        >
          <Table
            rowKey="_id"
            columns={overviewRoleColumns}
            dataSource={visibleRoles}
            loading={loadingRoles}
            pagination={overviewTablePagination}
            size="small"
          />
        </Card>

        <Card
          title="User Snapshot"
          extra={
            <Button size="small" onClick={() => setSection("roles")}>
              Open Users
            </Button>
          }
          className="rounded-2xl shadow-sm"
        >
          <Table
            rowKey="_id"
            columns={overviewUserColumns}
            dataSource={visibleUsers}
            loading={loadingUsers}
            pagination={overviewTablePagination}
            size="small"
          />
        </Card>
      </div>
    </div>
  );

  const renderRolesWorkspace = () => (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="m-0 text-lg font-ArialBold text-primary">Roles and Users</h3>
            <p className="m-0 mt-1 text-sm text-slate-500">
              Create roles, assign users, and manage access from one workspace
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button icon={<ReloadOutlined />} onClick={() => Promise.all([loadRoles(), loadUsers()])}>
              Refresh
            </Button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {rolesViewOptions.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveRolesView(item.key)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition-all ${
                activeRolesView === item.key
                  ? "border-primary bg-primary text-accent"
                  : "border-slate-200 bg-white text-slate-600 hover:border-primary hover:text-primary"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {activeRolesView === "roles" ? (
        <Card
          title="Roles Table"
          extra={
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              <span className="text-accent">Create Role</span>
            </Button>
          }
          className="rounded-2xl shadow-sm"
        >
          <Table
            rowKey="_id"
            columns={roleColumns}
            dataSource={visibleRoles}
            loading={loadingRoles}
            sticky
            scroll={tableScrollConfig}
            pagination={{ pageSize: 6 }}
          />
        </Card>
      ) : (
        <Card
          title="Users Table"
          extra={
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateUserModal}>
                <span className="text-accent">Create Account</span>
            </Button>
          }
          className="rounded-2xl shadow-sm"
        >
          <Table
            rowKey="_id"
            columns={userColumns}
            dataSource={visibleUsers}
            loading={loadingUsers}
            sticky
            scroll={tableScrollConfig}
            pagination={{ pageSize: 6 }}
          />
        </Card>
      )}
    </div>
  );

  const renderPermissionsWorkspace = () => (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="m-0 text-lg font-ArialBold text-primary">Permissions Center</h3>
            <p className="m-0 mt-1 text-sm text-slate-500">
              Select a role, then enable modules and actions from the permission panel
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button icon={<ReloadOutlined />} onClick={loadRoles}>
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <Card
          title="Permission Roles"
          className="rounded-2xl shadow-sm xl:w-[42%] xl:min-w-[560px] xl:max-w-[680px]"
          bodyStyle={{ paddingBottom: 8 }}
        >
          <Table
            rowKey="_id"
            columns={permissionColumns}
            dataSource={managedRoles}
            loading={loadingRoles}
            sticky
            pagination={{ pageSize: 6 }}
          />
        </Card>

        <Card
          className="min-w-0 flex-1 rounded-2xl shadow-sm"
          bodyStyle={{ padding: 0 }}
        >
          <div className="max-h-[72vh] overflow-y-auto rounded-t-2xl">
            <div className="sticky top-0 z-20 rounded-t-2xl border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-lg font-ArialBold text-primary">
                    {activePermissionRole ? `${activePermissionRole.name} Permissions` : "Permissions Preview"}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {activePermissionRole
                      ? activePermissionRole.description || "No description added for this role"
                      : "Select or create a role, then manage module access from here."}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {activePermissionRole ? (
                    <>
                      <Tag color="blue">{activePermissionRole.userCount || 0} users</Tag>
                      <Tag color="geekblue">
                        {countEnabledModules(permissionEditorState)} modules enabled
                      </Tag>
                      <Button
                        type="primary"
                        loading={savingPermissionPanel}
                        className="!bg-primary !border-primary hover:!bg-[#0e215fc7]"
                        onClick={handleSavePermissionPanel}
                      >
                        <span className="text-accent">Save Permissions</span>
                      </Button>
                    </>
                  ) : (
                    <Tag color="default">All modules visible</Tag>
                  )}
                </div>
              </div>
            </div>

            <div className="p-5">
              <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-base font-ArialBold text-primary">
                      {activePermissionRole ? activePermissionRole.name : "Module Access"}
                    </div>
                    <div className="text-sm text-slate-500">
                      {activePermissionRole
                        ? "Enable modules and choose actions for this role"
                        : "All modules are shown below. Select a role from the left table to save access."}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {activePermissionRole ? (
                      <>
                        <Tag color="blue">{activePermissionRole.userCount || 0} users</Tag>
                        <Tag color="geekblue">
                          {countEnabledModules(permissionEditorState)} modules enabled
                        </Tag>
                      </>
                    ) : (
                      <Tag color="blue">{RBAC_MODULES.length} modules available</Tag>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {RBAC_MODULES.map((moduleKey) => (
                  <PermissionModuleCard
                    key={moduleKey}
                    moduleKey={moduleKey}
                    permissions={permissionEditorState}
                    setPermissions={setPermissionEditorState}
                  />
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );

  const renderFinanceWorkspace = () => {
    const periodLabel = financeData?.period?.label || "Selected Month";
    const balances = financeData?.balances || {};
    const feePayments = financeData?.feePayments || {};
    const installments = financeData?.installments || {};
    const accounting = financeData?.accounting || {};
    const trends = financeData?.monthWise || [];
    const recentPayments = financeData?.recentPayments || [];

    const summaryCards = [
      {
        key: "balance",
        title: "Total Current Balance",
        value: balances.totalCurrentBalance || 0,
        color: "#0f766e",
      },
      {
        key: "collected",
        title: "Fee Collected",
        value: feePayments.totalCollected || 0,
        color: "#1d4ed8",
      },
      {
        key: "pending",
        title: "Pending Installments",
        value: installments.totalPendingInstallmentAmount || 0,
        color: "#b45309",
      },
      {
        key: "net",
        title: "Net Income / Expense",
        value: accounting.netBalance || 0,
        color: accounting.netBalance >= 0 ? "#166534" : "#b91c1c",
      },
    ];

    const recentPaymentColumns = [
      {
        title: "Receipt",
        dataIndex: "receiptNo",
        key: "receiptNo",
        render: (value) => <span className="font-mono text-xs">{value}</span>,
      },
      {
        title: "Student",
        key: "student",
        render: (_, record) => record.student?.studentName || "Unknown",
      },
      {
        title: "Course",
        key: "course",
        render: (_, record) => record.course?.courseName || "Unknown",
      },
      {
        title: "Amount",
        dataIndex: "amount",
        key: "amount",
        render: (value) => `Rs ${Number(value || 0).toLocaleString()}`,
      },
      {
        title: "Status",
        dataIndex: "status",
        key: "status",
        render: (value) => <Tag color={value === "Completed" ? "green" : value === "Pending" ? "orange" : "red"}>{value}</Tag>,
      },
      {
        title: "Date",
        dataIndex: "paymentDate",
        key: "paymentDate",
        render: (value) => (value ? new Date(value).toLocaleDateString() : "-"),
      },
    ];

    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="m-0 text-lg font-ArialBold text-primary">Finance Monitor</h3>
              <p className="m-0 mt-1 text-sm text-slate-500">
                Super admin monthly view of balances, installments, income, and expenses
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <DatePicker
                picker="month"
                value={financeMonth}
                onChange={(value) => value && setFinanceMonth(value)}
                allowClear={false}
              />
              <Button icon={<ReloadOutlined />} onClick={() => loadFinanceMonitor(financeMonth)}>
                Refresh
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <div key={card.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <Statistic
                title={<span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.title}</span>}
                value={card.value}
                precision={0}
                formatter={(value) => `Rs ${Number(value || 0).toLocaleString()}`}
                valueStyle={{ color: card.color, fontWeight: 700 }}
              />
              <div className="mt-2 text-xs text-slate-400">{periodLabel}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card title={`Installment Status - ${periodLabel}`} loading={financeLoading} className="rounded-2xl shadow-sm">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-400">Installment Amount</div>
                <div className="mt-1 text-lg font-ArialBold text-primary">
                  Rs {Number(installments.totalInstallmentAmount || 0).toLocaleString()}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-400">Paid Installments</div>
                <div className="mt-1 text-lg font-ArialBold text-green-700">
                  Rs {Number(installments.totalInstallmentPaidAmount || 0).toLocaleString()}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-400">Pending Count</div>
                <div className="mt-1 text-lg font-ArialBold text-amber-700">
                  {Number(installments.pendingCount || 0).toLocaleString()}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-400">Overdue Count</div>
                <div className="mt-1 text-lg font-ArialBold text-red-700">
                  {Number(installments.overdueCount || 0).toLocaleString()}
                </div>
              </div>
            </div>
          </Card>

          <Card title={`Accounting Summary - ${periodLabel}`} loading={financeLoading} className="rounded-2xl shadow-sm">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-400">Income</div>
                <div className="mt-1 text-lg font-ArialBold text-green-700">
                  Rs {Number(accounting.totalIncome || 0).toLocaleString()}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-400">Expense</div>
                <div className="mt-1 text-lg font-ArialBold text-red-700">
                  Rs {Number(accounting.totalExpense || 0).toLocaleString()}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-400">Net</div>
                <div className="mt-1 text-lg font-ArialBold text-primary">
                  Rs {Number(accounting.netBalance || 0).toLocaleString()}
                </div>
              </div>
            </div>
          </Card>
        </div>

        <Card title="Month-wise Trend" loading={financeLoading} className="rounded-2xl shadow-sm">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {trends.length ? (
              trends.map((item) => (
                <div key={item.month} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-base font-ArialBold text-primary">{item.month}</div>
                  <div className="mt-3 space-y-2 text-sm text-slate-600">
                    <div>Fee Collected: Rs {Number(item.feeCollected || 0).toLocaleString()}</div>
                    <div>Income: Rs {Number(item.income || 0).toLocaleString()}</div>
                    <div>Expense: Rs {Number(item.expense || 0).toLocaleString()}</div>
                    <div>Pending Installments: Rs {Number(item.pendingInstallmentAmount || 0).toLocaleString()}</div>
                  </div>
                </div>
              ))
            ) : (
              <Empty description="No finance trend data available" />
            )}
          </div>
        </Card>

        <Card title="Recent Payments" loading={financeLoading} className="rounded-2xl shadow-sm">
          <Table
            rowKey="_id"
            columns={recentPaymentColumns}
            dataSource={recentPayments}
            pagination={{ pageSize: 6 }}
            scroll={tableScrollConfig}
          />
        </Card>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {!isUserDetailsPage ? (
        <>
          {currentSection === "overview" && renderOverviewWorkspace()}
          {currentSection === "roles" && renderRolesWorkspace()}
          {currentSection === "permissions" && renderPermissionsWorkspace()}
          {currentSection === "finance" && renderFinanceWorkspace()}
        </>
      ) : null}

      <Modal
        title={editingRole ? "Edit Role" : "Create New Role"}
        open={roleModalOpen}
        onCancel={() => setRoleModalOpen(false)}
        onOk={() => form.submit()}
        okText={editingRole ? "Save Changes" : "Save Role"}
        confirmLoading={savingRole}
        width={620}
        okButtonProps={{ className: "!bg-primary !border-primary hover:!bg-[#0e215fc7]" }}
      >
        <Form layout="vertical" form={form} onFinish={handleSaveRole}>
          <Form.Item
            name="name"
            label="Role Name"
            rules={[{ required: true, message: "Role name is required" }]}
          >
            <Input
              size="large"
              placeholder="e.g. Branch Manager"
              className="form-input"
            />
          </Form.Item>

          <Form.Item name="description" label="Description">
            <Input
              size="large"
              placeholder="Role summary for your team"
              className="form-input"
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingUser ? "Edit Account" : "Create Account"}
        open={userModalOpen}
        onCancel={() => {
          setUserModalOpen(false);
          setEditingUser(null);
        }}
        onOk={() => userForm.submit()}
        okText={editingUser ? "Update Account" : "Create Account"}
        confirmLoading={savingUser}
        width={1000}
        okButtonProps={{ className: "!bg-primary !border-primary hover:!bg-[#0e215fc7]" }}
      >
        <div className="max-h-[76vh] overflow-y-auto pr-2">
          <Form
            layout="vertical"
            form={userForm}
            onFinish={handleCreateUser}
            onValuesChange={(changedValues) => {
              if (Object.prototype.hasOwnProperty.call(changedValues, "roleId")) {
                const role = roles.find((item) => item._id === changedValues.roleId);
                setAccountPermissionState(
                  role ? buildPermissionsFromRole(role) : createPermissionTemplate(),
                );
              }
            }}
          >
            <Form.Item
              name="accountType"
              label="Account Type"
              rules={[{ required: true, message: "Account type is required" }]}
            >
              <Select
                size="large"
                disabled={Boolean(editingUser)}
                options={[
                  { label: "Employee / Teacher Account", value: "employee" },
                  { label: "Role-based Admin Account", value: "admin" },
                ]}
                className="form-input"
              />
            </Form.Item>

            <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
              <Form.Item
                name="name"
                label="Full Name"
                rules={[{ required: true, message: "Name is required" }]}
              >
                <Input size="large" placeholder="Enter full name" className="form-input" />
              </Form.Item>
              <Form.Item
                name="email"
                label="Email"
                rules={[
                  { required: true, message: "Email is required" },
                  { type: "email", message: "Enter a valid email" },
                ]}
              >
                <Input size="large" placeholder="Enter email address" className="form-input" />
              </Form.Item>

              {selectedAccountType === "employee" ? (
                <>
                  <Form.Item name="phone" label="Phone">
                    <Input size="large" placeholder="Phone number" className="form-input" />
                  </Form.Item>
                  <Form.Item
                    name="designation"
                    label="Designation / Role"
                    rules={[{ required: true, message: "Designation is required" }]}
                  >
                    <Input
                      size="large"
                      placeholder="Teacher, Coordinator, Instructor..."
                      className="form-input"
                    />
                  </Form.Item>
                  <Form.Item
                    name="status"
                    label="Account Status"
                    rules={[{ required: true, message: "Select an account status" }]}
                  >
                    <Select
                      size="large"
                      options={[
                        { label: "Active", value: "active" },
                        { label: "Inactive", value: "inactive" },
                      ]}
                      className="form-input"
                    />
                  </Form.Item>
                  <Form.Item
                    name="courseIds"
                    label={
                      <div className="flex w-full items-center justify-between gap-3">
                        <span>Assigned Courses</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-normal text-slate-500">
                            {selectedEmployeeCourseIds?.length || 0} selected
                          </span>
                          {selectedEmployeeCourseIds?.length ? (
                            <Button
                              type="link"
                              size="small"
                              className="!h-auto !p-0"
                              onClick={() => {
                                userForm.setFieldValue("courseIds", []);
                                userForm.setFieldValue("attendanceBatchIds", []);
                              }}
                            >
                              Clear
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    }
                  >
                    <Select
                      mode="multiple"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      maxTagCount={1}
                      maxTagPlaceholder={(omittedValues) => `+${omittedValues.length} more`}
                      optionRender={(option) => (
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={(selectedEmployeeCourseIds || []).some(
                              (courseId) => String(courseId) === String(option.value),
                            )}
                            readOnly
                            tabIndex={-1}
                            aria-hidden="true"
                            className="pointer-events-none accent-blue-600"
                          />
                          <span>{option.label}</span>
                        </div>
                      )}
                      options={courses.map((course) => ({
                        value: course._id,
                        label: `${course.courseName} (${course.courseId})`,
                      }))}
                      placeholder="Select courses for this employee"
                      className="form-input"
                      onChange={(courseIds) =>
                        userForm.setFieldValue(
                          "attendanceBatchIds",
                          getBatchIdsForCourseIds(batches, courseIds || []),
                        )
                      }
                    />
                  </Form.Item>
                  <Form.Item name="profile" label="Profile Picture">
                    <Upload
                      beforeUpload={beforeUploadEmployeeProfile}
                      maxCount={1}
                      listType="picture"
                    >
                      <Button icon={<UploadOutlined />}>Select JPG, PNG, or WEBP</Button>
                    </Upload>
                  </Form.Item>
                </>
              ) : (
                <Form.Item
                  name="roleId"
                  label="Assign Role"
                  rules={[{ required: true, message: "Role is required" }]}
                >
                  <Select
                    size="large"
                    options={customRoleOptions}
                    placeholder="Select a created role"
                    className="form-input role-select-theme"
                  />
                </Form.Item>
              )}

              <Form.Item
                label={
                  <div className="flex w-full items-center justify-between gap-3">
                    <span>Attendance Batches</span>
                    {selectedAccountType === "employee" && selectedEmployeeCourseIds?.length ? (
                      <span className="text-xs font-normal text-slate-500">Auto-assigned from courses</span>
                    ) : (
                      <Button
                        type="link"
                        size="small"
                        className="!h-auto !p-0"
                        onClick={() =>
                          userForm.setFieldValue(
                            "attendanceBatchIds",
                            batches.map((batch) => String(batch._id)),
                          )
                        }
                        disabled={!batches.length}
                      >
                        Select All Batches
                      </Button>
                    )}
                  </div>
                }
                extra={
                  selectedAccountType === "employee" && selectedEmployeeCourseIds?.length
                    ? "All batches belonging to the selected courses are automatically assigned for attendance."
                    : "Attendance access is limited to students in these batches. Clear the selection to disable attendance batch access."
                }
              >
                <Form.Item name="attendanceBatchIds" noStyle>
                  <Select
                    mode="multiple"
                    allowClear
                    showSearch
                    disabled={
                      selectedAccountType === "employee" &&
                      Boolean(selectedEmployeeCourseIds?.length)
                    }
                    optionFilterProp="label"
                    maxTagCount="responsive"
                    options={batches.map((batch) => ({
                      value: String(batch._id),
                      label: `${batch.batchName || "Batch"}${batch.batchCode ? ` (${batch.batchCode})` : ""}${batch.course?.courseName ? ` — ${batch.course.courseName}` : ""}`,
                    }))}
                    placeholder="Select batches this account can manage attendance for"
                    className="form-input"
                  />
                </Form.Item>
              </Form.Item>

              <Form.Item
                name="password"
                label="Password"
                rules={[
                  { required: !editingUser, message: "Password is required" },
                  { min: 6, message: "Minimum 6 characters" },
                ]}
              >
                <Input.Password
                  size="large"
                  placeholder={editingUser ? "Leave blank to keep current password" : "Create a secure password"}
                  className="form-input password-input"
                />
              </Form.Item>
            </div>

            <section className="mt-2">
              <div className="mb-3">
                <h3 className="m-0 text-lg font-ArialBold text-primary">Module Access & Permissions</h3>
                <p className="m-0 mt-1 text-sm text-slate-500">
                  This account can perform only the actions enabled below.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {RBAC_MODULES.map((moduleKey) => (
                  <PermissionModuleCard
                    key={moduleKey}
                    moduleKey={moduleKey}
                    permissions={accountPermissionState}
                    setPermissions={setAccountPermissionState}
                  />
                ))}
              </div>
            </section>
          </Form>
        </div>
      </Modal>

      {isUserDetailsPage ? (
        <section className="mx-auto w-full max-w-[1680px] space-y-6 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:p-6 xl:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
            <div>
              <h2 className="m-0 text-2xl font-ArialBold leading-8 text-primary">User Details</h2>
              <p className="m-0 mt-1 text-sm leading-6 text-slate-500">
                Review the account and manage its permissions.
              </p>
            </div>
            <Button
              onClick={() => {
                setSelectedUser(null);
                setSearchParams({ section: "roles", view: "users" });
              }}
            >
              Back to Users
            </Button>
          </div>
        {selectedUser ? (
          <div className="min-w-0">
            <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 md:p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="m-0 break-words text-xl font-ArialBold leading-7 text-primary">
                      {selectedUser.name}
                    </h3>
                    {selectedUser.isSuperAdmin ? <Tag color="gold">Super Admin</Tag> : null}
                  </div>
                  <p className="m-0 mt-2 break-all text-sm text-slate-500">{selectedUser.email}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Tag className="m-0" color={selectedUser.isActive ? "green" : "red"}>
                    {selectedUser.isActive ? "Active" : "Inactive"}
                  </Tag>
                  <Tag className="m-0" color="blue">
                    {getEnabledUserModules(userPermissionEditorState || {}).length} Modules Enabled
                  </Tag>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="flex min-h-[112px] min-w-0 flex-col justify-center rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Assigned Role</div>
                {selectedUser.isSuperAdmin ? (
                  <div className="mt-1 text-base font-ArialBold text-primary">Super Admin</div>
                ) : isEmployeeAccount(selectedUser) ? (
                  <div className="mt-2">
                    <Tag color="cyan">Employee</Tag>
                    <span className="text-sm text-slate-600">
                      {selectedUser.details?.job || "No designation"}
                    </span>
                  </div>
                ) : (
                  <Select
                    value={selectedUser.roleId || undefined}
                    options={customRoleOptions}
                    placeholder="Select a created role"
                    className="mt-2 w-full role-select-theme"
                    onChange={(value) =>
                      setSelectedUser((prev) =>
                        prev
                          ? {
                              ...prev,
                              roleId: value,
                              role:
                                customRoleOptions.find((option) => option.value === value)?.label ||
                                prev.role,
                            }
                          : prev,
                      )
                    }
                  />
                )}
              </div>
              <div className="flex min-h-[112px] min-w-0 flex-col justify-center rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Account Type</div>
                <div className="mt-2 break-words text-base font-ArialBold text-primary">
                  {selectedUser.isSuperAdmin
                    ? "Super Admin"
                    : isEmployeeAccount(selectedUser)
                    ? "Employee Account"
                    : "Role-based Admin"}
                </div>
              </div>
              <div className="flex min-h-[112px] min-w-0 flex-col justify-center rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Last Login</div>
                <div className="mt-2 break-words text-base font-ArialBold text-primary">
                  {selectedUser.lastLogin
                    ? new Date(selectedUser.lastLogin).toLocaleString()
                    : "Never"}
                </div>
              </div>
              <div className="flex min-h-[112px] min-w-0 flex-col justify-center rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Created</div>
                <div className="mt-2 break-words text-base font-ArialBold text-primary">
                  {selectedUser.createdAt
                    ? new Date(selectedUser.createdAt).toLocaleString()
                    : "Not available"}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 md:p-6">
              <div className="mb-5 flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-lg font-ArialBold leading-7 text-primary">Assigned Module Access</div>
                  <div className="mt-1 text-sm leading-6 text-slate-500">
                    Manage this user&apos;s modules and permission actions from here
                  </div>
                </div>
                {!selectedUser.isSuperAdmin ? (
                  <Button
                    type="primary"
                    loading={savingUserAccess}
                    className="!bg-primary !border-primary hover:!bg-[#0e215fc7]"
                    onClick={handleSaveUserAccess}
                  >
                    <span className="text-accent">Save User Access</span>
                  </Button>
                ) : null}
              </div>

              <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {RBAC_MODULES.map((moduleKey) => {
                  const moduleEnabled = userPermissionEditorState?.[moduleKey]?.view === true;
                  const enabledActions = getEnabledUserActions(userPermissionEditorState || {}, moduleKey);
                  const moduleVisual = moduleVisuals[moduleKey];
                  const ModuleIcon = moduleVisual.icon;

                  return (
                    selectedUser.isSuperAdmin ? (
                      <div
                        key={moduleKey}
                        className={`flex h-full min-h-[258px] min-w-0 flex-col rounded-2xl border border-slate-200 border-t-4 p-5 shadow-sm ${moduleAccentClasses[moduleVisual.accent]}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${moduleIconClasses[moduleVisual.accent]}`}>
                              <ModuleIcon size={19} strokeWidth={2} />
                            </span>
                            <div>
                              <div className="text-base font-ArialBold text-primary">
                                {moduleLabels[moduleKey]}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {moduleEnabled ? "Module access enabled" : "Module access not enabled"}
                              </div>
                            </div>
                          </div>
                          <Tag color={moduleEnabled ? "green" : "default"}>
                            {moduleEnabled ? "Enabled" : "Disabled"}
                          </Tag>
                        </div>

                        <div className="mt-auto flex min-h-[54px] flex-wrap content-start gap-2 pt-4">
                          {enabledActions.length ? (
                            enabledActions.map((action) => (
                              <Tag key={action} color="blue">
                                {formatActionLabel(action)}
                              </Tag>
                            ))
                          ) : (
                            <span className="text-sm text-slate-400">No permissions assigned</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <PermissionModuleCard
                        key={moduleKey}
                        moduleKey={moduleKey}
                        permissions={userPermissionEditorState}
                        setPermissions={setUserPermissionEditorState}
                      />
                    )
                  );
                })}
              </div>
            </div>
          </div>
          </div>
        ) : null}
        </section>
      ) : null}

      <Modal
        title="Role Details"
        open={viewRoleOpen}
        footer={null}
        onCancel={() => {
          setViewRoleOpen(false);
          setSelectedRole(null);
        }}
        width={780}
      >
        {selectedRole ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h3 className="m-0 text-xl font-ArialBold text-primary">{selectedRole.name}</h3>
            <p className="m-0 mt-2 text-sm leading-6 text-slate-500">
              {selectedRole.description || "No description added for this role"}
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default SuperAdmin;
