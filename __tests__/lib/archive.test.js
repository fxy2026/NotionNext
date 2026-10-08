import { getArchiveMonth } from '@/lib/utils/archive'

describe('canonical archive month', () => {
  test.each([
    ['2025-09-01', '2025-09'],
    ['2025-01-01', '2025-01'],
    ['2024-12-31', '2024-12'],
    ['2024-02-29', '2024-02'],
    ['2025-03-09', '2025-03'],
    ['2025-11-02', '2025-11']
  ])('preserves the author date %s in every time zone', (startDate, month) => {
    const post = {
      date: { start_date: startDate },
      publishDate: Date.parse(`${startDate}T00:00:00.000Z`),
      publishDay: startDate
    }
    const original = JSON.stringify(post)

    expect(getArchiveMonth(post)).toBe(month)
    expect(JSON.stringify(post)).toBe(original)
  })

  test('uses the author date even when a timestamp has a different UTC month', () => {
    expect(
      getArchiveMonth({
        date: { start_date: '2025-01-01', start_time: '00:30' },
        publishDate: Date.parse('2024-12-31T16:30:00.000Z')
      })
    ).toBe('2025-01')
  })

  test.each([
    ['2025-09-01T00:00:00.000Z', '2025-09'],
    ['2024-12-31T23:30:00.000Z', '2024-12'],
    ['2025-01-01T00:00:00.000Z', '2025-01'],
    ['2025-03-09T09:59:59.000Z', '2025-03'],
    ['2025-03-09T10:00:00.000Z', '2025-03'],
    ['2025-11-02T08:59:59.000Z', '2025-11'],
    ['2025-11-02T09:00:00.000Z', '2025-11']
  ])(
    'uses a fixed UTC month for timestamp-only posts: %s',
    (instant, month) => {
      expect(getArchiveMonth({ publishDate: Date.parse(instant) })).toBe(month)
    }
  )

  test.each(['2025-02-29', '2025-13-01', '2025-00-01', '2025-04-31', 'bad'])(
    'ignores an invalid date-only value: %s',
    startDate => {
      expect(
        getArchiveMonth({
          date: { start_date: startDate },
          publishDate: Date.parse('2025-09-01T00:00:00.000Z')
        })
      ).toBe('2025-09')
    }
  )

  test('accepts the Unix epoch without treating zero as missing', () => {
    expect(getArchiveMonth({ publishDate: 0 })).toBe('1970-01')
  })

  test.each([
    undefined,
    null,
    {},
    { publishDate: null },
    { publishDate: NaN },
    { publishDate: Infinity },
    { publishDate: 9e15 }
  ])('does not invent a month for missing or invalid data: %p', post => {
    expect(getArchiveMonth(post)).toBe('')
  })
})
