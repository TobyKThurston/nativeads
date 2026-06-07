import type { Metadata } from "next";
import { Fredoka, Nunito, Geist_Mono } from "next/font/google";
import "./globals.css";

// Fredoka = chunky rounded display. Nunito = friendly rounded body.
const fredoka = Fredoka({ variable: "--font-fredoka", subsets: ["latin"] });
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"] });
// Mono kept only for the rare technical micro-label.
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "NativeAds - the native-ad factory",
  description:
    "Drop in a video. We find the best spot and render three fun, native ad cuts - automatically.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fredoka.variable} ${nunito.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
