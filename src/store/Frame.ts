import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

type State = {
  width: number;
  height: number;
};
type Action = {
  setFrame(frame: { width: number; height: number }): void;
};

export const useFrameStore = create(
  immer<State & Action>((set) => ({
    width: 0,
    height: 0,
    setFrame(frame) {
      set((store) => {
        store.width = frame.width;
        store.height = frame.height;
      });
    },
  })),
);

export function px(value: number) {
  return value + "px";
}
