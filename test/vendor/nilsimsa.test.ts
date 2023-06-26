import Nilsimsa from '../../src/vendor/nilsimsa'

describe('Nilsimsa hash', () => {
  it('should detect perfect equality', () => {
    const hash1 = new Nilsimsa('test')
    const hash2 = new Nilsimsa('test')

    expect(hash1.compare(hash2)).toBe(Nilsimsa.MAX_VALUE)
  })

  it('should detect similarity', () => {
    const hash1 = new Nilsimsa('test string')
    const hash2 = new Nilsimsa('testing strings')

    expect(hash1.compare(hash2)).toBe(62)
  })

  it('should have low score for differing inputs', () => {
    const hash1 = new Nilsimsa('some test string')
    const hash2 = new Nilsimsa('completely different')

    expect(hash1.compare(hash2)).toBe(20)
  })

  it('should follow scale', () => {
    const hash1 = new Nilsimsa('abcdefghijkl')
    const hash2 = new Nilsimsa('defghijkl') // More overlap with first string
    const hash3 = new Nilsimsa('ghijklmno')

    const diff1 = hash1.compare(hash2)
    const diff2 = hash2.compare(hash3)

    expect(diff1).toBeGreaterThan(diff2)
  })
})
