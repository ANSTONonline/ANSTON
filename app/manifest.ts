import type { MetadataRoute } from "next";

// Web app manifest: lets people install Anston on their phone's home screen
// so it opens full-screen like a regular app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Anston",
    short_name: "Anston",
    description:
      "Buy, sell, bid, rent and book services, all in one place: vehicles, homes, clothes, jewelry, food and more.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#7A1E2B",
    categories: ["shopping", "business", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Browse", url: "/browse", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Sell", url: "/sell", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Messages", url: "/messages", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
