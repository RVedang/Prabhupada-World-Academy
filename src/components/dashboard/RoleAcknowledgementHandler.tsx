import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserProfile } from '@/contexts/UserProfileContext';
import { acknowledgeRoleChange, acknowledgeBvRoleNotice, acknowledgeBvApprovalNotice, acknowledgeBvRejectionNotice, acknowledgeAshrayNotice, getUserBvStatus } from '@/lib/endpoints-sdk';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Crown, MapPin, ShieldAlert, Sparkles, XCircle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function RoleAcknowledgementHandler() {
  const navigate = useNavigate();
  const { profile, refreshProfile } = useUserProfile();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [groupInfo, setGroupInfo] = useState<{ groupName?: string; bvslName?: string; rgsfName?: string } | null>(null);

  // Determine what type of popup to show
  let popupType: 'ashray_notice_approved' | 'ashray_notice_rejected' | 'bv_approval_notice' | 'bv_rejection_notice' | 'bv_role_notice' | null = null;

  if (profile) {
    // Show notices regardless of role level
    if ((profile as any).pendingBvApprovalNotice) {
      popupType = 'bv_approval_notice';
    } else if ((profile as any).pendingBvRejectionNotice) {
      popupType = 'bv_rejection_notice';
    } else if ((profile as any).pendingRoleNotice && !(profile as any).roleNoticeAcknowledged) {
      popupType = 'bv_role_notice';
    } else if (profile.pendingAshrayNoticeStatus === 'approved' && !profile.ashrayNoticeAcknowledged) {
      popupType = 'ashray_notice_approved';
    } else if (profile.pendingAshrayNoticeStatus === 'rejected' && !profile.ashrayNoticeAcknowledged) {
      popupType = 'ashray_notice_rejected';
    }
  }

  // Fetch Reading Group details when approval popup is triggered
  useEffect(() => {
    if (popupType === 'bv_approval_notice') {
      getUserBvStatus({})
        .then(res => {
          if (res?.myGroup) {
            setGroupInfo({
              groupName: res.myGroup.groupName,
              bvslName: res.myGroup.bvslName,
              rgsfName: res.myGroup.rgsfName,
            });
          }
        })
        .catch(() => {});
    }
  }, [popupType]);

  // Sync open state with popup detection
  useEffect(() => {
    if (popupType) {
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [popupType]);

  if (!popupType || !profile) return null;

  const handleAcknowledge = async () => {
    setBusy(true);
    try {
      let redirectPath: string | null = null;
      if (popupType === 'bv_role_notice') {
        const roleNoticeLabel = (profile as any).pendingRoleNotice || 'Member';
        const routeMap: Record<string, string> = {
          'BV Supervisor': '/bv-supervisor/dashboard',
          'Reading Group Facilitator (RGF)': '/bvsl/dashboard',
          'Reading Group Sub-Facilitator (RGSF)': '/bv-supervisor/dashboard',
          'BV Admin': '/pw-admin/dashboard',
          'Regular Member': '/user/dashboard',
          'Sadhana Mentor': '/mentor/dashboard',
        };
        redirectPath = routeMap[roleNoticeLabel] || null;
      }

      if (popupType === 'ashray_notice_approved' || popupType === 'ashray_notice_rejected') {
        await acknowledgeAshrayNotice({});
      } else if (popupType === 'bv_approval_notice') {
        await acknowledgeBvApprovalNotice({});
      } else if (popupType === 'bv_rejection_notice') {
        await acknowledgeBvRejectionNotice({});
      } else if (popupType === 'bv_role_notice') {
        await acknowledgeBvRoleNotice({});
      }
      await refreshProfile();
      setOpen(false);

      if (redirectPath) {
        navigate(redirectPath, { replace: true });
      }
    } catch {
      // Keep the database notice pending if acknowledgement fails so it can be
      // shown again instead of being permanently hidden on this device.
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  // Render variables
  let title = '';
  let description = '';
  let icon = null;

  switch (popupType) {
    case 'ashray_notice_approved':
      title = 'Ashraya Level Request Approved! 🎉';
      description = `Hare Krishna, Prabhu! Your Ashraya level request for "${profile.pendingAshrayNoticeLevel || 'Ashraya'}" has been approved!`;
      icon = <CheckCircle className="w-12 h-12 text-primary mx-auto animate-bounce" />;
      break;
    case 'ashray_notice_rejected':
      title = 'Ashraya Level Request Update';
      description = `Hare Krishna, Prabhu! Your Ashraya level request for "${profile.pendingAshrayNoticeLevel || 'Ashraya'}" was not approved at this time. Please contact your guide for more guidance.`;
      icon = <XCircle className="w-12 h-12 text-destructive mx-auto" />;
      break;
    case 'bv_approval_notice':
      title = 'Bhakti Vriksha Registration Approved! 🎉';
      description = 'Hare Krishna, Prabhu! Your registration to join Bhakti Vriksha has been approved. Welcome to your Reading Group!';
      icon = <Sparkles className="w-12 h-12 text-primary mx-auto animate-bounce" />;
      break;
    case 'bv_rejection_notice':
      title = 'Bhakti Vriksha Registration Update';
      description = 'Hare Krishna, Prabhu! Unfortunately, your recent registration for a Bhakti Vriksha reading group was not approved at this time. Please contact your guide for more information.';
      icon = <XCircle className="w-12 h-12 text-destructive mx-auto" />;
      break;
    case 'bv_role_notice': {
      const roleNoticeLabel = (profile as any).pendingRoleNotice || 'Member';
      const dashboardMap: Record<string, string> = {
        'BV Supervisor': 'Supervisor Dashboard',
        'Reading Group Facilitator (RGF)': 'Facilitator (RGF) Dashboard',
        'Reading Group Sub-Facilitator (RGSF)': 'Sub-Facilitator (RGSF) Dashboard',
        'BV Admin': 'Admin Dashboard',
        'Regular Member': 'My Sadhana Dashboard',
        'Sadhana Mentor': 'Sadhana Mentor Dashboard',
      };
      const dashboardName = dashboardMap[roleNoticeLabel] || 'your updated dashboard';
      title = 'Bhakti Vriksha Role Updated 🎉';
      description = `Hare Krishna, Prabhu! Your Bhakti Vriksha role has been updated to: ${roleNoticeLabel}. You now have access to the ${dashboardName} on this platform.`;
      icon = <Sparkles className="w-12 h-12 text-primary mx-auto animate-bounce" />;
      break;
    }
  }

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val && !busy) handleAcknowledge(); }}>
      <DialogContent showCloseButton={false} className="sm:max-w-md text-center p-6 gap-4">
        <div className="pt-2">
          {icon}
        </div>
        <DialogHeader className="text-center">
          <DialogTitle className="text-xl font-bold text-foreground text-center w-full">{title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-1">
            {description}
          </DialogDescription>
        </DialogHeader>

        {popupType === 'bv_approval_notice' && (
          <div className="bg-muted/50 border rounded-lg p-3 text-xs text-left space-y-1.5 my-1">
            <p><strong>• Name of Reading Group:</strong> {groupInfo?.groupName || (profile as any).bvGroupName || 'Assigned Group'}</p>
            <p><strong>• Reading Group Facilitator:</strong> {groupInfo?.bvslName || (profile as any).bvslLeaderName || (profile as any).bvslName || 'Facilitator'}</p>
            <p><strong>• Sub-facilitators:</strong> {groupInfo?.rgsfName || 'None'}</p>
          </div>
        )}

        <DialogFooter className="sm:justify-center w-full flex justify-center mt-2">
          <Button onClick={handleAcknowledge} disabled={busy} className="w-full sm:w-auto px-8">
            {busy ? 'Saving...' : 'I Understand'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
