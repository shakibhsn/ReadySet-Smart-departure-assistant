// Starter checklists per event category. Nothing is added automatically: the user applies a template
// (or adds their own items) and can edit or delete everything afterwards.
export const CHECKLIST_GROUPS = ['Essentials', 'Documents', 'Electronics', 'Personal']

const item = (text, group) => ({ text, group })

export const CHECKLIST_TEMPLATES = {
  university: {
    label: 'University / Class',
    items: [item('Student ID card', 'Documents'), item('Laptop', 'Electronics'), item('Charger', 'Electronics'), item('Notebook', 'Essentials'), item('Water bottle', 'Personal'), item('Phone', 'Electronics'), item('Wallet', 'Personal')],
  },
  office: {
    label: 'Office / Work',
    items: [item('Laptop', 'Electronics'), item('Charger', 'Electronics'), item('Office ID', 'Documents'), item('Documents', 'Documents'), item('Keys', 'Essentials'), item('Wallet', 'Personal'), item('Phone', 'Electronics')],
  },
  interview: {
    label: 'Interview',
    items: [item('Printed CVs', 'Documents'), item('ID card', 'Documents'), item('Certificates', 'Documents'), item('Notebook and pen', 'Essentials'), item('Phone', 'Electronics'), item('Water bottle', 'Personal')],
  },
  business: {
    label: 'Business meeting',
    items: [item('Laptop', 'Electronics'), item('Charger', 'Electronics'), item('Presentation or documents', 'Documents'), item('Business cards', 'Documents'), item('Notebook and pen', 'Essentials'), item('Phone', 'Electronics')],
  },
  appointment: {
    label: 'Meeting / Appointment',
    items: [item('Appointment confirmation', 'Documents'), item('ID card', 'Documents'), item('Required documents', 'Documents'), item('Phone', 'Electronics'), item('Wallet', 'Personal')],
  },
  travel: {
    label: 'Travel',
    items: [item('Passport or ID', 'Documents'), item('Tickets', 'Documents'), item('Wallet', 'Personal'), item('Phone', 'Electronics'), item('Charger', 'Electronics'), item('Keys', 'Essentials'), item('Water bottle', 'Personal')],
  },
  gym: {
    label: 'Gym',
    items: [item('Gym clothes', 'Essentials'), item('Towel', 'Essentials'), item('Water bottle', 'Personal'), item('Shoes', 'Essentials'), item('Headphones', 'Electronics'), item('Membership card', 'Documents')],
  },
  personal: {
    label: 'Personal outing',
    items: [item('Wallet', 'Personal'), item('Phone', 'Electronics'), item('Keys', 'Essentials')],
  },
  // Custom event: deliberately empty so nothing unnecessary is created.
  other: { label: 'Custom event', items: [] },
}

export const TEMPLATE_KEYS = Object.keys(CHECKLIST_TEMPLATES)

export const listTemplates = () =>
  TEMPLATE_KEYS.map((key) => ({ key, label: CHECKLIST_TEMPLATES[key].label, items: CHECKLIST_TEMPLATES[key].items }))
