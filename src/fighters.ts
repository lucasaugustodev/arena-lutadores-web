// Roster of 5 fighters using Kenney platformer-characters.

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
    id: "adventurer", name: "O Aventureiro", emoji: "⚔️", folder: "adventurer",
    weapon: "Espada", style: "Equilibrado",
    hp: 110, atkMin: 13, atkMax: 21, speed: 13, crit: 0.18, color: "#7c3aed",
  },
  {
    id: "female", name: "A Heroína", emoji: "🗡️", folder: "female",
    weapon: "Lâmina", style: "Velocista",
    hp: 100, atkMin: 12, atkMax: 22, speed: 17, crit: 0.22, color: "#e63946",
  },
  {
    id: "player", name: "O Atleta", emoji: "💪", folder: "player",
    weapon: "Punhos", style: "Marcial",
    hp: 105, atkMin: 12, atkMax: 19, speed: 15, crit: 0.20, color: "#ffd23d",
  },
  {
    id: "soldier", name: "O Soldado", emoji: "🪖", folder: "soldier",
    weapon: "Rifle", style: "Tanque",
    hp: 140, atkMin: 16, atkMax: 24, speed: 9, crit: 0.12, color: "#22b755",
  },
  {
    id: "zombie", name: "O Zumbi", emoji: "🧟", folder: "zombie",
    weapon: "Mordida", style: "Berserker",
    hp: 150, atkMin: 15, atkMax: 25, speed: 7, crit: 0.10, color: "#06b6d4",
  },
];

export const POSES = ["idle", "walk", "attack_quick", "attack_heavy", "hit", "ko", "victory"] as const;
export type Pose = typeof POSES[number];

export function getFighter(id: string): Fighter | undefined {
  return ROSTER.find(f => f.id === id);
}
