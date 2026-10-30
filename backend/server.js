import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import connectDB from "./dbConnection/db.js";

// Routes
import authRout from "./app/routes/authRout.js";
import { accountRoute } from "./app/routes/userAcountRoutes.js";
import studentRoute from "./app/routes/studentRoute.js";
import announcementRoute from "./app/routes/announcementsRoute.js";
import couresRoute from "./app/routes/courseRoute.js";
import teacherRouter from "./app/routes/teacherRoute.js";
import enrollmentRoute from "./app/routes/enrollmentRoute.js";
import feeRoute from "./app/routes/feeRoute.js";
import batchRoute from "./app/routes/batchRoute.js";
import accountingRoute from "./app/routes/accountingRoute.js";
import attendanceRoute from "./app/routes/attendanceRoute.js";
import holidayRoute from "./app/routes/holidayRoute.js";
import roleRoutes from "./app/routes/roleRoutes.js";
import appSettingsRoutes from "./app/routes/appSettingsRoutes.js";
import employeeRoutes from "./app/routes/employeeRoute.js";
import testStudioRoutes from "./app/routes/testStudioRoute.js";
import { startTestStudioScheduler } from "./app/jobs/testStudioScheduler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localEnvPath = path.join(__dirname, ".env.local");
const envPath = path.join(__dirname, ".env");

dotenv.config({ path: localEnvPath });
dotenv.config({ path: envPath });

const app = express();

// ===== CORS =====
// Allow frontend domain
const allowedOrigins = [
  "https://odysseyacademy.education",
  "https://www.odysseyacademy.education",
  "http://localhost:5173",
  "http://localhost:3000",
  "https://staging.odysseyacademy.education",
  "http://staging.odysseyacademy.education",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(null, true); // Allow all origins for now
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Authorization"],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  }),
);

// ===== JSON Parser =====
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" })); // optional, if you receive form data

const uploadsDir = path.resolve(__dirname, process.env.UPLOADS_DIR || "./uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use("/uploads", express.static(uploadsDir));

// ===== Request Logger =====
app.use((req, res, next) => {
  console.log(`\n📨 [${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`   Body:`, req.body);
  }
  next();
});

// ===== Connect Database =====
connectDB();

// ===== Health Check Route =====
app.get("/health", (req, res) => {
  res.json({
    message: "ODC EDU APP Server is running!",
    status: "active",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// ===== API Routes (Backend) - MUST BE BEFORE STATIC FILES =====
app.use("/auth", authRout);
app.use("/user", accountRoute);
app.use("/student", studentRoute);
app.use("/announcement", announcementRoute);
app.use("/course", couresRoute);
app.use("/teacher", teacherRouter);
app.use("/enrollment", enrollmentRoute);
app.use("/fee", feeRoute);
app.use("/batch", batchRoute);
app.use("/accounting", accountingRoute);
app.use("/attendance", attendanceRoute);
app.use("/holiday", holidayRoute);
app.use("/roles", roleRoutes);
app.use("/settings", appSettingsRoutes);
app.use("/employees", employeeRoutes);
app.use("/test-studio", testStudioRoutes);

// ===== Serve Static Files (Built Frontend) AFTER API ROUTES =====
const publicPath = path.join(__dirname, "public");
const publicExists = fs.existsSync(publicPath);

if (publicExists) {
  app.use(express.static(publicPath));

  // ===== Fallback to SPA (React Router) =====
  app.use((req, res, next) => {
    // Skip SPA fallback for API routes
    if (
      req.path.startsWith("/auth") ||
      req.path.startsWith("/user") ||
      req.path.startsWith("/student") ||
      req.path.startsWith("/announcement") ||
      req.path.startsWith("/course") ||
      req.path.startsWith("/teacher") ||
      req.path.startsWith("/enrollment") ||
      req.path.startsWith("/fee") ||
      req.path.startsWith("/accounting") ||
      req.path.startsWith("/attendance") ||
      req.path.startsWith("/holiday") ||
      req.path.startsWith("/roles") ||
      req.path.startsWith("/settings") ||
      req.path.startsWith("/employees") ||
      req.path.startsWith("/test-studio") ||
      req.path.startsWith("/uploads") ||
      req.path.startsWith("/health")
    ) {
      return next();
    }

    // Check if it's a static file request
    if (
      req.path.match(
        /\.(js|css|png|jpg|gif|svg|woff|woff2|ttf|eot|webmanifest)$/,
      )
    ) {
      return next();
    }
    // Serve index.html for all other routes (SPA)
    res.sendFile(path.join(publicPath, "index.html"));
  });
}

// ===== 404 Handler =====
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// ===== Global Error Handler =====
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Internal Server Error" });
});

// ===== Start Server =====
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startTestStudioScheduler();
});
