import type { CloudCodeMonsterActivity, CloudCodeMonsterActivityId } from "./cloud-code-monster-pet-types";

export const CLOUD_CODE_MONSTER_ACTIVITIES: CloudCodeMonsterActivity[] = [
  { id: "coding", label: "Coding", caption: "Tapping through a small patch" },
  { id: "sleeping", label: "Sleeping", caption: "Taking a short workspace nap" },
  { id: "reading", label: "Reading", caption: "Flipping through a thick doc" },
  { id: "phone", label: "On phone", caption: "Checking a tiny glowing screen" },
  { id: "thinking", label: "Thinking", caption: "Processing a background thought" },
  { id: "snacking", label: "Snacking", caption: "Chewing on a little energy block" },
];

export const CLOUD_CODE_MONSTER_AUTOWALK_ACTIVITY_IDS: readonly CloudCodeMonsterActivityId[] = [
  "reading",
  "phone",
  "snacking",
];
