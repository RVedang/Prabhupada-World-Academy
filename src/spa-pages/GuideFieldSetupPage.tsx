import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Database, Home, Globe, RefreshCw, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { RESIDENT_FIELDS, NON_RESIDENT_FIELDS } from '@/config/sadhanaFields';
import { invalidateSadhanaFieldsCache } from '@/lib/endpoints-sdk';

export default function GuideFieldSetupPage() {
  const navigate = useNavigate();
  const [syncing, setSyncing]     = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSyncCache() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await invalidateSadhanaFieldsCache({ scope: 'fields' });
      setSyncResult({ ok: true, message: res.message });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to sync cache';
      setSyncResult({ ok: false, message: msg });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="container mx-auto max-w-3xl">
        <Button variant="ghost" onClick={() => navigate('/guide/dashboard')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>

        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="w-6 h-6" />
            Sadhana Form Fields
          </h1>
          <p className="text-muted-foreground mt-1">
            Fields are defined from the official PDF specification. Residents and non-residents see different forms.
          </p>
        </div>

        {/* ── Cache Sync Panel ──────────────────────────────────────────────── */}
        <Card className="mb-6 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-primary" />
              Field Cache Sync
            </CardTitle>
            <CardDescription>
              The approved resident form is maintained in the application schema so it stays aligned with
              scoring and reports. Non-resident database customisations are cached for fast form loading.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Alert className="bg-muted/50 border-border">
              <Info className="h-4 w-4 text-muted-foreground" />
              <AlertDescription className="text-xs text-muted-foreground">
                <strong className="text-foreground">How it works:</strong> The resident form always uses the
                current approved schema. When you edit a non-resident field in the
                {' '}<code className="font-mono bg-card border border-border rounded px-1 py-0.5 text-xs">SadhanaFields</code>
                {' '}table (via the App Database tab), the change is stored in the database immediately but won't appear
                in the user form until the memory cache is refreshed. Clicking <strong>Sync</strong> clears the cache —
                the next applicable form load will read fresh definitions from the database.
              </AlertDescription>
            </Alert>

            <div className="flex items-center gap-3">
              <Button
                onClick={handleSyncCache}
                disabled={syncing}
                variant="outline"
                className="gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing…' : 'Sync Fields Cache'}
              </Button>
              <span className="text-xs text-muted-foreground">
                Clears cached non-resident field definitions
              </span>
            </div>

            {syncResult && (
              <Alert className={syncResult.ok ? 'border-green-500/40 bg-green-500/10' : 'border-destructive/40 bg-destructive/10'}>
                {syncResult.ok
                  ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                  : <AlertCircle className="h-4 w-4 text-destructive" />
                }
                <AlertDescription className={`text-sm ${syncResult.ok ? 'text-green-700' : 'text-destructive'}`}>
                  {syncResult.message}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6">
          {/* Resident Fields */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Home className="w-5 h-5 text-primary" />
                Resident Form
                <Badge variant="secondary">{RESIDENT_FIELDS.length} fields</Badge>
              </CardTitle>
              <CardDescription>
                Shown to users with an approved residency (Folk Residency members)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {RESIDENT_FIELDS.map(f => (
                  <div key={f.fieldKey} className="flex items-start justify-between gap-2 py-1.5 border-b last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{f.fieldLabel}</p>
                      <p className="text-xs text-muted-foreground font-mono">{f.fieldKey}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant="outline" className="text-xs capitalize">{f.fieldType}</Badge>
                      {f.contributesToScore && <Badge className="text-xs bg-primary/10 text-primary hover:bg-primary/10">scored</Badge>}
                      {f.isRequired && <Badge variant="destructive" className="text-xs">req</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Non-Resident Fields */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-primary" />
                Non-Resident Form
                <Badge variant="secondary">{NON_RESIDENT_FIELDS.length} fields</Badge>
              </CardTitle>
              <CardDescription>
                Shown to all users without an approved residency
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {NON_RESIDENT_FIELDS.map(f => (
                  <div key={f.fieldKey} className="flex items-start justify-between gap-2 py-1.5 border-b last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{f.fieldLabel}</p>
                      <p className="text-xs text-muted-foreground font-mono">{f.fieldKey}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant="outline" className="text-xs capitalize">{f.fieldType}</Badge>
                      {f.contributesToScore && <Badge className="text-xs bg-primary/10 text-primary hover:bg-primary/10">scored</Badge>}
                      {f.isRequired && <Badge variant="destructive" className="text-xs">req</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
