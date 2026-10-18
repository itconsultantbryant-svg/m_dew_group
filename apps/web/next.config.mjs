const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@mdg/domain', '@mdg/api-client', '@mdg/design-tokens'],
  env: {
    NEXT_PUBLIC_API_URL: apiUrl,
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

export default nextConfig;
