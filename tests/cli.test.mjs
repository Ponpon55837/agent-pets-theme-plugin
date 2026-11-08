import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseArgs, UsageError } from '../scripts/lib/cli.mjs'

const spec = { boolean: ['require-signature', 'quiet'], string: ['out', 'published-at'] }

describe('argument parser', () => {
  it('never lets a boolean flag swallow the next positional', () => {
    for (const argv of [['a.zip', '--require-signature'], ['--require-signature', 'a.zip']]) {
      assert.deepEqual(parseArgs(argv, spec), { options: { 'require-signature': true }, positionals: ['a.zip'] }, argv.join(' '))
    }
  })

  it('reads string options in both forms and in any position', () => {
    assert.deepEqual(parseArgs(['--out', 'dir', 'a.zip'], spec), { options: { out: 'dir' }, positionals: ['a.zip'] })
    assert.deepEqual(parseArgs(['a.zip', '--out=dir', '--quiet'], spec), { options: { out: 'dir', quiet: true }, positionals: ['a.zip'] })
    assert.deepEqual(parseArgs(['--', '--out'], spec), { options: {}, positionals: ['--out'] })
  })

  it('rejects unknown, repeated, value-less and valued-boolean options', () => {
    const cases = [
      [['--require-signatures', 'a.zip'], /unknown option --require-signatures/],
      [['-r', 'a.zip'], /unknown option -r/],
      [['--out'], /--out needs a value/],
      [['--out', '--quiet'], /--out needs a value/],
      [['--out='], /--out needs a value/],
      [['--quiet=yes'], /--quiet takes no value/],
      [['--quiet', '--quiet'], /more than once/],
      [['--__proto__'], /unknown option/],
    ]
    for (const [argv, pattern] of cases) assert.throws(() => parseArgs(argv, spec), error => error instanceof UsageError && pattern.test(error.message), argv.join(' '))
  })
})
