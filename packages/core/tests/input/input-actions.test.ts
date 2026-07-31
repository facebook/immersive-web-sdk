/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  type InputActionBinding,
  InputActionManager,
  InputActions,
} from '../../src/input/input-actions.js';
import {
  BrowserGamepadAxis,
  BrowserGamepadButton,
} from '../../src/input/stateful-browser-gamepad.js';

vi.hoisted(() => {
  (globalThis as any).document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        clearRect: () => {},
        beginPath: () => {},
        arc: () => {},
        fill: () => {},
        stroke: () => {},
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 0,
      }),
    }),
  };
});

function createContext({
  pressedKeys = [],
  downKeys = [],
  gamepad,
  xrGamepad,
}: {
  pressedKeys?: string[];
  downKeys?: string[];
  gamepad?: any;
  xrGamepad?: any;
} = {}) {
  const pressed = new Set(pressedKeys);
  const down = new Set(downKeys);

  return {
    keyboard: {
      getKeyPressed: (code: string) => pressed.has(code),
      getKeyDown: (code: string) => down.has(code),
      getKeyUp: () => false,
    },
    browserGamepads: gamepad ? [gamepad] : [],
    xr: {
      gamepads: {
        left: undefined,
        right: xrGamepad,
      },
    },
  } as any;
}

describe('InputActionManager', () => {
  it('does not enable browser-first bindings by default', () => {
    const actions = new InputActionManager();

    actions.update(createContext({ pressedKeys: ['KeyW'] }));

    expect(actions.getAxis2D(InputActions.LocomotionMove)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('maps opt-in keyboard bindings to locomotion actions', () => {
    const actions = new InputActionManager();
    actions.enableDefaultBindings('browser-first-person', {
      keyboard: true,
      gamepad: false,
    });

    actions.update(
      createContext({
        pressedKeys: ['KeyW', 'KeyD', 'Space'],
        downKeys: ['Space'],
      }),
    );

    expect(actions.getAxis2D(InputActions.LocomotionMove)).toEqual({
      x: 1,
      y: -1,
    });
    expect(actions.getButtonPressed(InputActions.LocomotionJump)).toBe(true);
    expect(actions.getButtonDown(InputActions.LocomotionJump)).toBe(true);
  });

  it('maps opt-in browser gamepad bindings to locomotion actions', () => {
    const actions = new InputActionManager();
    actions.enableDefaultBindings('browser-first-person', {
      keyboard: false,
      gamepad: true,
    });

    const gamepad = {
      connected: true,
      getAxesValues: (axis: BrowserGamepadAxis) =>
        axis === BrowserGamepadAxis.LeftStick
          ? { x: -0.5, y: 0.25 }
          : undefined,
      getButtonPressed: () => true,
      getButtonDown: () => true,
      getButtonUp: () => false,
    };

    actions.update(createContext({ gamepad }));

    expect(actions.getAxis2D(InputActions.LocomotionMove)).toEqual({
      x: -0.5,
      y: 0.25,
    });
    expect(actions.getButtonDown(InputActions.LocomotionJump)).toBe(true);
  });

  it('maps the right XR A button to the locomotion jump action', () => {
    const actions = new InputActionManager();
    const getButtonDown = vi.fn((componentId: string) => {
      return componentId === 'a-button';
    });

    actions.update(
      createContext({
        xrGamepad: {
          getAxesValues: () => ({ x: 0, y: 0 }),
          getButtonPressed: () => false,
          getButtonDown,
          getButtonUp: () => false,
          getAxesState: () => 0,
          getAxesEnteringState: () => false,
          getAxesLeavingState: () => false,
        },
      }),
    );

    expect(actions.getButtonDown(InputActions.LocomotionJump)).toBe(true);
    expect(getButtonDown).toHaveBeenCalledWith('a-button');
  });

  it('tracks axis entering edges for turn actions', () => {
    const actions = new InputActionManager();
    actions.clearBindings();
    actions.addBinding({
      source: 'browserGamepad',
      kind: 'axis1d',
      action: InputActions.LocomotionTurn,
      axis: BrowserGamepadAxis.RightStick,
      component: 'x',
    });

    let x = 0;
    const gamepad = {
      connected: true,
      getAxesValues: () => ({ x, y: 0 }),
    };

    actions.update(createContext({ gamepad }));
    expect(actions.getAxis1DEnteringPositive(InputActions.LocomotionTurn)).toBe(
      false,
    );

    x = 1;
    actions.update(createContext({ gamepad }));
    expect(actions.getAxis1DEnteringPositive(InputActions.LocomotionTurn)).toBe(
      true,
    );
  });

  it('adds missing browser default bindings across repeated calls', () => {
    const actions = new InputActionManager();
    actions.clearBindings();

    actions.enableDefaultBindings('browser-first-person', {
      keyboard: true,
      gamepad: false,
    });
    actions.enableDefaultBindings('browser-first-person', {
      keyboard: false,
      gamepad: true,
    });

    const moveBindings = actions.getBindings(InputActions.LocomotionMove);
    expect(
      moveBindings.filter((binding) => binding.source === 'keyboard'),
    ).toHaveLength(1);
    expect(
      moveBindings.filter((binding) => binding.source === 'browserGamepad'),
    ).toHaveLength(1);
  });

  it('removes one binding and returns binding snapshots', () => {
    const actions = new InputActionManager();
    actions.clearBindings();
    const binding: InputActionBinding = {
      source: 'browserGamepad',
      kind: 'button',
      action: 'player.jetpack',
      button: BrowserGamepadButton.South,
    };

    actions.addBinding(binding);
    const snapshot = actions.getBindings('player.jetpack');
    expect(snapshot).toEqual([binding]);

    snapshot[0].action = 'changed';
    expect(actions.getBindings('player.jetpack')).toEqual([binding]);
    expect(actions.removeBinding(binding)).toBe(true);
    expect(actions.removeBinding(binding)).toBe(false);
    expect(actions.getBindings('player.jetpack')).toEqual([]);
  });
});
