export const permissionsPolicy =
  'accelerometer=(), bluetooth=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()';

export function contentSecurityPolicy(
  scriptHashes: readonly string[],
  options: { responseHeader?: boolean } = {},
): string {
  const hashes = scriptHashes.map((hash) => `'${hash}'`).join(' ');
  return [
    "default-src 'self'",
    `script-src 'self'${hashes ? ` ${hashes}` : ''}`,
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "media-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(options.responseHeader ? ["frame-ancestors 'none'", 'upgrade-insecure-requests'] : []),
  ].join('; ');
}
