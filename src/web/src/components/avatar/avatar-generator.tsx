"use client";

import { useState } from "react";
import {
  type AvatarConfig,
  AvatarRenderer,
  FACES,
  EYES,
  EYEBROWS,
  NOSES,
  MOUTHS,
  HAIRS,
  BEARDS,
  GLASSES,
  EARRINGS,
  HATS,
  COLLARS,
  SKIN_TONES,
  HAIR_COLORS,
  BG_COLORS,
  CLOTHING_COLORS,
  PRESETS,
  randomConfig,
  type ColorOption,
} from "./avatar-parts";
import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
  icon: string;
  parts: { id: string; name: string }[];
  key: keyof AvatarConfig;
}

const TABS: Tab[] = [
  { id: "face", label: "Face", icon: "\u25EF", parts: FACES, key: "face" },
  { id: "hair", label: "Hair", icon: "\u223F", parts: HAIRS, key: "hair" },
  { id: "eyes", label: "Eyes", icon: "\u25C9", parts: EYES, key: "eyes" },
  { id: "eyebrows", label: "Brows", icon: "\u2312", parts: EYEBROWS, key: "eyebrows" },
  { id: "nose", label: "Nose", icon: "\u25B5", parts: NOSES, key: "nose" },
  { id: "mouth", label: "Mouth", icon: "\u2323", parts: MOUTHS, key: "mouth" },
  { id: "beard", label: "Beard", icon: "\u2A55", parts: BEARDS, key: "beard" },
  { id: "glasses", label: "Glasses", icon: "\u25CE\u25CE", parts: GLASSES, key: "glasses" },
  { id: "earrings", label: "Acc.", icon: "\u00B7", parts: EARRINGS, key: "earrings" },
  { id: "hat", label: "Hat", icon: "\u2302", parts: HATS, key: "hat" },
  { id: "collar", label: "Collar", icon: "\u2335", parts: COLLARS, key: "collar" },
];

const COLOR_MAP: Record<string, { label: string; items: ColorOption[]; key: keyof AvatarConfig }> = {
  face: { label: "Skin tone", items: SKIN_TONES, key: "skinTone" },
  hair: { label: "Hair color", items: HAIR_COLORS, key: "hairColor" },
  beard: { label: "Beard color", items: HAIR_COLORS, key: "beardColor" },
  hat: { label: "Clothing color", items: CLOTHING_COLORS, key: "clothingColor" },
  collar: { label: "Clothing color", items: CLOTHING_COLORS, key: "clothingColor" },
};

interface AvatarGeneratorProps {
  config: AvatarConfig;
  onChange: (config: AvatarConfig) => void;
}

export function AvatarGenerator({ config, onChange }: AvatarGeneratorProps) {
  const [tab, setTab] = useState("face");

  const activeTab = TABS.find((x) => x.id === tab)!;
  const colorMap = COLOR_MAP[tab];

  const setField = (key: keyof AvatarConfig, value: string) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <div className="flex h-[620px] overflow-hidden rounded-lg">
      {/* LEFT RAIL — category tabs */}
      <div className="flex w-[140px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-border bg-muted/30 p-2">
        <div className="px-2 pb-2 pt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Parts
        </div>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
              tab === t.id
                ? "bg-background font-semibold text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
            )}
          >
            <span className="w-4 text-center font-mono text-xs">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* MIDDLE — part selection grid */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-border px-5 py-3">
          <div className="text-base font-semibold">{activeTab.label}</div>
          <div className="text-xs text-muted-foreground">
            {activeTab.parts.length} options
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2.5">
            {activeTab.parts.map((p) => {
              const selected = config[activeTab.key] === p.id;
              const preview = { ...config, [activeTab.key]: p.id };
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setField(activeTab.key, p.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border p-1.5 transition-colors",
                    selected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  )}
                >
                  <AvatarRenderer config={preview} size={64} rounded={false} />
                  <span className="text-[11px] text-muted-foreground">{p.name}</span>
                </button>
              );
            })}
          </div>

          {/* Color picker for this tab */}
          {colorMap && (
            <div className="mt-5">
              <div className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {colorMap.label}
              </div>
              <div className="flex flex-wrap gap-2">
                {colorMap.items.map((c) => {
                  const active = config[colorMap.key] === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setField(colorMap.key, c.id)}
                      title={c.name}
                      className={cn(
                        "size-8 rounded-lg transition-shadow",
                        active ? "ring-2 ring-primary ring-offset-2" : "ring-1 ring-border"
                      )}
                      style={{ backgroundColor: c.fill }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Background color — always shown */}
          <div className="mt-4">
            <div className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Background
            </div>
            <div className="flex flex-wrap gap-2">
              {BG_COLORS.map((c) => {
                const active = config.bgColor === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setField("bgColor", c.id)}
                    title={c.name}
                    className={cn(
                      "size-8 rounded-lg transition-shadow",
                      active ? "ring-2 ring-primary ring-offset-2" : "ring-1 ring-border"
                    )}
                    style={{ backgroundColor: c.fill }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT — preview + presets */}
      <div className="flex w-[260px] shrink-0 flex-col items-center gap-4 overflow-y-auto border-l border-border bg-muted/20 p-5">
        <div className="self-start text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Preview
        </div>
        <div className="rounded-full bg-background p-2 shadow-sm">
          <AvatarRenderer config={config} size={180} />
        </div>

        {/* Presets */}
        <div className="w-full border-t border-dashed border-border pt-4">
          <div className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Presets
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange(p.config)}
                title={`${p.name} · ${p.subtitle}`}
                className="flex flex-col items-center gap-0.5 rounded-lg border border-border p-1 hover:border-primary/40 transition-colors"
              >
                <AvatarRenderer config={p.config} size={36} />
                <span className="text-[9px] leading-none text-muted-foreground">{p.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Random button */}
        <button
          type="button"
          onClick={() => onChange(randomConfig())}
          className="mt-auto w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Randomize
        </button>
      </div>
    </div>
  );
}
