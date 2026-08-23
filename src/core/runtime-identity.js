const GENERIC_BRAND = /not.?a.?brand/i;

function majorVersion(version) {
  const match = String(version ?? '').match(/\d+/);
  return match?.[0] ?? null;
}

function formatBrowser(label, version) {
  const major = majorVersion(version);
  return major ? label + ' ' + major : label;
}

function browserFromExplicitToken(userAgent) {
  const rules = [
    { pattern: /(?:Edg|EdgA|EdgiOS)\/([\d.]+)/, label: 'Microsoft Edge' },
    { pattern: /OPR\/([\d.]+)/, label: 'Opera' },
    { pattern: /Vivaldi\/([\d.]+)/, label: 'Vivaldi' },
    { pattern: /SamsungBrowser\/([\d.]+)/, label: 'Samsung Internet' },
    { pattern: /(?:Firefox|FxiOS)\/([\d.]+)/, label: 'Firefox' },
  ];
  for (const { pattern, label } of rules) {
    const match = userAgent.match(pattern);
    if (match) return formatBrowser(label, match[1]);
  }
  return null;
}

function browserFromBrands(brands) {
  if (!Array.isArray(brands)) return null;
  const reportedBrands = brands.filter(({ brand }) => (
    typeof brand === 'string' && !GENERIC_BRAND.test(brand)
  ));
  const priorities = [
    { pattern: /Microsoft Edge/i, label: 'Microsoft Edge' },
    { pattern: /Google Chrome/i, label: 'Google Chrome' },
    { pattern: /Opera/i, label: 'Opera' },
    { pattern: /^Chromium$/i, label: 'Chromium' },
  ];
  for (const { pattern, label } of priorities) {
    const match = reportedBrands.find(({ brand }) => pattern.test(brand));
    if (match) return formatBrowser(label, match.version);
  }
  const fallback = reportedBrands[0];
  return fallback ? formatBrowser(fallback.brand, fallback.version) : null;
}

function browserFromCompatibilityToken(userAgent) {
  const chrome = userAgent.match(/(?:Chrome|CriOS)\/([\d.]+)/);
  if (chrome) return formatBrowser('Chrome-compatible', chrome[1]);
  const safari = userAgent.match(/Version\/([\d.]+).*Safari\//);
  if (safari) return formatBrowser('Safari', safari[1]);
  return 'Unknown browser';
}

function normalizePlatform(platform, userAgent, maxTouchPoints) {
  const reportedPlatform = String(platform ?? '').toLowerCase();
  if (reportedPlatform.includes('windows')) return 'Windows';
  if (reportedPlatform.includes('android')) return 'Android';
  if (reportedPlatform.includes('chrome os')) return 'ChromeOS';
  if (reportedPlatform.includes('ios')) return 'iOS';
  if (reportedPlatform.includes('mac')) {
    return maxTouchPoints > 1 ? 'iPadOS' : 'macOS';
  }
  if (reportedPlatform.includes('linux')) return 'Linux';

  if (/Windows/i.test(userAgent)) return 'Windows';
  if (/Android/i.test(userAgent)) return 'Android';
  if (/CrOS/i.test(userAgent)) return 'ChromeOS';
  if (/(?:iPhone|iPad|iPod)/i.test(userAgent)) return 'iOS';
  if (/Macintosh/i.test(userAgent)) {
    return maxTouchPoints > 1 ? 'iPadOS' : 'macOS';
  }
  if (/Linux/i.test(userAgent)) return 'Linux';
  return 'Unknown platform';
}

export function describeRuntimeIdentity(navigatorLike = {}) {
  const rawUserAgent = String(navigatorLike.userAgent || 'Unavailable');
  const browser = browserFromExplicitToken(rawUserAgent)
    || browserFromBrands(navigatorLike.userAgentData?.brands)
    || browserFromCompatibilityToken(rawUserAgent);
  const platform = normalizePlatform(
    navigatorLike.userAgentData?.platform,
    rawUserAgent,
    Number(navigatorLike.maxTouchPoints) || 0,
  );

  return {
    browser,
    platform,
    exactPlatformVersion: null,
    rawUserAgent,
  };
}
