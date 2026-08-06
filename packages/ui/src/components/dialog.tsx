"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "@masc-landing/ui/lib/utils";
import type { ComponentProps, HTMLAttributes } from "react";

const Dialog = DialogPrimitive.Root;

function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal(props: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogBackdrop({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return <DialogPrimitive.Backdrop
    data-slot="dialog-backdrop"
    className={cn("fixed inset-0 z-[100] bg-black/75 backdrop-blur-[5px] duration-200 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0 motion-reduce:animate-none", className)}
    {...props}
  />;
}

function DialogContent({ className, children, ...props }: DialogPrimitive.Popup.Props) {
  return <DialogPortal>
    <DialogBackdrop />
    <DialogPrimitive.Viewport className="fixed inset-0 z-[101] grid place-items-center overflow-y-auto p-4">
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn("relative max-h-[calc(100svh-2rem)] w-full max-w-[640px] overflow-y-auto border border-white/20 bg-popover text-popover-foreground shadow-[0_30px_100px_rgba(0,0,0,0.7)] duration-200 outline-none data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-bottom-2 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-2 data-open:zoom-in-95 focus-visible:border-primary/50 focus-visible:ring-1 focus-visible:ring-primary/35 motion-reduce:animate-none", className)}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Viewport>
  </DialogPortal>;
}

function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="dialog-header" className={cn("grid gap-2", className)} {...props} />;
}

function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="dialog-footer" className={cn("flex flex-col-reverse gap-2.5 min-[421px]:flex-row min-[421px]:justify-end", className)} {...props} />;
}

function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn("m-0 font-display text-[28px] leading-tight font-normal", className)} {...props} />;
}

function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description data-slot="dialog-description" className={cn("text-sm leading-relaxed text-muted-foreground", className)} {...props} />;
}

export {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
