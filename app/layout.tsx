import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kinesis",
  description: "Life Management Platform",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Kinesis",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  // Lets env(safe-area-inset-bottom) report the iPhone home indicator, which
  // the phone tab bar (KD-054) sits clear of.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider signInUrl="/sign-in">
      <html lang="en">
        <body className={inter.className}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
