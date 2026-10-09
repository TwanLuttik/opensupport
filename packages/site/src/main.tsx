import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { currentDocSlug, Docs } from "./docs";
import "./styles.css";

function Root() {
  const [doc, setDoc] = useState<string | null>(() => currentDocSlug());

  useEffect(() => {
    const sync = () => setDoc(currentDocSlug());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return doc ? <Docs slug={doc} /> : <App />;
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
