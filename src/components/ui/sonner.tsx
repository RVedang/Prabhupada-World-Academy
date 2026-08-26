"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="top-right"
      className="toaster group"
      closeButton
      richColors
      expand
      visibleToasts={4}
      gap={12}
      offset={{ top: 18, right: 18, bottom: 18, left: 18 }}
      icons={{
        success: (
          <CircleCheckIcon className="w-5 h-5 rounded-full bg-emerald-500 p-0.5 text-white shadow-sm shrink-0" />
        ),
        info: (
          <InfoIcon className="w-5 h-5 rounded-full bg-sky-500 p-0.5 text-white shadow-sm shrink-0" />
        ),
        warning: (
          <TriangleAlertIcon className="w-5 h-5 rounded-full bg-amber-500 p-0.5 text-white shadow-sm shrink-0" />
        ),
        error: (
          <OctagonXIcon className="w-5 h-5 rounded-full bg-rose-500 p-0.5 text-white shadow-sm shrink-0" />
        ),
        loading: (
          <Loader2Icon className="w-5 h-5 rounded-full bg-primary p-0.5 text-primary-foreground animate-spin shadow-sm shrink-0" />
        ),
      }}
      style={
        {
          "--normal-bg": "hsl(var(--card))",
          "--normal-text": "hsl(var(--card-foreground))",
          "--normal-border": "hsl(var(--border))",
          "--description-color": "hsl(var(--foreground))",
          "--info-bg": "hsl(var(--card))",
          "--info-text": "hsl(var(--card-foreground))",
          "--info-border": "hsl(var(--border))",
          "--success-bg": "hsl(var(--card))",
          "--success-text": "hsl(var(--card-foreground))",
          "--success-border": "hsl(var(--border))",
          "--warning-bg": "hsl(var(--card))",
          "--warning-text": "hsl(var(--card-foreground))",
          "--warning-border": "hsl(var(--border))",
          "--error-bg": "hsl(var(--card))",
          "--error-text": "hsl(var(--card-foreground))",
          "--error-border": "hsl(var(--border))",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "group toast relative overflow-hidden !border !border-solid p-4 pr-11 rounded-2xl flex gap-3 w-full md:min-w-[390px] max-w-[460px] items-center !shadow-[0_18px_45px_-18px_rgba(15,23,42,0.38)] backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:rounded-l-2xl transition-all duration-300",
          title: "group-[.toast]:font-bold group-[.toast]:!text-current text-[15px] tracking-[-0.01em]",
          description: "group-[.toast]:!text-current text-[12px] font-medium opacity-80 block mt-1 leading-relaxed",
          actionButton: "group-[.toast]:!bg-primary group-[.toast]:!text-primary-foreground group-[.toast]:rounded-lg group-[.toast]:shadow-sm hover:group-[.toast]:brightness-110",
          cancelButton: "group-[.toast]:!bg-white/70 dark:group-[.toast]:!bg-white/10 group-[.toast]:!text-current group-[.toast]:rounded-lg group-[.toast]:border group-[.toast]:border-current/15",
          default: "group-[.toaster]:!bg-gradient-to-br group-[.toaster]:!from-orange-50 group-[.toaster]:!via-amber-50 group-[.toaster]:!to-yellow-100 dark:group-[.toaster]:!from-orange-950/80 dark:group-[.toaster]:!via-amber-950/70 dark:group-[.toaster]:!to-yellow-950/60 group-[.toaster]:!border-amber-300/80 dark:group-[.toaster]:!border-amber-700/70 group-[.toaster]:!text-amber-950 dark:group-[.toaster]:!text-amber-100 before:!bg-primary",
          success: "group-[.toaster]:!bg-gradient-to-br group-[.toaster]:!from-emerald-50 group-[.toaster]:!via-emerald-50 group-[.toaster]:!to-teal-100 dark:group-[.toaster]:!from-emerald-950/80 dark:group-[.toaster]:!via-emerald-950/70 dark:group-[.toaster]:!to-teal-950/60 group-[.toaster]:!border-emerald-300/80 dark:group-[.toaster]:!border-emerald-700/70 group-[.toaster]:!text-emerald-950 dark:group-[.toaster]:!text-emerald-100 before:!bg-emerald-500",
          error: "group-[.toaster]:!bg-gradient-to-br group-[.toaster]:!from-rose-50 group-[.toaster]:!via-red-50 group-[.toaster]:!to-orange-100 dark:group-[.toaster]:!from-rose-950/80 dark:group-[.toaster]:!via-red-950/70 dark:group-[.toaster]:!to-orange-950/60 group-[.toaster]:!border-rose-300/80 dark:group-[.toaster]:!border-rose-700/70 group-[.toaster]:!text-rose-950 dark:group-[.toaster]:!text-rose-100 before:!bg-rose-500",
          warning: "group-[.toaster]:!bg-gradient-to-br group-[.toaster]:!from-amber-50 group-[.toaster]:!via-yellow-50 group-[.toaster]:!to-orange-100 dark:group-[.toaster]:!from-amber-950/80 dark:group-[.toaster]:!via-yellow-950/70 dark:group-[.toaster]:!to-orange-950/60 group-[.toaster]:!border-amber-300/80 dark:group-[.toaster]:!border-amber-700/70 group-[.toaster]:!text-amber-950 dark:group-[.toaster]:!text-amber-100 before:!bg-amber-500",
          info: "group-[.toaster]:!bg-gradient-to-br group-[.toaster]:!from-sky-50 group-[.toaster]:!via-blue-50 group-[.toaster]:!to-indigo-100 dark:group-[.toaster]:!from-sky-950/80 dark:group-[.toaster]:!via-blue-950/70 dark:group-[.toaster]:!to-indigo-950/60 group-[.toaster]:!border-sky-300/80 dark:group-[.toaster]:!border-sky-700/70 group-[.toaster]:!text-sky-950 dark:group-[.toaster]:!text-sky-100 before:!bg-sky-500",
          loading: "group-[.toaster]:!bg-gradient-to-br group-[.toaster]:!from-orange-50 group-[.toaster]:!via-amber-50 group-[.toaster]:!to-yellow-100 dark:group-[.toaster]:!from-orange-950/80 dark:group-[.toaster]:!via-amber-950/70 dark:group-[.toaster]:!to-yellow-950/60 group-[.toaster]:!border-amber-300/80 dark:group-[.toaster]:!border-amber-700/70 group-[.toaster]:!text-amber-950 dark:group-[.toaster]:!text-amber-100 before:!bg-primary",
          closeButton: "group-[.toast]:!bg-white/80 dark:group-[.toast]:!bg-slate-950/40 group-[.toast]:!border-current/15 group-[.toast]:!text-current hover:group-[.toast]:!bg-white dark:hover:group-[.toast]:!bg-slate-950/70 hover:group-[.toast]:scale-105 shadow-sm border rounded-full transition-all duration-200",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
