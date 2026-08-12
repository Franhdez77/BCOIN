export function consumeTokenFragment(): string | undefined {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const token = fragment.get('token')?.trim();

  if (window.location.hash.length > 0) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }

  return token || undefined;
}
