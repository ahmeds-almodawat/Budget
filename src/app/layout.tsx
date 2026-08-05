import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Enterprise Control Platform",
  description: "Enterprise Project, Budget and Performance Control",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
