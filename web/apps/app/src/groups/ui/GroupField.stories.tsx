import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { GroupInput } from './GroupField'

const meta = {
  title: 'Sonivo/Grupo/Campos',
  component: GroupInput,
  args: { label: 'Nombre de la canción', placeholder: 'Ej. Canto de esperanza' },
  argTypes: { type: { control: 'select', options: ['text', 'search', 'email', 'number'] } },
} satisfies Meta<typeof GroupInput>

export default meta
type Story = StoryObj<typeof meta>

export const Predeterminado: Story = { args: {} }
export const ConAyuda: Story = { args: { hint: 'Puedes cambiarlo después.' } }
export const ConError: Story = { args: { error: 'Escribe un nombre para continuar.', defaultValue: '' } }
export const Deshabilitado: Story = { args: { disabled: true, defaultValue: 'Canto de esperanza' } }
