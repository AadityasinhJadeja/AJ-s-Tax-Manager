import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AJ Finance Manager",
  description: "Personal take-home pay calculator for hourly and salary scenarios."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
