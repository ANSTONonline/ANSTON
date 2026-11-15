import type { MetadataRoute } from "next";

// Served at /robots.txt. Lets search engines in, keeps them out of private
// pages, and points them to the sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/account",
        "/messages",
        "/sell",
        "/cart",
        "/favorites",
        "/auth",
        "/api",
        "/listing/*/edit",
      ],
    },
    sitemap: "https://www.myanston.com/sitemap.xml",
  };
}
