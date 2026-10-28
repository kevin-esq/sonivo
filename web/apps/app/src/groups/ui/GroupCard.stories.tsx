import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Music2 } from 'lucide-react'
import { GroupCard, GroupChip, GroupStat } from './GroupCard'

const meta = { title: 'Sonivo/Grupo/Superficies', component: GroupCard } satisfies Meta<typeof GroupCard>
export default meta
type Story = StoryObj<typeof meta>

export const Tarjeta: Story = {
  render: () => (
    <GroupCard className="space-y-3">
      <h2 className="font-semibold">Repertorio</h2>
      <p className="text-sm text-muted">Canciones disponibles para el grupo.</p>
      <GroupChip tone="success">Actualizado</GroupChip>
    </GroupCard>
  ),
}

export const AccesoDeGrupo: Story = {
  render: () => <GroupStat icon={Music2} label="Canciones" description="Repertorio del grupo" value="12" />,
}

export const VariantesDeEstado: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <GroupChip>Normal</GroupChip>
      <GroupChip tone="accent">Seleccionada</GroupChip>
      <GroupChip tone="success">Lista</GroupChip>
      <GroupChip tone="warning">Pendiente</GroupChip>
      <GroupChip tone="error">Con error</GroupChip>
      <GroupChip tone="outline">Opcional</GroupChip>
    </div>
  ),
}
