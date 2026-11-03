import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { PostHogProvider } from "@/components/posthog-provider";
import { AppToast } from "@/components/ui/app-toast";
import { PwaSupport } from "@/components/pwa-support";
import { ThemeProvider } from "@/components/theme-provider";
import { THEME_INIT_SCRIPT } from "@/lib/theme-init-script";
import { SITE_DESCRIPTION, SITE_NAME, SITE_SHARE_IMAGE, SITE_URL } from "@/lib/site";
import "./globals.css";

// Edorax type: DM Sans for everything you read, Unbounded 700 for headings.
const dmSans = localFont({
  src: "./fonts/dm-sans-latin-variable.woff2",
  variable: "--font-dm-sans",
  weight: "100 1000",
  display: "swap",
});

const unbounded = localFont({
  src: "./fonts/unbounded-latin-700.woff2",
  variable: "--font-unbounded",
  weight: "700",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin-variable.woff2",
  variable: "--font-jetbrains-mono",
  weight: "100 800",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: "%s · Edorax",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  // Share previews (WhatsApp, LinkedIn, X); pages override the title, description and image.
  openGraph: { type: "website", siteName: SITE_NAME, title: SITE_NAME, description: SITE_DESCRIPTION, images: [{ url: SITE_SHARE_IMAGE, width: 1200, height: 630, alt: "Edorax" }] },
  twitter: { card: "summary_large_image", images: [SITE_SHARE_IMAGE] },
  // Set NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION to the code Search Console gives for the HTML tag method.
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } : undefined,
  icons: { icon: "/logo.svg", apple: "/icons/apple-touch-icon.png" },
  // iOS reads these when a learner adds Edorax to the home screen (see app/manifest.ts).
  appleWebApp: { capable: true, title: "Edorax", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F7FB" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0F2C" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${dmSans.variable} ${unbounded.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <script
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
          suppressHydrationWarning
        />
        <ThemeProvider>
          <PostHogProvider>{children}</PostHogProvider>
          <AppToast />
        </ThemeProvider>
        <PwaSupport />
      </body>
    </html>
  );
}
