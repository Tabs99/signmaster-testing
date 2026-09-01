import type { AccountFieldState } from '../types'

export function accountInputClasses(state: AccountFieldState, hasAddon = false): string {
  const base = `min-h-11 w-full rounded-lg py-3.5 text-[15px] text-white outline-none transition-[border-color,background-color] duration-150 placeholder:text-white/[0.42] ${
    hasAddon ? 'pl-4 pr-12' : 'px-4'
  }`

  if (state === 'error') {
    return `${base} border border-error/60 bg-error/10`
  }

  if (state === 'focused') {
    return `${base} border border-accent-gold/60 bg-white/[0.07]`
  }

  if (state === 'valid') {
    return `${base} border border-success/35 bg-white/[0.07]`
  }

  return `${base} border border-white/20 bg-white/[0.07]`
}

export const accountLabelClassName =
  'mb-1.5 block text-[11px] font-bold uppercase tracking-[0.1em] text-accent-gold'
