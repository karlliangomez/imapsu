import type { AuthResponse, User } from '~/types/auth'

const TOKEN_COOKIE = 'strapi_token'

export const useAuth = () => {
  const config = useRuntimeConfig()
  const token = useCookie<string | null>(TOKEN_COOKIE, {
    maxAge: 60 * 60 * 24 * 7,
    sameSite: 'lax'
  })
  const user = useState<User | null>('auth-user', () => null)
  const loading = useState<boolean>('auth-loading', () => false)

  const isAuthenticated = computed(() => !!user.value)
  const role = computed(() => user.value?.role?.type ?? null)

  const isStudent = computed(() => role.value === 'student')
  const isAspiringTenant = computed(() => role.value === 'aspiring-tenant')
  const isCurrentTenant = computed(() => role.value === 'current-tenant')
  const isFieldPersonnel = computed(() => role.value === 'field-personnel')
  const isOas = computed(() => role.value === 'oas')
  const isAdmin = computed(() => role.value === 'admin')
  const isStaff = computed(() => isOas.value || isAdmin.value)

  const refreshMe = async () => {
    if (!token.value) {
      user.value = null
      return
    }

    loading.value = true
    try {
      user.value = await $fetch<User>('/api/auth/me', {
        baseURL: config.public.strapiUrl,
        headers: { Authorization: `Bearer ${token.value}` }
      })
    } catch {
      token.value = null
      user.value = null
    } finally {
      loading.value = false
    }
  }

  const login = async (identifier: string, password: string) => {
    const data = await $fetch<AuthResponse>('/api/auth/login', {
      method: 'POST',
      baseURL: config.public.strapiUrl,
      body: { identifier, password }
    })

    token.value = data.jwt
    await refreshMe()
    return data.user
  }

  const register = async (input: { username: string; email: string; password: string; role: string }) => {
    const data = await $fetch<AuthResponse>('/api/auth/register-with-role', {
      method: 'POST',
      baseURL: config.public.strapiUrl,
      body: input
    })

    token.value = data.jwt
    await refreshMe()
    return data.user
  }

  const logout = () => {
    token.value = null
    user.value = null
  }

  const init = async () => {
    if (!token.value) return
    await refreshMe()
  }

  return {
    token,
    user,
    loading,
    isAuthenticated,
    role,
    isStudent,
    isAspiringTenant,
    isCurrentTenant,
    isFieldPersonnel,
    isOas,
    isAdmin,
    isStaff,
    login,
    register,
    logout,
    init,
    refreshMe
  }
}
