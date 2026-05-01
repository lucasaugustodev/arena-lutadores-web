import Phaser from "phaser";
import { ROSTER, type Fighter } from "../fighters";

export class CharacterSelect extends Phaser.Scene {
  private leftPick: Fighter | null = null;
  private rightPick: Fighter | null = null;
  private cards: Phaser.GameObjects.Container[] = [];
  private leftBadge!: Phaser.GameObjects.Container;
  private rightBadge!: Phaser.GameObjects.Container;
  private fightBtn!: Phaser.GameObjects.Container;
  private fightBtnGlow!: Phaser.GameObjects.Rectangle;

  constructor() { super("CharacterSelect"); }

  create() {
    const { width, height } = this.scale;

    // Title banner
    const banner = this.add.rectangle(width / 2, 70, 600, 70, 0x7a1024);
    banner.setStrokeStyle(3, 0xffd23d);
    this.add.text(width / 2, 70, "⚔  ARENA DOS LUTADORES  ⚔", {
      fontSize: "40px", fontStyle: "bold", color: "#ffd23d",
      stroke: "#3a0a1a", strokeThickness: 4,
    }).setOrigin(0.5);

    // Subtitle
    this.add.text(width / 2, 130, "Escolha P1 e P2 para a batalha", {
      fontSize: "18px", color: "#e0d0a0",
    }).setOrigin(0.5);

    // Roster grid
    const cardW = 220, cardH = 280;
    const gap = 16;
    const totalW = ROSTER.length * cardW + (ROSTER.length - 1) * gap;
    const startX = (width - totalW) / 2;
    const cardY = 180;

    ROSTER.forEach((f, i) => {
      const x = startX + i * (cardW + gap);
      const card = this.makeCard(f, x, cardY, cardW, cardH);
      this.cards.push(card);
    });

    // VS panel
    this.leftBadge = this.makeSlot(170, height - 140, 200, 100, "P1", 0xff5050);
    this.rightBadge = this.makeSlot(width - 370, height - 140, 200, 100, "P2", 0x50a8ff);

    this.add.text(width / 2, height - 90, "VS", {
      fontSize: "60px", fontStyle: "bold", color: "#ffd23d",
      stroke: "#3a0a1a", strokeThickness: 6,
    }).setOrigin(0.5);

    // FIGHT button (initially hidden)
    this.fightBtnGlow = this.add.rectangle(width / 2, height - 50, 320, 70, 0xff7733, 0).setVisible(false);
    const btnBg = this.add.rectangle(0, 0, 320, 60, 0xff7733).setStrokeStyle(4, 0xffd23d);
    const btnTxt = this.add.text(0, 0, "⚔  COMEÇAR LUTA  ⚔", {
      fontSize: "24px", fontStyle: "bold", color: "#fff",
      stroke: "#3a0a1a", strokeThickness: 4,
    }).setOrigin(0.5);
    this.fightBtn = this.add.container(width / 2, height - 50, [btnBg, btnTxt]);
    this.fightBtn.setSize(320, 60);
    this.fightBtn.setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.startBattle())
      .on("pointerover", () => btnBg.setFillStyle(0xff9050))
      .on("pointerout",  () => btnBg.setFillStyle(0xff7733));
    this.fightBtn.setVisible(false);

    // Button pulse glow
    this.tweens.add({
      targets: this.fightBtnGlow, alpha: { from: 0.0, to: 0.4 },
      yoyo: true, repeat: -1, duration: 600, ease: "Sine.InOut",
    });
  }

  private makeCard(f: Fighter, x: number, y: number, w: number, h: number): Phaser.GameObjects.Container {
    const bg = this.add.rectangle(0, 0, w, h, Phaser.Display.Color.HexStringToColor(f.color).color);
    const inner = this.add.rectangle(0, 0, w - 8, h - 8, Phaser.Display.Color.HexStringToColor(f.color).color);
    inner.setFillStyle(Phaser.Display.Color.ValueToColor(f.color).darken(35).color);
    const border = this.add.rectangle(0, 0, w, h, 0, 0).setStrokeStyle(3, 0xffffff, 0.2);

    const sprite = this.add.image(0, -50, `${f.id}_idle`).setScale(0.18);
    const name = this.add.text(0, 60, f.name, {
      fontSize: "22px", fontStyle: "bold", color: "#fff",
    }).setOrigin(0.5);
    const style = this.add.text(0, 88, f.style, { fontSize: "14px", color: "#fff", alpha: 0.85 }).setOrigin(0.5);
    const weapon = this.add.text(0, 108, "🗡  " + f.weapon, { fontSize: "12px", color: "#fff", alpha: 0.7 }).setOrigin(0.5);

    const stats = this.add.text(0, 130,
      `❤ ${f.hp}    ⚔ ${f.atkMin}-${f.atkMax}    ⚡ ${f.speed}`,
      { fontSize: "12px", color: "#fff", fontStyle: "bold" }).setOrigin(0.5);

    const card = this.add.container(x + w / 2, y + h / 2, [bg, inner, sprite, name, style, weapon, stats, border]);
    card.setSize(w, h);
    card.setInteractive({ useHandCursor: true });
    card.setData("fighter", f);
    card.setData("border", border);

    // idle bob
    this.tweens.add({
      targets: sprite, y: { from: -55, to: -45 }, yoyo: true, repeat: -1,
      duration: 1200, ease: "Sine.InOut", delay: Math.random() * 500,
    });

    card.on("pointerover", () => {
      if (this.leftPick !== f && this.rightPick !== f) border.setStrokeStyle(3, 0xffd23d);
      this.tweens.add({ targets: card, scale: 1.04, duration: 150, ease: "Quad.Out" });
    });
    card.on("pointerout", () => {
      if (this.leftPick !== f && this.rightPick !== f) border.setStrokeStyle(3, 0xffffff, 0.2);
      this.tweens.add({ targets: card, scale: 1.0, duration: 150, ease: "Quad.Out" });
    });
    card.on("pointerdown", () => this.handlePick(f));
    return card;
  }

  private handlePick(f: Fighter) {
    if (!this.leftPick) {
      this.leftPick = f;
    } else if (!this.rightPick && this.leftPick !== f) {
      this.rightPick = f;
    } else {
      this.leftPick = f;
      this.rightPick = null;
    }
    this.refreshSelection();
  }

  private refreshSelection() {
    for (const card of this.cards) {
      const f = card.getData("fighter") as Fighter;
      const border = card.getData("border") as Phaser.GameObjects.Rectangle;
      if (this.leftPick === f) border.setStrokeStyle(4, 0xff5050);
      else if (this.rightPick === f) border.setStrokeStyle(4, 0x50a8ff);
      else border.setStrokeStyle(3, 0xffffff, 0.2);
    }
    this.fillSlot(this.leftBadge, this.leftPick);
    this.fillSlot(this.rightBadge, this.rightPick);
    const ready = !!(this.leftPick && this.rightPick);
    this.fightBtn.setVisible(ready);
    this.fightBtnGlow.setVisible(ready);
  }

  private makeSlot(x: number, y: number, w: number, h: number, label: string, color: number): Phaser.GameObjects.Container {
    const bg = this.add.rectangle(0, 0, w, h, 0x000000, 0.55);
    bg.setStrokeStyle(3, color);
    const lbl = this.add.text(-w / 2 + 12, -h / 2 + 8, label, {
      fontSize: "16px", fontStyle: "bold", color: Phaser.Display.Color.IntegerToColor(color).rgba,
    });
    const placeholder = this.add.text(0, 0, "escolha um lutador", {
      fontSize: "16px", color: "#fff", alpha: 0.5, fontStyle: "italic",
    }).setOrigin(0.5);
    placeholder.setName("placeholder");
    const c = this.add.container(x, y, [bg, lbl, placeholder]);
    c.setSize(w, h);
    return c;
  }

  private fillSlot(slot: Phaser.GameObjects.Container, fighter: Fighter | null) {
    const placeholder = slot.getByName("placeholder") as Phaser.GameObjects.Text;
    placeholder.setVisible(!fighter);
    // Remove old preview
    const old = slot.getByName("preview");
    if (old) old.destroy();
    const oldName = slot.getByName("name");
    if (oldName) oldName.destroy();
    if (fighter) {
      const img = this.add.image(-65, 5, `${fighter.id}_idle`).setScale(0.12);
      img.setName("preview");
      const txt = this.add.text(70, 0, fighter.name, {
        fontSize: "20px", fontStyle: "bold", color: "#fff",
      }).setOrigin(0.5);
      txt.setName("name");
      slot.add([img, txt]);
    }
  }

  private startBattle() {
    if (!this.leftPick || !this.rightPick) return;
    this.scene.start("Battle", { left: this.leftPick.id, right: this.rightPick.id });
  }
}
