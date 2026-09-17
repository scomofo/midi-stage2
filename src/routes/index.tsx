import { createFileRoute } from "@tanstack/react-router";
import { StageApp } from "@/components/stage/stage-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <StageApp />;
}
