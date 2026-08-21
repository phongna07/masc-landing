"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Button } from "@masc-landing/ui/components/button";
import { cn } from "@masc-landing/ui/lib/utils";
import { useRef, type ReactElement, type ReactNode } from "react";

type ConfirmationDialogTone = "default" | "success" | "destructive";

const iconToneStyles: Record<ConfirmationDialogTone, string> = {
  default: "border-primary/45 bg-primary/10 text-primary",
  success: "border-[#86efac]/50 bg-[#86efac]/10 text-[#86efac]",
  destructive: "border-destructive/50 bg-destructive/10 text-destructive",
};

const confirmToneStyles: Record<ConfirmationDialogTone, string> = {
  default: "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
  success: "border-[#86efac] bg-[#86efac] text-[#07120a] hover:bg-[#a2f3bd]",
  destructive: "border-destructive bg-destructive text-[#160706] hover:bg-[#ff817a]",
};

interface ConfirmationDialogProps {
  trigger?: ReactElement;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  icon?: ReactNode;
  tone?: ConfirmationDialogTone;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onConfirm: () => void;
}

function ConfirmationDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel,
  icon,
  tone = "default",
  open,
  onOpenChange,
  onConfirm,
}: ConfirmationDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <AlertDialog.Trigger render={trigger} /> : null}
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-[5px] duration-200 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0 motion-reduce:animate-none" />
        <AlertDialog.Viewport className="fixed inset-0 z-[101] grid place-items-center overflow-y-auto p-4">
          <AlertDialog.Popup
            initialFocus={cancelRef}
            className="relative w-full max-w-[440px] border border-white/20 bg-popover text-popover-foreground shadow-[0_30px_100px_rgba(0,0,0,0.7)] duration-200 data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-bottom-2 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-2 data-open:zoom-in-95 motion-reduce:animate-none"
          >
            <div className="grid justify-items-center p-6 text-center sm:p-[30px]">
              {icon ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "mb-[18px] grid size-11 place-items-center rounded-full border [&_svg]:size-5",
                    iconToneStyles[tone],
                  )}
                >
                  {icon}
                </span>
              ) : null}
              <AlertDialog.Title className="m-0 font-display text-[28px] leading-tight font-normal">
                {title}
              </AlertDialog.Title>
              <AlertDialog.Description className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                {description}
              </AlertDialog.Description>
              <div className="mt-6 grid w-full grid-cols-1 gap-2.5 min-[421px]:grid-cols-2">
                <AlertDialog.Close
                  ref={cancelRef}
                  render={<Button type="button" variant="outline" className="h-10 w-full" />}
                >
                  {cancelLabel}
                </AlertDialog.Close>
                <AlertDialog.Close
                  onClick={onConfirm}
                  render={
                    <Button
                      type="button"
                      className={cn("h-10 w-full", confirmToneStyles[tone])}
                    />
                  }
                >
                  {confirmLabel}
                </AlertDialog.Close>
              </div>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export { ConfirmationDialog, type ConfirmationDialogProps, type ConfirmationDialogTone };
