import type { Metadata } from "next";
import { Work_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_NAME, TAGLINE } from "@/lib/brand";
import { BASE_PATH } from "@/lib/showcase";
import "./globals.css";

const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  // Both listed: an `icons` object here replaces the link Next would add for app/icon.svg on its own.
  icons: { icon: { url: `${BASE_PATH}/icon.svg`, type: "image/svg+xml" }, apple: `${BASE_PATH}/localify-icon.png` },
  title: APP_NAME,
  description: TAGLINE,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The font variable sits on <html>: Tailwind sets the page font there, and on <body> the variable
    // was out of reach, so every page silently fell back to the system font.
    <html lang="en" className={`dark ${workSans.variable}`}>
      <body className="antialiased">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster theme="dark" position="top-center" />
      </body>
    </html>
  );
}
