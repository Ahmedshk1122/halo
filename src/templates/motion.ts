// Motion tokens. Springs everywhere, no bounce, exits quicker than entrances.
import type { Transition } from "motion/react";

export const SPRING: Transition = { type: "spring", stiffness: 260, damping: 30, mass: 1 };
/** Slightly softer spring for content that follows the card in (reveals, rings). */
export const SPRING_SOFT: Transition = { type: "spring", stiffness: 200, damping: 30, mass: 1 };
export const EXIT: Transition = { duration: 0.2, ease: [0.4, 0, 1, 1] };
export const TUCK: Transition = { duration: 0.34, ease: [0.32, 0, 0.24, 1] };

export const ENTER_FROM = { opacity: 0, scale: 0.96 };
export const ENTER_BLUR = "blur(14px)";

/** Stagger for elements that build in after the card (chart bars, list rows). */
export const BUILD_DELAY = 0.12;
export const BUILD_STAGGER = 0.06;
