import { defineComponent, h } from 'vue'

export const OutputPane = defineComponent({
  name: 'OutputPane',
  props: {
    /** Heading above the output */
    title: { type: String, required: true },
    /** Text shown verbatim */
    content: { type: String, required: true },
    /** Test hook of the output block */
    testid: { type: String, required: true },
  },
  setup(props) {
    return () =>
      h('figure', { class: 'demo-pane' }, [
        h('figcaption', props.title),
        h('pre', { 'data-testid': props.testid }, h('code', props.content)),
      ])
  },
})
