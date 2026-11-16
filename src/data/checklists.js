// Checklist templates (static content). Per-event checklists are temporary client state for now.
export const CHECKLIST_GROUPS = ['Essentials', 'Documents', 'Electronics', 'Personal']

export const checklistTemplates = {
  university: {
    label: 'University',
    items: [
      { text: 'Student ID card', group: 'Documents' },
      { text: 'Laptop', group: 'Electronics' },
      { text: 'Notebook', group: 'Essentials' },
      { text: 'Charger', group: 'Electronics' },
      { text: 'Water bottle', group: 'Personal' },
    ],
  },
  office: {
    label: 'Office',
    items: [
      { text: 'Laptop', group: 'Electronics' },
      { text: 'Office ID', group: 'Documents' },
      { text: 'Documents', group: 'Documents' },
      { text: 'Charger', group: 'Electronics' },
      { text: 'Wallet', group: 'Personal' },
    ],
  },
  travel: {
    label: 'Travel',
    items: [
      { text: 'Passport', group: 'Documents' },
      { text: 'Tickets', group: 'Documents' },
      { text: 'Wallet', group: 'Personal' },
      { text: 'Phone', group: 'Electronics' },
      { text: 'Clothes', group: 'Essentials' },
    ],
  },
  appointment: {
    label: 'Appointment',
    items: [
      { text: 'Appointment confirmation', group: 'Documents' },
      { text: 'ID card', group: 'Documents' },
      { text: 'Previous reports', group: 'Documents' },
      { text: 'Wallet', group: 'Personal' },
    ],
  },
}

let counter = 0
export const makeItem = (text, group = 'Essentials', done = false) => ({
  id: `item-${Date.now().toString(36)}-${counter++}`,
  text,
  group,
  done,
})

export const itemsFromTemplate = (key) =>
  (checklistTemplates[key]?.items ?? []).map((i) => makeItem(i.text, i.group))
