import { ConfigMissing, configureSupabase, isSupabaseConfigured } from "@hc/shared";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

const root = createRoot(document.getElementById("root")!);
let problem: string | null = null;
try {
  configureSupabase("livreur");
} catch (error) {
  problem = (error as Error).message;
}

root.render(
  <StrictMode>
    {problem ? (
      <p role="alert" className="m-6 rounded-xl bg-red-600 p-4 font-bold text-white">{problem}</p>
    ) : isSupabaseConfigured ? (
      <App />
    ) : (
      <ConfigMissing app="Houcine Chapati — Livreur" />
    )}
  </StrictMode>,
);
