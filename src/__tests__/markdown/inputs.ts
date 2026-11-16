const nestedList = (chars: number): string => {
  let markdown = ''
  for (let level = 0; markdown.length < chars; level++) {
    markdown += `${' '.repeat((level % 200) * 2)}- a\n`
  }
  return markdown
}

export const ADVERSARIAL: readonly (readonly [string, (count: number) => string])[] = [
  ['*', (count) => '*'.repeat(count)],
  ['**a', (count) => '**a'.repeat(count)],
  ['_', (count) => '_'.repeat(count)],
  ['_a ', (count) => '_a '.repeat(count)],
  ['a* ', (count) => 'a* '.repeat(count)],
  ['openers then closers', (count) => `${'_a '.repeat(count / 2)}${'a* '.repeat(count / 2)}`],
  ['[', (count) => '['.repeat(count)],
  ['[](', (count) => '[]('.repeat(count)],
  ['[a](', (count) => '[a]('.repeat(count)],
  ['[a]((', (count) => `[a](${'('.repeat(count)}`],
  ['[a](<', (count) => `[a](<${'a'.repeat(count)}`],
  ['[a](b "', (count) => '[a](b "'.repeat(count)],
  ['[a](b (', (count) => '[a](b ('.repeat(count)],
  [')[a](', (count) => `[a]((${')[a]('.repeat(count)}`],
  ['[ then ](', (count) => `${'['.repeat(count / 2)}${'[a](b)'.repeat(count / 12)}`],
  ['`', (count) => '`'.repeat(count)],
  ['\\', (count) => '\\'.repeat(count)],
  ['<', (count) => '<'.repeat(count)],
  ['#', (count) => '#'.repeat(count)],
  ['# + spaces', (count) => `# a${' '.repeat(count)}#b`],
  ['spaces then x', (count) => `${' '.repeat(count)}x`],
  ['- on one line', (count) => '- '.repeat(count)],
  ['nested - lines', (count) => nestedList(count * 2)],
  ['trailing spaces lines', (count) => 'a  \n'.repeat(count)],
  ['1. lines', (count) => '1. a\n'.repeat(count)],
]
