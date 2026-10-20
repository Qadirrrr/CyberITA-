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
import NotFoundPage from './pages/NotFoundPage';

import StudentDashboard from './pages/student/StudentDashboard';
import MyCoursesPage from './pages/student/MyCoursesPage';
import LearnPage from './pages/student/LearnPage';
import QuizPage from './pages/student/QuizPage';
import AssignmentPage from './pages/student/AssignmentPage';
import LabsPage from './pages/student/LabsPage';
import LabDetailPage from './pages/student/LabDetailPage';
import LabSessionPage from './pages/student/LabSessionPage';
import ReportsPage from './pages/student/ReportsPage';
import ReportEditorPage from './pages/student/ReportEditorPage';
import CertificatesPage from './pages/student/CertificatesPage';
import HistoryPage from './pages/student/HistoryPage';
import ProfilePage from './pages/student/ProfilePage';

import StaffDashboard from './pages/instructor/StaffDashboard';
import ManageCoursesPage from './pages/instructor/ManageCoursesPage';
import CourseEditorPage from './pages/instructor/CourseEditorPage';
import ManageLabsPage from './pages/instructor/ManageLabsPage';
import LabEditorPage from './pages/instructor/LabEditorPage';
import SubmissionsPage from './pages/instructor/SubmissionsPage';
import ReportsReviewPage from './pages/instructor/ReportsReviewPage';
import ReportReviewDetailPage from './pages/instructor/ReportReviewDetailPage';
import BlogManagePage from './pages/instructor/BlogManagePage';
import StudentsPage from './pages/instructor/StudentsPage';

import AdminOverview from './pages/admin/AdminOverview';
import UsersPage from './pages/admin/UsersPage';
import MessagesPage from './pages/admin/MessagesPage';
import BroadcastPage from './pages/admin/BroadcastPage';

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

      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="student" element={<StudentDashboard />} />
          <Route path="student/courses" element={<MyCoursesPage />} />
          <Route path="student/labs" element={<LabsPage />} />
          <Route path="student/reports" element={<ReportsPage />} />
          <Route path="student/reports/:id" element={<ReportEditorPage />} />
          <Route path="student/certificates" element={<CertificatesPage />} />
          <Route path="student/history" element={<HistoryPage />} />
          <Route path="student/profile" element={<ProfilePage />} />

          <Route path="learn/:slug" element={<LearnPage />} />
          <Route path="learn/quizzes/:id" element={<QuizPage />} />
          <Route path="learn/assignments/:id" element={<AssignmentPage />} />
          <Route path="labs/:id" element={<LabDetailPage />} />
          <Route path="labs/session/:sessionId" element={<LabSessionPage />} />

          <Route element={<ProtectedRoute roles={['instructor', 'admin']} />}>
            <Route path="instructor" element={<StaffDashboard />} />
            <Route path="instructor/courses" element={<ManageCoursesPage />} />
            <Route path="instructor/courses/new" element={<CourseEditorPage />} />
            <Route path="instructor/courses/:id" element={<CourseEditorPage />} />
            <Route path="instructor/labs" element={<ManageLabsPage />} />
            <Route path="instructor/labs/:id" element={<LabEditorPage />} />
            <Route path="instructor/submissions" element={<SubmissionsPage />} />
            <Route path="instructor/reports" element={<ReportsReviewPage />} />
            <Route path="instructor/reports/:id" element={<ReportReviewDetailPage />} />
            <Route path="instructor/blog" element={<BlogManagePage />} />
            <Route path="instructor/students" element={<StudentsPage />} />
          </Route>

          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route path="admin" element={<AdminOverview />} />
            <Route path="admin/users" element={<UsersPage />} />
            <Route path="admin/messages" element={<MessagesPage />} />
            <Route path="admin/broadcast" element={<BroadcastPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
