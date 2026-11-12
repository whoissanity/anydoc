"use client";

import LandingWorkspace from "@/components/workspaces/LandingWorkspace";

export function Welcome({ onOpen, onCreate }: { onOpen: () => void; onCreate: () => void }) {
  return <LandingWorkspace onOpenFile={onOpen} onCreate={() => onCreate()} />;
}
