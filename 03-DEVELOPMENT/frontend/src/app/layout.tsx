import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import RootLayout from "@/components/layout/RootLayout";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Tradebaas - USDC Futures Trading Platform",
  description: "24/7 USDC futures trading platform with automated strategies for Deribit exchange",
  keywords: ["trading", "USDC", "futures", "Deribit", "cryptocurrency", "automated trading"],
};

export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        <RootLayout>
          {children}
        </RootLayout>
      </body>
    </html>
  );
}
