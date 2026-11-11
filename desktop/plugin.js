/**
 * Hermes Desktop half of Thought We Wouldn't Notice.
 *
 * A quarter in chat broadcasts plugin.thought-we-wouldnt-notice.coin.
 * This file opens Top Sails over the Desktop window. Esc closes it and
 * returns focus to the composer. Older builds fall back from a dialog,
 * to a workspace tab, to a side pane. Missing APIs are skipped.
 *
 * Disk plugins load uncompiled. No JSX. Imports stay on the SDK allowlist.
 */
import * as sdk from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useEffect, useRef, useState } from 'react'

export const COIN_EVENT = 'plugin.thought-we-wouldnt-notice.coin'
const CLOSE_MESSAGE = 'twwwn-close'

export function chooseSurface(api) {
  const offered = api || {}
  if (offered.dialog) return 'dialog'
  if (offered.openWorkspace) return 'workspace'
  if (offered.pane) return 'pane'
  return 'none'
}

export function isDismissKey(event) {
  if (!event) return false
  return event.key === 'Escape' || event.key === 'Esc'
}


const CABINET_NATURAL_WIDTH = 420
const CABINET_NATURAL_HEIGHT = 798
const FRAME_PAD = 16
const TITLE_BAR_HEIGHT = 60
const WINDOW_FIT = 0.94

export function cabinetFrameSize(bounds) {
  const hasWindow = typeof window !== 'undefined'
  const viewportW = (hasWindow && window.visualViewport && window.visualViewport.width) || (hasWindow && window.innerWidth) || (CABINET_NATURAL_WIDTH + FRAME_PAD)
  const viewportH = (hasWindow && window.visualViewport && window.visualViewport.height) || (hasWindow && window.innerHeight) || (CABINET_NATURAL_HEIGHT + FRAME_PAD + TITLE_BAR_HEIGHT)
  const fromParent = !!(bounds && (bounds.width || bounds.height))
  const boxW = fromParent ? bounds.width : viewportW
  const boxH = fromParent ? bounds.height : viewportH
  const pct = fromParent ? 0.98 : WINDOW_FIT
  const maxW = Math.max(200, Math.floor(boxW * pct))
  const maxH = Math.max(200, Math.floor(boxH * pct) - TITLE_BAR_HEIGHT)
  const frameW = CABINET_NATURAL_WIDTH + FRAME_PAD
  const frameH = CABINET_NATURAL_HEIGHT + FRAME_PAD
  let scale = Math.min(maxW / frameW, maxH / frameH)
  if (!isFinite(scale) || scale <= 0) scale = 1
  return {
    width: Math.round(frameW * scale),
    height: Math.round(frameH * scale),
  }
}

function useFitSize(parentRef, fit) {
  const [size, setSize] = useState(() => cabinetFrameSize(null))
  useEffect(() => {
    const update = () => {
      if (fit === 'parent' && parentRef && parentRef.current) {
        const box = parentRef.current.getBoundingClientRect()
        if (box.width >= 160 && box.height >= 160) {
          setSize(cabinetFrameSize({ width: box.width, height: box.height }))
          return
        }
      }
      setSize(cabinetFrameSize(null))
    }
    update()
    window.addEventListener('resize', update)
    if (window.visualViewport) window.visualViewport.addEventListener('resize', update)
    let observer = null
    if (fit === 'parent' && parentRef && parentRef.current && typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(update)
      observer.observe(parentRef.current)
    }
    return () => {
      window.removeEventListener('resize', update)
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', update)
      if (observer) observer.disconnect()
    }
  }, [fit, parentRef])
  return size
}

const host = sdk.host
const Dialog = sdk.Dialog
const DialogContent = sdk.DialogContent
const SandboxedFrame = sdk.SandboxedFrame

let cabinetOpen = false
let session = 0
let workspaceDispose = null
let paneDispose = null
let activeSurface = 'none'
let pageHtml = ''
let pagePromise = null
const listeners = new Set()
let pluginCtx = null

function notify() {
  listeners.forEach((fn) => {
    try { fn() } catch (err) { /* one listener must not stall the rest */ }
  })
}

function focusComposer() {
  try {
    if (host && host.composer && typeof host.composer.focus === 'function') {
      host.composer.focus(null)
      return
    }
  } catch (err) { /* older host */ }
  try {
    if (pluginCtx && typeof pluginCtx.runAction === 'function') {
      pluginCtx.runAction('composer.focus')
    }
  } catch (err) { /* action missing */ }
}

function dismiss() {
  const wasOpen = cabinetOpen || workspaceDispose || paneDispose
  cabinetOpen = false
  notify()
  const closeWorkspace = workspaceDispose
  workspaceDispose = null
  if (typeof closeWorkspace === 'function') {
    try { closeWorkspace() } catch (err) { /* already closed */ }
  }
  const closePane = paneDispose
  paneDispose = null
  if (typeof closePane === 'function') {
    try { closePane() } catch (err) { /* already closed */ }
  }
  if (wasOpen) focusComposer()
}

function onWorkspaceClosed() {
  workspaceDispose = null
  if (!cabinetOpen) return
  cabinetOpen = false
  notify()
  focusComposer()
}

function surfaceApis() {
  return {
    dialog: typeof Dialog === 'function' && typeof DialogContent === 'function',
    openWorkspace: !!(host && typeof host.openWorkspace === 'function'),
    pane: !!(pluginCtx && typeof pluginCtx.register === 'function'),
  }
}

function loadHtml() {
  if (pageHtml) return Promise.resolve(pageHtml)
  if (!pluginCtx || typeof pluginCtx.rest !== 'function') return Promise.resolve('')
  if (!pagePromise) {
    pagePromise = pluginCtx.rest('/cabinet').then((data) => {
      pageHtml = (data && data.html) || ''
      return pageHtml
    }).catch(() => {
      pagePromise = null
      return ''
    })
  }
  return pagePromise
}

function CabinetBody(props) {
  const fit = (props && props.fit) || 'window'
  const parentRef = useRef(null)
  const size = useFitSize(parentRef, fit)
  const [html, setHtml] = useState(pageHtml)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let stop = false
    loadHtml().then((value) => {
      if (stop) return
      if (!value) setFailed(true)
      else setHtml(value)
    })
    return () => { stop = true }
  }, [])
  useEffect(() => {
    if (!pluginCtx || typeof pluginCtx.addEventListener !== 'function') return undefined
    return pluginCtx.addEventListener(window, 'message', (event) => {
      const data = event && event.data
      if (data && data.type === CLOSE_MESSAGE) dismiss()
    })
  }, [])
  const closeButton = jsx('button', {
    type: 'button',
    onClick: dismiss,
    style: {
      minHeight: '44px',
      padding: '8px 14px',
      color: '#1a0f16',
      background: '#ffd36a',
      border: '0',
      borderRadius: '8px',
      fontWeight: '700',
      cursor: 'pointer',
    },
    children: 'Close',
  })
  if (failed) {
    return jsxs('div', {
      style: { padding: '16px', color: '#f6e7c1', background: '#120910' },
      children: [
        jsx('p', { children: 'Top Sails could not load from this gateway.' }),
        closeButton,
      ],
    })
  }
  if (!html) {
    return jsx('p', {
      style: { padding: '16px', color: '#f6e7c1' },
      children: 'Opening Top Sails…',
    })
  }
  const src = 'data:text/html;charset=utf-8,' + encodeURIComponent(html)
  const frame = typeof SandboxedFrame === 'function'
    ? jsx(SandboxedFrame, {
      src,
      title: 'Top Sails',
      style: { width: size.width + 'px', height: size.height + 'px', border: '0', background: '#120910', display: 'block' },
    })
    : jsx('p', { children: 'This Desktop build cannot embed the cabinet.' })
  return jsxs('div', {
    ref: parentRef,
    style: {
      display: 'flex',
      flexDirection: 'column',
      width: size.width + 'px',
      overflow: 'hidden',
      background: '#120910',
    },
    children: [
      jsxs('div', {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          padding: '8px 12px',
          color: '#ffe7a3',
        },
        children: [
          jsx('strong', { children: 'Top Sails' }),
          closeButton,
        ],
      }),
      jsx('div', { style: { width: size.width + 'px', height: size.height + 'px', overflow: 'hidden', background: '#120910' }, children: frame }),
    ],
  })
}

function useCabinet() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const fn = () => setTick((n) => n + 1)
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])
  return cabinetOpen
}

function OverlayHost() {
  const open = useCabinet()
  if (!open || activeSurface !== 'dialog') return null
  return jsx(Dialog, {
    open: true,
    onOpenChange: (next) => { if (!next) dismiss() },
    children: jsx(DialogContent, {
      onEscapeKeyDown: (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault()
        dismiss()
      },
      style: {
        width: 'auto',
        maxWidth: '94vw',
        height: 'auto',
        maxHeight: '94vh',
        padding: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      },
      children: jsx(CabinetBody, { key: session }),
    }),
  })
}

function Chip() {
  const open = useCabinet()
  return jsx('button', {
    type: 'button',
    onClick: () => { if (open) dismiss(); else present(null) },
    style: {
      padding: '0 8px',
      color: '#ffe7a3',
      background: 'transparent',
      border: '0',
      cursor: 'pointer',
    },
    children: open ? 'Close Top Sails' : 'Top Sails',
  })
}

function present(payload) {
  if (payload && typeof payload.html === 'string' && payload.html.length) {
    pageHtml = payload.html
    pagePromise = Promise.resolve(pageHtml)
  }
  session += 1
  activeSurface = chooseSurface(surfaceApis())
  cabinetOpen = activeSurface !== 'none'
  notify()
  if (activeSurface === 'workspace') {
    workspaceDispose = host.openWorkspace('top-sails', {
      title: 'Top Sails',
      minWidth: 420,
      onClose: onWorkspaceClosed,
      render: () => jsx(CabinetBody, { key: session, fit: 'parent' }),
    })
  } else if (activeSurface === 'pane' && pluginCtx) {
    if (paneDispose) {
      try { paneDispose() } catch (err) { /* replace the side pane */ }
      paneDispose = null
    }
    paneDispose = pluginCtx.register({
      id: 'top-sails-side',
      area: 'panes',
      title: 'Top Sails',
      data: {
        placement: 'right',
        width: '440px',
        dock: { pane: 'workspace', pos: 'right' },
      },
      render: () => jsx(CabinetBody, { key: session, fit: 'parent' }),
    })
  } else if (activeSurface === 'none' && host && typeof host.notify === 'function') {
    try {
      host.notify({ kind: 'info', message: 'Top Sails heard the quarter, but this Desktop build has no panel to open.' })
    } catch (err) { /* toast is optional */ }
  }
  void payload
}

function onWindowKey(event) {
  if (!cabinetOpen || !isDismissKey(event)) return
  if (typeof event.preventDefault === 'function') event.preventDefault()
  if (typeof event.stopPropagation === 'function') event.stopPropagation()
  dismiss()
}

export default {
  id: 'thought-we-wouldnt-notice',
  name: "Thought We Wouldn't Notice",
  defaultEnabled: true,
  register(ctx) {
    pluginCtx = ctx
    const listen = typeof ctx.onEvent === 'function'
      ? ctx.onEvent.bind(ctx)
      : (host && typeof host.onEvent === 'function' ? host.onEvent.bind(host) : null)
    if (listen) {
      listen(COIN_EVENT, (event) => {
        const payload = event && event.payload
        present(payload || null)
      })
    }
    if (typeof ctx.addEventListener === 'function') {
      ctx.addEventListener(window, 'keydown', onWindowKey, true)
    }
    ctx.register({
      id: 'overlay-host',
      area: 'statusBar.right',
      order: 140,
      render: () => jsx(OverlayHost, {}),
    })
    ctx.register({
      id: 'chip',
      area: 'statusBar.right',
      order: 139,
      render: () => jsx(Chip, {}),
    })
    if (typeof ctx.rest === 'function') {
      ctx.rest('/drops?since=0').then((data) => {
        const drops = (data && data.drops) || []
        const now = Date.now() / 1000
        const fresh = drops.filter((drop) => now - Number(drop.created_at || 0) < 20)
        if (fresh.length) present(fresh[fresh.length - 1])
      }).catch(() => {})
    }
  },
}
