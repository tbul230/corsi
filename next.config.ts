import type { NextConfig } from 'next';

// Firebase Auth's sign-in helper normally lives on corsitask.firebaseapp.com, which some school
// networks block. We serve it from our own domain instead (authDomain = this site) by proxying
// /__/auth/* and /__/firebase/* to Firebase Hosting. See firebase.google.com/docs/auth/web/redirect-best-practices
const FIREBASE_HOSTING = 'https://corsitask.firebaseapp.com';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return [
      { source: '/__/auth/:path*', destination: `${FIREBASE_HOSTING}/__/auth/:path*` },
      { source: '/__/firebase/:path*', destination: `${FIREBASE_HOSTING}/__/firebase/:path*` }
    ];
  },
  async headers() {
    return [
      {
        // Everything except the proxied Firebase helper, which must be frameable by our own pages.
        source: '/((?!__/).*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' }
        ]
      }
    ];
  }
};

export default nextConfig;
