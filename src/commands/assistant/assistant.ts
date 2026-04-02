import React from 'react'
import { homedir } from 'os'
import { join } from 'path'
import { Box, Text, useInput } from '../../ink.js'

type NewInstallWizardProps = {
  defaultDir: string
  onInstalled: (dir: string) => void
  onCancel: () => void
  onError: (message: string) => void
}

export async function computeDefaultInstallDir(): Promise<string> {
  return join(homedir(), '.claude', 'assistant')
}

export function NewInstallWizard({
  defaultDir,
  onCancel,
  onError,
}: NewInstallWizardProps): React.ReactNode {
  const h = React.createElement
  useInput((input, key) => {
    if (key.escape || input === 'q') {
      onCancel()
      return
    }
    if (key.return || input === 'i') {
      onError(
        'Assistant installation workflow is not fully restored yet. Install it manually or use an existing session.',
      )
    }
  })

  return h(
    Box,
    { flexDirection: 'column', gap: 1 },
    h(Text, { bold: true }, 'Assistant install'),
    h(
      Text,
      null,
      'The restored source tree does not include the original installer flow.',
    ),
    h(Text, { dimColor: true }, `Suggested install directory: ${defaultDir}`),
    h(
      Text,
      { dimColor: true },
      'Press Enter or i to report the missing installer, Esc or q to cancel.',
    ),
  )
}

export default {
  type: 'local',
  name: 'assistant',
  description: 'Attach to or manage assistant sessions.',
  supportsNonInteractive: false,
  async load() {
    const h = React.createElement
    return {
      type: 'jsx',
      jsx: h(
        Box,
        { flexDirection: 'column' },
        h(Text, null, 'Use `claude assistant` to attach to an assistant session.'),
      ),
    }
  },
}
