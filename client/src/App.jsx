import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import PublicLayout from './components/layout/PublicLayout';
import DashboardLayout from './components/layout/DashboardLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';

const HomePage = lazy(() => import('./pages/public/HomePage'));
const CoursesPage = lazy(() => import('./pages/public/CoursesPage'));
const CourseDetailPage = lazy(() => import('./pages/public/CourseDetailPage'));
const LearningPathsPage = lazy(() => import('./pages/public/LearningPathsPage'));
const LearningPathDetailPage = lazy(() => import('./pages/public/LearningPathDetailPage'));
const BlogPage = lazy(() => import('./pages/public/BlogPage'));
const BlogDetailPage = lazy(() => import('./pages/public/BlogDetailPage'));
const AboutPage = lazy(() => import('./pages/public/AboutPage'));
const ContactPage = lazy(() => import('./pages/public/ContactPage'));
const VerifyCertificatePage = lazy(() => import('./pages/public/VerifyCertificatePage'));
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('./pages/auth/VerifyEmailPage'));
import NotFoundPage from './pages/NotFoundPage';

const StudentDashboard = lazy(() => import('./pages/student/StudentDashboard'));
const MyCoursesPage = lazy(() => import('./pages/student/MyCoursesPage'));
const StudentLessonsPage = lazy(() => import('./pages/student/StudentLessonsPage'));
const LearnPage = lazy(() => import('./pages/student/LearnPage'));
const LabAssignmentsPage = lazy(() => import('./pages/student/LabAssignmentsPage'));
const StudentCalendarPage = lazy(() => import('./pages/student/StudentCalendarPage'));
const LabsPage = lazy(() => import('./pages/student/LabsPage'));
const LabDetailPage = lazy(() => import('./pages/student/LabDetailPage'));
const LabSessionPage = lazy(() => import('./pages/student/LabSessionPage'));
const ReportsPage = lazy(() => import('./pages/student/ReportsPage'));
const ReportEditorPage = lazy(() => import('./pages/student/ReportEditorPage'));
const CertificatesPage = lazy(() => import('./pages/student/CertificatesPage'));
const HistoryPage = lazy(() => import('./pages/student/HistoryPage'));
const ProfilePage = lazy(() => import('./pages/student/ProfilePage'));
const StudentSupportPage = lazy(() => import('./pages/student/StudentSupportPage'));
const StudentNotificationsPage = lazy(() => import('./pages/student/StudentNotificationsPage'));
const ChatPage = lazy(() => import('./pages/chat/ChatPage'));

const StaffDashboard = lazy(() => import('./pages/instructor/StaffDashboard'));
const ManageCoursesPage = lazy(() => import('./pages/instructor/ManageCoursesPage'));
const CourseEditorPage = lazy(() => import('./pages/instructor/CourseEditorPage'));
const ManageLabsPage = lazy(() => import('./pages/instructor/ManageLabsPage'));
const LabEditorPage = lazy(() => import('./pages/instructor/LabEditorPage'));
const LabSubmissionsPage = lazy(() => import('./pages/instructor/LabSubmissionsPage'));
const DeadlineTrackerPage = lazy(() => import('./pages/instructor/DeadlineTrackerPage'));
const ReportsReviewPage = lazy(() => import('./pages/instructor/ReportsReviewPage'));
const ReportReviewDetailPage = lazy(() => import('./pages/instructor/ReportReviewDetailPage'));
const BlogManagePage = lazy(() => import('./pages/instructor/BlogManagePage'));
const StudentsPage = lazy(() => import('./pages/instructor/StudentsPage'));
const ContentStudioPage = lazy(() => import('./pages/instructor/ContentStudioPage'));
const InstructorAnnouncementsPage = lazy(() => import('./pages/instructor/InstructorAnnouncementsPage'));

const AdminOverview = lazy(() => import('./pages/admin/AdminOverview'));
const UsersPage = lazy(() => import('./pages/admin/UsersPage'));
const MessagesPage = lazy(() => import('./pages/admin/MessagesPage'));
const BroadcastPage = lazy(() => import('./pages/admin/BroadcastPage'));
const AdminLabsPage = lazy(() => import('./pages/admin/AdminLabsPage'));
const LiveLabServersPage = lazy(() => import('./pages/admin/LiveLabServersPage'));
const AdminAuditLogsPage = lazy(() => import('./pages/admin/AdminAuditLogsPage'));
const AdminCoursesPage = lazy(() => import('./pages/admin/AdminCoursesPage'));
const AdminContentPage = lazy(() => import('./pages/admin/AdminContentPage'));
const AdminSystemPage = lazy(() => import('./pages/admin/AdminSystemPage'));
const ModeratorManagementPage = lazy(() => import('./pages/admin/ModeratorManagementPage'));

const SeniorModeratorDashboard = lazy(() => import('./pages/moderator/SeniorModeratorDashboard'));
const SubjectModeratorDashboard = lazy(() => import('./pages/moderator/SubjectModeratorDashboard'));
const ModerationReportsPage = lazy(() => import('./pages/moderator/ModerationReportsPage'));

function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading page">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
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
            <Route path="instructor/deadline-tracker" element={<DeadlineTrackerPage />} />
            <Route path="instructor/announcements" element={<InstructorAnnouncementsPage />} />
            <Route path="instructor/reports" element={<ReportsReviewPage />} />
            <Route path="instructor/reports/:id" element={<ReportReviewDetailPage />} />
            <Route path="instructor/blog" element={<BlogManagePage />} />
            <Route path="instructor/students" element={<StudentsPage />} />
            <Route path="instructor/messages" element={<ChatPage />} />
            <Route path="instructor/settings" element={<ProfilePage />} />
          </Route>

          <Route element={<ProtectedRoute roles={['senior_moderator']} />}>
            <Route path="moderator/senior" element={<SeniorModeratorDashboard />} />
          </Route>

          <Route element={<ProtectedRoute roles={['subject_moderator']} />}>
            <Route path="moderator/subject" element={<SubjectModeratorDashboard />} />
          </Route>

          <Route element={<ProtectedRoute roles={['senior_moderator', 'subject_moderator']} />}>
            <Route path="moderator/reports" element={<ModerationReportsPage />} />
            <Route path="moderator/settings" element={<ProfilePage />} />
          </Route>

          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route path="admin" element={<AdminOverview />} />
            <Route path="admin/users" element={<UsersPage />} />
            <Route path="admin/moderators" element={<ModeratorManagementPage />} />
            <Route path="admin/courses" element={<AdminCoursesPage />} />
            <Route path="admin/labs" element={<AdminLabsPage />} />
            <Route path="admin/live-lab-servers" element={<LiveLabServersPage />} />
            <Route path="admin/content" element={<AdminContentPage />} />
            <Route path="admin/system" element={<AdminSystemPage />} />
            <Route path="admin/logs" element={<AdminAuditLogsPage />} />
            <Route path="admin/messages" element={<MessagesPage />} />
            <Route path="admin/broadcast" element={<BroadcastPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
    </Suspense>
  );
}
