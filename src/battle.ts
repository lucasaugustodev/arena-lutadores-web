// Pre-simulates a battle and returns a timeline of events for playback.

import type { Fighter } from "./fighters";

export type BattleEvent =
  | { t: number; type: "attack"; attacker: "left" | "right"; defender: "left" | "right"; kind: "quick" | "heavy" }
  | { t: number; type: "hit"; defender: "left" | "right"; dmg: number; crit: boolean; defenderHp: number }
  | { t: number; type: "ko"; loser: "left" | "right" }
  | { t: number; type: "victory"; winner: "left" | "right" };

export interface BattleScript {
  events: BattleEvent[];
  duration: number;
  winner: "left" | "right";
  leftFinalHp: number;
  rightFinalHp: number;
}

const ROUND_GAP = 1.4;
const ATTACK_TIME = 0.6;

function rollDamage(stats: Fighter): { dmg: number; crit: boolean } {
  const base = stats.atkMin + Math.random() * (stats.atkMax - stats.atkMin);
  const crit = Math.random() < stats.crit;
  return { dmg: Math.round(base * (crit ? 1.6 : 1)), crit };
}

export function simulate(left: Fighter, right: Fighter): BattleScript {
  const a = { stats: left,  hp: left.hp,  side: "left"  as const };
  const b = { stats: right, hp: right.hp, side: "right" as const };
  const order = a.stats.speed >= b.stats.speed ? [a, b] : [b, a];

  const events: BattleEvent[] = [];
  let t = 0.4;
  let round = 1;

  while (a.hp > 0 && b.hp > 0 && round < 30) {
    for (const attacker of order) {
      if (a.hp <= 0 || b.hp <= 0) break;
      const defender = attacker === a ? b : a;
      const { dmg, crit } = rollDamage(attacker.stats);
      defender.hp = Math.max(0, defender.hp - dmg);
      const kind: "quick" | "heavy" = crit ? "heavy" : (Math.random() < 0.5 ? "quick" : "heavy");
      events.push({ t, type: "attack", attacker: attacker.side, defender: defender.side, kind });
      events.push({ t: t + ATTACK_TIME * 0.55, type: "hit", defender: defender.side, dmg, crit, defenderHp: defender.hp });
      t += ATTACK_TIME + ROUND_GAP * 0.6;
      if (defender.hp <= 0) {
        events.push({ t, type: "ko", loser: defender.side });
        t += 1.2;
        events.push({ t, type: "victory", winner: attacker.side });
        t += 2.0;
        break;
      }
    }
    round++;
  }

  return {
    events,
    duration: t,
    winner: a.hp > 0 ? "left" : "right",
    leftFinalHp: a.hp,
    rightFinalHp: b.hp,
  };
}
