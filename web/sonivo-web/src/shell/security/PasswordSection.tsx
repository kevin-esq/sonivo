export function PasswordSection({
  hasPassword,
}: {
  hasPassword?: boolean
}) {
  if (!hasPassword) return null

  return (
    <section className="space-y-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">Contraseña de la cuenta</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Tu cuenta está protegida con contraseña. Para cambiarla, puedes utilizar la función de recuperación de contraseña desde la pantalla de inicio de sesión.
      </p>
    </section>
  )
}
