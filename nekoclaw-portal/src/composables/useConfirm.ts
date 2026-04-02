import { ref } from 'vue'

export function useConfirm() {
  const visible = ref(false)
  const title = ref('')
  const message = ref('')
  let _resolve: ((value: boolean) => void) | null = null

  function confirm(opts: { title: string; message: string }): Promise<boolean> {
    title.value = opts.title
    message.value = opts.message
    visible.value = true
    return new Promise<boolean>((resolve) => {
      _resolve = resolve
    })
  }

  function onConfirm() {
    visible.value = false
    _resolve?.(true)
    _resolve = null
  }

  function onCancel() {
    visible.value = false
    _resolve?.(false)
    _resolve = null
  }

  return { visible, title, message, confirm, onConfirm, onCancel }
}
