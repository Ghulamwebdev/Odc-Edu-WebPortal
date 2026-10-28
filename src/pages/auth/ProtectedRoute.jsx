import { Navigate, useLocation } from "react-router-dom";
import useZustandStore from "../../stores/zustandStore";
import { getFirstAccessibleDashboardPath } from "../../config/rbac";

export default function ProtectedRoute({
  children,
  moduleKey = null,
  action = "view",
  superAdminOnly = false,
  employeeOnly = false,
  studentOnly = false,
}) {
  const location = useLocation();
  const { token, permissions, isSuperAdmin, adminInfo } = useZustandStore();
  const localToken = localStorage.getItem("token");
  const superAdminMode =
    isSuperAdmin === true || adminInfo?.userData?.isSuperAdmin === true;
  const roleName = adminInfo?.userData?.role || "";
  const employeeMode = String(roleName || "").toLowerCase() === "employee";
  const studentMode = String(roleName || "").toLowerCase() === "student";
  const employeeModulePaths = {
    "/dashboard/courses": "courses",
    "/dashboard/employees": "employees",
    "/dashboard/teachers": "employees",
    "/dashboard/test-studio": "test_studio",
    "/dashboard/students": "students",
    "/dashboard/certification": "certifications",
    "/dashboard/announcements": "announcements",
    "/dashboard/accounting": "accounting",
    "/dashboard/attendance": "attendance",
  };
  const employeeModulePath = Object.entries(employeeModulePaths).find(
    ([path]) => location.pathname === path || location.pathname.startsWith(`${path}/`),
  )?.[1];

  if (!token && !localToken) {
    return <Navigate to="/login" replace />;
  }

  if (employeeOnly) {
    return employeeMode ? children : <Navigate to="/dashboard/no-access" replace />;
  }

  if (studentOnly) {
    return studentMode ? children : <Navigate to="/dashboard/no-access" replace />;
  }

  if (studentMode && !studentOnly) {
    return <Navigate to="/student-portal" replace />;
  }

  if (employeeMode && !employeeOnly && !moduleKey && location.pathname !== "/dashboard/no-access") {
    const firstPath = getFirstAccessibleDashboardPath({
      permissions,
      isSuperAdmin: superAdminMode,
      role: roleName,
    });
    if (!employeeModulePath || permissions?.[employeeModulePath]?.view !== true) {
      return <Navigate to={firstPath || "/dashboard/no-access"} replace />;
    }
  }

  if (superAdminOnly && !superAdminMode) {
    const target = getFirstAccessibleDashboardPath({
      permissions,
      isSuperAdmin: superAdminMode,
      role: roleName,
    });
    return (
      <Navigate
        to={target || "/dashboard/no-access"}
        replace
      />
    );
  }

  if (moduleKey && !superAdminMode && permissions?.[moduleKey]?.[action] !== true) {
    const target = getFirstAccessibleDashboardPath({
      permissions,
      isSuperAdmin: superAdminMode,
      role: roleName,
    });

    if (!target) {
      return <Navigate to="/dashboard/no-access" replace />;
    }

    if (location.pathname === target) {
      return <Navigate to="/dashboard/no-access" replace />;
    }

    return <Navigate to={target} replace />;
  }

  return children;
}
