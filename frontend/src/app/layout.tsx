import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { APPEARANCE_BOOTSTRAP } from "@/lib/theme";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Careyu Automation — Project Management Tool",
  description: "Manage projects, teams and execution in one place.",
  referrer: "same-origin",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOTSTRAP }} />
      </head>
      <body className={`${inter.className} bg-background text-foreground antialiased min-h-screen selection:bg-cyan-500 selection:text-white`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
