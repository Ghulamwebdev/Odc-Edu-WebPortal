import mongoose from "mongoose";
import Role from "../modules/roleModule.js";
import { RBAC_ACTIONS, RBAC_MODULES } from "./rbacConstants.js";
import {
  createEmptyActions,
  createFullActions,
  createFullPermissionsMap,
  normalizePermissions,
} from "./rbacShape.js";

export { RBAC_ACTIONS, RBAC_MODULES } from "./rbacConstants.js";
export {
  createEmptyActions,
  createFullActions,
  createFullPermissionsMap,
  normalizePermissions,
} from "./rbacShape.js";

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

export const resolveRoleForUser = async (user) => {
  if (!user?.role) return null;

  if (typeof user.role === "object" && user.role?.permissions) {
    return user.role;
  }

  if (typeof user.role === "string" && isObjectId(user.role)) {
    return Role.findById(user.role).lean();
  }

  if (typeof user.role === "string") {
    const safeName = user.role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return Role.findOne({ name: new RegExp(`^${safeName}$`, "i") }).lean();
  }

  return null;
};

export const isLegacyAdminUser = (user, resolvedRole = null) => {
  if (typeof user?.role !== "string") {
    return false;
  }

  // Legacy full-access admins were stored directly as role strings like "admin".
  // New RBAC users store an ObjectId string in `role`, so they must use role permissions only.
  if (isObjectId(user.role)) {
    return false;
  }

  // If a real RBAC role document exists for this user, respect that role's permissions.
  if (resolvedRole?.permissions?.length) {
    return false;
  }

  const directRole = user.role.toLowerCase();
  return directRole === "admin";
};

export const buildPermissionsMap = (user, resolvedRole = null) => {
  if (user?.isSuperAdmin) {
    return createFullPermissionsMap();
  }

  if (isLegacyAdminUser(user, resolvedRole)) {
    return createFullPermissionsMap();
  }

  const role = resolvedRole || null;
  const permissionMap = RBAC_MODULES.reduce((acc, moduleKey) => {
    acc[moduleKey] = createEmptyActions();
    return acc;
  }, {});

  if (!role?.permissions?.length) {
    if (user?.permissions?.length) {
      normalizePermissions(user.permissions).forEach((permission) => {
        permissionMap[permission.module] = {
          ...createEmptyActions(),
          ...(permission.actions || {}),
        };
      });
    }

    return permissionMap;
  }

  normalizePermissions(role.permissions).forEach((permission) => {
    permissionMap[permission.module] = {
      ...createEmptyActions(),
      ...(permission.actions || {}),
    };
  });

  if (user?.accountType === "employee") {
    const employeePermission = user.permissions?.find(
      (permission) => permission?.module === "employees",
    );
    if (employeePermission) {
      permissionMap.employees = {
        ...permissionMap.employees,
        ...employeePermission.actions,
      };
    }
  }

  return permissionMap;
};

export const getModulePermission = (permissionsMap, moduleKey) =>
  permissionsMap?.[moduleKey] || createEmptyActions();

export const serializeRoleForClient = (user, resolvedRole = null) => {
  if (resolvedRole?.name) return resolvedRole.name;
  if (typeof user?.role === "string") return user.role;
  return "";
};
