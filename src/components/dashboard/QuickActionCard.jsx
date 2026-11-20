import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'

export function QuickActionCard({ to, icon: Icon, title, description }) {
  return (
    <Link
      to={to}
      className="card-hover group flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 shadow-card"
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white">
        <Icon className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-ink">{title}</span>
        <span className="block truncate text-xs text-muted">{description}</span>
      </span>
      <ArrowUpRight className="size-5 shrink-0 text-slate-300 transition-colors group-hover:text-brand-600" />
    </Link>
  )
}
