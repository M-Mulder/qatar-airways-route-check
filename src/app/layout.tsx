import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import { Fraunces, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { QsuitePriceAlertBar } from "@/components/QsuitePriceAlertBar";

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
  title: "Qatar'ed",
  description:
    "Compare your Qatar Airways booking with what actually flew—Qsuite, aircraft type, and the last-minute swap problem.",
  /**
   * `src/app/icon.png` + `apple-icon.png` — Next serves `/icon.png` and `/apple-icon.png` (stable across deploys).
   */
  icons: {
    icon: [
      { url: "/icon-48.png", type: "image/png", sizes: "48x48" },
      { url: "/icon.png", type: "image/png", sizes: "32x32" },
    ],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#06080c",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const fontVars = `${fraunces.variable} ${ibmPlexSans.variable} ${jetbrainsMono.variable}`;

  return (
    <html lang="en" className={`${fontVars} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="relative z-20 border-b border-[var(--ops-line)] bg-[var(--ops-elevated)]/80 backdrop-blur-md ops-header-shimmer">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
            <Link
              href="/compare"
              className="group flex min-w-0 max-w-full items-center gap-3 md:gap-3.5"
            >
              <Image
                src="/qatared-logo.png"
                alt="Qatar'ed — parody site logo"
                width={112}
                height={112}
                sizes="(max-width: 768px) 44px, 56px"
                className="h-11 w-11 shrink-0 rounded-full object-contain ring-2 ring-[var(--ops-cyan)]/35 shadow-[0_0_28px_rgba(94,234,212,0.16)] transition-[box-shadow,transform] group-hover:shadow-[0_0_36px_rgba(232,165,75,0.22)] md:h-14 md:w-14"
                priority
              />
              <span
                className="ops-display truncate text-xl text-[var(--ops-fg)] md:text-2xl"
                style={{ textShadow: "0 0 40px rgba(94, 234, 212, 0.08)" }}
              >
                <span className="text-[var(--ops-cyan)]">Qatar</span>
                <span className="text-[var(--ops-fg)]">&apos;ed</span>
              </span>
            </Link>
            <nav className="flex shrink-0 items-center gap-5 text-sm font-medium">
              <Link
                href="/compare"
                className="text-[var(--ops-muted)] transition-colors hover:text-[var(--ops-cyan)]"
              >
                Compare
              </Link>
              <Link
                href="/pricing"
                className="text-[var(--ops-muted)] transition-colors hover:text-[var(--ops-cyan)]"
              >
                Pricing
              </Link>
            </nav>
          </div>
        </header>
        <QsuitePriceAlertBar />
        <main className="ops-main-grid relative z-10 flex-1">{children}</main>
      </body>
    </html>
  );
}
