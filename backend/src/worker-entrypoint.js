#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const STRATEGIES_DIR = process.env.STRATEGIES_DIR || path.join(__dirname, '../strategies')

function loadStrategies() {
  try {
    const files = fs.readdirSync(STRATEGIES_DIR)
    const strategies = files
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          const content = fs.readFileSync(path.join(STRATEGIES_DIR, f), 'utf8')
          return { file: f, json: JSON.parse(content) }
        } catch (err) {
          console.error('Failed to parse strategy', f, err.message)
          return { file: f, error: err.message }
        }
      })
    console.log('Loaded strategies:', strategies.map(s => s.file))
    return strategies
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn('Strategies directory not found:', STRATEGIES_DIR)
      return []
    }
    console.error('Error reading strategies dir:', err)
    return []
  }
}

// Initial load
loadStrategies()

// Watch for changes (simple, works in most containers)
try {
  fs.watch(STRATEGIES_DIR, { persistent: true }, (eventType, filename) => {
    if (!filename) return
    if (!filename.endsWith('.json')) return
    console.log('Strategy change detected:', eventType, filename)
    loadStrategies()
  })
} catch (err) {
  if (err.code === 'ENOENT') {
    console.warn('No strategies directory to watch — create', STRATEGIES_DIR)
  } else {
    console.error('Failed to start strategies watcher:', err)
  }
}

// Basic health / keepalive loop
let shuttingDown = false
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

function shutdown(sig) {
  if (shuttingDown) return
  shuttingDown = true
  console.log('Worker shutting down...', sig)
  setTimeout(() => process.exit(0), 1000)
}

console.log('Worker entrypoint started. Watching strategies in', STRATEGIES_DIR)
