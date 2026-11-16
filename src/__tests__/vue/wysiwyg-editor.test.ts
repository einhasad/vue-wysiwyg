import { mount, type VueWrapper } from '@vue/test-utils'
import { KeepAlive, defineComponent, h, nextTick, ref, type Ref } from 'vue'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import type { Editor, Format } from '../../core/types.js'
import { bold } from '../../modules/bold.js'
import { WysiwygEditor } from '../../vue/wysiwyg-editor.js'
import { dispatch } from '../core/helpers.js'

type Props = InstanceType<typeof WysiwygEditor>['$props']

const mountEditor = async (
  props: Props = {},
): Promise<VueWrapper<InstanceType<typeof WysiwygEditor>>> => {
  const wrapper = mount(WysiwygEditor, { props, attachTo: document.body })
  await nextTick()
  return wrapper
}

const editorOf = (wrapper: VueWrapper<InstanceType<typeof WysiwygEditor>>): Editor =>
  wrapper.vm.editor as Editor

const rootOf = (wrapper: VueWrapper<InstanceType<typeof WysiwygEditor>>): HTMLElement =>
  wrapper.get('[role=textbox]').element as HTMLElement

const typeInto = (root: HTMLElement, text: Text, value: string): void => {
  text.data = value
  document.getSelection()?.collapse(text, value.length)
  dispatch(root, 'input')
}

const mountWithModel = async (
  initial: string,
): Promise<{ model: Ref<string>; root: () => HTMLElement; editor: () => Editor }> => {
  const model = ref(initial)
  const wrapper = mount(
    defineComponent({
      setup() {
        return () =>
          h(WysiwygEditor, {
            modelValue: model.value,
            'onUpdate:modelValue': (value: string) => {
              model.value = value
            },
          })
      },
    }),
    { attachTo: document.body },
  )
  await nextTick()
  const child = wrapper.getComponent(WysiwygEditor)
  return {
    model,
    root: () => child.get('[role=textbox]').element as HTMLElement,
    editor: () => child.vm.editor as Editor,
  }
}

describe('WysiwygEditor', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('renders the initial value through the sanitizer', async () => {
    const wrapper = await mountEditor({
      modelValue: '<p onclick="x()">a</p><img src=x onerror=alert(1)>',
    })
    expect(rootOf(wrapper).innerHTML).toBe('<p>a</p>')
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('starts empty without a modelValue', async () => {
    const wrapper = await mountEditor()
    expect(editorOf(wrapper).getValue()).toBe('')
  })

  it('emits update:modelValue with the editor value on input', async () => {
    const wrapper = await mountEditor({ modelValue: '<p>a</p>' })
    const root = rootOf(wrapper)
    typeInto(root, root.querySelector('p')?.firstChild as Text, 'ab')
    expect(wrapper.emitted('update:modelValue')).toEqual([['<p>ab</p>']])
  })

  it("emits '' when the content becomes empty", async () => {
    const wrapper = await mountEditor({ modelValue: '<p>a</p>' })
    const root = rootOf(wrapper)
    root.replaceChildren(document.createElement('p'))
    dispatch(root, 'input')
    expect(wrapper.emitted('update:modelValue')).toEqual([['']])
  })

  it('keeps the DOM and caret when the parent sends back the typed value', async () => {
    const { model, root, editor } = await mountWithModel('<p>ab</p>')
    const text = root().querySelector('p')?.firstChild as Text
    const setValue = vi.spyOn(editor(), 'setValue')
    typeInto(root(), text, 'abc')
    expect(model.value).toBe('<p>abc</p>')
    await nextTick()
    expect(setValue).not.toHaveBeenCalled()
    expect(root().querySelector('p')?.firstChild).toBe(text)
    expect(document.getSelection()?.anchorNode).toBe(text)
    expect(document.getSelection()?.anchorOffset).toBe(3)
  })

  it('applies a different external value through setValue', async () => {
    const { model, root, editor } = await mountWithModel('<p>a</p>')
    const setValue = vi.spyOn(editor(), 'setValue')
    model.value = '<p>b</p><script>alert(1)</script>'
    await nextTick()
    expect(setValue).toHaveBeenCalledOnce()
    expect(root().innerHTML).toBe('<p>b</p>')
    expect(model.value).toBe('<p>b</p><script>alert(1)</script>')
  })

  it('normalizes an external value without emitting it back to the model', async () => {
    const { model, root } = await mountWithModel('')
    model.value = 'plain'
    await nextTick()
    expect(root().innerHTML).toBe('<p>plain</p>')
    expect(model.value).toBe('plain')
  })

  it('emits nothing on load or after an external value until the user edits', async () => {
    const wrapper = await mountEditor({ modelValue: '<b>a</b>', modules: [bold()], name: 'body' })
    await wrapper.setProps({ modelValue: '<p><b>loaded</b></p>' })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe(
      '<p><strong>loaded</strong></p>',
    )
    const root = rootOf(wrapper)
    typeInto(root, root.querySelector('strong')?.firstChild as Text, 'loaded!')
    expect(wrapper.emitted('update:modelValue')).toEqual([['<p><strong>loaded!</strong></p>']])
  })

  it('applies only the last of rapid external updates', async () => {
    const { model, root, editor } = await mountWithModel('<p>a</p>')
    const setValue = vi.spyOn(editor(), 'setValue')
    model.value = '<p>b</p>'
    model.value = '<p>c</p>'
    model.value = '<p>d</p>'
    await nextTick()
    expect(setValue).toHaveBeenCalledExactlyOnceWith('<p>d</p>')
    expect(root().innerHTML).toBe('<p>d</p>')
  })

  it('applies every external update across ticks', async () => {
    const { model, editor } = await mountWithModel('<p>a</p>')
    for (const value of ['<p>b</p>', '', '<p>c</p>']) {
      model.value = value
      await nextTick()
      expect(editor().getValue()).toBe(value)
    }
  })

  it('toggles readonly from the prop', async () => {
    const wrapper = await mountEditor({ modelValue: '<p>a</p>', readonly: true })
    const editor = editorOf(wrapper)
    expect(editor.readonly).toBe(true)
    expect(rootOf(wrapper).getAttribute('aria-readonly')).toBe('true')
    await wrapper.setProps({ readonly: false })
    expect(editor.readonly).toBe(false)
    expect(rootOf(wrapper).getAttribute('aria-readonly')).toBe('false')
    await wrapper.setProps({ readonly: true })
    expect(editor.readonly).toBe(true)
    expect(rootOf(wrapper).getAttribute('aria-readonly')).toBe('true')
  })

  it('sets and updates the accessible label', async () => {
    const wrapper = await mountEditor({ label: 'Body' })
    expect(rootOf(wrapper).getAttribute('aria-label')).toBe('Body')
    await wrapper.setProps({ label: 'Description' })
    expect(rootOf(wrapper).getAttribute('aria-label')).toBe('Description')
  })

  it('names the textbox with a default label', async () => {
    const wrapper = await mountEditor()
    expect(rootOf(wrapper).getAttribute('aria-label')).toBe('Rich text editor')
  })

  it('sets, updates and removes aria-labelledby', async () => {
    const wrapper = await mountEditor({ labelledby: 'body-label' })
    expect(rootOf(wrapper).getAttribute('aria-labelledby')).toBe('body-label')
    await wrapper.setProps({ labelledby: 'other-label' })
    expect(rootOf(wrapper).getAttribute('aria-labelledby')).toBe('other-label')
    await wrapper.setProps({ labelledby: '' })
    expect(rootOf(wrapper).hasAttribute('aria-labelledby')).toBe(false)
  })

  it('exposes only the editor on the instance type', async () => {
    const wrapper = await mountEditor()
    expectTypeOf(wrapper.vm.editor).toEqualTypeOf<Editor | null>()
    expectTypeOf<InstanceType<typeof WysiwygEditor>>().not.toHaveProperty('value')
    expect(Object.keys(wrapper.vm.$.exposed ?? {})).toEqual(['editor'])
  })

  it('emits focus and blur with the native event', async () => {
    const wrapper = await mountEditor()
    const root = rootOf(wrapper)
    const focus = new FocusEvent('focus')
    const blur = new FocusEvent('blur')
    root.dispatchEvent(focus)
    root.dispatchEvent(blur)
    expect(wrapper.emitted('focus')).toEqual([[focus]])
    expect(wrapper.emitted('blur')).toEqual([[blur]])
  })

  it('renders the toolbar slot with the editor once it exists', async () => {
    const toolbar = vi.fn((props?: { editor: Editor }) =>
      h('div', { class: 'toolbar' }, props?.editor.commands.join(',')),
    )
    const wrapper = mount(WysiwygEditor, {
      props: { modules: [bold()] },
      slots: { toolbar },
    })
    await nextTick()
    expect(wrapper.get('.toolbar').text()).toBe('bold')
    expect(toolbar).toHaveBeenCalledWith({ editor: editorOf(wrapper) })
    expect((wrapper.element as HTMLElement).firstElementChild?.className).toBe('toolbar')
  })

  it('uses the given modules', async () => {
    const wrapper = await mountEditor({ modelValue: '<p>a</p>', modules: [bold()] })
    const editor = editorOf(wrapper)
    document.getSelection()?.selectAllChildren(rootOf(wrapper))
    expect(editor.exec('bold')).toBe(true)
    expect(wrapper.emitted('update:modelValue')).toEqual([['<p><strong>a</strong></p>']])
  })

  it('reads and writes the value through the given format', async () => {
    const format: Format = {
      parse: (input) => input.replace(/^# (.*)$/, '<p>$1</p>'),
      stringify: (html) => html.replace(/^<p>(.*)<\/p>$/, '# $1'),
    }
    const wrapper = await mountEditor({ modelValue: '# a', format })
    expect(rootOf(wrapper).innerHTML).toBe('<p>a</p>')
    await wrapper.setProps({ modelValue: '# b' })
    expect(rootOf(wrapper).innerHTML).toBe('<p>b</p>')
    const root = rootOf(wrapper)
    typeInto(root, root.querySelector('p')?.firstChild as Text, 'bc')
    expect(wrapper.emitted('update:modelValue')).toEqual([['# bc']])
  })

  it('runs the external sanitizer on input', async () => {
    const sanitizer = vi.fn((html: string) => {
      const template = document.createElement('template')
      template.innerHTML = html.replace('secret', '')
      return template.content
    })
    const wrapper = await mountEditor({ modelValue: '<p>a secret</p>', sanitizer })
    expect(sanitizer).toHaveBeenCalled()
    expect(rootOf(wrapper).textContent).toBe('a ')
  })

  it('renders a hidden input with the sanitized value when named', async () => {
    const wrapper = await mountEditor({
      modelValue: '<p>a</p><img src=x onerror=alert(1)>',
      name: 'body',
    })
    const input = wrapper.get('input[type=hidden]').element as HTMLInputElement
    expect(input.name).toBe('body')
    expect(input.value).toBe('<p>a</p>')
  })

  it('keeps the hidden input in sync with typing', async () => {
    const wrapper = await mountEditor({ modelValue: '<p>a</p>', name: 'body' })
    const root = rootOf(wrapper)
    typeInto(root, root.querySelector('p')?.firstChild as Text, 'ab')
    await nextTick()
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('<p>ab</p>')
  })

  it('renders no hidden input without a name', async () => {
    expect((await mountEditor()).find('input').exists()).toBe(false)
  })

  it('destroys the editor on unmount and stops emitting', async () => {
    const wrapper = await mountEditor({ modelValue: '<p>a</p>' })
    const editor = editorOf(wrapper)
    const root = rootOf(wrapper)
    const destroy = vi.fn()
    editor.on('destroy', destroy)
    wrapper.unmount()
    expect(destroy).toHaveBeenCalledOnce()
    root.querySelector('p')?.append('b')
    dispatch(root, 'input')
    root.dispatchEvent(new FocusEvent('focus'))
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('focus')).toBeUndefined()
  })

  it('survives keep-alive deactivation with the same root and content', async () => {
    const shown = ref(true)
    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h('div', [
              h(KeepAlive, null, [
                shown.value ? h(WysiwygEditor, { modelValue: '<p>kept</p>' }) : null,
              ]),
            ])
        },
      }),
      { attachTo: document.body },
    )
    await nextTick()
    const root = wrapper.get('[role=textbox]').element
    shown.value = false
    await nextTick()
    shown.value = true
    await nextTick()
    expect(wrapper.get('[role=textbox]').element).toBe(root)
    expect(root.innerHTML).toBe('<p>kept</p>')
  })
})
