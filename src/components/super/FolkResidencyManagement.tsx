import SuperHostelsPanel from './SuperHostelsPanel';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-sdk';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { Check, X } from 'lucide-react';
import { getGuideResidencyAssignmentRequests, reviewGuideResidencyAssignment } from '@/lib/endpoints-sdk';

export default function FolkResidencyManagement() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);

  const loadRequests = async () => {
    try {
      const result: any = await getGuideResidencyAssignmentRequests({ status: 'Pending' } as any);
      setRequests(Array.isArray(result) ? result : []);
    } catch {
      // Regular guides do not have access to this panel.
      setRequests([]);
    }
  };

  useEffect(() => { if (user) loadRequests(); }, [user]);
  useRealtimeRefresh(['users'], loadRequests, Boolean(user));

  const review = async (requestId: string, action: 'approve' | 'reject') => {
    try {
      await reviewGuideResidencyAssignment({ requestId, action } as any);
      toast.success(action === 'approve' ? 'Residency assignment approved' : 'Residency assignment rejected');
      loadRequests();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to review residency assignment');
    }
  };

  return (
    <div className="space-y-4">
      <SuperHostelsPanel />
      {requests.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Pending Guide Residency Changes <Badge variant="outline" className="ml-2">{requests.length}</Badge></CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {requests.map((request: any) => (
              <div key={request.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm"><div className="font-semibold">{request.requesterName}</div><div className="text-muted-foreground">{request.requestedResidencyNames.join(', ') || 'No residencies selected'}</div></div>
                <div className="flex gap-2"><Button size="sm" onClick={() => review(request.id, 'approve')}><Check className="mr-1 h-3 w-3" />Approve</Button><Button size="sm" variant="outline" onClick={() => review(request.id, 'reject')}><X className="mr-1 h-3 w-3" />Reject</Button></div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
