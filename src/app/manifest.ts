import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "BeatMyVendor",
    short_name: "BeatMyVendor",
    description: "Make software vendors compete for you with a verified brief and private, comparable offers.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f2f0e9",
    theme_color: "#171713",
    categories: ["business", "productivity"],
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
