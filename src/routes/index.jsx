import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from '@/layouts/AppLayout'
import { ProtectedRoute, PublicOnlyRoute } from '@/components/common/RouteGuards'
import LoginPage from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import SchedulePage from '@/pages/schedule/SchedulePage'
import CreateEventPage from '@/pages/events/CreateEventPage'
import ChecklistPage from '@/pages/checklist/ChecklistPage'
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
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="events/new" element={<CreateEventPage />} />
          <Route path="checklist" element={<ChecklistPage />} />
          <Route path="planner" element={<PlannerPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
