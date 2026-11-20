import { createApp } from './app.js'
import { prisma } from './config/database.js'
import { emailConfig } from './config/email.config.js'
import { env, databaseNameOf } from './config/env.js'
import { idle } from './services/email/emailService.js'
import { startNotificationScheduler, stopNotificationScheduler } from './services/notification/notificationSweep.service.js'
import { startReminderScheduler, stopReminderScheduler } from './services/reminder.service.js'

const app = createApp()

const server = app.listen(env.PORT, () => {
  // Log the database NAME only (never the full URL, it contains the password).
  console.log(`ReadySet API listening on port ${env.PORT} (${env.NODE_ENV}), database "${databaseNameOf(env.DATABASE_URL)}"`)
  console.log(`Email: mode=${emailConfig.mode} provider=${emailConfig.provider} verificationRequired=${emailConfig.verificationRequired} reminders=${emailConfig.remindersEnabled}`)
  startReminderScheduler()
  startNotificationScheduler() // one timer for ALL users and events
})

const shutdown = async () => {
  stopReminderScheduler()
  stopNotificationScheduler()
  server.close(async () => {
    await idle() // let queued emails finish
    await prisma.$disconnect()
    process.exit(0)
  })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
