import { useRef, useState } from 'react'
import { Bot, Check, Info, Send, Sparkles, X } from 'lucide-react'
import { Alert } from '@/components/common/Alert'
import { PageHeader } from '@/components/common/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { askAssistant, confirmAssistantAction } from '@/services/assistantApi'

const EXAMPLES = ['When should I start preparing for my interview?', "What should I pack for tomorrow's trip?", 'Do I have any schedule conflicts tomorrow?', 'Am I likely to be late for my next event?']

/** One answer. Always says where it came from, why, and what it is not sure about. */
export function AnswerCard({ answer, onPick, onConfirm, onDismiss, proposalState }) {
  const ai = answer.source === 'ai'
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={ai ? 'bg-accent-50 text-accent-700 ring-accent-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}>
          {ai ? <><Sparkles className="size-3.5" /> AI-assisted wording</> : 'Rules-based answer'}
        </Badge>
        {answer.estimate && <Badge className="bg-amber-50 text-amber-700 ring-amber-200">Estimate</Badge>}
      </div>
      <p className="whitespace-pre-line text-sm text-ink">{answer.answer}</p>

      {answer.notice && <p className="text-xs text-muted">{answer.notice}</p>}

      {answer.clarification && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Choose an event">
          {answer.clarification.map((c) => (
            <Button key={c.id} variant="outline" size="sm" onClick={() => onPick(c.id)}>{c.title}</Button>
          ))}
        </div>
      )}

      {answer.examples && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          {answer.examples.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      {answer.proposal && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-3" role="group" aria-label="Suggested change">
          <p className="text-sm font-semibold text-ink">{answer.proposal.label}</p>
          <p className="mt-1 text-xs text-muted">Nothing changes unless you confirm. This applies to the event itself (every occurrence if it repeats).</p>
          {proposalState?.done ? (
            <p className="mt-2 text-sm font-semibold text-emerald-700">{proposalState.done}</p>
          ) : (
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => onConfirm(answer.proposal)} disabled={proposalState?.busy}><Check className="size-4" /> Confirm change</Button>
              <Button size="sm" variant="ghost" onClick={onDismiss} disabled={proposalState?.busy}><X className="size-4" /> No thanks</Button>
            </div>
          )}
          {proposalState?.error && <p role="alert" className="mt-2 text-sm text-rose-700">{proposalState.error}</p>}
        </div>
      )}

      {(answer.basedOn?.length > 0 || answer.uncertainty) && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer font-semibold">Why this answer</summary>
          {answer.basedOn?.length > 0 && <p className="mt-2">Based on: {answer.basedOn.join(', ')}.</p>}
          {answer.uncertainty && <p className="mt-1 flex gap-1.5"><Info className="mt-0.5 size-3.5 shrink-0" /> {answer.uncertainty}</p>}
        </details>
      )}
    </div>
  )
}

export default function AssistantPage() {
  const [question, setQuestion] = useState('')
  const [thread, setThread] = useState([]) // [{ id, question, answer?, error?, pending? }] (kept in this tab only; never stored)
  const [busy, setBusy] = useState(false)
  const [proposals, setProposals] = useState({}) // by thread id
  const counter = useRef(0)

  async function send(text, eventId) {
    const trimmed = text.trim()
    if (trimmed.length < 3 || busy) return
    const id = ++counter.current
    setThread((t) => [...t, { id, question: trimmed, pending: true }])
    setQuestion('')
    setBusy(true)
    try {
      const answer = await askAssistant(trimmed, eventId)
      setThread((t) => t.map((m) => (m.id === id ? { ...m, pending: false, answer } : m)))
    } catch (error) {
      setThread((t) => t.map((m) => (m.id === id ? { ...m, pending: false, error: error.message } : m)))
    } finally {
      setBusy(false)
    }
  }

  async function confirm(id, proposal) {
    setProposals((p) => ({ ...p, [id]: { busy: true } }))
    try {
      const result = await confirmAssistantAction(proposal.token)
      setProposals((p) => ({ ...p, [id]: { done: result.applied ? `Done: preparation is now ${result.preparationMinutes} min.` : 'Already applied.' } }))
    } catch (error) {
      setProposals((p) => ({ ...p, [id]: { error: error.message } }))
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Departure Assistant" description="Ask about your own events. Answers use your saved events, checklists, forecasts and history only." />
      <p className="flex items-start gap-2.5 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        <Info className="mt-0.5 size-4 shrink-0 text-brand-600" />
        <span>The assistant explains the times ReadySet already calculated. It cannot see live traffic, it never changes anything without your confirmation, and it only answers the four kinds of question shown below.</span>
      </p>

      <div className="space-y-4" aria-live="polite">
        {thread.length === 0 && (
          <Card>
            <CardContent className="space-y-3 pt-6">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink"><Bot className="size-4 text-brand-600" /> Try one of these</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((e) => <Button key={e} variant="outline" size="sm" onClick={() => send(e)} disabled={busy}>{e}</Button>)}
              </div>
            </CardContent>
          </Card>
        )}
        {thread.map((m) => (
          <div key={m.id} className="space-y-2">
            <p className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-2 text-sm text-white">{m.question}</p>
            {m.pending && <p role="status" className="text-sm text-muted">Working it out…</p>}
            {m.error && <Alert>{m.error}</Alert>}
            {m.answer && <AnswerCard answer={m.answer} proposalState={proposals[m.id]} onPick={(eventId) => send(m.question, eventId)} onConfirm={(p) => confirm(m.id, p)} onDismiss={() => setProposals((p) => ({ ...p, [m.id]: { done: 'Dismissed. Nothing was changed.' } }))} />}
          </div>
        ))}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(question) }} className="flex items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Your question</span>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={300}
            placeholder="Ask about preparing, packing, conflicts or being late…"
            className="h-11 w-full rounded-xl border border-line bg-surface px-4 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </label>
        <Button type="submit" disabled={busy || question.trim().length < 3}><Send className="size-4" /> Ask</Button>
      </form>
    </div>
  )
}
