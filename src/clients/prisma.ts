import { Prisma, PrismaClient } from '@prisma/client'

const fmtPrismaEvent = (event: Prisma.LogEvent): string => `[prisma => ${event.target}] ${event.message}`

const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'info' },
    { emit: 'event', level: 'warn' }
  ]
})

if (process.env.LOG_LEVEL !== 'silent') {
  // Route Prisma logging through Pino
  prisma.$on('error', e => logger.error(fmtPrismaEvent(e)))
  prisma.$on('info', e => logger.info(fmtPrismaEvent(e)))
  prisma.$on('warn', e => logger.warn(fmtPrismaEvent(e)))
  prisma.$on('query', e => logger.trace(`[prisma => ${e.target}] Query: ${e.query} (params: ${e.params}, duration: ${e.duration}ms)`))
}

export default prisma
