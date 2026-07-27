import { describe, expect, it } from 'vitest';
import apollo from '../../demo/data/apollo.json';
import charlesIv from '../../demo/data/charles-iv.json';
import { validateTimelineData } from './validate';

interface InvalidFixture {
  expectIssueContaining: string;
  data: unknown;
}

const invalidFixtures = import.meta.glob<{ default: InvalidFixture }>(
  '../../test/fixtures/invalid/*.json',
  { eager: true },
);

describe('validateTimelineData — valid fixtures', () => {
  it('accepts the Apollo fixture', () => {
    const result = validateTimelineData(apollo);
    expect(result.ok).toBe(true);
  });

  it('accepts the Charles IV fixture', () => {
    const result = validateTimelineData(charlesIv);
    expect(result.ok).toBe(true);
  });
});

describe('validateTimelineData — invalid fixtures', () => {
  const entries = Object.entries(invalidFixtures);

  it('has invalid fixtures to test', () => {
    expect(entries.length).toBeGreaterThanOrEqual(7);
  });

  it.each(entries)('rejects %s with the expected issue', (_path, module) => {
    const { expectIssueContaining, data } = module.default;
    const result = validateTimelineData(data);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const rendered = result.issues.map((i) => `${i.path}: ${i.message}`);
      expect(
        rendered.some((line) => line.includes(expectIssueContaining)),
        `expected an issue containing "${expectIssueContaining}", got:\n${rendered.join('\n')}`,
      ).toBe(true);
    }
  });
});

describe('validateTimelineData — behavior', () => {
  it('collects all issues instead of failing fast', () => {
    const result = validateTimelineData({
      timeline: { id: '', title: 'Multi' },
      events: [
        { id: 'a', title: 'Bad date', date: { start: 'nope', precision: 'day' } },
        { id: 'b', title: 'Bad precision', date: { start: '1943', precision: 'month' } },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThanOrEqual(3);
      expect(result.issues.map((i) => i.path)).toContain('events[1].date.precision');
    }
  });

  it('reports mismatched precision with a helpful message', () => {
    const result = validateTimelineData({
      timeline: { id: 't', title: 'T' },
      events: [{ id: 'e', title: 'E', date: { start: '1943', precision: 'day' } }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.path).toBe('events[0].date.precision');
      expect(result.issues[0]?.message).toContain('does not match start "1943"');
    }
  });

  it('ignores unknown extra fields', () => {
    const result = validateTimelineData({
      timeline: { id: 't', title: 'T', futureField: 42 },
      events: [],
    });
    expect(result.ok).toBe(true);
  });
});
