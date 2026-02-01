import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Fonts
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Metadata with explicit icon override
export const metadata: Metadata = {
  title: "BankMaps Grok Chat",
  description: "Grok-powered AI assistant for BankMaps members",
  icons: {
    icon: "/bankmapsfav.ico",           // Primary favicon (renamed to avoid cache)
    shortcut: "/bankmapsfav.ico",
    apple: "/apple-touch-icon.png",      // For iOS home screen
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Force favicon load - primary one */}
        <link rel="icon" href="/bankmapsfav.ico" />

        {/* Standard sizes for high-DPI/retina */}
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />

        {/* Apple touch icon */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>

      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}