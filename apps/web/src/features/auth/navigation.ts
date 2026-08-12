export function getSafeRedirect(value: string | null, fallback = '/account'): string {
  if (value === null || !value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }

  try {
    const base = new URL('https://bichocoin.invalid');
    const candidate = new URL(value, base);

    if (candidate.origin !== base.origin) {
      return fallback;
    }

    return `${candidate.pathname}${candidate.search}${candidate.hash}`;
  } catch {
    return fallback;
  }
}

export function navigateTo(path: string): void {
  window.location.assign(path);
}
