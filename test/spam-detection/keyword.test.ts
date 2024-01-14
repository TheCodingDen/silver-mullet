import prisma from '../../src/clients/prisma'
import { executeAntiSpamDetection } from '../../src/detection/spam-detection'
import { newMessage } from './util'

describe('Keyword detection', () => {
  const heavyContent = newMessage('KEYWORD content content')
  const lightContent = newMessage('LIGHTWORD content content')
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
    expect(await executeAntiSpamDetection(heavyContent, guildID, [heavyContent])).toMatchSnapshot()
  })

  it('detects several lightly weighted keywords as spam', async () => {
    expect(await executeAntiSpamDetection(lightContent, guildID, [lightContent, lightContent, lightContent, lightContent, lightContent])).toMatchSnapshot()
  })
})
