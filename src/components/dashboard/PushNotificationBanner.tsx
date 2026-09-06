import { useEffect, useState } from 'react';
import { Bell, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useUserProfile } from '@/contexts/UserProfileContext';
import {
  getNotificationPermission,
  requestNotificationPermission,
  subscribeToPush,
  getPwNotificationConfig,
} from '@/utils/sadhanaNotification';

const DISMISS_KEY = 'push_banner_dismissed';

export default function PushNotificationBanner() {
  const { profile } = useUserProfile();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pwConfig, setPwConfig] = useState({ enabled: true, times: ['21:20', '22:20'] });

  const isFolk = profile?.segment === 'FOLK';

  useEffect(() => {
    let active = true;
    getPwNotificationConfig().then((config) => {
      if (active) setPwConfig(config);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    // If PW user and disabled by PW Super Admin, don't show
    if (!isFolk && !pwConfig.enabled) return;
    // Don't show if dismissed, unsupported, or already enabled
    if (localStorage.getItem(DISMISS_KEY)) return;
    if (typeof Notification === 'undefined' || !('PushManager' in window)) return;
    const perm = getNotificationPermission();
    if (perm === 'granted' || perm === 'denied') return;
    setVisible(true);
  }, [isFolk, pwConfig.enabled]);

  if ((!isFolk && !pwConfig.enabled) || !visible) return null;

  const handleEnable = async () => {
    setBusy(true);
    try {
      const perm = await requestNotificationPermission();
      if (perm === 'denied') {
        toast.error('Notifications blocked — you can unblock in browser settings');
        setVisible(false);
        return;
      }
      if (perm !== 'granted') { setBusy(false); return; }
      const ok = await subscribeToPush();
      if (ok) toast.success('Push notifications enabled! 🔔');
      else toast.error('Could not save subscription — try again from Profile');
      setVisible(false);
    } catch {
      toast.error('Something went wrong');
    } finally { setBusy(false); }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  };

  // Format times nicely for PW users (e.g., "21:20", "22:20" -> "9:20 PM & 10:20 PM")
  const formatTimeStr = (t24: string) => {
    const [hStr, mStr] = t24.split(':');
    const h = parseInt(hStr || '0', 10);
    const m = mStr || '00';
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 === 0 ? 12 : h % 12;
    return `${displayH}:${m} ${ampm}`;
  };
  const timesListStr = (pwConfig.times || ['21:20', '22:20']).map(formatTimeStr).join(' & ');

  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
      <Bell className="w-5 h-5 text-primary shrink-0" />
      <p className="flex-1 text-sm text-foreground">
        <span className="font-medium">Never miss your Sadhana</span>
        <span className="text-muted-foreground"> — enable push reminders to receive timely Sadhana alerts!</span>
      </p>
      <Button size="sm" onClick={handleEnable} disabled={busy} className="shrink-0">
        {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
        Enable
      </Button>
      <button
        onClick={handleDismiss}
        className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
