import { emailConfig } from '../../config/email.config.js'
import { createConsoleProvider } from './consoleProvider.js'
import { createResendProvider } from './resendProvider.js'

/** Chooses the provider from configuration. Add new providers here (e.g. brevo). */
export function createConfiguredProvider() {
  if (emailConfig.mode === 'console') return createConsoleProvider({ includeBody: !emailConfig.isProduction })

  switch (emailConfig.provider) {
    case 'resend':
      return createResendProvider({ apiKey: emailConfig.apiKey })
    default:
      throw new Error(`Unsupported EMAIL_PROVIDER "${emailConfig.provider}"`)
  }
}
