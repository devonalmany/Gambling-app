// Keyboard + mouse state, polled by the game loop rather than pushed via
// events, so movement/aim always reflect the current frame.

const keys = new Set();
const pressedThisFrame = new Set();
const mouse = { x: 0, y: 0, down: false };
let canvasEl = null;

function onKeyDown(e) {
  const code = e.code;
  if (!keys.has(code)) pressedThisFrame.add(code);
  keys.add(code);
  if (
    ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
      code
    )
  ) {
    e.preventDefault();
  }
}

function onKeyUp(e) {
  keys.delete(e.code);
}

function onMouseMove(e) {
  const rect = canvasEl.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
}

function onMouseDown(e) {
  if (e.button === 0) mouse.down = true;
}

function onMouseUp(e) {
  if (e.button === 0) mouse.down = false;
}

export const Input = {
  init(canvas) {
    canvasEl = canvas;
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("blur", () => {
      keys.clear();
      mouse.down = false;
    });
  },
  isDown(code) {
    return keys.has(code);
  },
  wasPressed(code) {
    return pressedThisFrame.has(code);
  },
  mouse,
  // Call once per frame, after game logic has consumed wasPressed().
  endFrame() {
    pressedThisFrame.clear();
  },
  moveVector() {
    let x = 0;
    let y = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) y -= 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) y += 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len, moving: x !== 0 || y !== 0 };
  },
};
