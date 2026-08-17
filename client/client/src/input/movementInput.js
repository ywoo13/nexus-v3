// 키보드(WASD)와 모바일 터치 D패드/액션 버튼이 같은 이동 입력을 공유합니다.
// LocalPlayerController는 이 값들만 읽으면 됩니다.
export const movementInput = { x: 0, z: 0, run: false };

// 점프는 "누르고 있는 상태"가 아니라 1회성 트리거라서 별도 객체로 관리
// (프레임마다 계속 점프하지 않도록 소비 후 false로 리셋)
export const jumpRequest = { pending: false };

const keyboardKeys = { w: false, a: false, s: false, d: false };
const touchKeys = { up: false, down: false, left: false, right: false };

function recompute() {
  let x = 0;
  let z = 0;
  if (keyboardKeys.w || touchKeys.up) z -= 1;
  if (keyboardKeys.s || touchKeys.down) z += 1;
  if (keyboardKeys.a || touchKeys.left) x -= 1;
  if (keyboardKeys.d || touchKeys.right) x += 1;
  movementInput.x = x;
  movementInput.z = z;
}

// 채팅 입력창 등에 포커스가 있을 때는 게임 조작(WASD/Shift/Space)이 같이 눌리지 않도록 무시
function isTypingTarget(target) {
  const tag = target?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;
}

export function bindKeyboard() {
  const down = (e) => {
    if (isTypingTarget(e.target)) return;
    const k = e.key.toLowerCase();
    if (k in keyboardKeys) {
      keyboardKeys[k] = true;
      recompute();
    }
    if (k === "shift") movementInput.run = true;
    if (e.code === "Space") jumpRequest.pending = true;
  };
  const up = (e) => {
    if (isTypingTarget(e.target)) return;
    const k = e.key.toLowerCase();
    if (k in keyboardKeys) {
      keyboardKeys[k] = false;
      recompute();
    }
    if (k === "shift") movementInput.run = false;
  };
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);

  // 이동 키를 누른 채로 채팅 입력창에 포커스가 옮겨가면 keyup을 못 받아
  // 키가 눌린 채로 고착될 수 있어서, 입력창 포커스 시 안전하게 초기화합니다.
  const handleFocusIn = (e) => {
    if (!isTypingTarget(e.target)) return;
    keyboardKeys.w = keyboardKeys.a = keyboardKeys.s = keyboardKeys.d = false;
    movementInput.run = false;
    recompute();
  };
  window.addEventListener("focusin", handleFocusIn);

  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    window.removeEventListener("focusin", handleFocusIn);
  };
}

export function setTouchDirection(direction, isPressed) {
  if (!(direction in touchKeys)) return;
  touchKeys[direction] = isPressed;
  recompute();
}

export function setTouchRun(isRunning) {
  movementInput.run = isRunning;
}

export function requestJump() {
  jumpRequest.pending = true;
}

// 전화 수신, 알림 내리기, 앱 전환 등으로 터치가 pointerup/pointercancel 없이
// 끊기면 D패드 방향키가 "눌린 채로 고착"될 수 있습니다. 화면이 안 보이게 되거나
// 포커스를 잃으면 모든 터치 입력을 강제로 해제해서 이런 상황을 방지합니다.
export function resetTouchInput() {
  touchKeys.up = touchKeys.down = touchKeys.left = touchKeys.right = false;
  movementInput.run = false;
  recompute();
}

export function bindTouchSafety() {
  const handleVisibilityChange = () => {
    if (document.hidden) resetTouchInput();
  };
  window.addEventListener("blur", resetTouchInput);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  return () => {
    window.removeEventListener("blur", resetTouchInput);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
