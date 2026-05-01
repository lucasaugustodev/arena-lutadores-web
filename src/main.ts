import Phaser from "phaser";
import { Preloader } from "./scenes/Preloader";
import { CharacterSelect } from "./scenes/CharacterSelect";
import { Battle } from "./scenes/Battle";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  width: 1280,
  height: 720,
  backgroundColor: "#0a0a18",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  pixelArt: false,
  scene: [Preloader, CharacterSelect, Battle],
};

new Phaser.Game(config);
