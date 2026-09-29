import { describe, it, expect } from 'vitest';
import { computeWordDiff } from '../src/word-diff.js';

describe('computeWordDiff', () => {
  it('returns equal segment for identical lines', () => {
    const result = computeWordDiff('hello world', 'hello world');

    expect(result).toEqual([{ text: 'hello world', type: 'equal' }]);
  });

  it('detects single word change', () => {
    const result = computeWordDiff('const x = 5;', 'const x = 10;');

    expect(result).toEqual([
      { text: 'const x = ', type: 'equal' },
      { text: '5', type: 'delete' },
      { text: '10', type: 'insert' },
      { text: ';', type: 'equal' },
    ]);
  });

  it('detects word added at end', () => {
    const result = computeWordDiff('hello', 'hello world');

    expect(result).toEqual([
      { text: 'hello', type: 'equal' },
      { text: ' world', type: 'insert' },
    ]);
  });

  it('detects word deleted from beginning', () => {
    const result = computeWordDiff('const x = 1;', 'x = 1;');

    expect(result).toEqual([
      { text: 'const ', type: 'delete' },
      { text: 'x = 1;', type: 'equal' },
    ]);
  });

  it('detects multiple word changes', () => {
    const result = computeWordDiff(
      'import { foo } from "bar";',
      'import { baz } from "qux";'
    );

    expect(result).toEqual([
      { text: 'import { ', type: 'equal' },
      { text: 'foo', type: 'delete' },
      { text: 'baz', type: 'insert' },
      { text: ' } from "', type: 'equal' },
      { text: 'bar', type: 'delete' },
      { text: 'qux', type: 'insert' },
      { text: '";', type: 'equal' },
    ]);
  });

  it('handles entirely different lines', () => {
    const result = computeWordDiff('abc', 'xyz');

    expect(result).toEqual([
      { text: 'abc', type: 'delete' },
      { text: 'xyz', type: 'insert' },
    ]);
  });

  it('handles empty old line', () => {
    const result = computeWordDiff('', 'hello');

    expect(result).toEqual([{ text: 'hello', type: 'insert' }]);
  });

  it('handles empty new line', () => {
    const result = computeWordDiff('hello', '');

    expect(result).toEqual([{ text: 'hello', type: 'delete' }]);
  });

  it('handles indentation change', () => {
    const result = computeWordDiff('  return x;', '    return x;');

    expect(result).toEqual([
      { text: '  ', type: 'delete' },
      { text: '    ', type: 'insert' },
      { text: 'return x;', type: 'equal' },
    ]);
  });

  it('handles case change', () => {
    const result = computeWordDiff('Foo', 'foo');

    expect(result).toEqual([
      { text: 'Foo', type: 'delete' },
      { text: 'foo', type: 'insert' },
    ]);
  });

  it('handles string content change', () => {
    const result = computeWordDiff(
      'const msg = "hello";',
      'const msg = "world";'
    );

    expect(result).toEqual([
      { text: 'const msg = "', type: 'equal' },
      { text: 'hello', type: 'delete' },
      { text: 'world', type: 'insert' },
      { text: '";', type: 'equal' },
    ]);
  });

  it('handles whitespace-only change between words', () => {
    const result = computeWordDiff('a  b', 'a b');

    expect(result).toEqual([
      { text: 'a', type: 'equal' },
      { text: '  ', type: 'delete' },
      { text: ' ', type: 'insert' },
      { text: 'b', type: 'equal' },
    ]);
  });
});
