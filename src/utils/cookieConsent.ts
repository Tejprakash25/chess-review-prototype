const CONSENT_KEY = 'chess-review-cookie-consent';

export type CookieConsent = {
  necessary: true;
  analytics: boolean;
  decidedAt: string;
};

export function getCookieConsent(): CookieConsent | null {
  try {
    const stored = localStorage.getItem(CONSENT_KEY);

    if (!stored) {
      return null;
    }

    const parsed: unknown = JSON.parse(stored);

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('necessary' in parsed) ||
      !('analytics' in parsed) ||
      !('decidedAt' in parsed) ||
      parsed.necessary !== true ||
      typeof parsed.analytics !== 'boolean' ||
      typeof parsed.decidedAt !== 'string'
    ) {
      return null;
    }

    return parsed as CookieConsent;
  } catch {
    return null;
  }
}

export function saveCookieConsent(
  analytics: boolean,
): CookieConsent {
  const consent: CookieConsent = {
    necessary: true,
    analytics,
    decidedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
  } catch {
    // Storage may be unavailable. Do not assume consent was saved.
  }

  return consent;
}
