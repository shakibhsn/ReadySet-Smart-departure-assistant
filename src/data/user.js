// MOCK DATA — frontend-only settings (reminders / theme). The profile and departure
// preferences now come from the backend through the auth context.
export const defaultSettings = {
  reminders: { preparation: true, departure: true, event: false },
  theme: 'light',
}
