import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import BvslQuizPanel from '@/components/bvsl/BvslQuizPanel';
import { getBvslGroups } from '@/lib/endpoints-sdk';

export default function PwQuizManagementPanel() {
  const [groups, setGroups] = useState<{ id: string; groupName: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBvslGroups({ bvslId: 'ALL' })
      .then(response => {
        const unique = new Map<string, { id: string; groupName: string }>();
        for (const group of response.groups || []) {
          if (String(group.segment || 'PW').toUpperCase() !== 'PW' || group.isActive === false) continue;
          unique.set(group.id, { id: group.id, groupName: group.groupName || 'Reading Group' });
        }
        setGroups([...unique.values()].sort((a, b) => a.groupName.localeCompare(b.groupName)));
      })
      .catch((error: any) => toast.error(error.message || 'Failed to load Prabhupada World reading groups'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <BvslQuizPanel
      bvslId="ALL"
      groups={groups}
      department="PW"
      canManageContent
      canToggleGroupActivation
    />
  );
}
