import { executeAntiSpamDetection } from '../../src/detection/spam-detection'
import { newMessage } from './util'

describe('Keyword detection', () => {
  const heavyContent = newMessage('KEYWORD content content')
  const lightContent = newMessage('LIGHTWORD content content')

  const weights = {
    keyword: 5,
    lightword: 1
  }

  it('detects a single heavily weighted keyword as spam', () => {
    expect(executeAntiSpamDetection(heavyContent, [heavyContent], weights)).toMatchSnapshot()
  })

  it('detects several lightly weighted keywords as spam', () => {
    expect(executeAntiSpamDetection(lightContent, [lightContent, lightContent, lightContent, lightContent, lightContent], weights)).toMatchSnapshot()
  })
})
