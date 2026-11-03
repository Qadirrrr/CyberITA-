import { Route, Routes } from 'react-router-dom';
import PublicLayout from './components/layout/PublicLayout';
import DashboardLayout from './components/layout/DashboardLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';

import HomePage from './pages/public/HomePage';
import CoursesPage from './pages/public/CoursesPage';
import CourseDetailPage from './pages/public/CourseDetailPage';
import LearningPathsPage from './pages/public/LearningPathsPage';
import LearningPathDetailPage from './pages/public/LearningPathDetailPage';
import BlogPage from './pages/public/BlogPage';
import BlogDetailPage from './pages/public/BlogDetailPage';
import AboutPage from './pages/public/AboutPage';
import ContactPage from './pages/public/ContactPage';
import VerifyCertificatePage from './pages/public/VerifyCertificatePage';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import VerifyEmailPage from './pages/auth/VerifyEmailPage';
import NotFoundPage from './pages/NotFoundPage';

import StudentDashboard from './pages/student/StudentDashboard';
import MyCoursesPage from './pages/student/MyCoursesPage';
import StudentLessonsPage from './pages/student/StudentLessonsPage';
import LearnPage from './pages/student/LearnPage';
import LabAssignmentsPage from './pages/student/LabAssignmentsPage';
import StudentCalendarPage from './pages/student/StudentCalendarPage';
import LabsPage from './pages/student/LabsPage';
import LabDetailPage from './pages/student/LabDetailPage';
import LabSessionPage from './pages/student/LabSessionPage';
import ReportsPage from './pages/student/ReportsPage';
import ReportEditorPage from './pages/student/ReportEditorPage';
import CertificatesPage from './pages/student/CertificatesPage';
import HistoryPage from './pages/student/HistoryPage';
import ProfilePage from './pages/student/ProfilePage';
import StudentSupportPage from './pages/student/StudentSupportPage';
import StudentNotificationsPage from './pages/student/StudentNotificationsPage';
import ChatPage from './pages/chat/ChatPage';

import StaffDashboard from './pages/instructor/StaffDashboard';
import ManageCoursesPage from './pages/instructor/ManageCoursesPage';
import CourseEditorPage from './pages/instructor/CourseEditorPage';
import ManageLabsPage from './pages/instructor/ManageLabsPage';
import LabEditorPage from './pages/instructor/LabEditorPage';
import LabSubmissionsPage from './pages/instructor/LabSubmissionsPage';
import ReportsReviewPage from './pages/instructor/ReportsReviewPage';
import ReportReviewDetailPage from './pages/instructor/ReportReviewDetailPage';
import BlogManagePage from './pages/instructor/BlogManagePage';
import StudentsPage from './pages/instructor/StudentsPage';
import ContentStudioPage from './pages/instructor/ContentStudioPage';
import InstructorAnnouncementsPage from './pages/instructor/InstructorAnnouncementsPage';

import AdminOverview from './pages/admin/AdminOverview';
import UsersPage from './pages/admin/UsersPage';
import MessagesPage from './pages/admin/MessagesPage';
import BroadcastPage from './pages/admin/BroadcastPage';
import AdminLabsPage from './pages/admin/AdminLabsPage';
import AdminAuditLogsPage from './pages/admin/AdminAuditLogsPage';
import AdminSettingsPage from './pages/admin/AdminSettingsPage';
import AdminCoursesPage from './pages/admin/AdminCoursesPage';
import AdminContentPage from './pages/admin/AdminContentPage';
import AdminSystemPage from './pages/admin/AdminSystemPage';

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="courses" element={<CoursesPage />} />
        <Route path="courses/:slug" element={<CourseDetailPage />} />
        <Route path="learning-paths" element={<LearningPathsPage />} />
        <Route path="learning-paths/:slug" element={<LearningPathDetailPage />} />
        <Route path="blog" element={<BlogPage />} />
        <Route path="blog/:slug" element={<BlogDetailPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="verify" element={<VerifyCertificatePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route path="login" element={<LoginPage />} />
      <Route path="register" element={<RegisterPage />} />
      <Route path="forgot-password" element={<ForgotPasswordPage />} />
      <Route path="reset-password" element={<ResetPasswordPage />} />
      <Route path="verify-email" element={<VerifyEmailPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="labs/session/:sessionId" element={<LabSessionPage />} />
        <Route element={<DashboardLayout />}>
          <Route path="student" element={<StudentDashboard />} />
          <Route path="student/courses" element={<MyCoursesPage />} />
          <Route path="student/lessons" element={<StudentLessonsPage />} />
          <Route path="student/labs" element={<LabsPage />} />
          <Route path="student/lab-assignments" element={<LabAssignmentsPage />} />
          <Route path="student/calendar" element={<StudentCalendarPage />} />
          <Route path="student/chat" element={<ChatPage />} />
          <Route path="student/reports" element={<ReportsPage />} />
          <Route path="student/reports/:id" element={<ReportEditorPage />} />
          <Route path="student/certificates" element={<CertificatesPage />} />
          <Route path="student/history" element={<HistoryPage />} />
          <Route path="student/support" element={<StudentSupportPage />} />
          <Route path="student/notifications" element={<StudentNotificationsPage />} />
          <Route path="student/settings" element={<ProfilePage />} />
          <Route path="student/profile" element={<ProfilePage />} />

          <Route path="learn/:slug" element={<LearnPage />} />
          <Route path="labs/:id" element={<LabDetailPage />} />
          <Route path="labs/session/:sessionId" element={<LabSessionPage />} />

          <Route element={<ProtectedRoute roles={['instructor', 'admin']} />}>
            <Route path="instructor" element={<StaffDashboard />} />
            <Route path="instructor/courses" element={<ManageCoursesPage />} />
            <Route path="instructor/courses/new" element={<CourseEditorPage />} />
            <Route path="instructor/courses/:id" element={<CourseEditorPage />} />
            <Route path="instructor/labs" element={<ManageLabsPage />} />
            <Route path="instructor/studio" element={<ContentStudioPage />} />
            <Route path="instructor/labs/:id" element={<LabEditorPage />} />
            <Route path="instructor/lab-submissions" element={<LabSubmissionsPage />} />
            <Route path="instructor/announcements" element={<InstructorAnnouncementsPage />} />
            <Route path="instructor/reports" element={<ReportsReviewPage />} />
            <Route path="instructor/reports/:id" element={<ReportReviewDetailPage />} />
            <Route path="instructor/blog" element={<BlogManagePage />} />
            <Route path="instructor/students" element={<StudentsPage />} />
            <Route path="instructor/messages" element={<ChatPage />} />
            <Route path="instructor/settings" element={<ProfilePage />} />
          </Route>

          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route path="admin" element={<AdminOverview />} />
            <Route path="admin/users" element={<UsersPage />} />
            <Route path="admin/courses" element={<AdminCoursesPage />} />
            <Route path="admin/labs" element={<AdminLabsPage />} />
            <Route path="admin/content" element={<AdminContentPage />} />
            <Route path="admin/system" element={<AdminSystemPage />} />
            <Route path="admin/logs" element={<AdminAuditLogsPage />} />
            <Route path="admin/settings" element={<AdminSettingsPage />} />
            <Route path="admin/messages" element={<MessagesPage />} />
            <Route path="admin/broadcast" element={<BroadcastPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
