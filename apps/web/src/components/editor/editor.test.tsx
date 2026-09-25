import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { VideoEditor } from "./video-editor";

function fakeContext() {
  const noop = () => undefined;
  return {
    canvas: null,
    filter: "none",
    fillStyle: "#000",
    font: "",
    textAlign: "center",
    textBaseline: "middle",
    shadowColor: "",
    shadowBlur: 0,
    save: noop,
    restore: noop,
    setTransform: noop,
    fillRect: noop,
    drawImage: noop,
    fillText: noop,
    beginPath: noop,
    roundRect: noop,
    fill: noop,
    measureText: () => ({ width: 42 }),
  } as unknown as CanvasRenderingContext2D;
}

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => fakeContext(),
  ) as unknown as HTMLCanvasElement["getContext"];
  // @ts-expect-error test stub
  HTMLCanvasElement.prototype.captureStream = vi.fn(() => ({
    getTracks: () => [],
    addTrack: () => undefined,
  }));
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn(() => Promise.resolve()),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => cleanup());

describe("VideoEditor", () => {
  it("mounts with an empty timeline", () => {
    render(<VideoEditor />);
    expect(
      screen.getByText(/Kuch import karke editing shuru karo/i),
    ).toBeTruthy();
    expect(screen.getByText("Import media")).toBeTruthy();
  });

  it("adds a text layer and lets undo remove it", () => {
    render(<VideoEditor />);
    const addText = screen.getByText("Add text");
    act(() => {
      fireEvent.click(addText);
    });
    expect(screen.getByDisplayValue("Your text here")).toBeTruthy();

    const undo = screen.getByText("Undo");
    act(() => {
      fireEvent.click(undo);
    });
    expect(screen.queryByDisplayValue("Your text here")).toBeNull();
  });

  it("shows the inspector hint until something is selected", () => {
    render(<VideoEditor />);
    expect(screen.getByText(/Inspector/i)).toBeTruthy();
  });
});
