import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Bộ máy chat cục bộ đọc data/chatbot/*.json lúc runtime — bảo đảm
  // standalone build mang theo thư mục dữ liệu này.
  outputFileTracingIncludes: {
    "/api/chat": ["./data/chatbot/**/*", "./data/ai/**/*"],
    "/api/admin/chatbot": ["./data/chatbot/**/*"],
    "/api/admin/ai": ["./data/ai/**/*"],
  },
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
