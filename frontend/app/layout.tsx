import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Inkomoko | Impact & Early Warning",
  description: "AI-driven impact measurement and early warning for refugee-led microenterprises.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
