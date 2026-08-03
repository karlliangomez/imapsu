export const PASSWORD_REQUIREMENTS = [
  { key: 'length', label: 'At least 6 characters' },
  { key: 'upper', label: 'At least one uppercase letter' },
  { key: 'lower', label: 'At least one lowercase letter' },
  { key: 'symbol', label: 'At least one symbol (e.g. ! @ # $)' }
] as const

export type PasswordCheck = { ok: boolean; missing: string[] }

export function checkPasswordStrength(password: string): PasswordCheck {
  const missing: string[] = []
  if (password.length < 6) missing.push('length')
  if (!/[A-Z]/.test(password)) missing.push('upper')
  if (!/[a-z]/.test(password)) missing.push('lower')
  if (!/[^A-Za-z0-9]/.test(password)) missing.push('symbol')
  return { ok: missing.length === 0, missing }
}

export function isStrongPassword(password: string): boolean {
  return checkPasswordStrength(password).ok
}
