import { newMessage, runDetection } from './util'

describe('Keyword detection', () => {
  const heavyContent = newMessage('KEYWORD content content')
  const lightContent = newMessage('LIGHTWORD content content')

  const weights = {
    keyword: 5,
    lightword: 1
  }

  it('detects a single heavy keyword as spam', () => {
    expect(runDetection(heavyContent, [heavyContent], weights)).toMatchSnapshot()
  })

  it('detects several light weight keywords as spam', () => {
    expect(runDetection(lightContent, [lightContent, lightContent, lightContent, lightContent, lightContent], weights)).toMatchSnapshot()
  })
})
