import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import DashboardLayout from "../layouts/DashboardLayout";
import Dashboard from "../pages/dashboard/Dashboard";
import Certification from "../pages/dashboard/Certification";
import Settings from "../pages/dashboard/Settings";
import ProtectedRoute from "../pages/auth/ProtectedRoute";
import Login from "../pages/auth/Login";
import Announcement from "../pages/dashboard/Announcement";
import HomePage from "../pages/website/pages/HomePage";
import Certifications from "../pages/website/pages/Certifications";
import AboutUs from "../pages/website/pages/AboutUs";
import Layout from "../pages/website/pages/Layout/Layout";
import ServicesSection from "../pages/website/pages/ServicesSection";
import AnnouncementsSection from "../pages/website/pages/AnnouncementsSection";
import ContactSection from "../pages/website/pages/ContactSection";
import ModernGallery from "../pages/website/pages/ModernGallery";
import OurCourse from "../pages/website/pages/OurCourse";
import ExpertTrainers from "../pages/website/pages/ExpertTrainers";
import CompCourse from "../pages/website/pages/CompCourse";
import VocationalCourses from "../pages/website/pages/VocationalCourses";
import EnglishCourses from "../pages/website/pages/englishCourses";
import CoachingClasses from "../pages/website/pages/CoachingClasses";
import CareerOpportunities from "../pages/website/pages/CareerOpportunities";
import Courses from "../pages/dashboard/Courses";
import Teachers from "../pages/dashboard/Teachers";
import EmployeeDashboard from "../pages/dashboard/EmployeeDashboard";
import TestStudio from "../pages/dashboard/TestStudio";
import StudentTestHistory from "../pages/dashboard/StudentTestHistory";
import TestPaperHeader from "../pages/dashboard/TestPaperHeader";
import Students from "../pages/dashboard/Students";
import EnrollmentManagement from "../pages/dashboard/EnrollmentManagement";
import StudentProfile from "../pages/dashboard/StudentProfile";
import StudentPortalAccounts from "../pages/dashboard/StudentPortalAccounts";
import StudentPortal from "../pages/dashboard/StudentPortal";
import HeadsOfAccount from "../pages/dashboard/accounting/HeadsOfAccount";
import Banks from "../pages/dashboard/accounting/Banks";
import Transactions from "../pages/dashboard/accounting/Transactions";
import FundTransfer from "../pages/dashboard/accounting/FundTransfer";
import Ledger from "../pages/dashboard/accounting/Ledger";
import ProfitLoss from "../pages/dashboard/accounting/ProfitLoss";
import Receipt from "../pages/dashboard/accounting/Receipt";
import ReceiptStudentHistory from "../pages/dashboard/accounting/ReceiptStudentHistory";
import StudentDues from "../pages/dashboard/accounting/StudentDues";
import DropoutStudentsDues from "../pages/dashboard/accounting/DropoutStudentsDues";
import Payroll from "../pages/dashboard/accounting/Payroll";
import Attendance from "../pages/dashboard/Attendance";
import HolidayManagement from "../pages/dashboard/HolidayManagement";
import SuperAdmin from "../pages/dashboard/SuperAdmin";
import AppSettingsPage from "../pages/dashboard/AppSettingsPage";
import NoAccess from "../pages/dashboard/NoAccess";

function AppRouter() {
  return (
    <Router>
      <Routes>
        {/* PUBLIC ROUTE */}

        {/* Wrap all routes with Layout */}
        <Route element= {<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/about-us" element={<AboutUs />} />
          <Route path="/services" element={<ServicesSection />} />
          <Route path="/certifications" element={<Certifications />} />
          <Route path="/computer-courses" element={<CompCourse />} />
          <Route path="/vocation-course" element={<VocationalCourses />} />
          <Route path="/english-course" element={<EnglishCourses />} />
          <Route path="/coaching-course" element={<CoachingClasses />} />
          <Route
            path="/career-opportunities"
            element={<CareerOpportunities />}
          />
          <Route path="/gallery" element={<ModernGallery />} />
          <Route path="/contact" element={<ContactSection />} />

          <Route path="/login" element={<Login />} />
        </Route>

        {/* PROTECTED ROUTES */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<ProtectedRoute moduleKey="dashboard"><Dashboard /></ProtectedRoute>} />
          <Route path="courses" element={<ProtectedRoute moduleKey="courses"><Courses /></ProtectedRoute>} />
          <Route path="employees" element={<ProtectedRoute moduleKey="employees"><Teachers /></ProtectedRoute>} />
          <Route path="employees/:teacherId" element={<ProtectedRoute moduleKey="employees"><Teachers /></ProtectedRoute>} />
          <Route path="employee-accounts" element={<Navigate to="/dashboard/super-admin?section=roles&view=users" replace />} />
          <Route path="test-studio" element={<ProtectedRoute moduleKey="test_studio"><TestStudio /></ProtectedRoute>} />
          <Route path="test-studio/create" element={<ProtectedRoute moduleKey="test_studio" action="create"><TestStudio setupMode /></ProtectedRoute>} />
          <Route path="test-studio/student/:studentId" element={<ProtectedRoute moduleKey="test_studio"><StudentTestHistory /></ProtectedRoute>} />
          <Route path="test-studio/:id" element={<ProtectedRoute moduleKey="test_studio"><TestStudio detailMode /></ProtectedRoute>} />
          <Route path="teachers" element={<ProtectedRoute moduleKey="employees"><Teachers /></ProtectedRoute>} />
          <Route path="teachers/:teacherId" element={<ProtectedRoute moduleKey="employees"><Teachers /></ProtectedRoute>} />
          <Route
            path="students"
            element={<Navigate to="/dashboard/students/all" replace />}
          />
          <Route
            path="students/all"
            element={
              <ProtectedRoute moduleKey="students">
                <Students />
              </ProtectedRoute>
            }
          />
          <Route
            path="students/enrolled"
            element={
              <ProtectedRoute moduleKey="students">
                <EnrollmentManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="students/portal-accounts"
            element={
              <ProtectedRoute superAdminOnly>
                <StudentPortalAccounts />
              </ProtectedRoute>
            }
          />
          <Route path="students/:id" element={<ProtectedRoute moduleKey="students"><StudentProfile /></ProtectedRoute>} />
          <Route path="certification" element={<ProtectedRoute moduleKey="certifications"><Certification /></ProtectedRoute>} />
          <Route path="settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="no-access" element={<ProtectedRoute><NoAccess /></ProtectedRoute>} />
          <Route path="super-admin" element={<ProtectedRoute superAdminOnly><SuperAdmin /></ProtectedRoute>} />
          <Route path="app-settings" element={<ProtectedRoute superAdminOnly><AppSettingsPage /></ProtectedRoute>} />
          <Route path="announcements" element={<ProtectedRoute moduleKey="announcements"><Announcement /></ProtectedRoute>} />
          {/* Accounting Module */}
          <Route path="accounting/heads" element={<ProtectedRoute moduleKey="accounting"><HeadsOfAccount /></ProtectedRoute>} />
          <Route path="accounting/banks" element={<ProtectedRoute moduleKey="accounting"><Banks /></ProtectedRoute>} />
          <Route path="accounting/transactions" element={<ProtectedRoute moduleKey="accounting"><Transactions /></ProtectedRoute>} />
          <Route path="accounting/receipt" element={<ProtectedRoute moduleKey="accounting"><Receipt /></ProtectedRoute>} />
          <Route path="accounting/receipt/dropout-students" element={<ProtectedRoute moduleKey="accounting"><DropoutStudentsDues /></ProtectedRoute>} />
          <Route path="accounting/student-dues" element={<ProtectedRoute moduleKey="accounting"><StudentDues /></ProtectedRoute>} />
          <Route path="accounting/receipt/history/:studentId" element={<ProtectedRoute moduleKey="accounting"><ReceiptStudentHistory /></ProtectedRoute>} />
          <Route path="accounting/payroll" element={<ProtectedRoute moduleKey="accounting"><Payroll /></ProtectedRoute>} />
          <Route path="accounting/fund-transfer" element={<ProtectedRoute moduleKey="accounting"><FundTransfer /></ProtectedRoute>} />
          <Route path="accounting/ledger" element={<ProtectedRoute moduleKey="accounting"><Ledger /></ProtectedRoute>} />
          <Route path="accounting/profit-loss" element={<ProtectedRoute moduleKey="accounting"><ProfitLoss /></ProtectedRoute>} />
          {/* Attendance Module */}
          <Route path="attendance" element={<ProtectedRoute moduleKey="attendance"><Attendance /></ProtectedRoute>} />
          <Route path="attendance/holidays" element={<ProtectedRoute moduleKey="attendance"><HolidayManagement /></ProtectedRoute>} />
        </Route>
        <Route
          path="/student-portal"
          element={
            <ProtectedRoute studentOnly>
              <StudentPortal />
            </ProtectedRoute>
          }
        />
        <Route
          path="/employee-dashboard"
          element={
            <ProtectedRoute employeeOnly>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<ProtectedRoute moduleKey="dashboard"><EmployeeDashboard /></ProtectedRoute>} />
          <Route path="employees" element={<ProtectedRoute moduleKey="employees"><Teachers /></ProtectedRoute>} />
          <Route path="test-studio" element={<ProtectedRoute moduleKey="test_studio"><TestStudio /></ProtectedRoute>} />
          <Route path="test-studio/create" element={<ProtectedRoute moduleKey="test_studio" action="create"><TestStudio setupMode /></ProtectedRoute>} />
          <Route path="test-studio/student/:studentId" element={<ProtectedRoute moduleKey="test_studio"><StudentTestHistory /></ProtectedRoute>} />
          <Route path="test-studio/:id" element={<ProtectedRoute moduleKey="test_studio"><TestStudio detailMode /></ProtectedRoute>} />
          <Route path="test-paper-header" element={<ProtectedRoute moduleKey="test_studio" action="update"><TestPaperHeader /></ProtectedRoute>} />
        </Route>
      </Routes>
    </Router>
  );
}

export default AppRouter;
