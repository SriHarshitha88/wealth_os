/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the PDF renderer (and its native-ish deps) out of the bundler.
  serverExternalPackages: ['@react-pdf/renderer'],
};
export default nextConfig;
