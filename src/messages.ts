import type { Message } from './types/message.js'

let getMessages: () => Message[] = () => []

export function setMessagesGetter(getter: () => Message[]) {
  getMessages = getter
}

export function getMessagesGetter(): () => Message[] {
  return getMessages
}
