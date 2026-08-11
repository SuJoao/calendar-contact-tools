export interface SyntheticCalendarOptions {
  descriptionLength?: number;
  attendeesPerEvent?: number;
  duplicateEvery?: number;
}

export function generateCalendar(
  eventCount: number,
  options: SyntheticCalendarOptions = {},
): string {
  const events = Array.from({ length: eventCount }, (_unused, index) => {
    const uidIndex = options.duplicateEvery ? index % options.duplicateEvery : index;
    const day = String((index % 28) + 1).padStart(2, '0');
    const attendees = Array.from(
      { length: options.attendeesPerEvent ?? 0 },
      (_value, attendee) => `ATTENDEE:mailto:person-${index}-${attendee}@example.test`,
    );
    return [
      'BEGIN:VEVENT',
      `UID:synthetic-${uidIndex}@example.test`,
      `DTSTART:202608${day}T120000Z`,
      `DTEND:202608${day}T130000Z`,
      `SUMMARY:Synthetic event ${index}`,
      ...(options.descriptionLength
        ? [`DESCRIPTION:${'x'.repeat(options.descriptionLength)}`]
        : []),
      ...attendees,
      'END:VEVENT',
    ].join('\r\n');
  });
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Calendar Contact Tools Synthetic Test//EN',
    ...events,
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}
