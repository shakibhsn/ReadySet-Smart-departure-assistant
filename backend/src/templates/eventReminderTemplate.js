import { renderEmail } from './baseTemplate.js'

/**
 * kind: 'upcoming' | 'prep' | 'departure'
 * times: pre-formatted strings in the EVENT's timezone: { start, targetArrival, departure, prepStart }
 */
export function eventReminderTemplate({ name, kind, event, times, url }) {
  const copy = {
    upcoming: {
      subject: `Reminder: ${event.title} starts at ${times.start}`,
      heading: 'Your event is coming up',
      line: `${event.title} starts at ${times.start}.`,
    },
    prep: {
      subject: `Time to start getting ready for ${event.title}`,
      heading: 'Time to start getting ready',
      line: `To leave on time for ${event.title}, start preparing now.`,
    },
    departure: {
      subject: `Time to leave for ${event.title}`,
      heading: 'Time to leave',
      line: `Leave now to arrive on time for ${event.title}.`,
    },
  }[kind]

  const details = [['Starts', times.start]]
  if (event.destination) details.push(['Destination', event.destination])
  details.push(['Start preparing', times.prepStart], ['Leave at', times.departure], ['Arrive by', times.targetArrival], ['Timezone', event.timezone])

  return {
    subject: copy.subject,
    ...renderEmail({
      preheader: copy.line,
      heading: copy.heading,
      paragraphs: [`Hi ${name}, ${copy.line}`],
      details,
      button: { label: 'Open ReadySet', url },
      footnote: 'You can turn these reminders off any time in Settings → Email notifications.',
    }),
  }
}
