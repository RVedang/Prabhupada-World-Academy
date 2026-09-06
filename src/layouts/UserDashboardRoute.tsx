import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useUserProfile } from '@/contexts/UserProfileContext';
import { getUserDashboardRedirect } from '@/lib/userDashboardRoutes';
import { LoadingPage } from '@/shared';

/** Runs inside ProtectedRoute, before either department dashboard is mounted. */
export default function UserDashboardRoute({ children }: { children?: ReactNode }) {
  const { profile, isLoading } = useUserProfile();
  const location = useLocation();
  if (isLoading || !profile) return <LoadingPage rows={3} />;

  const redirect = getUserDashboardRedirect(profile, location);
  if (redirect) return <Navigate to={redirect} replace />;
  return <>{children}</>;
}
