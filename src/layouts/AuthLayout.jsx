import { ArrowDownRight, ArrowUpRight, CheckCircle2, Clock4, MapPin, ShieldCheck } from 'lucide-react'
import { Logo } from '@/components/common/Logo'

const highlights = [
  { icon: Clock4, text: 'Know when to start getting ready' },
  { icon: MapPin, text: 'Leave on time with a plan that fits your day' },
  { icon: CheckCircle2, text: 'Keep the little details from slipping through' },
]

function PlanPreview() {
  return (
    <div aria-label="Example departure plan" className="relative mt-9 max-w-md rounded-[26px] border border-white/15 bg-white/[0.09] p-5 shadow-2xl shadow-black/10 backdrop-blur-xl sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-200">Example plan</p>
          <p className="mt-1.5 text-sm font-semibold text-white">Design review</p>
        </div>
        <span className="rounded-full border border-accent-200/20 bg-accent-200/10 px-3 py-1.5 text-[11px] font-semibold text-accent-100">
          Ready for today
        </span>
      </div>

      <div className="mt-5 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2">
        <div className="rounded-2xl bg-white/[0.08] p-3">
          <p className="text-[10px] font-medium text-brand-200">GET READY</p>
          <p className="mt-1 text-lg font-bold text-white">8:05</p>
          <p className="text-[11px] text-brand-200">AM</p>
        </div>
        <ArrowUpRight aria-hidden="true" className="size-4 text-brand-300" />
        <div className="rounded-2xl bg-accent-300/[0.15] p-3 ring-1 ring-accent-200/20">
          <p className="text-[10px] font-medium text-accent-100">LEAVE BY</p>
          <p className="mt-1 text-lg font-bold text-white">8:32</p>
          <p className="text-[11px] text-accent-100">AM</p>
        </div>
        <ArrowUpRight aria-hidden="true" className="size-4 text-brand-300" />
        <div className="rounded-2xl bg-white/[0.08] p-3">
          <p className="text-[10px] font-medium text-brand-200">ARRIVE</p>
          <p className="mt-1 text-lg font-bold text-white">8:55</p>
          <p className="text-[11px] text-brand-200">AM</p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs text-brand-100">
        <span className="flex size-6 items-center justify-center rounded-full bg-white/10">
          <MapPin aria-hidden="true" className="size-3.5 text-accent-200" />
        </span>
        Built around your travel and preparation time
      </div>
      <ArrowDownRight aria-hidden="true" className="absolute -bottom-5 -right-5 size-10 text-accent-200/80" />
    </div>
  )
}

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen overflow-hidden bg-[#f7f8fc] lg:grid-cols-2">
      <aside className="relative hidden min-h-screen overflow-hidden bg-[#1d1b50] px-10 py-9 text-white lg:flex lg:flex-col lg:justify-between xl:px-16 xl:py-11">
        <div aria-hidden="true" className="absolute -right-36 -top-32 size-[30rem] rounded-full border border-white/[0.08]" />
        <div aria-hidden="true" className="absolute -right-20 -top-16 size-[21rem] rounded-full border border-white/[0.08]" />
        <div aria-hidden="true" className="absolute -bottom-52 -left-40 size-[34rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(45,212,191,0.22),transparent_68%)]" />
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_15%_85%,rgba(95,90,232,0.35),transparent_45%)]" />

        <Logo light className="relative z-10" />

        <div className="relative z-10 mx-auto w-full max-w-lg py-12 xl:py-16">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-brand-100">
            <span className="size-1.5 rounded-full bg-accent-300 shadow-[0_0_12px_rgba(94,234,212,0.9)]" />
            A little more calm in every commute
          </div>
          <h2 className="max-w-md text-4xl font-extrabold leading-[1.12] tracking-tight xl:text-[3.25rem]">
            Don&apos;t rush.
            <br />
            <span className="text-accent-200">Be ready.</span>
          </h2>
          <p className="mt-4 max-w-md text-sm leading-6 text-brand-100/85 xl:text-base">
            ReadySet works backwards from your event to give you a clear, comfortable plan for getting there.
          </p>

          <PlanPreview />

          <ul className="mt-7 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {highlights.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2.5 text-xs font-medium leading-5 text-brand-100 xl:items-start">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.09]">
                  <Icon aria-hidden="true" className="size-4 text-accent-200" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-xs text-brand-200/75">© {new Date().getFullYear()} ReadySet <span className="mx-1.5">·</span> Make time for what matters.</p>
      </aside>

      <main className="relative flex min-h-screen items-center justify-center px-4 py-8 sm:px-8 sm:py-12 lg:px-10 xl:px-16">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-28 size-72 rounded-full bg-brand-100/70 blur-3xl lg:hidden" />
        <div className="relative w-full max-w-[460px]">
          <Logo className="mb-8 lg:hidden" />

          <section className="rounded-[28px] border border-white bg-white/95 p-6 shadow-[0_24px_70px_-30px_rgba(35,34,90,0.24)] sm:p-9">
            <div className="mb-7">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-600">Your day, right on time</p>
              <h1 className="text-[1.8rem] font-extrabold leading-tight tracking-tight text-ink sm:text-3xl">{title}</h1>
              <p className="mt-2.5 text-sm leading-6 text-muted">{subtitle}</p>
            </div>
            {children}
            {footer && <p className="mt-7 border-t border-line/80 pt-5 text-center text-sm text-muted">{footer}</p>}
          </section>

          <p className="mt-5 flex items-center justify-center gap-2 text-xs font-medium text-muted">
            <ShieldCheck aria-hidden="true" className="size-4 text-brand-500" />
            Your account and plans stay private.
          </p>
        </div>
      </main>
    </div>
  )
}
