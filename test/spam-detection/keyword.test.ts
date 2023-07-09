import prisma from '../../src/clients/prisma'
import { executeAntiSpamDetection } from '../../src/detection/spam-detection'
import { newMessage } from './util'

describe('Keyword detection', () => {
  const heavyContent = newMessage('KEYWORD content content')
  const lightContent = newMessage('LIGHTWORD content content')

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
                pointThreshold: 5,
                action: 'BAN',
                type: 'SPAM'
              }
            ]
          }
        },
        pointOverrides: {
          createMany: {
            data: [
              {
                word: 'keyword',
                points: 5
              },
              {
                word: 'lightword',
                points: 1
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
                pointThreshold: 5,
                action: 'BAN',
                type: 'SPAM'
              }
            ]
          }
        },
        pointOverrides: {
          createMany: {
            data: [
              {
                word: 'keyword',
                points: 5
              },
              {
                word: 'lightword',
                points: 1
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

  it('detects a single heavily weighted keyword as spam', async () => {
    expect(await executeAntiSpamDetection(heavyContent, [heavyContent])).toMatchSnapshot()
  })

  it('detects several lightly weighted keywords as spam', async () => {
    expect(await executeAntiSpamDetection(lightContent, [lightContent, lightContent, lightContent, lightContent, lightContent])).toMatchSnapshot()
  })
})
