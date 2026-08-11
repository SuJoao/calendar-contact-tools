export function generatedVcf(count: number): string {
  return Array.from({ length: count }, (_unused, index) =>
    [
      'BEGIN:VCARD',
      index % 3 === 0 ? 'VERSION:2.1' : index % 3 === 1 ? 'VERSION:3.0' : 'VERSION:4.0',
      `FN:Generated João ${index}`,
      `N:Person ${index};Generated João;;;`,
      `ORG:Fictional Organization ${index % 20};Unit ${index % 5}`,
      `EMAIL;TYPE=work:person${index}@example.test`,
      `EMAIL;TYPE=home:person${index}@home.example.test`,
      `TEL;TYPE=cell:+351 910 ${String(index).padStart(6, '0')}`,
      `ADR;TYPE=work:;;${index} Test Street;Lisbon;;1000-001;Portugal`,
      `NOTE:Generated note ${index} ${'x'.repeat(32)}`,
      'END:VCARD',
    ].join('\r\n'),
  ).join('\r\n');
}
