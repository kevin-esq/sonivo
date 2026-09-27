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

export function SettingsBillingPage() {
  const plans = [
    { name: 'Free', price: '$0', desc: 'Hasta 1 grupo y 20 canciones en repertorio', current: false },
    { name: 'Pro', price: '$9.99/mes', desc: 'Repertorio ilimitado, audio HD y 5 miembros', current: true },
    { name: 'Band', price: '$24.99/mes', desc: 'Múltiples bandas, almacenamiento R2 y SignalR live', current: false },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Planes y Facturación</h2>
        <p className="text-sm text-slate-500">Administra tu suscripción y métodos de pago guardados.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {plans.map((p) => (
          <div
            key={p.name}
            className={`p-6 rounded-2xl border ${
              p.current
                ? 'border-indigo-600 bg-indigo-50/30 dark:bg-indigo-950/20 ring-2 ring-indigo-600'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
            }`}
          >
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">{p.name}</h3>
            <p className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-2">{p.price}</p>
            <p className="text-sm text-slate-500 mt-2">{p.desc}</p>
            <button
              type="button"
              className={`w-full mt-6 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all ${
                p.current
                  ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-default'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}
            >
              {p.current ? 'Plan Actual' : 'Seleccionar Plan'}
            </button>
          </div>
        ))}
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
