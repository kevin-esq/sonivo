import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { GroupButton } from './GroupButton'
import { GroupSection } from './GroupSection'

const meta = { title: 'Sonivo/Grupo/Sección', component: GroupSection } satisfies Meta<typeof GroupSection>
export default meta
type Story = StoryObj<typeof meta>

export const ConAccion: Story = {
  args: {
    title: 'Canciones',
    description: 'Organiza el repertorio de tu grupo.',
    action: <GroupButton size="sm">Agregar canción</GroupButton>,
    children: <p className="rounded-xl border border-border-subtle p-4 text-sm">Aquí aparece el contenido de la sección.</p>,
  },
}
