import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ListSkeleton, PageSkeleton } from './skeleton'

const meta = { title: 'Sonivo/General/Carga', component: PageSkeleton } satisfies Meta<typeof PageSkeleton>
export default meta
type Story = StoryObj<typeof meta>

export const Página: Story = { args: { label: 'Cargando contenido' } }
export const Lista: Story = {
  args: { label: 'Cargando canciones' },
  render: () => <ListSkeleton rows={3} label="Cargando canciones" />,
}
