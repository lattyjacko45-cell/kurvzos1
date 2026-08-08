import type { Metadata } from "next";
import { DM_Serif_Display, Inter } from "next/font/google";

import { siteConfig } from "@/config/site";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

/**
 * Inter carries the entire interface. The variable name is --font-inter rather
 * than --font-sans because the theme layer maps font-sans onto it; naming both
 * the same would make the mapping circular.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/** Display only: page titles, executive names, the CEO Packet masthead. */
const dmSerifDisplay = DM_Serif_Display({
  variable: "--font-dm-serif",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    /**
     * The font variables must live on <html>, not <body>.
     *
     * The theme layer declares --font-sans/--font-serif on :root, and a custom
     * property's own value is resolved on the element that declares it. With
     * --font-inter/--font-dm-serif defined only on <body>, the :root lookup
     * failed and both fell back to the generic system stacks — which is why
     * DM Serif Display never appeared.
     */
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${dmSerifDisplay.variable}`}
    >
      <body className="font-sans antialiased">
        <TooltipProvider>
          {children}
          <Toaster richColors position="top-right" />
        </TooltipProvider>
      </body>
    </html>
  );
}
