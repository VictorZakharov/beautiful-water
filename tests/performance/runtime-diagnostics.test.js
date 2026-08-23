import { describe, expect, test } from 'bun:test';
import { readRendererFrameDiagnostics } from '../../src/core/renderer-diagnostics.js';
import { describeRuntimeIdentity } from '../../src/core/runtime-identity.js';

describe('runtime identity diagnostics', () => {
  test('uses reported Chromium brands without treating compatibility tokens as browsers', () => {
    const rawUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
      + 'AppleWebKit/537.36 (KHTML, like Gecko) '
      + 'Chrome/151.0.0.0 Safari/537.36';
    const identity = describeRuntimeIdentity({
      userAgent: rawUserAgent,
      userAgentData: {
        brands: [
          { brand: 'Not_A Brand', version: '99' },
          { brand: 'Chromium', version: '151' },
          { brand: 'Google Chrome', version: '151' },
        ],
        platform: 'macOS',
      },
    });

    expect(identity).toEqual({
      browser: 'Google Chrome 151',
      platform: 'macOS',
      exactPlatformVersion: null,
      rawUserAgent,
    });
  });

  test('recognizes Safari without interpreting its WebKit compatibility text', () => {
    const identity = describeRuntimeIdentity({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
        + 'AppleWebKit/605.1.15 (KHTML, like Gecko) '
        + 'Version/26.0 Safari/605.1.15',
    });

    expect(identity.browser).toBe('Safari 26');
    expect(identity.platform).toBe('macOS');
    expect(identity.exactPlatformVersion).toBeNull();
  });

  test('prefers explicit Edge and Firefox product tokens', () => {
    expect(describeRuntimeIdentity({
      userAgent: 'Mozilla/5.0 Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0',
    }).browser).toBe('Microsoft Edge 151');
    expect(describeRuntimeIdentity({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:151.0) '
        + 'Gecko/20100101 Firefox/151.0',
    }).browser).toBe('Firefox 151');
  });
});

describe('per-frame renderer diagnostics', () => {
  test('uses the WebGPU per-frame drawCalls field instead of cumulative calls', () => {
    expect(readRendererFrameDiagnostics({
      info: {
        render: {
          calls: 7_404,
          drawCalls: 37,
          triangles: 196_753,
        },
      },
    })).toEqual({
      drawCalls: 37,
      triangles: 196_753,
    });
  });

  test('falls back to the WebGL per-frame calls field', () => {
    expect(readRendererFrameDiagnostics({
      info: {
        render: {
          calls: 42,
          triangles: 123_456,
        },
      },
    })).toEqual({
      drawCalls: 42,
      triangles: 123_456,
    });
  });
});
