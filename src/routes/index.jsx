import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from '@/layouts/AppLayout'
import { ProtectedRoute, PublicOnlyRoute } from '@/components/common/RouteGuards'
import { UserScopedAppState } from '@/components/common/UserScopedAppState'
import LoginPage from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage'
import VerifyEmailPage from '@/pages/auth/VerifyEmailPage'
import ConfirmEmailChangePage from '@/pages/auth/ConfirmEmailChangePage'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import SchedulePage from '@/pages/schedule/SchedulePage'
import CreateEventPage from '@/pages/events/CreateEventPage'
import EditEventPage from '@/pages/events/EditEventPage'
import EventDetailPage from '@/pages/events/EventDetailPage'
import ChecklistPage from '@/pages/checklist/ChecklistPage'
import PrepProfilePage from '@/pages/profile/PrepProfilePage'
import PlacesPage from '@/pages/places/PlacesPage'
import PlannerPage from '@/pages/planner/PlannerPage'
import NotificationsPage from '@/pages/notifications/NotificationsPage'
import SettingsPage from '@/pages/settings/SettingsPage'

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      {/* Emailed links must work whether or not the visitor is logged in */}
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/confirm-email-change" element={<ConfirmEmailChangePage />} />
      <Route element={<ProtectedRoute />}>
        {/* Per-user state lives ONLY here, so public pages (reset / verify links) are never remounted when a stored session is restored */}
        <Route element={<UserScopedAppState><AppLayout /></UserScopedAppState>}>
          <Route index element={<DashboardPage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="events/new" element={<CreateEventPage />} />
          <Route path="events/:id" element={<EventDetailPage />} />
          <Route path="events/:id/edit" element={<EditEventPage />} />
          <Route path="checklist" element={<ChecklistPage />} />
          <Route path="planner" element={<PlannerPage />} />
          <Route path="places" element={<PlacesPage />} />
          <Route path="profile" element={<PrepProfilePage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
