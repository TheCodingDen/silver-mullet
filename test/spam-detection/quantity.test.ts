import prisma from '../../src/clients/prisma'
import { executeAntiSpamDetection } from '../../src/detection/spam-detection'
import { newMessage } from './util'

describe('Quantity spam', () => {
  const content = newMessage('content--1')
  const similarContent = newMessage('content--2')

  beforeAll(async () => {
    await prisma.$connect()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await prisma.antiSpamRule.deleteMany({})
    await prisma.pointOverride.deleteMany({})

    await prisma.crossChannelAntiSpamSettings.upsert({
      create: {
        version: 1,
        maxSizeDiffPercentage: 30,
        cacheTTLSeconds: 3,
        minMessageLength: 10,
        pointsOnMatch: 1,
        shortMessageLength: 15,
        shortMessageSimilarityThreshold: 80,
        similarityThreshold: 128,
        rules: {
          createMany: {
            data: [
              {
                points: 5,
                action: 'BAN',
                type: 'SPAM'
              }
            ]
          }
        }
      },
      update: {
        version: 1,
        maxSizeDiffPercentage: 30,
        cacheTTLSeconds: 3,
        minMessageLength: 10,
        pointsOnMatch: 1,
        shortMessageLength: 15,
        shortMessageSimilarityThreshold: 80,
        similarityThreshold: 128,
        rules: {
          createMany: {
            data: [
              {
                points: 5,
                action: 'BAN',
                type: 'SPAM'
              }
            ]
          }
        }
      },
      where: {
        version: 1
      }
    })
  })

  it('does not detect a single message as spam', async () => {
    expect(await executeAntiSpamDetection(content, [])).toMatchSnapshot()
  })

  it('detects a series of identical messages as spam', async () => {
    expect(await executeAntiSpamDetection(content, [content, content, content, content, content])).toMatchSnapshot()
  })

  it('detects a series of similar messages as spam', async () => {
    expect(await executeAntiSpamDetection(content, [similarContent, similarContent, similarContent, similarContent, similarContent])).toMatchSnapshot()
  })

  it('detects a mix of similar and identical messages as spam', async () => {
    expect(await executeAntiSpamDetection(content, [similarContent, content, similarContent, content, similarContent])).toMatchSnapshot()
  })
})
