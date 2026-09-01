export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const PASSWORD_SYMBOL_PATTERN =
  /[0-9!@#$%^&*()_\-+=[\]{};':"\\|,.<>/?`~]/

export const ACCOUNT_VALIDATION_MESSAGES = {
  emailInvalid:
    'Enter a valid email address, for example you@example.com.',
  passwordInvalid: 'Password does not meet the requirements.',
  confirmEmpty: 'Please confirm your password.',
  confirmMismatch: "Passwords don't match. Please try again.",
} as const

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim())
}

export function hasMinPasswordLength(value: string): boolean {
  return value.length >= 8
}

export function hasNumberOrSymbol(value: string): boolean {
  return PASSWORD_SYMBOL_PATTERN.test(value)
}

export function isValidPassword(value: string): boolean {
  return hasMinPasswordLength(value) && hasNumberOrSymbol(value)
}

export function passwordsMatch(password: string, confirm: string): boolean {
  return confirm !== '' && password === confirm
}

export function shouldSimulateExistingAccount(email: string): boolean {
  return email.toLowerCase().includes('+exists')
}
