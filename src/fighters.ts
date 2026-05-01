// Roster of 2 anthropomorphic warrior bichos generated via Scenario.gg.

export interface Fighter {
  id: string;
  name: string;
  emoji: string;
  folder: string;
  weapon: string;
  style: string;
  hp: number;
  atkMin: number;
  atkMax: number;
  speed: number;
  crit: number;
  color: string;
}

export const ROSTER: Fighter[] = [
  {
    id: "jacare", name: "Jacaré", emoji: "🐊", folder: "jacare",
    weapon: "Clava de Pedra", style: "Tanque",
    hp: 140, atkMin: 14, atkMax: 22, speed: 8, crit: 0.10, color: "#4a7a3a",
  },
  {
    id: "aguia", name: "Águia", emoji: "🦅", folder: "aguia",
    weapon: "Cimitarra", style: "Velocista",
    hp: 100, atkMin: 12, atkMax: 22, speed: 17, crit: 0.22, color: "#c4923a",
  },
];

export const POSES = ["idle", "walk", "attack_quick", "attack_heavy", "hit", "ko", "victory"] as const;
export type Pose = typeof POSES[number];

export function getFighter(id: string): Fighter | undefined {
  return ROSTER.find(f => f.id === id);
}
