import { useEffect, useRef, type RefObject } from 'react';

/** Focus/scroll behavior for the existing meeting forms, including their portalled pickers. */
export function useModalSurface(open: boolean, ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const modal = ref.current;
    if (!open || !modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const selector = 'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]';
    const visible = (element: Element) => element.getClientRects().length > 0;
    const focusFirst = () => (Array.from(modal.querySelectorAll<HTMLElement>(selector)).find(visible) || modal).focus();
    focusFirst();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const pickers = Array.from(document.querySelectorAll<HTMLElement>('[role="listbox"],[data-slot="popover-content"]')).filter(visible);
      if (event.key === 'Escape') {
        if (!pickers.length) { event.preventDefault(); close.current(); }
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [modal, ...pickers].flatMap(node => Array.from(node.querySelectorAll<HTMLElement>(selector))).filter(visible);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); modal.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, ref]);
}
