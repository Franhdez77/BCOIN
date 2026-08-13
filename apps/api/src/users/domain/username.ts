export interface NormalizedUsername {
  display: string;
  normalized: string;
}

export function normalizeUsername(value: string): NormalizedUsername {
  const display = value.trim().normalize('NFC');
  return { display, normalized: display.normalize('NFKC').toLowerCase() };
}
