import { afterEach, describe, expect, it } from 'vitest'
import * as barrel from '../../../modules/index.js'
import { starterKit } from '../../../modules/index.js'
import { keyDown, mountEditor, select, textOf } from '../../core/helpers.js'

afterEach(() => {
  document.body.replaceChildren()
})

const STARTER_NAMES = [
  'bold',
  'italic',
  'underline',
  'heading',
  'lists',
  'link',
  'history',
  'paste',
  'placeholder',
]

describe('modules barrel', () => {
  it('exports every module factory', () => {
    expect(Object.keys(barrel).sort()).toEqual(
      [
        'bold',
        'characterCount',
        'heading',
        'history',
        'italic',
        'link',
        'linkHref',
        'lists',
        'markdownShortcuts',
        'paste',
        'placeholder',
        'starterKit',
        'underline',
      ].sort(),
    )
  })
})

describe('starterKit', () => {
  it('returns the starter modules in order', () => {
    expect(starterKit().map((module) => module.name)).toEqual(STARTER_NAMES)
  })

  it('leaves out modules set to false', () => {
    expect(
      starterKit({ underline: false, history: false, placeholder: false }).map(
        (module) => module.name,
      ),
    ).toEqual(['bold', 'italic', 'heading', 'lists', 'link', 'paste'])
  })

  it('passes module options through', () => {
    const editor = mountEditor({
      modules: starterKit({ heading: { levels: [2] }, placeholder: { text: 'Write' } }),
    })
    expect(editor.schema.tags.has('h2')).toBe(true)
    expect(editor.schema.tags.has('h1')).toBe(false)
    expect(editor.root.dataset['placeholder']).toBe('Write')
  })

  it('passes the link and history options through', () => {
    let shortcuts = 0
    const editor = mountEditor({
      content: '<p>a</p>',
      modules: starterKit({
        link: {
          target: '_blank',
          onShortcut: () => {
            shortcuts++
          },
        },
        history: { depth: 1 },
      }),
    })
    expect(editor.schema.tags.get('a')?.fixedAttrs).toEqual({
      rel: 'noopener noreferrer nofollow',
      target: '_blank',
    })
    keyDown(editor, { key: 'k', ctrlKey: true })
    expect(shortcuts).toBe(1)
    select(textOf(editor, [0, 0]), 0, textOf(editor, [0, 0]), 1)
    editor.exec('bold')
    editor.exec('italic')
    expect(editor.exec('undo')).toBe(true)
    expect(editor.can('undo')).toBe(false)
  })

  it('creates an editor with every starter command', () => {
    expect(mountEditor({ modules: starterKit() }).commands).toEqual(
      expect.arrayContaining([
        'bold',
        'italic',
        'underline',
        'heading',
        'bulletList',
        'orderedList',
        'link',
        'undo',
        'redo',
      ]),
    )
  })
})
