import { useState } from 'react'

export function SettingsProfilePage({ user }: { user: { email?: string | null; id?: string } }) {
  const [name, setName] = useState('Kevin Esquivel')
  const [email] = useState(user?.email || 'usuario@sonivo.app')

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Perfil Personal</h2>
        <p className="text-sm text-slate-500">Actualiza tus datos personales de contacto y preferencias.</p>
      </div>

      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Nombre completo</span>
          <input
            type="text"
            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Correo electrónico</span>
          <input
            type="email"
            disabled
            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 text-slate-500 cursor-not-allowed"
            value={email}
          />
        </label>
      </div>
    </div>
  )
}

export function SettingsTeamPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Miembros del Equipo</h2>
        <p className="text-sm text-slate-500">Gestiona los roles y miembros activos en tus grupos musicales.</p>
      </div>

      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-sm">
        Para agregar o remover miembros de un grupo específico, dirígete a la sección <strong>Equipo</strong> de tu grupo activo en el menú lateral.
      </div>
    </div>
  )
}
