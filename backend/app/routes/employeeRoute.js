import express from "express";
import multer from "multer";
import authMiddleware from "../midlewear/authMiddleware.js";
import requireAuth from "../midlewear/requireAuth.js";
import superAdminOnly from "../midlewear/superAdminOnly.js";
import employeeOnly from "../midlewear/employeeOnly.js";
import authorize from "../midlewear/authorize.js";
import {
  changeMyEmployeePassword,
  createEmployee,
  deleteEmployee,
  getEmployeeRole,
  getMyEmployeeDashboard,
  getMyEmployeeProfile,
  listEmployees,
  setEmployeeModuleAccess,
  setEmployeeStatus,
  updateEmployee,
  updateMyEmployeeProfile,
} from "../controller/employeeController.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

router.use(authMiddleware, requireAuth);

router.get("/role", superAdminOnly, getEmployeeRole);
router.get("/", superAdminOnly, listEmployees);
router.post("/", superAdminOnly, upload.single("profile"), createEmployee);
router.patch("/:id/employee-module-access", superAdminOnly, setEmployeeModuleAccess);
router.put("/:id", superAdminOnly, upload.single("profile"), updateEmployee);
router.patch("/:id/status", superAdminOnly, setEmployeeStatus);
router.delete("/:id", superAdminOnly, deleteEmployee);

router.get("/me/profile", employeeOnly, getMyEmployeeProfile);
router.put("/me/profile", employeeOnly, upload.single("profile"), updateMyEmployeeProfile);
router.put("/me/password", employeeOnly, changeMyEmployeePassword);
router.get("/me/dashboard", employeeOnly, authorize("dashboard", "view"), getMyEmployeeDashboard);

export default router;
