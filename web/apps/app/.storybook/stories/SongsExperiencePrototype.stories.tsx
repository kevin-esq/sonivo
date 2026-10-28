import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SongsExperiencePrototype } from '../prototypes/SongsExperiencePrototype'

const meta = {
  title: 'Sonivo/Propuestas/Canciones',
  component: SongsExperiencePrototype,
  parameters: {
    fullBleed: true,
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
  argTypes: { variant: { control: false } },
} satisfies Meta<typeof SongsExperiencePrototype>

export default meta
type Story = StoryObj<typeof meta>

export const AListaGuiada: Story = {
  name: 'A · Lista guiada',
  args: { variant: 'guided' },
  parameters: { docs: { description: { story: 'Prioriza búsqueda, letra y la acción de practicar. Filtros secundarios y detalles avanzados se abren cuando hacen falta.' } } },
}

export const BEspacioDeEnsayo: Story = {
  name: 'B · Espacio de ensayo',
  args: { variant: 'workspace' },
  parameters: { docs: { description: { story: 'Mantiene la lista visible junto a la canción seleccionada, para cambiar de referencia sin perder el contexto.' } } },
}

export const CRepertorioCompacto: Story = {
  name: 'C · Repertorio compacto',
  args: { variant: 'catalog' },
  parameters: { docs: { description: { story: 'Conserva una tabla de repertorio para consultas y organización frecuente, con detalle, versiones y acciones en una jerarquía compacta.' } } },
}
