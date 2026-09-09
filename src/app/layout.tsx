import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "The Kenko Life | People & Assets", description: "Secure HR and fixed asset management" };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
