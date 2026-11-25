export interface SmartDockState {
  visible: boolean;
  lastScrollY: number;
  accumulatedDelta: number;
}

export interface SmartDockScrollInput {
  scrollY: number;
  viewportHeight: number;
  documentHeight: number;
  isInputFocused: boolean;
  isModalOpen: boolean;
}

export interface SmartDockThresholds {
  topRevealY?: number;
  hideAfterY?: number;
  downDeltaToHide?: number;
  upDeltaToShow?: number;
  nearBottomMargin?: number;
  minScrollableForBottomReveal?: number;
}

const DEFAULT_THRESHOLDS: Required<SmartDockThresholds> = {
  topRevealY: 20,
  hideAfterY: 28,
  downDeltaToHide: 12,
  upDeltaToShow: 10,
  nearBottomMargin: 48,
  minScrollableForBottomReveal: 420,
};

export function createInitialSmartDockState(scrollY = 0): SmartDockState {
  return {
    visible: true,
    lastScrollY: Math.max(0, scrollY),
    accumulatedDelta: 0,
  };
}

/**
 * Pure state machine deciding whether the floating iOS bottom dock should be visible.
 *
 * Rules:
 * - Always hides when a text input is focused (virtual keyboard) or a modal dialog is open.
 * - Always shows at the very top of the page (<= topRevealY).
 * - Hides promptly on deliberate downward scrolling past hideAfterY so reading, booking,
 *   and footer links are never obstructed.
 * - Reappears on deliberate upward scrolling (user wants navigation), or at the bottom of
 *   long pages when scrolling has settled past the main content.
 */
export function computeNextSmartDockState(
  prev: SmartDockState,
  input: SmartDockScrollInput,
  thresholds: SmartDockThresholds = {}
): SmartDockState {
  const cfg = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const currentY = Math.max(0, input.scrollY);
  const delta = currentY - prev.lastScrollY;

  if (input.isInputFocused || input.isModalOpen) {
    return {
      visible: false,
      lastScrollY: currentY,
      accumulatedDelta: 0,
    };
  }

  const maxScrollable = Math.max(0, input.documentHeight - input.viewportHeight);
  const isNearTop = currentY <= cfg.topRevealY;
  const isNonScrollable = maxScrollable <= cfg.hideAfterY;

  if (isNearTop || isNonScrollable) {
    return {
      visible: true,
      lastScrollY: currentY,
      accumulatedDelta: 0,
    };
  }

  // Accumulate scroll delta in the same direction; reset when direction reverses
  const sameDirection =
    (delta > 0 && prev.accumulatedDelta >= 0) ||
    (delta < 0 && prev.accumulatedDelta <= 0);
  const nextAccumulated = sameDirection ? prev.accumulatedDelta + delta : delta;

  if (currentY > cfg.hideAfterY && nextAccumulated >= cfg.downDeltaToHide) {
    return {
      visible: false,
      lastScrollY: currentY,
      accumulatedDelta: 0,
    };
  }

  if (nextAccumulated <= -cfg.upDeltaToShow) {
    return {
      visible: true,
      lastScrollY: currentY,
      accumulatedDelta: 0,
    };
  }

  // Only auto-reveal at bottom on genuinely tall pages if user wasn't actively hiding it on a short screen
  if (
    maxScrollable >= cfg.minScrollableForBottomReveal &&
    currentY >= maxScrollable - cfg.nearBottomMargin &&
    delta <= 0
  ) {
    return {
      visible: true,
      lastScrollY: currentY,
      accumulatedDelta: 0,
    };
  }

  return {
    visible: prev.visible,
    lastScrollY: currentY,
    accumulatedDelta: nextAccumulated,
  };
}

export interface EditableElementLike {
  tagName?: string;
  isContentEditable?: boolean;
  type?: string;
}

export function isEditableElement(target: EventTarget | EditableElementLike | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as EditableElementLike;
  if (el.isContentEditable) return true;
  const tag = (el.tagName || '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el.type || 'text').toLowerCase();
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range'].includes(type);
  }
  return false;
}
