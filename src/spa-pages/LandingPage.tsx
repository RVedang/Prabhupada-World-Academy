import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-sdk';
import { useEffect, useState } from 'react';
import { Loader2, LogIn, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

const PWA_LOGO = 'https://images.fillout.com/orgid-615562/flowpublicid-u91plgmzcu/widgetid-default/q1fJEkENG5kbvfjYaFbDeT/pasted-image-1773145742081.png';

export default function LandingPage() {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();
  const [authError] = useState<string | null>(null);
  const [authenticating] = useState(false);

  useEffect(() => {
    if (user) navigate('/auth-callback', { replace: true });
  }, [user, navigate]);

  const handleSignIn = () => {
    navigate('/login');
  };

  const handleRegister = () => {
    navigate('/signup');
  };

  if (isLoading || authenticating) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-2">
        <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
        <span className="text-sm text-muted-foreground">Connecting to Google Auth...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm text-center space-y-8"
      >

        {/* Logo / Brand */}
        <div className="flex flex-col items-center gap-3">
          <motion.img
            initial={{ scale: 0.5, rotate: -15, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            src={PWA_LOGO}
            alt="Prabhupada World Academy"
            className="w-24 h-24 object-contain"
          />
          <div>
            <motion.h1 
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="text-2xl font-bold text-foreground leading-tight"
            >
              Prabhupada World Academy
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="text-sm text-muted-foreground mt-1"
            >
              Daily Spiritual Practice Tracker
            </motion.p>
          </div>
        </div>

        {authError && (
          <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg border border-destructive/20 text-left">
            <strong>Authentication Error:</strong> {authError}
          </div>
        )}

        {/* Buttons */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          className="space-y-3"
        >
          {/* Sign In — existing users */}
          <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
            <Button
              className="w-full shadow-md font-semibold cursor-pointer"
              size="lg"
              onClick={handleSignIn}
            >
              <LogIn className="w-4 h-4 mr-2" />
              Sign In
            </Button>
          </motion.div>

          {/* Register — new users */}
          <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
            <Button
              className="w-full shadow-md font-semibold cursor-pointer"
              size="lg"
              variant="outline"
              onClick={handleRegister}
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Register
            </Button>
          </motion.div>

          <p className="text-xs text-muted-foreground">
            New users will be guided through registration after signing in.
          </p>
        </motion.div>

      </motion.div>
    </div>
  );
}
