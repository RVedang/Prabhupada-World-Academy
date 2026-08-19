import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { XCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function RejectedPage() {

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
              <XCircle className="w-16 h-16 text-destructive" />
            </div>
            <CardTitle className="text-2xl">Registration Rejected</CardTitle>
            <CardDescription>
              Your registration request has been rejected by your FOLK Guide
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Please contact your guide directly for more information or to discuss reapplying.
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
