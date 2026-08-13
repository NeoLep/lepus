import { app, BrowserWindow, screen, type Rectangle } from 'electron'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const STATE_FILENAME = 'window-state.json'
const DEFAULT_WIDTH = 900
const DEFAULT_HEIGHT = 670
const MIN_WIDTH = 720
const MIN_HEIGHT = 520
const SAVE_DELAY_MS = 300
const MIN_VISIBLE_WIDTH = 120
const MIN_VISIBLE_HEIGHT = 60

interface WindowState extends Rectangle {
  maximized: boolean
}

function statePath(): string {
  return join(app.getPath('userData'), STATE_FILENAME)
}

function intersectionArea(left: Rectangle, right: Rectangle): number {
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x)
  )
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y)
  )
  return width * height
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizeState(value: unknown): WindowState | null {
  if (!value || typeof value !== 'object') return null
  const state = value as Partial<WindowState>
  if (
    !isFiniteNumber(state.x) ||
    !isFiniteNumber(state.y) ||
    !isFiniteNumber(state.width) ||
    !isFiniteNumber(state.height)
  ) {
    return null
  }

  const bounds = {
    x: Math.round(state.x),
    y: Math.round(state.y),
    width: Math.max(MIN_WIDTH, Math.round(state.width)),
    height: Math.max(MIN_HEIGHT, Math.round(state.height))
  }
  const displays = screen.getAllDisplays()
  const display = displays
    .map((candidate) => ({ candidate, area: intersectionArea(bounds, candidate.workArea) }))
    .sort((left, right) => right.area - left.area)[0]

  if (!display || display.area < MIN_VISIBLE_WIDTH * MIN_VISIBLE_HEIGHT) {
    const workArea = screen.getPrimaryDisplay().workArea
    const width = Math.min(bounds.width, workArea.width)
    const height = Math.min(bounds.height, workArea.height)
    return {
      x: workArea.x + Math.round((workArea.width - width) / 2),
      y: workArea.y + Math.round((workArea.height - height) / 2),
      width,
      height,
      maximized: state.maximized === true
    }
  }

  const workArea = display.candidate.workArea
  return {
    x: bounds.x,
    y: bounds.y,
    width: Math.min(bounds.width, workArea.width),
    height: Math.min(bounds.height, workArea.height),
    maximized: state.maximized === true
  }
}

export function loadWindowState(): WindowState {
  try {
    const state = normalizeState(JSON.parse(readFileSync(statePath(), 'utf8')))
    if (state) return state
  } catch {
    // The first launch and invalid state files both fall back to centered defaults.
  }

  const workArea = screen.getPrimaryDisplay().workArea
  const width = Math.min(DEFAULT_WIDTH, workArea.width)
  const height = Math.min(DEFAULT_HEIGHT, workArea.height)
  return {
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    height,
    maximized: false
  }
}

function saveWindowState(window: BrowserWindow): void {
  if (window.isDestroyed()) return
  const bounds = window.getNormalBounds()
  const state: WindowState = { ...bounds, maximized: window.isMaximized() }
  const path = statePath()
  const temporaryPath = `${path}.${process.pid}.tmp`

  try {
    writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8' })
    renameSync(temporaryPath, path)
  } catch (error) {
    console.warn('Unable to save window state:', error)
  }
}

export function trackWindowState(window: BrowserWindow): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined

  const scheduleSave = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      saveWindowState(window)
    }, SAVE_DELAY_MS)
  }
  const flush = (): void => {
    if (timer) clearTimeout(timer)
    timer = undefined
    saveWindowState(window)
  }

  window.on('resize', scheduleSave)
  window.on('move', scheduleSave)
  window.on('maximize', scheduleSave)
  window.on('unmaximize', scheduleSave)
  window.on('close', flush)

  return flush
}
