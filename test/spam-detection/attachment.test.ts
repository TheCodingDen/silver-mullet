import prisma from '../../src/clients/prisma'
import { executeAntiSpamDetection } from '../../src/detection/spam-detection'
import { newMessage } from './util'

describe('Attachment detection', () => {
  const guildID = '731581715474153542'

  beforeAll(async () => {
    await prisma.$connect()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await prisma.antiSpamActionMapping.deleteMany({})
    await prisma.pointOverride.deleteMany({})

    await prisma.crossChannelAntiSpamSettings.upsert({
      create: {
        guildID,
        version: 1,
        maxSizeDiffPercentage: 30,
        cacheTTLSeconds: 3,
        minMessageLength: 10,
        pointsOnMatch: 1,
        shortMessageLength: 15,
        shortMessageSimilarityThreshold: 80,
        similarityThreshold: 128,
        actionMappings: {
          create: {
            points: 5,
            action: 'BAN'
          }
        }
      },
      update: {
        version: 1,
        guildID,
        maxSizeDiffPercentage: 30,
        cacheTTLSeconds: 3,
        minMessageLength: 10,
        pointsOnMatch: 1,
        shortMessageLength: 15,
        shortMessageSimilarityThreshold: 80,
        similarityThreshold: 128,
        actionMappings: {
          create: {
            points: 5,
            action: 'BAN'
          }
        }
      },
      where: {
        version: 1
      }
    })
  })

  it('attaches points to attachments', async () => {
    const m1 = newMessage('')
    m1.channelId = '000000000000000000001'
    m1.attachmentCount = 4

    const m2 = newMessage('')
    m2.channelId = '000000000000000000002'
    m2.attachmentCount = 4

    expect(await executeAntiSpamDetection(m1, guildID, [m2])).toMatchSnapshot()
  })

  it('attaches points to attachments in lower quantities', async () => {
    const m1 = newMessage('')
    m1.channelId = '000000000000000000001'
    m1.attachmentCount = 2

    const m2 = newMessage('')
    m2.channelId = '000000000000000000002'
    m2.attachmentCount = 2

    const m3 = newMessage('')
    m3.channelId = '000000000000000000002'
    m3.attachmentCount = 2

    expect(await executeAntiSpamDetection(m1, guildID, [m2, m3])).toMatchSnapshot()
  })
})
