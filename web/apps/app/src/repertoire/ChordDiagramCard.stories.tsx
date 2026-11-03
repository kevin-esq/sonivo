import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ChordDiagramCard } from './ChordDiagramCard'

const meta = {
  title: 'Sonivo/Repertorio/Diagramas',
  component: ChordDiagramCard,
  args: { chord: 'C' },
  argTypes: { chord: { control: 'text' } },
} satisfies Meta<typeof ChordDiagramCard>

export default meta
type Story = StoryObj<typeof meta>

function Row({ chords }: { chords: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {chords.map((chord) => (
        <div key={chord} className="flex flex-col items-center gap-1 rounded-lg border border-border-subtle bg-surface px-2 py-2">
          <span className="font-mono text-xs font-semibold text-ink">{chord}</span>
          <ChordDiagramCard chord={chord} />
        </div>
      ))}
    </div>
  )
}

export const Comunes: Story = { render: () => <Row chords={['C', 'A', 'G', 'E', 'D', 'Am', 'Em', 'Dm']} /> }

export const ConCeja: Story = { render: () => <Row chords={['F', 'Bm', 'F#m', 'B', 'Gm', 'C#m', 'Bb']} /> }

export const Séptimas: Story = { render: () => <Row chords={['C7', 'Am7', 'Gmaj7', 'Bm7', 'Fmaj7']} /> }

export const Extensiones: Story = { render: () => <Row chords={['C6', 'Am6', 'Csus2', 'Csus4', 'C7sus4', 'C9', 'Cm9', 'Cmaj9', 'Cadd9', 'C5']} /> }

export const SinDiagrama: Story = { render: () => <Row chords={['Cdim', 'Caug', 'C13', 'H7']} /> }
