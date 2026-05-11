export type PetPoint = {
  x: number;
  y: number;
};

export type PetBounds = {
  width: number;
  height: number;
};

export type PetSize = {
  width: number;
  height: number;
};

export type CloudCodeMonsterPeekTarget = PetPoint & {
  agentId?: string;
};

export type CloudCodeMonsterActivityTriggerMode = "home" | "global";

export type CloudCodeMonsterActivityId =
  | "coding"
  | "sleeping"
  | "reading"
  | "phone"
  | "thinking"
  | "snacking";

export type CloudCodeMonsterActivity = {
  id: CloudCodeMonsterActivityId;
  label: string;
  caption: string;
};

export type CloudCodeMonsterPresetFeature =
  | "square"
  | "horns"
  | "ears"
  | "visor"
  | "antenna"
  | "crown"
  | "bell"
  | "bolt"
  | "star"
  | "leaf"
  | "flame"
  | "fins"
  | "moon"
  | "mushroom"
  | "spin"
  | "chomp"
  | "ghost"
  | "cap"
  | "bow"
  | "hood"
  | "mask"
  | "soot"
  | "straw"
  | "ninja"
  | "pearl"
  | "wand"
  | "mecha"
  | "slime"
  | "ink"
  | "drum"
  | "sprout";

export type CloudCodeMonsterPresetShape =
  | "monster"
  | "doraemon"
  | "pikachu"
  | "kirby"
  | "bulbasaur"
  | "charmander"
  | "squirtle"
  | "minecraft-steve"
  | "minecraft-creeper"
  | "minecraft-zombie"
  | "toad"
  | "sonic"
  | "pacman"
  | "boo"
  | "mario"
  | "pooh"
  | "hello-kitty"
  | "my-melody"
  | "kuromi"
  | "totoro"
  | "soot-sprite"
  | "luffy"
  | "naruto"
  | "goku"
  | "sailor-moon"
  | "gundam"
  | "dragon-quest-slime"
  | "inkling"
  | "snoopy"
  | "chopper";

export type CloudCodeMonsterPetPreset = {
  id: string;
  name: string;
  group: string;
  feature: CloudCodeMonsterPresetFeature;
  shape?: CloudCodeMonsterPresetShape;
  bodyTop: string;
  body: string;
  bodyDark: string;
  bodyLight: string;
  bodySideLight: string;
  bodySideDark: string;
  accent: string;
  accessory: string;
  eye: string;
  highlight: string;
  facePatch?: string;
  cheek?: string;
};

export type StoredCloudCodeMonsterActivity = {
  activityId: CloudCodeMonsterActivityId | null;
  updatedAt: number;
  hiddenAt: number | null;
};

export type CloudCodeMonsterExpression =
  | "idle"
  | "sleeping"
  | "shocked"
  | "shaken"
  | "fainted";

export type Footprint = {
  id: number;
  x: number;
  y: number;
  side: "left" | "right";
  intensity: number;
};

export type ReflectedMonsterWalk = {
  position: PetPoint;
  velocity: PetPoint;
  reflectedX: boolean;
  reflectedY: boolean;
};
