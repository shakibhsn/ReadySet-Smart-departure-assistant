import { createApp } from './app.js'
import { prisma } from './config/database.js'
import { env, databaseNameOf } from './config/env.js'

const app = createApp()

const server = app.listen(env.PORT, () => {
  // Log the database NAME only (never the full URL, it contains the password).
  console.log(`ReadySet API listening on port ${env.PORT} (${env.NODE_ENV}), database "${databaseNameOf(env.DATABASE_URL)}"`)
})

const shutdown = async () => {
  server.close(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
