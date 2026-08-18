import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, User, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-sdk';
import { getGuides } from '@/lib/endpoints-sdk';
import { useUserProfile } from '@/contexts/UserProfileContext';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export default function PendingApprovalPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, refreshProfile } = useUserProfile();
  const [guideName, setGuideName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (user?.email) loadGuideInfo();
    else setLoading(false);
  }, [user?.email]);

  const loadGuideInfo = async () => {
    try {
      const guidesRes = await getGuides({});
      if (profile?.selectedGuideId) {
        const guide = guidesRes.guides.find((g: any) => g.guideId === profile.selectedGuideId);
        if (guide) setGuideName(guide.name);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const handleCheckStatus = async () => {
    setChecking(true);
    try {
      const updatedProfile = await refreshProfile(); // clears cache + re-fetches from sheet
      // AUTH-013 FIX: Route directly based on updated profile status — no full re-auth cycle
      if (updatedProfile?.status === 'ACTIVE') {
        navigate('/dashboard', { replace: true });
      } else if (updatedProfile?.status === 'REJECTED') {
        navigate('/rejected', { replace: true });
      } else {
        toast.info('Still pending approval. Please check with your mentor.');
      }
    } catch {
      toast.error('Failed to check status. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md"
      >
        <Card className="text-center">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <Clock className="w-16 h-16 text-primary" />
            </div>
            <CardTitle className="text-2xl">Pending Approval</CardTitle>
            <CardDescription>
              Your registration is awaiting approval from your mentor
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <Skeleton className="h-16 w-full" />
            ) : guideName ? (
              <div className="bg-muted rounded-lg p-4 text-left space-y-2">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-primary shrink-0" />
                  <p className="text-sm">
                    Your registration has been sent to <strong>{guideName}</strong>.
                  </p>
                </div>
                <p className="text-sm text-muted-foreground pl-6">
                  Please contact your mentor to confirm your registration.
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">
                You will be notified once your mentor approves your registration.
                Please contact your mentor directly if you have any questions.
              </p>
            )}



            <Button className="w-full cursor-pointer" onClick={handleCheckStatus} disabled={checking}>
              {checking ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Checking...</>
              ) : (
                <><RefreshCw className="w-4 h-4 mr-2" /> Check Approval Status</>
              )}
            </Button>

            <Button variant="outline" className="w-full cursor-pointer" onClick={() => navigate('/')}>
              Return to Home
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
