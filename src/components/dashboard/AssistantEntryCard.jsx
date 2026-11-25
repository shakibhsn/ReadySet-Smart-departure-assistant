import { Link } from 'react-router-dom'
import { ArrowUpRight, Bot, Sparkles } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

// The four question types the assistant really supports (see the Assistant page and backend/src/services/assistant).
const PROMPTS = [
  'When should I start preparing for my next event?',
  'What should I pack for tomorrow?',
  'Do I have any schedule conflicts tomorrow?',
  'Am I likely to be late for my next event?',
]

/** Entry point to the AI Departure Assistant: each prompt opens the Assistant page with the question filled in (nothing is sent until you press Ask). */
export function AssistantEntryCard() {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2"><Bot className="size-4 text-brand-600" aria-hidden="true" /> Departure Assistant</CardTitle>
          <CardDescription>Ask about your own events, packing and timing</CardDescription>
        </div>
        <Sparkles className="mt-1 size-5 text-brand-500" aria-hidden="true" />
      </CardHeader>
      <CardContent>
        <ul className="space-y-2" aria-label="Suggested questions">
          {PROMPTS.map((q) => (
            <li key={q}>
              <Link to={`/assistant?q=${encodeURIComponent(q)}`} className="group flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-sm font-medium text-brand-800 transition-colors hover:bg-brand-100">
                <span className="min-w-0 flex-1">{q}</span>
                <ArrowUpRight className="size-4 shrink-0 text-brand-400 transition-colors group-hover:text-brand-700" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">Answers use your saved events and explain their reasons. Nothing changes without your confirmation.</p>
      </CardContent>
    </Card>
  )
}
