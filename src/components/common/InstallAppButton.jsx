import { useState } from 'react'
import { Download, Share } from 'lucide-react'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'

/** Install ReadySet as an app. Shown only when installing is actually possible; started only by a click. */
export function InstallAppButton() {
  const { canInstall, ios, install } = useInstallPrompt()
  const [showIos, setShowIos] = useState(false)
  if (!canInstall && !ios) return null
  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => (canInstall ? install() : setShowIos((v) => !v))}
        aria-expanded={canInstall ? undefined : showIos}
        className="flex h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50"
      >
        <Download className="size-5" />
        Install app
      </button>
      {!canInstall && showIos && (
        <p className="mx-2 mb-1 flex items-start gap-2 rounded-lg bg-canvas p-2 text-xs text-muted">
          <Share className="mt-0.5 size-3.5 shrink-0" />
          <span>In Safari tap Share, then &quot;Add to Home Screen&quot;.</span>
        </p>
      )}
    </div>
  )
}
