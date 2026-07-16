import type { Metadata } from "next";
import { Playfair_Display, Open_Sans } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/lib/site";
import { env } from "@/lib/env";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
});

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: {
    default: "Norcineria Taccalite — Ancona dal 1946",
    template: "%s — Norcineria Taccalite",
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  keywords: [
    "norcineria",
    "porchetta",
    "Ancona",
    "salumi",
    "formaggi",
    "ciauscolo",
    "Marche",
    "gastronomia",
  ],
  authors: [{ name: siteConfig.name }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: siteConfig.locale,
    siteName: siteConfig.name,
    title: "Norcineria Taccalite — Ancona dal 1946",
    description: siteConfig.description,
    url: env.siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "Norcineria Taccalite — Ancona dal 1946",
    description: siteConfig.description,
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={cn("h-full", playfair.variable, openSans.variable, "font-sans")}>
      <body className="flex min-h-full flex-col antialiased">{children}</body>
    </html>
  );
}
