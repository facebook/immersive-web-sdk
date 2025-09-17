/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { InputConfig } from '../visual/adapter/base-visual-adapter.js';

export enum AxesState {
  Default = 0,
  Up = 1,
  Down = 2,
  Left = 3,
  Right = 4,
}

export enum InputComponent {
  Trigger = 'xr-standard-trigger',
  Squeeze = 'xr-standard-squeeze',
  Touchpad = 'xr-standard-touchpad',
  Thumbstick = 'xr-standard-thumbstick',
  A_Button = 'a-button',
  B_Button = 'b-button',
  X_Button = 'x-button',
  Y_Button = 'y-button',
  Thumbrest = 'thumbrest',
  Menu = 'menu',
}

export class StatefulGamepad {
  public readonly handedness: XRHandedness;
  public readonly gamepad: Gamepad;
  public readonly inputSource: XRInputSource;
  public readonly buttonMapping = new Map<string, number>();
  public readonly axesMapping = new Map<string, { x: number; y: number }>();
  public axesThreshold = 0.8;
  private axesStates = new Map<string, { prev: AxesState; curr: AxesState }>();
  private axes2DValues = new Map<string, number>();
  private pressedArrs: [Int8Array, Int8Array];
  private touchedArrs: [Int8Array, Int8Array];
  private valueArrs: [Float32Array, Float32Array];
  private axesValues = new Map<string, { x: number; y: number }>();
  private selectComponentId: string;
  private currentIndex = 1;
  private previousIndex = 0;

  constructor({ inputSource, layout }: InputConfig) {
    this.handedness = inputSource.handedness;
    this.gamepad = inputSource.gamepad!;
    this.inputSource = inputSource;
    this.selectComponentId = layout.selectComponentId;
    const numButtons = this.gamepad.buttons.length;
    this.pressedArrs = [
      new Int8Array(numButtons).fill(0),
      new Int8Array(numButtons).fill(0),
    ];
    this.touchedArrs = [
      new Int8Array(numButtons).fill(0),
      new Int8Array(numButtons).fill(0),
    ];
    this.valueArrs = [
      new Float32Array(numButtons).fill(0),
      new Float32Array(numButtons).fill(0),
    ];
    Object.entries(layout.components).forEach(([id, config]) => {
      const buttonIdx = config.gamepadIndices['button'];
      if (buttonIdx !== undefined) {
        this.buttonMapping.set(id, buttonIdx);
      }
      if (config.type === 'thumbstick' || config.type === 'touchpad') {
        this.axesMapping.set(id, {
          x: config.gamepadIndices.xAxis!,
          y: config.gamepadIndices.yAxis!,
        });
        this.axesValues.set(id, { x: 0, y: 0 });
        this.axes2DValues.set(id, 0);
        this.axesStates.set(id, {
          prev: AxesState.Default,
          curr: AxesState.Default,
        });
      }
    });
  }

  update() {
    this.currentIndex = 1 - this.currentIndex;
    this.previousIndex = 1 - this.previousIndex;
    this.gamepad.buttons.forEach((button, idx) => {
      this.pressedArrs[this.currentIndex][idx] = button.pressed ? 1 : 0;
      this.touchedArrs[this.currentIndex][idx] = button.touched ? 1 : 0;
      this.valueArrs[this.currentIndex][idx] = button.value;
    });
    this.axesMapping.forEach(({ x: xIdx, y: yIdx }, id) => {
      const axesValue = this.axesValues.get(id)!;
      const axesState = this.axesStates.get(id)!;
      axesState.prev = axesState.curr;
      axesValue.x = this.gamepad.axes[xIdx];
      axesValue.y = this.gamepad.axes[yIdx];
      const { x, y } = axesValue;
      const value2D = Math.sqrt(x * x + y * y);
      this.axes2DValues.set(id, value2D);
      if (value2D < this.axesThreshold) {
        axesState.curr = AxesState.Default;
      } else {
        if (Math.abs(x) > Math.abs(y)) {
          axesState.curr = x > 0 ? AxesState.Right : AxesState.Left;
        } else {
          axesState.curr = y > 0 ? AxesState.Down : AxesState.Up;
        }
      }
    });
  }

  private getButtonState(id: string, stateArr: [Int8Array, Int8Array]) {
    const idx = this.buttonMapping.get(id);
    return idx !== undefined ? stateArr[this.currentIndex][idx] : 0;
  }

  getButtonPressedByIdx(idx: number) {
    return !!this.pressedArrs[this.currentIndex][idx];
  }

  getButtonPressed(id: string) {
    return !!this.getButtonState(id, this.pressedArrs);
  }

  getButtonTouchedByIdx(idx: number) {
    return !!this.touchedArrs[this.currentIndex][idx];
  }

  getButtonTouched(id: string) {
    return !!this.getButtonState(id, this.touchedArrs);
  }

  getButtonValueByIdx(idx: number) {
    return this.valueArrs[this.currentIndex][idx] ?? 0;
  }

  getButtonValue(id: string) {
    const idx = this.buttonMapping.get(id);
    return idx !== undefined ? this.valueArrs[this.currentIndex][idx] : 0;
  }

  getButtonDownByIdx(idx: number) {
    return (
      (this.pressedArrs[this.currentIndex][idx] &
        ~this.pressedArrs[this.previousIndex][idx]) !==
      0
    );
  }

  getButtonDown(id: string) {
    const idx = this.buttonMapping.get(id);
    return idx !== undefined
      ? (this.pressedArrs[this.currentIndex][idx] &
          ~this.pressedArrs[this.previousIndex][idx]) !==
          0
      : false;
  }

  getButtonUpByIdx(idx: number) {
    return (
      (~this.pressedArrs[this.currentIndex][idx] &
        this.pressedArrs[this.previousIndex][idx]) !==
      0
    );
  }

  getButtonUp(id: string) {
    const idx = this.buttonMapping.get(id);
    return idx !== undefined
      ? (~this.pressedArrs[this.currentIndex][idx] &
          this.pressedArrs[this.previousIndex][idx]) !==
          0
      : false;
  }

  getSelectStart() {
    return this.getButtonDown(this.selectComponentId);
  }

  getSelectEnd() {
    return this.getButtonUp(this.selectComponentId);
  }

  getSelecting() {
    return this.getButtonPressed(this.selectComponentId);
  }

  getAxesValues(id: string) {
    return this.axesValues.get(id);
  }

  getAxesState(id: string) {
    return this.axesStates.get(id)?.curr;
  }

  get2DInputValue(id: string) {
    return this.axes2DValues.get(id);
  }

  getAxesEnteringState(id: string, state: AxesState) {
    const axesState = this.axesStates.get(id);
    return axesState
      ? axesState.curr === state && axesState.prev !== state
      : false;
  }

  getAxesLeavingState(id: string, state: AxesState) {
    const axesState = this.axesStates.get(id);
    return axesState
      ? axesState.curr !== state && axesState.prev === state
      : false;
  }

  getAxesEnteringUp(id: string) {
    return this.getAxesEnteringState(id, AxesState.Up);
  }

  getAxesEnteringDown(id: string) {
    return this.getAxesEnteringState(id, AxesState.Down);
  }

  getAxesEnteringLeft(id: string) {
    return this.getAxesEnteringState(id, AxesState.Left);
  }

  getAxesEnteringRight(id: string) {
    return this.getAxesEnteringState(id, AxesState.Right);
  }

  getAxesLeavingUp(id: string) {
    return this.getAxesLeavingState(id, AxesState.Up);
  }

  getAxesLeavingDown(id: string) {
    return this.getAxesLeavingState(id, AxesState.Down);
  }

  getAxesLeavingLeft(id: string) {
    return this.getAxesLeavingState(id, AxesState.Left);
  }

  getAxesLeavingRight(id: string) {
    return this.getAxesLeavingState(id, AxesState.Right);
  }
}
