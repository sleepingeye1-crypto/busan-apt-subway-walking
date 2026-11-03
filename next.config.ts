import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  poweredByHeader: false, // 응답에 "X-Powered-By: Next.js" 표시를 빼서 쓰는 기술을 덜 드러낸다
  // 보안 헤더: 다른 사이트가 이 앱을 몰래 겹쳐 띄우는 것(클릭재킹) 등을 브라우저가 막게 한다
  // (콘텐츠 보안 정책(CSP)은 카카오 지도 서버 허용이 필요해 아직 넣지 않았다)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
        ],
      },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
