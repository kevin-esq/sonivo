import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Copy, Pencil, Trash2 } from 'lucide-react'
import { GroupActionMenu } from './GroupActionMenu'

const meta = { title: 'Sonivo/Grupo/Menú de acciones', component: GroupActionMenu } satisfies Meta<typeof GroupActionMenu>
export default meta
type Story = StoryObj<typeof meta>

export const Predeterminado: Story = {
  args: {
    label: 'Acciones de la canción',
    items: [
      { key: 'edit', label: 'Editar canción', icon: Pencil, onSelect: () => undefined },
      { key: 'copy', label: 'Hacer una copia', icon: Copy, onSelect: () => undefined },
      { key: 'delete', label: 'Eliminar canción', icon: Trash2, onSelect: () => undefined, danger: true, separatorBefore: true },
    ],
  },
}
