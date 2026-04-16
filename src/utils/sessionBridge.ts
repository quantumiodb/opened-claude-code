import type { Message } from '../types/message.js'
import { getMessagesGetter } from '../messages.js'

export type ImageAttachment = {
  base64: string
  mediaType: string
}

export type SerializedPermission = {
  requestId: string
  toolName: string
  description: string
  input: Record<string, unknown>
}

type StoredPermission = SerializedPermission & {
  onAllow: (type: 'permanent' | 'temporary') => void
  onReject: () => void
  savePermissionFn: () => Promise<void>
}

// submitFn fires the query and returns immediately (does not wait for response)
type SubmitFn = (prompt: string, image?: ImageAttachment) => void
type ChangeListener = () => void
type PermissionRequestListener = (p: SerializedPermission) => void
type PermissionResolvedListener = (requestId: string) => void

class SessionBridge {
  private submitFn: SubmitFn | null = null
  private port: number | null = null
  // loading = true while REPL is processing a query (driven by isLoading from REPL)
  private loading = false
  private idleListeners = new Set<() => void>()
  private changeListeners = new Set<ChangeListener>()
  private pendingPermissions = new Map<string, StoredPermission>()
  private permissionRequestListeners = new Set<PermissionRequestListener>()
  private permissionResolvedListeners = new Set<PermissionResolvedListener>()

  register(submitFn: SubmitFn): void {
    this.submitFn = submitFn
  }

  unregister(): void {
    this.submitFn = null
  }

  isActive(): boolean {
    return this.submitFn !== null
  }

  isBusy(): boolean {
    return this.loading
  }

  /** Called by REPL useEffect([isLoading]) to track real query state */
  setLoading(loading: boolean): void {
    this.loading = loading
    if (!loading) {
      for (const cb of this.idleListeners) cb()
      this.idleListeners.clear()
    }
  }

  /** Resolves when the REPL next becomes idle (loading → false) */
  private waitForIdle(timeoutMs = 120_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.idleListeners.delete(done)
        reject(new Error('Timed out waiting for REPL response'))
      }, timeoutMs)
      const done = () => {
        clearTimeout(timer)
        resolve()
      }
      this.idleListeners.add(done)
    })
  }

  async submit(prompt: string, image?: ImageAttachment): Promise<void> {
    if (!this.submitFn) {
      throw new Error('No active REPL session')
    }
    if (this.loading) {
      throw new Error('Session is busy processing another request')
    }
    this.submitFn(prompt, image)
    // Wait a tick for REPL to flip isLoading true before we poll for idle
    await new Promise<void>((r) => setTimeout(r, 50))
    await this.waitForIdle()
  }

  getMessages(): Message[] {
    return getMessagesGetter()()
  }

  setPort(port: number): void {
    this.port = port
  }

  getPort(): number | null {
    return this.port
  }

  /** Subscribe to message changes. Returns unsubscribe function. */
  onMessagesChange(listener: ChangeListener): () => void {
    this.changeListeners.add(listener)
    return () => this.changeListeners.delete(listener)
  }

  /** Notify all listeners that messages have changed. */
  notifyMessagesChanged(): void {
    for (const listener of this.changeListeners) {
      listener()
    }
  }

  addPendingPermission(p: StoredPermission): void {
    this.pendingPermissions.set(p.requestId, p)
    const serialized: SerializedPermission = {
      requestId: p.requestId,
      toolName: p.toolName,
      description: p.description,
      input: p.input,
    }
    for (const listener of this.permissionRequestListeners) {
      listener(serialized)
    }
  }

  removePendingPermission(requestId: string): void {
    this.pendingPermissions.delete(requestId)
    for (const listener of this.permissionResolvedListeners) {
      listener(requestId)
    }
  }

  async resolvePermission(
    requestId: string,
    decision: 'allow' | 'allow-permanent' | 'reject'
  ): Promise<void> {
    const p = this.pendingPermissions.get(requestId)
    if (!p) return
    if (decision === 'reject') {
      p.onReject()
    } else if (decision === 'allow-permanent') {
      await p.savePermissionFn()
      p.onAllow('permanent')
    } else {
      p.onAllow('temporary')
    }
  }

  getPendingPermissions(): SerializedPermission[] {
    return Array.from(this.pendingPermissions.values()).map((p) => ({
      requestId: p.requestId,
      toolName: p.toolName,
      description: p.description,
      input: p.input,
    }))
  }

  onPermissionRequest(listener: PermissionRequestListener): () => void {
    this.permissionRequestListeners.add(listener)
    return () => this.permissionRequestListeners.delete(listener)
  }

  onPermissionResolved(listener: PermissionResolvedListener): () => void {
    this.permissionResolvedListeners.add(listener)
    return () => this.permissionResolvedListeners.delete(listener)
  }
}

export const sessionBridge = new SessionBridge()
