import { getUserDepartment } from './userDashboardRoutes';

/** Match dashboard department rules, including legacy FOLK membership flags. */
export function getNotificationDepartment(user: any): 'PW' | 'FOLK' {
  return getUserDepartment({
    ...user,
    isFolkUser: !!(user?.isFolkUser || user?.isFolkLead || user?.residencyId),
  });
}
