import type { Metadata } from "next";
import { Geist, Geist_Mono, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display face for the wordmark, page titles, and headings; Geist stays the
// working text. Wired through --font-display in globals.css.
const schibsted = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "JobWarden",
    template: "%s · JobWarden",
  },
  description:
    "A private UK job-search workspace with evidence-led job classification.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${schibsted.variable} h-full antialiased`}
    >
      <body className={`${geistSans.className} min-h-full`}>{children}</body>
    </html>
  );
}
