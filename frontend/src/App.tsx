import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import { useAuth, type Role } from './lib/auth';

import { LoginPage } from './pages/Login';
import { KioskLoginPage, KioskPage } from './pages/Kiosk';
import { VerifyCertificatePage } from './pages/VerifyCertificate';
import { DashboardPage } from './pages/Dashboard';
import { CoursesPage, CourseDetailPage } from './pages/Courses';
import { MyLearningPage, CoursePlayerPage } from './pages/Learning';
import { LivePage, SessionDetailPage } from './pages/Live';
import { CalendarPage } from './pages/Calendar';
import { AttendancePage } from './pages/Attendance';
import { AssignmentsPage, AssignmentDetailPage } from './pages/Assignments';
import { QuizzesPage, QuizAttemptPage } from './pages/Quizzes';
import { CertificatesPage } from './pages/Certificates';
import { UsersPage } from './pages/Users';
import { AcademicPage } from './pages/Academic';
import { SitesPage } from './pages/Sites';
import { ReportsPage } from './pages/Reports';
import { AnnouncementsPage } from './pages/Announcements';
import { NotificationsPage } from './pages/Notifications';
import { SupportPage, TicketDetailPage } from './pages/Support';
import { AuditPage } from './pages/Audit';
import { SettingsPage } from './pages/Settings';
import { NotFoundPage, ForbiddenPage } from './pages/Errors';

/** Blocks a route whose role list does not include the signed-in role. */
function RequireRole({ roles, children }: { roles: Role[]; children: JSX.Element }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return roles.includes(user.role) ? children : <ForbiddenPage />;
}

export function App() {
  const { user, kiosk, loading } = useAuth();

  if (loading) return <Loading label="Starting the portal…" />;

  // A signed-in classroom panel gets the kiosk experience and nothing else.
  if (kiosk) {
    return (
      <Routes>
        <Route path="*" element={<KioskPage />} />
      </Routes>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/kiosk-login" element={<KioskLoginPage />} />
        <Route path="/verify/:token" element={<VerifyCertificatePage />} />
        <Route path="/verify" element={<VerifyCertificatePage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/verify/:token" element={<VerifyCertificatePage />} />
      <Route path="/login" element={<Navigate to="/" replace />} />

      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />

        <Route
          path="courses"
          element={
            <RequireRole roles={['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER', 'CONTENT_MANAGER']}>
              <CoursesPage />
            </RequireRole>
          }
        />
        <Route
          path="courses/:id"
          element={
            <RequireRole roles={['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER', 'CONTENT_MANAGER']}>
              <CourseDetailPage />
            </RequireRole>
          }
        />

        <Route
          path="my-learning"
          element={
            <RequireRole roles={['STUDENT']}>
              <MyLearningPage />
            </RequireRole>
          }
        />
        <Route
          path="learn/:courseId"
          element={
            <RequireRole roles={['STUDENT']}>
              <CoursePlayerPage />
            </RequireRole>
          }
        />

        <Route path="live" element={<LivePage />} />
        <Route path="live/:id" element={<SessionDetailPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="assignments" element={<AssignmentsPage />} />
        <Route path="assignments/:id" element={<AssignmentDetailPage />} />
        <Route path="quizzes" element={<QuizzesPage />} />
        <Route
          path="quizzes/:id/attempt"
          element={
            <RequireRole roles={['STUDENT']}>
              <QuizAttemptPage />
            </RequireRole>
          }
        />
        <Route path="certificates" element={<CertificatesPage />} />

        <Route
          path="users"
          element={
            <RequireRole roles={['SUPER_ADMIN', 'ACADEMIC_ADMIN']}>
              <UsersPage />
            </RequireRole>
          }
        />
        <Route
          path="academic"
          element={
            <RequireRole roles={['SUPER_ADMIN', 'ACADEMIC_ADMIN']}>
              <AcademicPage />
            </RequireRole>
          }
        />
        <Route
          path="sites"
          element={
            <RequireRole roles={['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'DEPT_OVERSIGHT']}>
              <SitesPage />
            </RequireRole>
          }
        />
        <Route
          path="reports"
          element={
            <RequireRole roles={['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER', 'DEPT_OVERSIGHT']}>
              <ReportsPage />
            </RequireRole>
          }
        />

        <Route path="announcements" element={<AnnouncementsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="support" element={<SupportPage />} />
        <Route path="support/:id" element={<TicketDetailPage />} />
        <Route
          path="settings"
          element={
            <RequireRole roles={['SUPER_ADMIN']}>
              <SettingsPage />
            </RequireRole>
          }
        />
        <Route
          path="audit"
          element={
            <RequireRole roles={['SUPER_ADMIN']}>
              <AuditPage />
            </RequireRole>
          }
        />
        <Route
          path="kiosk"
          element={
            <RequireRole roles={['SUPER_ADMIN']}>
              <KioskLoginPage />
            </RequireRole>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
