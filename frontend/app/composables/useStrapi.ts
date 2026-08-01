export const useStrapi = () => {
  const config = useRuntimeConfig()
  const auth = useAuth()
  const baseURL = config.public.strapiUrl

  const authHeaders = computed<Record<string, string>>(() => {
    const token = auth.token.value
    return token ? { Authorization: `Bearer ${token}` } : {}
  })

  const $api = async <T>(path: string, options: Parameters<typeof $fetch<T>>[1] = {}) => {
    return $fetch<T>(path, {
      baseURL,
      headers: authHeaders.value,
      ...options
    })
  }

  const getErrorMessage = (err: unknown) =>
    (err as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Something went wrong. Please try again.'

  return { baseURL, authHeaders, $api, getErrorMessage }
}
