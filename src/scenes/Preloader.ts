import Phaser from "phaser";
import { ROSTER, POSES, ANIMATED, FRAMES_PER_ANIM } from "../fighters";

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
      // Load animation frames if available
      const animPoses = ANIMATED[f.id] || [];
      for (const pose of animPoses) {
        for (let i = 1; i <= FRAMES_PER_ANIM; i++) {
          const key = `${f.id}_${pose}_f${i}`;
          const num = String(i).padStart(3, "0");
          this.load.image(key, `assets/characters/${f.folder}/${pose}_frames/frame_${num}.png`);
        }
      }
    }

    this.load.image("arena_bg", "assets/arena.png");
    this.load.on("loaderror", (file: any) => {
      console.warn("missing asset:", file.key);
    });
  }

  create() {
    // Build Phaser animations from loaded frame sequences
    for (const f of ROSTER) {
      const animPoses = ANIMATED[f.id] || [];
      for (const pose of animPoses) {
        const frames: Phaser.Types.Animations.AnimationFrame[] = [];
        for (let i = 1; i <= FRAMES_PER_ANIM; i++) {
          frames.push({ key: `${f.id}_${pose}_f${i}` });
        }
        // frameRate: 14 fps for actions, 8 fps for slower ones (idle/ko)
        const fps = (pose === "idle") ? 8 : (pose === "ko" ? 10 : 14);
        this.anims.create({
          key: `${f.id}_${pose}_anim`,
          frames,
          frameRate: fps,
          repeat: 0,
        });
      }
    }
    this.scene.start("CharacterSelect");
  }
}
