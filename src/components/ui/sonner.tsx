"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CheckCircle2, Info, AlertTriangle, AlertCircle, Loader2 } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="bottom-right"
      className="toaster group"
      closeButton
      richColors
      expand
      visibleToasts={4}
      gap={12}
      offset={{ top: 18, right: 18, bottom: 18, left: 18 }}
      icons={{
        success: (
          <CheckCircle2 className="w-[18px] h-[18px] text-emerald-600 dark:text-emerald-400 shrink-0" />
        ),
        info: (
          <Info className="w-[18px] h-[18px] text-sky-600 dark:text-sky-400 shrink-0" />
        ),
        warning: (
          <AlertTriangle className="w-[18px] h-[18px] text-amber-600 dark:text-amber-400 shrink-0" />
        ),
        error: (
          <AlertCircle className="w-[18px] h-[18px] text-rose-600 dark:text-rose-400 shrink-0" />
        ),
        loading: (
          <Loader2 className="w-[18px] h-[18px] text-muted-foreground animate-spin shrink-0" />
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
          toast: "group toast relative overflow-visible !border !border-solid p-3.5 pr-12 rounded-xl flex gap-3 w-full md:min-w-[340px] max-w-[420px] items-center !shadow-[0_10px_30px_-10px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.02)] dark:!shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4),0_1px_3px_rgba(0,0,0,0.08)] backdrop-blur-md transition-all duration-200",
          title: "group-[.toast]:font-medium group-[.toast]:!text-current text-[13.5px] tracking-tight",
          description: "group-[.toast]:!text-current text-[12px] font-normal opacity-80 block mt-0.5 leading-normal",
          actionButton: "group-[.toast]:!bg-primary group-[.toast]:!text-primary-foreground group-[.toast]:rounded-lg group-[.toast]:shadow-sm hover:group-[.toast]:brightness-110 text-xs px-2.5 py-1.5",
          cancelButton: "group-[.toast]:!bg-secondary group-[.toast]:!text-secondary-foreground group-[.toast]:rounded-lg group-[.toast]:border group-[.toast]:border-border text-xs px-2.5 py-1.5",
          default: "group-[.toaster]:!bg-background/90 group-[.toaster]:!text-foreground group-[.toaster]:!border-border dark:group-[.toaster]:!bg-zinc-900/90 dark:group-[.toaster]:!text-zinc-100 dark:group-[.toaster]:!border-zinc-800",
          success: "group-[.toaster]:!bg-emerald-50/70 group-[.toaster]:!text-emerald-950 group-[.toaster]:!border-emerald-100 dark:group-[.toaster]:!bg-emerald-950/20 dark:group-[.toaster]:!text-emerald-100 dark:group-[.toaster]:!border-emerald-900/20",
          error: "group-[.toaster]:!bg-rose-50/70 group-[.toaster]:!text-rose-950 group-[.toaster]:!border-rose-100 dark:group-[.toaster]:!bg-rose-950/20 dark:group-[.toaster]:!text-rose-100 dark:group-[.toaster]:!border-rose-900/20",
          warning: "group-[.toaster]:!bg-amber-50/70 group-[.toaster]:!text-amber-950 group-[.toaster]:!border-amber-100 dark:group-[.toaster]:!bg-amber-950/20 dark:group-[.toaster]:!text-amber-100 dark:group-[.toaster]:!border-amber-900/20",
          info: "group-[.toaster]:!bg-sky-50/70 group-[.toaster]:!text-sky-950 group-[.toaster]:!border-sky-100 dark:group-[.toaster]:!bg-sky-950/20 dark:group-[.toaster]:!text-sky-100 dark:group-[.toaster]:!border-sky-900/20",
          loading: "group-[.toaster]:!bg-background/90 group-[.toaster]:!text-foreground group-[.toaster]:!border-border dark:group-[.toaster]:!bg-zinc-900/90 dark:group-[.toaster]:!text-zinc-100 dark:group-[.toaster]:!border-zinc-800",
          closeButton: "group-[.toast]:!bg-background dark:group-[.toast]:!bg-zinc-900 group-[.toast]:!border-border group-[.toast]:!text-muted-foreground hover:group-[.toast]:!text-foreground hover:group-[.toast]:scale-105 shadow-sm border rounded-full transition-all duration-200 !w-7 !h-7 !p-0 flex items-center justify-center right-2 top-2",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
