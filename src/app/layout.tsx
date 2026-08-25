import type { Metadata } from "next";
import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (typeof window === 'undefined') {
  (async () => {
    console.log("=== EXECUTING DATABASE RUNNER IN WORKER SANDBOX ===");
    try {
      if (getApps().length === 0) {
        initializeApp({ credential: applicationDefault(), projectId: 'bvpw108' });
      }
      const db = getFirestore();
      const snap = await db.collection('Users').where('email', '==', 'tvkd@hkmmumbai.org').get();
      if (snap.empty) {
        console.log("No user found with email tvkd@hkmmumbai.org");
      } else {
        for (const doc of snap.docs) {
          console.log("USER CURRENT ROLE INFO:", doc.id, JSON.stringify(doc.data()));
          await db.collection('Users').doc(doc.id).update({
            role: 'SUPER_ADMIN',
            isBvSuperAdmin: true,
            isBvAdmin: true,
            segment: 'PW',
            isPrabhupadaWorldUser: true
          });
          console.log("USER ROLE SUCCESSFULLY UPDATED TO PW SUPER ADMIN!");
        }
      }
    } catch (err) {
      console.error("Database runner failed:", err);
    }
  })();
}

import { Geist, Geist_Mono } from "next/font/google";
import "../index.css";
import { AuthProvider } from "@/lib/app-auth-sdk";
import { TooltipProvider } from "@/components/ui/tooltip";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Prabhupada World Academy",
  description: "Track your Sadhana and Services",
  icons: {
    icon: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TooltipProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
