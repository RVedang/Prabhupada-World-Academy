"use client"

import * as React from "react"

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({ asChild, children, render, ...props }: CollapsiblePrimitive.Trigger.Props & { asChild?: boolean }) {
  const child = asChild && React.isValidElement(children) ? children : undefined;
  return (
    <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" render={child || render} {...props} children={child ? undefined : children} />
  )
}

function CollapsibleContent({ ...props }: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel data-slot="collapsible-content" {...props} />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
