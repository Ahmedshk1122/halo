import { Search } from "lucide-react";
import { motion } from "motion/react";
import type { RUISketch, UIBlock } from "../../shared/visuals";
import { ICON_STROKE } from "./icons";
import { BUILD_DELAY, BUILD_STAGGER, SPRING_SOFT } from "./motion";

/** A rough app window built from a small block schema. Placeholders, not pixels. */
export function UISketch({ v }: { v: RUISketch }) {
  return (
    <div className="tpl-sketch">
      <div className="tpl-sketch-head">
        <div className="t-title">{v.title}</div>
        {v.caption && <div className="t-footnote">{v.caption}</div>}
      </div>
      <div className="tpl-sketch-window">
        <div className="tpl-sketch-bar">
          <span className="tpl-sketch-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="tpl-sketch-window-title">{v.window_title}</span>
        </div>
        <div className="tpl-sketch-body">
          {v.sidebar.length > 0 && (
            <nav className="tpl-sketch-sidebar">
              {v.sidebar.map((item, i) => (
                <div key={i} className={`tpl-sketch-nav${i === 0 ? " is-on" : ""}`}>
                  <span className="tpl-sketch-nav-icon" />
                  {item}
                </div>
              ))}
            </nav>
          )}
          <main className="tpl-sketch-main">
            {v.heading && <div className="tpl-sketch-heading">{v.heading}</div>}
            {v.blocks.map((b, i) => (
              <motion.div
                key={i}
                className={`tpl-sketch-block kind-${b.kind}${b.highlight ? " is-highlight" : ""}`}
                data-part={`block-${i}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING_SOFT, delay: BUILD_DELAY + 0.1 + i * BUILD_STAGGER * 2 }}
              >
                <Block b={b} />
              </motion.div>
            ))}
          </main>
        </div>
      </div>
    </div>
  );
}

function Block({ b }: { b: UIBlock }) {
  switch (b.kind) {
    case "grid":
      return (
        <>
          {b.label && <div className="tpl-sketch-label">{b.label}</div>}
          <div className="tpl-sketch-grid">
            {b.items.slice(0, 4).map((item, i) => (
              <div key={i} className="tpl-sketch-card">
                <div className="tpl-sketch-thumb">
                  <i />
                  <i />
                </div>
                <div className="tpl-sketch-card-title">{item}</div>
              </div>
            ))}
          </div>
        </>
      );
    case "list":
      return (
        <>
          {b.label && <div className="tpl-sketch-label">{b.label}</div>}
          <div className="tpl-sketch-list">
            {b.items.slice(0, 4).map((item, i) => (
              <div key={i} className="tpl-sketch-row">
                <span className="tpl-sketch-avatar" />
                <span className="tpl-sketch-row-text">{item}</span>
                <span className="tpl-sketch-line" />
              </div>
            ))}
          </div>
        </>
      );
    case "form":
      return (
        <>
          {b.label && <div className="tpl-sketch-label">{b.label}</div>}
          <div className="tpl-sketch-form">
            {b.items.slice(0, 3).map((item, i) => (
              <div key={i} className="tpl-sketch-field">
                <span className="tpl-sketch-field-label">{item}</span>
                <span className="tpl-sketch-input" />
              </div>
            ))}
          </div>
        </>
      );
    case "button":
      return <span className="tpl-sketch-button">{b.label}</span>;
    case "search":
      return (
        <div className="tpl-sketch-search">
          <Search size={24} strokeWidth={ICON_STROKE} aria-hidden />
          <span>{b.label || "Search"}</span>
        </div>
      );
    case "text":
      return <div className="tpl-sketch-text">{b.label}</div>;
  }
}
