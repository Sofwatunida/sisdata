import type { Metadata, Viewport } from "next";
import "./globals.css";
import "sweetalert2/dist/sweetalert2.min.css";

export const metadata: Metadata = {
  title: "Sistem Pendataan Personil",
  description: "Aplikasi manajemen pendataan personil, divisi, dan penugasan multi periode",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b172b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
