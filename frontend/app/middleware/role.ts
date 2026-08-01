export default defineNuxtRouteMiddleware((to) => {
  const { role } = useAuth()
  const allowed = (to.meta.roles ?? []) as string[]

  if (allowed.length === 0) return

  if (!role.value || !allowed.includes(role.value)) {
    return navigateTo('/properties')
  }
})
