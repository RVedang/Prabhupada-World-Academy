import React, { useEffect, useState } from 'react';
import { Home, CheckCircle2, XCircle } from 'lucide-react';
import { useUserProfile } from '@/contexts/UserProfileContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function TransferNoticeModal() {
  const { profile, refreshProfile } = useUserProfile();
  const [modalOpen, setModalOpen] = useState(false);
  const [notice, setNotice] = useState<{
    transferId: string;
    status: 'Approved' | 'Rejected';
    residencyName: string | null;
    storageKey: string;
  } | null>(null);

  useEffect(() => {
    if (!profile || !profile.userId) return;

    const transferId = profile.latestResidencyTransferId;
    const status = profile.latestResidencyTransferStatus;

    if (transferId && (status === 'Approved' || status === 'Rejected')) {
      const storageKey = `seen_residency_transfer_${transferId}`;
      const hasSeen = localStorage.getItem(storageKey);
      if (!hasSeen) {
        setNotice({
          transferId,
          status: status as 'Approved' | 'Rejected',
          residencyName: profile.residencyName || null,
          storageKey,
        });
        setModalOpen(true);
      }
    }
  }, [profile]);

  const handleAcknowledge = async () => {
    if (notice) {
      localStorage.setItem(notice.storageKey, 'true');
    }
    setModalOpen(false);
    await refreshProfile();
    setNotice(null);
  };

  if (!modalOpen || !notice) return null;

  const isApproved = notice.status === 'Approved';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="transfer-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden p-6 space-y-5 animate-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 border-b border-border/60 pb-4">
          <div className={`p-3 rounded-full shrink-0 ${isApproved ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>
            {isApproved ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 id="transfer-modal-title" className="text-lg font-bold text-foreground">FOLK Residency Update</h3>
              <Badge variant="outline" className={`text-[10px] uppercase font-bold ${isApproved ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' : 'bg-red-500/10 text-red-600 border-red-500/30'}`}>
                {notice.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">Status notice for your residency transfer request</p>
          </div>
        </div>

        <div className="space-y-3">
          {isApproved ? (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1.5">
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                🎉 Request Approved!
              </p>
              <p className="text-xs text-muted-foreground">
                {notice.residencyName
                  ? `Your request to join ${notice.residencyName} has been approved by the guide. You now have official residency access.`
                  : 'Your request regarding residency transfer has been successfully processed.'}
              </p>
            </div>
          ) : (
            <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl space-y-1.5">
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                ❌ Request Rejected
              </p>
              <p className="text-xs text-muted-foreground">
                Your request for residency transfer was reviewed and not approved at this time. Please contact your guide for more details.
              </p>
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
      </div>
    </div>
  );
}
