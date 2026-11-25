import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeNextSmartDockState,
  createInitialSmartDockState,
  isEditableElement,
} from './smartDock';

const BASE_DOC = {
  viewportHeight: 844,
  documentHeight: 2200,
  isInputFocused: false,
  isModalOpen: false,
};

test('smartDock starts visible at top, hides on downward scroll, and reappears on upward scroll', () => {
  let state = createInitialSmartDockState(0);
  assert.equal(state.visible, true);

  // Small scroll jitter should not hide dock immediately
  state = computeNextSmartDockState(state, { ...BASE_DOC, scrollY: 60 });
  // Still near threshold; downward delta from 0->60 exceeds downDeltaToHide and hideAfterY -> hides
  assert.equal(state.visible, false);

  // Scrolling further down keeps it hidden
  state = computeNextSmartDockState(state, { ...BASE_DOC, scrollY: 320 });
  assert.equal(state.visible, false);

  // Tiny 4px upward jitter should NOT prematurely pop the dock back
  state = computeNextSmartDockState(state, { ...BASE_DOC, scrollY: 316 });
  assert.equal(state.visible, false);

  // Deliberate upward scroll reveals the dock
  state = computeNextSmartDockState(state, { ...BASE_DOC, scrollY: 295 });
  assert.equal(state.visible, true);
});

test('smartDock always hides while typing in inputs or when a modal is open', () => {
  let state = createInitialSmartDockState(0);
  assert.equal(state.visible, true);

  state = computeNextSmartDockState(state, {
    ...BASE_DOC,
    scrollY: 0,
    isInputFocused: true,
  });
  assert.equal(state.visible, false);

  // Blur at top restores dock
  state = computeNextSmartDockState(state, {
    ...BASE_DOC,
    scrollY: 0,
    isInputFocused: false,
  });
  assert.equal(state.visible, true);

  // Modal open hides dock even at top
  state = computeNextSmartDockState(state, {
    ...BASE_DOC,
    scrollY: 0,
    isModalOpen: true,
  });
  assert.equal(state.visible, false);
});

test('smartDock stays hidden on downward scroll to footer on medium screens and reveals on upward scroll', () => {
  const mediumDoc = {
    viewportHeight: 844,
    documentHeight: 990,
    isInputFocused: false,
    isModalOpen: false,
  };
  let state = createInitialSmartDockState(0);
  // Scrolling down to bottom of a medium-height page should hide the dock so footer links are unobstructed
  state = computeNextSmartDockState(state, { ...mediumDoc, scrollY: 140 });
  assert.equal(state.visible, false);

  // Scrolling back up reveals it immediately
  state = computeNextSmartDockState(state, { ...mediumDoc, scrollY: 120 });
  assert.equal(state.visible, true);

  // Non-scrollable page always keeps dock visible when no input/modal active
  const shortState = computeNextSmartDockState(createInitialSmartDockState(0), {
    viewportHeight: 844,
    documentHeight: 860,
    scrollY: 10,
    isInputFocused: false,
    isModalOpen: false,
  });
  assert.equal(shortState.visible, true);
});

test('isEditableElement distinguishes text inputs from checkboxes and buttons', () => {
  assert.equal(isEditableElement({ tagName: 'INPUT', type: 'text' }), true);
  assert.equal(isEditableElement({ tagName: 'INPUT', type: 'tel' }), true);
  assert.equal(isEditableElement({ tagName: 'TEXTAREA' }), true);
  assert.equal(isEditableElement({ tagName: 'SELECT' }), true);
  assert.equal(isEditableElement({ tagName: 'INPUT', type: 'checkbox' }), false);
  assert.equal(isEditableElement({ tagName: 'INPUT', type: 'file' }), false);
  assert.equal(isEditableElement({ tagName: 'BUTTON' }), false);
});
