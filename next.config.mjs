/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "amautainversiones.com" },
    ],
  },
};

export default nextConfig;
