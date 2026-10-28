import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { GroupButton } from './GroupButton'

const meta = {
  title: 'Sonivo/Grupo/Botón',
  component: GroupButton,
  args: { children: 'Guardar cambios' },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'soft', 'ghost', 'danger'] },
    size: { control: 'select', options: ['sm', 'default', 'lg', 'icon'] },
  },
} satisfies Meta<typeof GroupButton>

export default meta
type Story = StoryObj<typeof meta>

export const Principal: Story = { args: { variant: 'primary' } }
export const Secundario: Story = { args: { variant: 'secondary' } }
export const Enfocado: Story = { args: { variant: 'secondary', autoFocus: true } }
export const Deshabilitado: Story = { args: { disabled: true } }
export const Cargando: Story = { args: { children: 'Guardando…', disabled: true, 'aria-busy': true } }
