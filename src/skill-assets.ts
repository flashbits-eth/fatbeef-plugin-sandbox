import agility from "./assets/skill-icons/agility.png";
import attack from "./assets/skill-icons/attack.png";
import cooking from "./assets/skill-icons/cooking.png";
import crafting from "./assets/skill-icons/crafting.png";
import defence from "./assets/skill-icons/defence.png";
import farming from "./assets/skill-icons/farming.png";
import firemaking from "./assets/skill-icons/firemaking.png";
import fishing from "./assets/skill-icons/fishing.png";
import fletching from "./assets/skill-icons/fletching.png";
import herblore from "./assets/skill-icons/herblore.png";
import hitpoints from "./assets/skill-icons/hitpoints.png";
import magic from "./assets/skill-icons/magic.png";
import mining from "./assets/skill-icons/mining.png";
import prayer from "./assets/skill-icons/prayer.png";
import ranged from "./assets/skill-icons/ranged.png";
import runecraft from "./assets/skill-icons/runecraft.png";
import slayer from "./assets/skill-icons/slayer.png";
import smithing from "./assets/skill-icons/smithing.png";
import strength from "./assets/skill-icons/strength.png";
import thieving from "./assets/skill-icons/thieving.png";
import woodcutting from "./assets/skill-icons/woodcutting.png";

export const SKILL_ICONS: readonly string[] = Object.freeze([
  attack, defence, strength, hitpoints, ranged, prayer, magic,
  cooking, woodcutting, fletching, fishing, firemaking, crafting,
  smithing, mining, herblore, agility, thieving, slayer, farming, runecraft,
]);

// RuneLite's default XP-globe arc colors, ordered like Solanascape's 21 skills.
export const SKILL_COLORS: readonly string[] = Object.freeze([
  "rgb(155,32,7)", "rgb(98,119,190)", "rgb(4,149,90)", "rgb(131,126,126)",
  "rgb(109,144,23)", "rgb(159,147,35)", "rgb(50,80,193)", "rgb(112,35,134)",
  "rgb(52,140,37)", "rgb(3,141,125)", "rgb(106,132,164)", "rgb(189,120,25)",
  "rgb(151,110,77)", "rgb(108,107,82)", "rgb(93,143,167)", "rgb(7,133,9)",
  "rgb(58,60,137)", "rgb(108,52,87)", "rgb(100,100,100)", "rgb(101,152,63)",
  "rgb(170,141,26)",
]);
