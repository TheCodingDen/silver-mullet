/* eslint-disable import/first */

// Env
import dotenv from 'dotenv-safe'
dotenv.config()

// Logger
import logger from './utils/logger'
global.logger = logger

// Main app
import { SlashCreator, GatewayServer } from 'slash-create'
import { GatewayDispatchEvents } from 'discord.js'
import path from 'path'
import prisma from './clients/prisma'
import redis from './clients/redis'
import discord from './clients/discord'
import { initActionComponents } from './detection/actions'

const creator = new SlashCreator({
  applicationID: process.env.DISCORD_APP_ID as string,
  publicKey: process.env.DISCORD_PUBLIC_KEY,
  token: process.env.DISCORD_BOT_TOKEN,
  client: discord
})

creator.on('debug', message => logger.debug(message))
creator.on('warn', message => logger.warn(message))
creator.on('error', error => logger.error(error))
creator.on('synced', () => logger.info('Commands synced!'))
creator.on('commandRun', (command, _, ctx) =>
  logger.info(`${ctx.user.username} (${ctx.user.id}) ran command ${command.commandName}`)
)
creator.on('commandRegister', command => logger.info(`Registered command ${command.commandName}`))
creator.on('commandError', (command, error) => logger.error(`Command ${command.commandName}:\n${error.stack ?? error}`))

void (async () => {
  creator
    .withServer(
      new GatewayServer(
        (handler) => discord.ws.on(GatewayDispatchEvents.InteractionCreate, handler)
      )
    )
    .registerCommandsIn(path.join(__dirname, 'commands'))

  logger.info('Connecting to Prisma...')
  await prisma.$connect()
  logger.info('Connection to Prisma established.')

  logger.info('Connecting to Redis...')
  await redis.connect()
  logger.info('Connection to Redis established.')

  logger.info('Connecting to Discord...')
  await discord.login(process.env.DISCORD_BOT_TOKEN)
  logger.info('Connection to Discord established.')

  initActionComponents(creator)

  logger.info('Startup process complete.')
})().catch(err => logger.error(err))
