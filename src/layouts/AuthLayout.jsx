import { CheckCircle2, Clock4, MapPin } from 'lucide-react'
import { Logo } from '@/components/common/Logo'

const highlights = [
  { icon: Clock4, text: 'Know exactly when to start getting ready' },
  { icon: MapPin, text: 'Leave on time with smart departure planning' },
  { icon: CheckCircle2, text: 'Never forget what to bring' },
]

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-brand-800 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden="true" className="absolute -right-24 -top-24 size-80 rounded-full bg-brand-600/50" />
        <div aria-hidden="true" className="absolute -bottom-32 -left-16 size-96 rounded-full bg-accent-600/20" />
        <Logo light className="relative" />
        <div className="relative max-w-md">
          <p className="text-4xl font-extrabold leading-tight tracking-tight">Don&apos;t rush.<br />Be ready.</p>
          <p className="mt-4 text-brand-200">
            ReadySet works backwards from your event to tell you when to leave, and when to start getting ready.
          </p>
          <ul className="mt-8 space-y-4">
            {highlights.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm font-medium text-brand-100">
                <span className="flex size-9 items-center justify-center rounded-xl bg-white/10">
                  <Icon className="size-5 text-accent-200" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-brand-300">© {new Date().getFullYear()} ReadySet</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Logo className="mb-8 lg:hidden" />
          <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-2 text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <p className="mt-8 text-center text-sm text-muted">{footer}</p>
        </div>
      </main>
    </div>
  )
}
