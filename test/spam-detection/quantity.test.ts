import { newMessage, runDetection } from './util'

describe('Quantity spam', () => {
  const content = newMessage('content')
  const similarContent = newMessage('contentish')

  it('does not detect a single message as spam', () => {
    expect(runDetection(content, [])).toMatchSnapshot()
  })

  it('detects a series of identical messages as spam', () => {
    expect(runDetection(content, [content, content, content, content, content])).toMatchSnapshot()
  })

  it('detects a series of similar messages as spam', () => {
    expect(runDetection(content, [similarContent, similarContent, similarContent, similarContent, similarContent])).toMatchSnapshot()
  })

  it('detects a mix of similar and identical messages as spam', () => {
    expect(runDetection(content, [similarContent, content, similarContent, content, similarContent])).toMatchSnapshot()
  })
})
