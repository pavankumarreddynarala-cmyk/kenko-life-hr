import "./globals.css";
import type { Metadata } from "next";
import { ToastProvider } from "@/components/toast";

export const metadata: Metadata = {
  title: "The Kenko Life | People & Assets",
  description: "Secure HR and fixed asset management",
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
