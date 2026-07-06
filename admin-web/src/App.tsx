import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './components/RequireAuth';
import { AdminLayout } from './layouts/AdminLayout';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { ClientsPage } from './pages/ClientsPage';
import { DashboardPage } from './pages/DashboardPage';
import { DevProjectsPage } from './pages/DevProjectsPage';
import { EarningsPage } from './pages/EarningsPage';
import { JobOrderPage } from './pages/JobOrderPage';
import { JobOrdersPage } from './pages/JobOrdersPage';
import { JobsPage } from './pages/JobsPage';
import { LicensesPage } from './pages/LicensesPage';
import { LoginPage } from './pages/LoginPage';
import { ProductsPage } from './pages/ProductsPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { UsersPage } from './pages/UsersPage';
import { WithdrawalsPage } from './pages/WithdrawalsPage';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth roles={['SUPER_ADMIN', 'INSTALLER', 'DEVELOPER', 'DESIGNER', 'LIAISON', 'ADMIN_STAFF', 'SALES_STAFF']}>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/earnings" element={<EarningsPage />} />
        <Route path="/withdrawals" element={<WithdrawalsPage />} />

        <Route
          path="/dev-projects"
          element={
            <RequireAuth roles={['DEVELOPER', 'ADMIN_STAFF', 'SUPER_ADMIN']}>
              <DevProjectsPage />
            </RequireAuth>
          }
        />

        <Route
          path="/jobs"
          element={
            <RequireAuth roles={['SUPER_ADMIN', 'INSTALLER', 'ADMIN_STAFF', 'LIAISON', 'SALES_STAFF']}>
              <JobsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/job-orders/software"
          element={
            <RequireAuth roles={['SUPER_ADMIN', 'ADMIN_STAFF', 'LIAISON', 'SALES_STAFF']}>
              <JobOrdersPage type="SOFTWARE" />
            </RequireAuth>
          }
        />
        <Route
          path="/job-orders/:jobId"
          element={
            <RequireAuth roles={['SUPER_ADMIN', 'ADMIN_STAFF', 'DESIGNER', 'LIAISON', 'SALES_STAFF']}>
              <JobOrderPage />
            </RequireAuth>
          }
        />
        <Route
          path="/licenses"
          element={
            <RequireAuth roles={['SUPER_ADMIN', 'DEVELOPER', 'ADMIN_STAFF']}>
              <LicensesPage />
            </RequireAuth>
          }
        />

        <Route
          path="/clients"
          element={
            <RequireAuth roles={['SUPER_ADMIN', 'ADMIN_STAFF', 'SALES_STAFF', 'LIAISON']}>
              <ClientsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/products"
          element={
            <RequireAuth roles={['SUPER_ADMIN', 'ADMIN_STAFF']}>
              <ProductsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/users"
          element={
            <RequireAuth roles={['SUPER_ADMIN']}>
              <UsersPage />
            </RequireAuth>
          }
        />
        <Route
          path="/analytics"
          element={
            <RequireAuth roles={['SUPER_ADMIN']}>
              <AnalyticsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/audit-logs"
          element={
            <RequireAuth roles={['SUPER_ADMIN', 'ADMIN_STAFF']}>
              <AuditLogsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth roles={['SUPER_ADMIN']}>
              <SettingsPage />
            </RequireAuth>
          }
        />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
