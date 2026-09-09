import { Card } from '@/components/ui/card';

interface AuthLayoutProps {
  children: React.ReactNode;
  maxWidth?: string;
}

export default function AuthLayout({ children, maxWidth = 'max-w-md' }: AuthLayoutProps) {
  return (
    <div className="min-h-dvh bg-gradient-to-b from-background to-secondary flex items-center justify-center p-4">
      <Card className={`w-full ${maxWidth}`}>
        {children}
      </Card>
    </div>
  );
}
