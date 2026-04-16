import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Fraunces, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  weight: ["400", "600", "700"],
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-ibm-plex",
  display: "swap",
  weight: ["400", "500", "600"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Qatar Airways route-check",
  description: "Compare your Qatar Airways schedule with live flight tracking and Qsuite info.",
};

export const viewport: Viewport = {
  themeColor: "#06080c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const fontVars = `${fraunces.variable} ${ibmPlexSans.variable} ${jetbrainsMono.variable}`;

  return (
    <html lang="en" className={`${fontVars} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="relative z-20 border-b border-[var(--ops-line)] bg-[var(--ops-elevated)]/80 backdrop-blur-md ops-header-shimmer">
          <div className="mx-auto flex max-w-6xl items-center px-4 py-4 md:px-6">
            <Link
              href="/compare"
              className="ops-display truncate text-xl text-[var(--ops-fg)] md:text-2xl"
              style={{ textShadow: "0 0 40px rgba(94, 234, 212, 0.08)" }}
            >
              Qatar <span className="text-[var(--ops-cyan)]">route</span>-check
            </Link>
          </div>
        </header>
        <main className="ops-main-grid relative z-10 flex-1">{children}</main>
      </body>
    </html>
  );
}
