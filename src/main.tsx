import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import "./styles/stage.css";
import "./styles/templates.css";
import "./styles/control.css";
import "./styles/gallery.css";
import { ControlApp } from "./control/ControlApp";
import { StageApp } from "./stage/StageApp";

// Three routes, one bundle:
//   /stage    the clean window OBS captures
//   /control  the presenter panel (also served at /)
//   /gallery  every template with sample data, for design work
const path = window.location.pathname.replace(/\/+$/, "") || "/";

async function root() {
  if (path === "/stage") return <StageApp />;
  if (path === "/gallery") {
    const { GalleryApp } = await import("./gallery/GalleryApp");
    return <GalleryApp />;
  }
  return <ControlApp />;
}

void root().then((el) => {
  createRoot(document.getElementById("root")!).render(<StrictMode>{el}</StrictMode>);
});
