export function formatDate(value: Date, mode: 'iso' | 'locale', timeZone?: string): string {
  if (mode === 'iso') return value.toISOString();
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(value);
}
