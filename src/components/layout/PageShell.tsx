interface PageShellProps {
  children: React.ReactNode
}

export default function PageShell({ children }: PageShellProps) {
  return (
    <main className="flex min-h-dvh w-full flex-col items-center overflow-x-hidden overflow-y-auto bg-keyline-page px-5 pb-[calc(40px+env(safe-area-inset-bottom))] pt-[calc(max(24px,4vh)+env(safe-area-inset-top))] font-sans">
      <div className="account-shell w-full contents">{children}</div>
    </main>
  )
}
