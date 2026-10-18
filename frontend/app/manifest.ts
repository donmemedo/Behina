import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "خانه‌بهینه · Khaneh Behineh",
    short_name: "خانه‌بهینه",
    description: "صرفه‌جویی تضمینی انرژی برای ساختمان‌های ایران",
    lang: "fa",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#10b981",
    categories: ["utilities", "finance"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "محاسبه صرفه‌جویی", url: "/#calc", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "پیش‌خوان", url: "/dashboard", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
