import Phaser from "phaser";
import { getFighter, type Fighter, type Pose } from "../fighters";
import { simulate, type BattleScript, type BattleEvent } from "../battle";

interface Rig {
  fighter: Fighter;
  side: "left" | "right";
  facing: 1 | -1;
  homeX: number;
  homeY: number;
  hp: number;
  maxHp: number;
  state: Pose;
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  hpBar: Phaser.GameObjects.Rectangle;
  hpBg: Phaser.GameObjects.Rectangle;
  hpText: Phaser.GameObjects.Text;
  nameText: Phaser.GameObjects.Text;
  bobTween?: Phaser.Tweens.Tween;
  victoryTween?: Phaser.Tweens.Tween;
}

const FLOOR_Y = 540;
const SPRITE_SCALE = 4.0;
const HP_BAR_W = 360;

export class Battle extends Phaser.Scene {
  private leftRig!: Rig;
  private rightRig!: Rig;
  private script!: BattleScript;
  private eventIdx = 0;
  private startedAt = 0;
  private winnerOverlay?: Phaser.GameObjects.Container;

  constructor() { super("Battle"); }

  init(data: { left: string; right: string }) {
    const L = getFighter(data.left)!;
    const R = getFighter(data.right)!;
    this.script = simulate(L, R);
    this.eventIdx = 0;
    this.startedAt = 0;
    (this as any)._left  = L;
    (this as any)._right = R;
  }

  create() {
    const { width, height } = this.scale;
    this.drawArenaBg(width, height);

    const L = (this as any)._left as Fighter;
    const R = (this as any)._right as Fighter;
    this.leftRig  = this.makeRig(L,  width * 0.30, FLOOR_Y, 1,  "left");
    this.rightRig = this.makeRig(R,  width * 0.70, FLOOR_Y, -1, "right");

    this.startedAt = this.time.now;
  }

  private drawArenaBg(width: number, height: number) {
    if (this.textures.exists("arena_bg")) {
      const bg = this.add.image(width / 2, height / 2, "arena_bg");
      const scaleX = width / bg.width;
      const scaleY = height / bg.height;
      bg.setScale(Math.max(scaleX, scaleY));
      // Subtle dark overlay near floor for ground separation
      this.add.rectangle(width / 2, FLOOR_Y + 30, width, 60, 0x000000, 0.35);
      return;
    }
    // Fallback procedural background
    for (let i = 0; i < 40; i++) {
      const y = (i / 40) * FLOOR_Y;
      const t = i / 40;
      const r = Phaser.Math.Linear(0x3a, 0x7a, t);
      const g = Phaser.Math.Linear(0x20, 0x38, t);
      const b = Phaser.Math.Linear(0x18, 0x18, t);
      const color = (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
      this.add.rectangle(width / 2, y + (FLOOR_Y / 80), width, FLOOR_Y / 40 + 1, color);
    }
    for (let row = 0; row < 3; row++) {
      const y = 200 + row * 30;
      for (let i = 0; i < width / 14; i++) {
        const cx = (i + row * 0.5) * 14;
        const c = this.add.circle(cx, y, 4 + (i % 3) * 0.5, 0x0a0814);
        this.tweens.add({
          targets: c, y: { from: y - 2, to: y + 2 }, yoyo: true, repeat: -1,
          duration: 1200 + (i % 5) * 120, ease: "Sine.InOut",
        });
      }
    }
    this.add.rectangle(width / 2, (FLOOR_Y + height) / 2, width, height - FLOOR_Y, 0x1a0a06);
    for (let i = 0; i < 8; i++) {
      this.add.rectangle(width / 2, FLOOR_Y + 8 + i * 14, width, 2, 0x261410);
    }
  }

  private makeRig(f: Fighter, homeX: number, homeY: number, facing: 1 | -1, side: "left" | "right"): Rig {
    const shadow = this.add.ellipse(homeX, homeY + 6, 100, 22, 0x000000, 0.45);
    const sprite = this.add.image(homeX, homeY, `${f.id}_idle`)
      .setOrigin(0.5, 1)
      .setScale(SPRITE_SCALE * facing, SPRITE_SCALE);

    const isLeft = side === "left";
    const hpX = isLeft ? 40 : this.scale.width - 40 - HP_BAR_W;
    const hpY = 30;
    const hpBg = this.add.rectangle(hpX, hpY, HP_BAR_W, 32, 0x000000, 0.6).setOrigin(0, 0).setStrokeStyle(2, 0xffd23d);
    const hpBar = this.add.rectangle(hpX, hpY, HP_BAR_W, 32, 0x22b755).setOrigin(0, 0);
    const nameText = this.add.text(isLeft ? hpX : hpX + HP_BAR_W, hpY + 38, `${f.emoji}  ${f.name}`, {
      fontSize: "20px", fontStyle: "bold", color: "#fff",
    }).setOrigin(isLeft ? 0 : 1, 0);
    const hpText = this.add.text(hpX + HP_BAR_W / 2, hpY + 16, `${f.hp} / ${f.hp}`, {
      fontSize: "16px", fontStyle: "bold", color: "#fff",
    }).setOrigin(0.5);

    const rig: Rig = {
      fighter: f, side, facing, homeX, homeY,
      hp: f.hp, maxHp: f.hp, state: "idle",
      sprite, shadow, hpBar, hpBg, hpText, nameText,
    };
    this.startBob(rig);
    return rig;
  }

  private startBob(rig: Rig) {
    rig.bobTween?.stop();
    rig.bobTween = this.tweens.add({
      targets: rig.sprite, y: { from: rig.homeY - 8, to: rig.homeY + 0 },
      yoyo: true, repeat: -1, duration: 700, ease: "Sine.InOut",
    });
  }

  update(_t: number, _dt: number) {
    if (!this.script) return;
    const elapsed = (this.time.now - this.startedAt) / 1000;
    while (this.eventIdx < this.script.events.length &&
           this.script.events[this.eventIdx].t <= elapsed) {
      this.applyEvent(this.script.events[this.eventIdx]);
      this.eventIdx++;
    }
    if (this.eventIdx >= this.script.events.length && elapsed > this.script.duration && !this.winnerOverlay) {
      this.showWinner();
    }
  }

  private applyEvent(ev: BattleEvent) {
    if (ev.type === "attack") {
      const rig = ev.attacker === "left" ? this.leftRig : this.rightRig;
      const pose: Pose = ev.kind === "heavy" ? "attack_heavy" : "attack_quick";
      this.swapPose(rig, pose);
      this.lunge(rig, ev.kind);
    } else if (ev.type === "hit") {
      const rig = ev.defender === "left" ? this.leftRig : this.rightRig;
      rig.hp = ev.defenderHp;
      this.swapPose(rig, "hit");
      this.recoil(rig);
      this.updateHp(rig);
      this.spawnFloatText(rig, ev.dmg, ev.crit);
      this.spawnHitSpark(ev.crit);
      this.cameraShake(ev.crit ? 0.025 : 0.012, ev.crit ? 12 : 6);
      this.cameraFlash(ev.crit ? 200 : 100);
      // After hit-stun, return to idle
      this.time.delayedCall(450, () => {
        if (rig.state === "hit") this.swapPose(rig, "idle");
      });
    } else if (ev.type === "ko") {
      const rig = ev.loser === "left" ? this.leftRig : this.rightRig;
      this.swapPose(rig, "ko");
      rig.bobTween?.stop();
      this.tweens.add({ targets: rig.sprite, y: rig.homeY, duration: 300, ease: "Quad.Out" });
    } else if (ev.type === "victory") {
      const rig = ev.winner === "left" ? this.leftRig : this.rightRig;
      this.swapPose(rig, "victory");
      rig.bobTween?.stop();
      rig.victoryTween = this.tweens.add({
        targets: rig.sprite, y: { from: rig.homeY - 25, to: rig.homeY },
        yoyo: true, repeat: -1, duration: 350, ease: "Quad.Out",
      });
      this.cameraFlash(300);
      this.spawnConfetti(80);
    }
  }

  private swapPose(rig: Rig, pose: Pose) {
    rig.state = pose;
    rig.sprite.setTexture(`${rig.fighter.id}_${pose}`);
  }

  private lunge(rig: Rig, kind: "quick" | "heavy") {
    rig.bobTween?.stop();
    const dir = rig.facing;
    const distance = kind === "heavy" ? 110 : 80;
    this.tweens.add({
      targets: rig.sprite, x: { from: rig.homeX, to: rig.homeX + dir * distance },
      duration: 180, ease: "Quad.Out",
      yoyo: true, hold: 80,
      onComplete: () => {
        rig.sprite.x = rig.homeX;
        rig.sprite.y = rig.homeY;
        if (rig.state === "attack_quick" || rig.state === "attack_heavy") {
          this.swapPose(rig, "idle");
          this.startBob(rig);
        }
      },
    });
  }

  private recoil(rig: Rig) {
    const dir = -rig.facing;
    const startX = rig.homeX + dir * 30;
    rig.sprite.x = startX;
    // Shake horizontally then return
    this.tweens.add({
      targets: rig.sprite, x: { from: startX - 8, to: startX + 8 },
      yoyo: true, repeat: 4, duration: 50, ease: "Sine.InOut",
      onComplete: () => {
        this.tweens.add({ targets: rig.sprite, x: rig.homeX, duration: 200, ease: "Quad.Out" });
      },
    });
    // Tint flash red
    rig.sprite.setTintFill(0xff5050);
    this.time.delayedCall(120, () => rig.sprite.clearTint());
  }

  private updateHp(rig: Rig) {
    const ratio = rig.hp / rig.maxHp;
    const newW = Math.max(0, HP_BAR_W * ratio);
    const color = ratio > 0.5 ? 0x22b755 : ratio > 0.25 ? 0xc47410 : 0xa01020;
    rig.hpBar.fillColor = color;
    this.tweens.add({ targets: rig.hpBar, displayWidth: newW, duration: 350, ease: "Quad.Out" });
    if (rig.side === "right") {
      // align right: anchor at start so width grows to the left
      const x = this.scale.width - 40 - newW;
      this.tweens.add({ targets: rig.hpBar, x, duration: 350, ease: "Quad.Out" });
    }
    rig.hpText.setText(`${rig.hp} / ${rig.maxHp}`);
  }

  private spawnFloatText(rig: Rig, dmg: number, crit: boolean) {
    const txt = this.add.text(rig.sprite.x, rig.sprite.y - 220, `-${dmg}${crit ? "!" : ""}`, {
      fontSize: crit ? "44px" : "32px", fontStyle: "bold",
      color: crit ? "#ffd23d" : "#fff",
      stroke: "#000", strokeThickness: 5,
    }).setOrigin(0.5);
    this.tweens.add({
      targets: txt, y: txt.y - 60, alpha: 0, duration: 1100, ease: "Quad.Out",
      onComplete: () => txt.destroy(),
    });
  }

  private spawnHitSpark(crit: boolean) {
    const cx = (this.leftRig.sprite.x + this.rightRig.sprite.x) / 2;
    const cy = FLOOR_Y - 120;
    const n = crit ? 22 : 12;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 120 + Math.random() * 280;
      const p = this.add.rectangle(cx, cy, crit ? 10 : 6, crit ? 10 : 6,
        crit ? 0xffd23d : 0xffffff);
      this.tweens.add({
        targets: p, x: cx + Math.cos(a) * sp * 0.6,
        y: cy + Math.sin(a) * sp * 0.6, alpha: 0,
        duration: 600 + Math.random() * 400, ease: "Quad.Out",
        onComplete: () => p.destroy(),
      });
    }
  }

  private spawnConfetti(n: number) {
    const cx = this.scale.width / 2;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 320;
      const p = this.add.rectangle(cx, 280, 8, 8,
        Phaser.Display.Color.HSVToRGB(Math.random(), 0.85, 1.0).color);
      p.setRotation(Math.random() * Math.PI * 2);
      this.tweens.add({
        targets: p,
        x: cx + Math.cos(a) * sp,
        y: 280 + Math.sin(a) * sp + 200,
        rotation: p.rotation + (Math.random() - 0.5) * 8,
        alpha: 0,
        duration: 1500 + Math.random() * 800,
        ease: "Quad.Out",
        onComplete: () => p.destroy(),
      });
    }
  }

  private cameraShake(seconds: number, intensity: number) {
    this.cameras.main.shake(seconds * 1000, intensity / 1000);
  }

  private cameraFlash(ms: number) {
    this.cameras.main.flash(ms, 255, 255, 255, true);
  }

  private showWinner() {
    const winner = this.script.winner === "left" ? this.leftRig.fighter : this.rightRig.fighter;
    const { width, height } = this.scale;

    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6);
    const title = this.add.text(width / 2, height / 2 - 200, "VITÓRIA", {
      fontSize: "44px", fontStyle: "bold", color: "#fff5b8",
      stroke: "#000", strokeThickness: 6,
    }).setOrigin(0.5);
    const winnerSprite = this.add.image(width / 2, height / 2 - 30, `${winner.id}_victory`).setScale(7).setOrigin(0.5);
    const winnerName = this.add.text(width / 2, height / 2 + 200, winner.name.toUpperCase(), {
      fontSize: "60px", fontStyle: "bold", color: "#ffd23d",
      stroke: "#000", strokeThickness: 8,
    }).setOrigin(0.5);
    const hint = this.add.text(width / 2, height - 40, "Clique para nova batalha", {
      fontSize: "18px", color: "#fff", alpha: 0.7,
    }).setOrigin(0.5);

    this.winnerOverlay = this.add.container(0, 0, [overlay, title, winnerSprite, winnerName, hint]);
    this.tweens.add({
      targets: winnerSprite, scale: { from: 5, to: 7 }, duration: 350, ease: "Back.Out",
    });
    this.tweens.add({
      targets: winnerSprite, y: { from: height / 2 - 50, to: height / 2 - 10 },
      yoyo: true, repeat: -1, duration: 600, ease: "Sine.InOut",
    });
    this.tweens.add({
      targets: hint, alpha: { from: 0.4, to: 1.0 }, yoyo: true, repeat: -1, duration: 800,
    });
    overlay.setInteractive();
    overlay.on("pointerdown", () => this.scene.start("CharacterSelect"));
  }
}
