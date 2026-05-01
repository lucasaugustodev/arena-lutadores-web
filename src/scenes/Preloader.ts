import Phaser from "phaser";
import { ROSTER, POSES } from "../fighters";

export class Preloader extends Phaser.Scene {
  constructor() { super("Preloader"); }

  preload() {
    const { width, height } = this.scale;
    const bar = this.add.rectangle(width / 2, height / 2, 0, 8, 0xffd23d);
    bar.setOrigin(0, 0.5);
    bar.x = width / 2 - 200;
    this.load.on("progress", (p: number) => bar.width = 400 * p);
    this.add.text(width / 2, height / 2 - 30, "Carregando…", { fontSize: "24px", color: "#ffd23d" }).setOrigin(0.5);

    for (const f of ROSTER) {
      for (const pose of POSES) {
        this.load.image(`${f.id}_${pose}`, `assets/characters/${f.folder}/${pose}.png`);
      }
    }

    this.load.image("arena_bg", "assets/arena.png");
    this.load.on("loaderror", (file: any) => {
      console.warn("missing asset:", file.key);
    });
  }

  create() {
    this.scene.start("CharacterSelect");
  }
}
