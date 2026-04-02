import React, { useState } from 'react'
import type { AssistantSession } from './sessionDiscovery.js'
import { Box, Text, useInput } from '../ink.js'

type Props = {
  sessions: AssistantSession[]
  onSelect: (id: string) => void
  onCancel: () => void
}

export function AssistantSessionChooser({
  sessions,
  onSelect,
  onCancel,
}: Props): React.ReactNode {
  const h = React.createElement
  const [index, setIndex] = useState(0)

  useInput((_input, key) => {
    if (key.escape || key.leftArrow) {
      onCancel()
      return
    }
    if (key.upArrow) {
      setIndex(current => (current <= 0 ? sessions.length - 1 : current - 1))
      return
    }
    if (key.downArrow) {
      setIndex(current => (current + 1) % sessions.length)
      return
    }
    if (key.return) {
      const selected = sessions[index]
      if (selected) onSelect(selected.id)
    }
  })

  return h(
    Box,
    { flexDirection: 'column', gap: 1 },
    h(Text, { bold: true }, 'Select an assistant session'),
    h(Text, { dimColor: true }, 'Use ↑/↓ to move, Enter to attach, Esc to cancel.'),
    ...sessions.map((session, sessionIndex) =>
      h(
        Box,
        { key: session.id, flexDirection: 'column' },
        h(
          Text,
          { color: sessionIndex === index ? 'cyan' : undefined },
          `${sessionIndex === index ? '› ' : '  '}${session.title}`,
        ),
        h(
          Text,
          { dimColor: true },
          `${session.status} · ${session.id.slice(0, 8)} · updated ${session.updatedAt}`,
        ),
      ),
    ),
  )
}

export default AssistantSessionChooser
