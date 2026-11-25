import { useEffect, useRef, useState } from 'react';
import {
  computeNextSmartDockState,
  createInitialSmartDockState,
  isEditableElement,
  type SmartDockState,
} from '../utils/smartDock';

/**
 * Tracks scroll direction, virtual keyboard/input focus, open modals, and viewport bounds
 * so the floating iOS bottom dock stays hidden while reading or typing and reappears only when needed.
 */
export function useSmartDockVisibility(resetKey: string): boolean {
  const [visible, setVisible] = useState(true);
  const stateRef = useRef<SmartDockState>(
    createInitialSmartDockState(typeof window !== 'undefined' ? window.scrollY : 0)
  );
  const inputFocusedRef = useRef(false);

  useEffect(() => {
    stateRef.current = createInitialSmartDockState(window.scrollY);
    setVisible(true);
  }, [resetKey]);

  useEffect(() => {
    let rafId = 0;

    const evaluate = () => {
      rafId = 0;
      const isModalOpen = Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));
      const next = computeNextSmartDockState(stateRef.current, {
        scrollY: window.scrollY,
        viewportHeight: window.innerHeight,
        documentHeight: document.documentElement.scrollHeight,
        isInputFocused: inputFocusedRef.current,
        isModalOpen,
      });
      stateRef.current = next;
      setVisible((prev) => (prev === next.visible ? prev : next.visible));
    };

    const scheduleEvaluate = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(evaluate);
    };

    const onFocusIn = (e: FocusEvent) => {
      if (isEditableElement(e.target)) {
        inputFocusedRef.current = true;
        scheduleEvaluate();
      }
    };

    const onFocusOut = () => {
      // Defer slightly so focus moving directly to another input doesn't flicker the dock
      window.setTimeout(() => {
        inputFocusedRef.current = isEditableElement(document.activeElement);
        scheduleEvaluate();
      }, 60);
    };

    const observer = new MutationObserver(() => {
      scheduleEvaluate();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['role', 'aria-modal'],
    });

    window.addEventListener('scroll', scheduleEvaluate, { passive: true });
    window.addEventListener('resize', scheduleEvaluate, { passive: true });
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);

    scheduleEvaluate();

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener('scroll', scheduleEvaluate);
      window.removeEventListener('resize', scheduleEvaluate);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  return visible;
}
