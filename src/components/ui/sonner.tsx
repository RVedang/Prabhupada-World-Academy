"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      icons={{
        success: (
          <CircleCheckIcon className="w-[18px] h-[18px] text-emerald-500 dark:text-emerald-400 shrink-0" />
        ),
        info: (
          <InfoIcon className="w-[18px] h-[18px] text-blue-500 dark:text-blue-400 shrink-0" />
        ),
        warning: (
          <TriangleAlertIcon className="w-[18px] h-[18px] text-amber-500 dark:text-amber-400 shrink-0" />
        ),
        error: (
          <OctagonXIcon className="w-[18px] h-[18px] text-red-500 dark:text-red-400 shrink-0" />
        ),
        loading: (
          <Loader2Icon className="w-[18px] h-[18px] text-primary animate-spin shrink-0" />
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
          toast: "group toast group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:border-border group-[.toaster]:shadow-md border p-4 px-5 rounded-2xl flex gap-3 w-full md:min-w-[380px] max-w-[440px] items-center transition-all duration-300",
          title: "group-[.toast]:font-semibold group-[.toast]:text-foreground text-[14px]",
          description: "group-[.toast]:!text-neutral-700 dark:group-[.toast]:!text-neutral-300 text-[11px] font-medium block mt-1 leading-relaxed",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success: "group-[.toaster]:!bg-emerald-50/40 dark:group-[.toaster]:!bg-emerald-950/10 group-[.toaster]:!border-emerald-500/20 group-[.toaster]:!text-emerald-950 dark:group-[.toaster]:!text-emerald-300",
          error: "group-[.toaster]:!bg-red-50/40 dark:group-[.toaster]:!bg-red-950/10 group-[.toaster]:!border-red-500/20 group-[.toaster]:!text-red-950 dark:group-[.toaster]:!text-red-300",
          warning: "group-[.toaster]:!bg-amber-50/40 dark:group-[.toaster]:!bg-amber-950/10 group-[.toaster]:!border-amber-500/20 group-[.toaster]:!text-amber-950 dark:group-[.toaster]:!text-amber-300",
          info: "group-[.toaster]:!bg-blue-50/40 dark:group-[.toaster]:!bg-blue-950/10 group-[.toaster]:!border-blue-500/20 group-[.toaster]:!text-blue-950 dark:group-[.toaster]:!text-blue-300",
          closeButton: "group-[.toast]:!bg-background group-[.toast]:!border-border group-[.toast]:!text-muted-foreground hover:group-[.toast]:!text-foreground hover:group-[.toast]:!bg-accent shadow-sm border transition-all duration-200",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
