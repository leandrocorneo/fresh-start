import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import App from "../pickem/App";
import Admin from "../pickem/components/Admin";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pick'em · PGL Major Singapore 2026" },
      {
        name: "description",
        content: "Simulador e Pick'em da galera para o PGL Major Singapore 2026.",
      },
    ],
  }),
  component: Index,
});

// O app usa localStorage e o hash da URL (#admin), então só renderiza no navegador.
function Index() {
  const [hash, setHash] = useState<string | null>(null);

  useEffect(() => {
    const read = () => setHash(window.location.hash);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  if (hash === null) {
    return <div className="min-h-screen" />;
  }
  return hash.startsWith("#admin") ? <Admin /> : <App />;
}
