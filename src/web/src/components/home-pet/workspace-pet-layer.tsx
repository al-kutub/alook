"use client";

import { type RefObject } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

import { useHomePetSettings } from "@/lib/home-pet-settings";
import type { CloudCodeMonsterPetProps } from "./cloud-code-monster-pet";

const CloudCodeMonsterPet = dynamic<CloudCodeMonsterPetProps>(
  () =>
    import("./cloud-code-monster-pet").then(
      (module) => module.CloudCodeMonsterPet
    ),
  { ssr: false }
);

type WorkspacePetLayerProps = {
  boundaryRef: RefObject<HTMLElement | null>;
  slug: string;
};

export function WorkspacePetLayer({ boundaryRef, slug }: WorkspacePetLayerProps) {
  const pathname = usePathname();
  const petSettings = useHomePetSettings();
  const isHome = pathname === `/w/${slug}/home`;

  if (
    !petSettings.enabled ||
    petSettings.displayScope !== "global" ||
    isHome
  ) {
    return null;
  }

  return <CloudCodeMonsterPet boundaryRef={boundaryRef} activityTriggerMode="global" />;
}
