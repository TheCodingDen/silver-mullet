import { executeAntiSpamDetection } from '../../src/detection/spam-detection'
import { newMessage } from './util'

describe('Quantity spam', () => {
  const content = newMessage('content--1')
  const similarContent = newMessage('content--2')

  it('does not detect a single message as spam', () => {
    expect(executeAntiSpamDetection(content, [], {})).toMatchSnapshot()
  })

  it('detects a series of identical messages as spam', () => {
    expect(executeAntiSpamDetection(content, [content, content, content, content, content], {})).toMatchSnapshot()
  })

  it('detects a series of similar messages as spam', () => {
    expect(executeAntiSpamDetection(content, [similarContent, similarContent, similarContent, similarContent, similarContent], {})).toMatchSnapshot()
  })

  it('detects a mix of similar and identical messages as spam', () => {
    expect(executeAntiSpamDetection(content, [similarContent, content, similarContent, content, similarContent], {})).toMatchSnapshot()
  })
})
