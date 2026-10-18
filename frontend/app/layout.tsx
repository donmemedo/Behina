import type { Metadata, Viewport } from "next";
import { Vazirmatn } from "next/font/google";
import { cookies } from "next/headers";
import { Providers } from "@/lib/i18n";
import "./globals.css";

const vazir = Vazirmatn({ subsets: ["arabic", "latin"], variable: "--font-vazir", display: "swap" });

export const metadata: Metadata = {
  title: "خانه‌بهینه · Khaneh Behineh",
  description: "Guaranteed energy savings for Iranian buildings. صرفه‌جویی تضمینی انرژی.",
  appleWebApp: { capable: true, title: "خانه‌بهینه", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

// Runs before paint so the saved/system theme never flashes.
const themeScript = `try{var t=localStorage.getItem("theme")||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = (await cookies()).get("lang")?.value === "en" ? "en" : "fa";
  return (
    <html lang={lang} dir={lang === "fa" ? "rtl" : "ltr"} className={vazir.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers initialLang={lang}>{children}</Providers>
      </body>
    </html>
  );
}
