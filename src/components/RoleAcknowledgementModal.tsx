import React, { useEffect, useState } from 'react';
import { ShieldCheck, UserCheck, Award, Users, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useUserProfile } from '@/contexts/UserProfileContext';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';

export default function RoleAcknowledgementModal() {
  const { profile, refreshProfile } = useUserProfile();
  const [modalOpen, setModalOpen] = useState(false);
  const [roleNotice, setRoleNotice] = useState<{
    added: string[];
    removed: string[];
    snapshotKey: string;
    newSnapshot: string;
  } | null>(null);

  useEffect(() => {
    if (!profile || !profile.userId) return;

    // Super Admins do not receive role update popups
    if (profile.isBvSuperAdmin || profile.role === 'SUPER_ADMIN') return;

    // 1. Determine active roles — use independent checks (not else-if)
    const activeRoles: string[] = [];
    const segment = profile.segment || 'PW';

    if (profile.isBvSuperAdmin) {
      activeRoles.push(segment === 'FOLK' ? 'FOLK Super Admin' : 'PW Super Admin');
    }
    if (profile.isBvAdmin && !profile.isBvSuperAdmin) {
      activeRoles.push(segment === 'FOLK' ? 'FOLK Admin' : 'PW Admin');
    }

    if (profile.isSadhanaMentor || profile.role === 'SADHANA_MENTOR') {
      activeRoles.push('Sadhana Mentor');
    }

    if ((profile as any).isTripCoordinator) {
      activeRoles.push('Trip Coordinator');
    }

    if ((profile as any).isFolkLead) {
      activeRoles.push('FOLK Lead');
    }

    if (profile.isBvSupervisor || profile.isBvMentor) {
      activeRoles.push('BV Supervisor');
    }

    if (profile.isBvFacilitator || profile.isBvsl) {
      activeRoles.push('RGF (Facilitator)');
    }
    if (profile.isBvSubFacilitator) {
      activeRoles.push('RGSF (Sub-Facilitator)');
    }

    const currentSnapshot = activeRoles.sort().join('|');
    const storageKey = `seen_role_snapshot_${profile.userId}`;
    const previousSnapshot = localStorage.getItem(storageKey);

    if (previousSnapshot === null) {
      // First initialization for user on this device — record snapshot silently
      localStorage.setItem(storageKey, currentSnapshot);
      return;
    }

    if (previousSnapshot !== currentSnapshot) {
      const prevRoles = previousSnapshot ? previousSnapshot.split('|').filter(Boolean) : [];
      const currRoles = currentSnapshot ? currentSnapshot.split('|').filter(Boolean) : [];

      const added = currRoles.filter(r => !prevRoles.includes(r));
      const removed = prevRoles.filter(r => !currRoles.includes(r));

      if (added.length > 0 || removed.length > 0) {
        setRoleNotice({
          added,
          removed,
          snapshotKey: storageKey,
          newSnapshot: currentSnapshot,
        });
        setModalOpen(true);
      }
    }
  }, [profile]);

  const handleAcknowledge = async () => {
    if (roleNotice) {
      localStorage.setItem(roleNotice.snapshotKey, roleNotice.newSnapshot);
    }
    setModalOpen(false);
    
    // Check if admin role was removed and user is on admin route
    const wasAdminRemoved = roleNotice?.removed.some(r => r.includes('Admin'));
    const currentPath = window.location.pathname;
    const isAdminPath = currentPath.startsWith('/pw-admin') || currentPath.startsWith('/folk-admin') || currentPath.startsWith('/super-admin');

    await refreshProfile();
    setRoleNotice(null);

    if (wasAdminRemoved && isAdminPath) {
      const targetUserDashboard = profile?.segment === 'FOLK' ? '/user/folk-dashboard' : '/user/pw-dashboard';
      window.location.href = targetUserDashboard;
    }
  };

  return (
    <AnimatePresence>
      {modalOpen && roleNotice && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="role-modal-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden p-6 space-y-5"
          >
            <div className="flex items-center gap-3 border-b border-border/60 pb-4">
              <div className="p-3 rounded-full bg-primary/10 text-primary shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 id="role-modal-title" className="text-lg font-bold text-foreground">Role Update Notice</h3>
                <p className="text-xs text-muted-foreground">Your account permissions have been updated</p>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                An Administrator has updated your administrative access and responsibilities:
              </p>

              {roleNotice.added.length > 0 && (
                <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Newly Assigned Role(s):</span>
                  </div>
                  <ul className="list-disc list-inside text-xs font-semibold text-foreground space-y-1 pl-1">
                    {roleNotice.added.map(role => (
                      <li key={role}>{role}</li>
                    ))}
                  </ul>
                </div>
              )}

              {roleNotice.removed.length > 0 && (
                <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400">
                    <AlertCircle className="w-4 h-4" />
                    <span>Removed Role(s):</span>
                  </div>
                  <ul className="list-disc list-inside text-xs font-semibold text-foreground space-y-1 pl-1">
                    {roleNotice.removed.map(role => (
                      <li key={role}>{role}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="pt-2">
              <Button
                onClick={handleAcknowledge}
                className="w-full h-11 text-sm font-semibold rounded-xl cursor-pointer"
              >
                Got it, Acknowledge
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
