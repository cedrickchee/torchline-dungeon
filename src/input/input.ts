import type { GameAction } from "../core/types";

type KeyboardPlayer = {
  x: number;
  y: number;
};

export function bindKeyboard(dispatch: (action: GameAction) => void, getPlayer?: () => KeyboardPlayer): void {
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    const movement: Record<string, [number, number]> = {
      arrowup: [0, -1],
      w: [0, -1],
      arrowright: [1, 0],
      d: [1, 0],
      arrowdown: [0, 1],
      s: [0, 1],
      arrowleft: [-1, 0],
      a: [-1, 0]
    };

    if (movement[key]) {
      event.preventDefault();
      const [dx, dy] = movement[key];
      const player = getPlayer?.();
      if (player) dispatch({ type: "moveTo", x: player.x + dx * 1.35, y: player.y + dy * 1.35 });
      else dispatch({ type: "move", dx, dy });
      return;
    }

    if (key === " ") {
      event.preventDefault();
      dispatch({ type: "useAbility" });
    } else if (key === "e") dispatch({ type: "useStairs" });
    else if (key === "f") dispatch({ type: "activateShrine" });
    else if (key === "q") dispatch({ type: "drinkPotion" });
    else if (key === "shift") dispatch({ type: "basicAttack" });
    else if (key === "p" || key === "escape") dispatch({ type: "pause" });
    else if (key === "`" || key === "~") dispatch({ type: "toggleDebug" });
    else if (key === "r") dispatch({ type: "restart" });
    else if (["1", "2", "3"].includes(key)) dispatch({ type: "chooseSkill", index: Number(key) - 1 });
  });
}
