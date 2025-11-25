// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrendGenie RugShield – DeFi Safety Scanner for Ethereum & BNB (Honeypot & Rug Pull Risk)",
  description: "TrendGenie RugShield is a free DeFi safety scanner for Ethereum and BNB Chain. Paste any token address and instantly see honeypot, rug pull and ownership risk with beginner and pro explanations."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
