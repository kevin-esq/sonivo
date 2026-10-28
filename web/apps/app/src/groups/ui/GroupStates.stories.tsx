import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Music2 } from 'lucide-react'
import { GroupButton } from './GroupButton'
import { GroupEmptyState, GroupErrorState, GroupListSkeleton } from './GroupStates'

const meta = {
  title: 'Sonivo/Grupo/Estados',
  component: GroupEmptyState,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof GroupEmptyState>

export default meta
type Story = StoryObj<typeof meta>

export const BibliotecaVacia: Story = {
  args: {
    icon: Music2,
    title: 'Tu biblioteca está vacía',
    description: 'Agrega una canción para empezar a organizar el repertorio del grupo.',
    action: <GroupButton>Agregar canción</GroupButton>,
  },
}

export const Cargando: Story = {
  args: { title: 'Cargando canciones' },
  render: () => <GroupListSkeleton rows={3} label="Cargando canciones" />,
}

export const ErrorRecuperable: Story = {
  args: { title: 'No pudimos cargar las canciones' },
  render: () => (
    <GroupErrorState
      title="No pudimos cargar las canciones"
      message="Revisa tu conexión e inténtalo de nuevo."
      retryLabel="Intentar de nuevo"
      onRetry={() => undefined}
    />
  ),
}
