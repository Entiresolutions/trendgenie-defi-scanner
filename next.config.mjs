/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
    serverActions: {
      allowedOrigins: ["app.trendgenie.io", "localhost:3000"]
    }
  }
};

export default nextConfig;
