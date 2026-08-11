// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { contentSecurityPolicy, permissionsPolicy } from '../config/security';
import { normalizeSiteUrl } from '../config/site';
import { downloadText } from '../utils/files';
import { cleanupRouteResources, registerRouteCleanup } from '../utils/lifecycle';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
  cleanupRouteResources();
});

describe('production security helpers', () => {
  it('normalizes HTTPS origins and preserves configured subpaths', () => {
    expect(normalizeSiteUrl('https://tools.example/project///')).toBe(
      'https://tools.example/project/',
    );
    expect(() => normalizeSiteUrl('http://tools.example')).toThrow(/HTTPS/);
    expect(() => normalizeSiteUrl('https://tools.example/?token=secret')).toThrow(/query/);
  });

  it('keeps worker and framing policy explicit', () => {
    const meta = contentSecurityPolicy(['sha256-test']);
    expect(meta).toContain("worker-src 'self'");
    expect(meta).toContain("manifest-src 'self'");
    expect(meta).not.toContain('frame-ancestors');
    expect(contentSecurityPolicy([], { responseHeader: true })).toContain("frame-ancestors 'none'");
    expect(permissionsPolicy).toContain('camera=()');
  });
});

describe('temporary resource cleanup', () => {
  it('runs route cleanups once and supports explicit unregistering', () => {
    const active = vi.fn();
    const removed = vi.fn();
    registerRouteCleanup(active);
    const unregister = registerRouteCleanup(removed);
    unregister();
    cleanupRouteResources();
    cleanupRouteResources();
    expect(active).toHaveBeenCalledOnce();
    expect(removed).not.toHaveBeenCalled();
  });

  it('revokes each download object URL after a WebKit-safe delay', () => {
    vi.useFakeTimers();
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    downloadText('hello', 'result.txt', 'text/plain');
    expect(create).toHaveBeenCalledOnce();
    expect(revoke).not.toHaveBeenCalled();
    expect(document.querySelector('a[download]')).toBeNull();
    vi.advanceTimersByTime(1_000);
    expect(revoke).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('blob:test');
  });
});
