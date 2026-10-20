import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { dashboardPath, useAuth } from '../../context/AuthContext';
import Logo from '../Logo';
import { Spinner } from '../ui';

export function FullPageLoader({ label = 'Preparing your workspace…' }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-night-950">
      <Logo />
      <div className="flex items-center gap-4 text-sm text-slate-400">
        <Spinner className="h-5 w-5 text-brand-400" />
        {label}
      </div>
    </div>
  );
}

export default function ProtectedRoute({ roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageLoader />;

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={dashboardPath(user.role)} replace />;
  }

  return <Outlet />;
}
