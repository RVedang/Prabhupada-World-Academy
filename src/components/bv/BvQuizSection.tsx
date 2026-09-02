import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BookOpen, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getMyBvQuizSubmissions } from '@/lib/endpoints-sdk';
import type { GetMyBvQuizSubmissionsOutputType } from '@/lib/endpoints-sdk';
import BvQuizTaker from './BvQuizTaker';
import { format } from 'date-fns';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

interface Props {
  userId: string;
}

type QuizData = GetMyBvQuizSubmissionsOutputType;

export default function BvQuizSection({ userId }: Props) {
  const [data, setData] = useState<QuizData | null>(null);
  const [loading, setLoading] = useState(true);
  const [takingQuizId, setTakingQuizId] = useState<string | null>(null);
  const [takingQuizTitle, setTakingQuizTitle] = useState('');
  const [reviewSubmissionId, setReviewSubmissionId] = useState<string | null>(null);
  const [reviewQuizTitle, setReviewQuizTitle] = useState('');

  const load = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const r = await getMyBvQuizSubmissions({});
      setData(r as QuizData);
    } catch { toast.error('Failed to load quizzes'); }
    finally { if (showLoading) setLoading(false); }
  };

  useEffect(() => { load(); }, [userId]);
  // A facilitator activating a centrally published PW quiz should make it
  // available to active group members immediately, without polling.
  useRealtimeRefresh(['quizzes', 'groups'], () => { void load(false); }, Boolean(userId));

  if (loading) return (
    <Card><CardContent className="py-4 flex justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </CardContent></Card>
  );

  if (!data || (data.pendingQuizzes.length === 0 && data.submissions.length === 0)) return null;

  const closeDialog = () => {
    setTakingQuizId(null);
    setReviewSubmissionId(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">BV Quizzes</h3>
        </div>
        {data.stats.totalTaken > 0 && (
          <Badge variant="outline" className="text-xs">
            Avg: {data.stats.avgPercent}%
          </Badge>
        )}
      </div>

      {data.pendingQuizzes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ready to take</p>
        {data.pendingQuizzes.map((q: any) => (
          <Card
            key={q.id}
            className="border-l-4 border-l-primary cursor-pointer hover:shadow-sm transition-shadow"
            onClick={() => { setTakingQuizTitle(q.title); setTakingQuizId(q.id); }}
          >
            <CardContent className="py-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm">{q.title}</p>
                  <Badge className="text-xs bg-primary/10 text-primary border-primary/20">New</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {q.questionCount} questions
                  {q.createdAt ? ` · ${format(new Date(q.createdAt), 'd MMM')}` : ''}
                </p>
              </div>
              <Button size="sm" variant="default" className="shrink-0 text-xs h-8 gap-1">
                Start <ChevronRight className="w-3 h-3" />
              </Button>
            </CardContent>
          </Card>
        ))}
        </div>
      )}

      {data.submissions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Completed quizzes</p>
          {data.submissions.map((submission: any) => (
            <Card
              key={submission.id}
              className="border-l-4 border-l-emerald-500 cursor-pointer hover:shadow-sm transition-shadow"
              onClick={() => { setReviewQuizTitle(submission.quizTitle); setReviewSubmissionId(submission.id); }}
            >
              <CardContent className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{submission.quizTitle}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Submitted {submission.submittedAt ? format(new Date(submission.submittedAt), 'd MMM yyyy') : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50">
                    {submission.percentage}%
                  </Badge>
                  <Button size="sm" variant="outline" className="text-xs h-8 gap-1">
                    Review <ChevronRight className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Quiz Dialog popup */}
      <Dialog open={!!takingQuizId || !!reviewSubmissionId} onOpenChange={open => { if (!open) closeDialog(); }}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-4xl max-h-[92vh] overflow-hidden p-0">
          <div className="min-w-0 max-h-[92vh] overflow-y-auto overflow-x-hidden p-5 sm:p-8">
            <DialogHeader className="border-b pb-4 mb-5">
              <DialogTitle className="min-w-0 break-words text-lg sm:text-xl leading-snug pr-8">{takingQuizTitle || reviewQuizTitle}</DialogTitle>
            </DialogHeader>
            {(takingQuizId || reviewSubmissionId) && (
              <BvQuizTaker
                quizId={takingQuizId || ''}
                submissionId={reviewSubmissionId || undefined}
                onBack={closeDialog}
                // Do not replace this dialog with the section skeleton while
                // the result screen is being shown. Refresh the quiz list in
                // the background so the user sees their score immediately.
                onSubmitted={() => { void load(false); }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
