import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const SITE_URL = "https://cortavatares.vercel.app";

export const viewport: Viewport = {
  themeColor: "#5c6bc0",
};

export const metadata: Metadata = {
  title: "Cortavatares – Recorta y edita avatares",
  description:
    "Herramienta online gratuita para recortar avatares desde una imagen. Sube una foto, configura el grid, ajusta márgenes y descarga cada avatar editado individualmente o en ZIP.",
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Cortavatares – Recorta y edita avatares",
    description:
      "Sube una imagen, define el grid, ajusta márgenes y recorta tus avatares. Edita brillo, contraste, rotación y descarga en ZIP.",
    url: SITE_URL,
    siteName: "Cortavatares",
    locale: "es_ES",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cortavatares – Recorta y edita avatares",
    description:
      "Herramienta online para recortar y editar avatares desde una imagen con grid configurable.",
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={cn("font-sans", geist.variable)}>
      <body><TooltipProvider delayDuration={200}>{children}</TooltipProvider></body>
    </html>
  );
}
