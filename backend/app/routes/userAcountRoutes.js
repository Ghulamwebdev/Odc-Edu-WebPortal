import express from "express";
import {
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
} from "../controller/userAccountcontroller.js";
import authMiddleware from "../midlewear/authMiddleware.js";
import requireAuth from "../midlewear/requireAuth.js";
import superAdminOnly from "../midlewear/superAdminOnly.js";
import multer from "multer";

const accountRoute = express.Router();

// Set up multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

accountRoute.get("/account-info/:id", authMiddleware, requireAuth, getUserAccount);
accountRoute.put(
  "/account-update/:id",
  authMiddleware,
  requireAuth,
  upload.single("profile"),
  updateUserAccount,
);
accountRoute.delete("/account-delete/:id", authMiddleware, requireAuth, deleteUserAccount);
accountRoute.put("/complete-profile/:id", authMiddleware, requireAuth, completeUserProfile);
accountRoute.get("/getAllProfilesInfo", authMiddleware, requireAuth, getAllProfileData);
accountRoute.put("/:id/role", authMiddleware, requireAuth, superAdminOnly, updateUserRole);
accountRoute.put("/:id/status", authMiddleware, requireAuth, superAdminOnly, updateUserStatus);
accountRoute.get("/me/permissions", authMiddleware, requireAuth, getMyPermissions);
accountRoute.get("/student-portal-accounts", authMiddleware, requireAuth, superAdminOnly, listStudentPortalAccounts);
accountRoute.delete("/student-portal-accounts", authMiddleware, requireAuth, superAdminOnly, deleteAllStudentPortalAccounts);
accountRoute.post("/student-portal-accounts/preview", authMiddleware, requireAuth, superAdminOnly, previewStudentPortalAccounts);
accountRoute.post("/student-portal-accounts/bulk", authMiddleware, requireAuth, superAdminOnly, createStudentPortalAccounts);
accountRoute.patch("/student-portal-accounts/:id/status", authMiddleware, requireAuth, superAdminOnly, updateStudentPortalAccountStatus);

export { accountRoute };
