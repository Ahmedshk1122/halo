// Specs for /gallery. They go through the same resolver and grounding check as
// the director's output, so a broken sample shows up here first.
import type { VisualSpec } from "../../shared/visuals";

const none = { match_column: "", match_value: "" };

export const SAMPLE_SPECS: { name: string; spec: VisualSpec; reveal?: number; said?: string }[] = [
  {
    name: "Metric card",
    spec: {
      template: "metric",
      title: "Activation rate",
      caption: "Weekly, this quarter",
      aliases: ["activation"],
      value: { table: "q3_metrics", column: "activation_rate", pick: "last", ...none },
      baseline: { table: "q3_metrics", column: "activation_rate", pick: "first", ...none },
      trend: { table: "q3_metrics", x: "week", y: "activation_rate", filter_column: "", filter_value: "" },
      good_direction: "up",
    },
  },
  {
    name: "Line chart",
    spec: {
      template: "line",
      title: "Activation rate",
      subtitle: "Weekly, this quarter",
      aliases: ["activation trend"],
      series: { table: "q3_metrics", x: "week", y: "activation_rate", filter_column: "", filter_value: "" },
    },
  },
  {
    name: "Bar chart",
    spec: {
      template: "bar",
      title: "Where people reach",
      subtitle: "Share of sign-ups at each step",
      aliases: [],
      series: { table: "onboarding_funnel", x: "step", y: "share_of_signups", filter_column: "", filter_value: "" },
      highlight_label: "Set up workspace",
    },
  },
  {
    name: "Funnel",
    spec: {
      template: "funnel",
      title: "Onboarding funnel",
      subtitle: "Share of sign-ups reaching each step",
      aliases: ["funnel", "drop-off"],
      steps: { table: "onboarding_funnel", x: "step", y: "share_of_signups", filter_column: "", filter_value: "" },
      highlight_step: "Set up workspace",
    },
  },
  {
    name: "Comparison",
    spec: {
      template: "comparison",
      title: "First run, before and after",
      aliases: [],
      a: { label: "Blank workspace", value: { table: "", column: "", pick: "none", ...none }, points: ["Empty page on arrival", "Invite step comes first", "Setup by hand"] },
      b: { label: "Templates first", value: { table: "", column: "", pick: "none", ...none }, points: ["Pick a ready-made template", "Invite once there is work", "Import from existing tools"] },
      favor: "b",
    },
  },
  {
    name: "Strategy card",
    reveal: 2,
    spec: {
      template: "strategy",
      title: "Three moves",
      aliases: ["moves", "plan"],
      reveal: "progressive",
      points: [
        { icon: "layout-template", text: "Templates, not a blank page", detail: "Start from something that works", cue: "templates blank page" },
        { icon: "download", text: "Import from existing tools", detail: "Bring your work with you", cue: "imports existing tools" },
        { icon: "user-plus", text: "Invite later, not first", detail: "Once there is something to share", cue: "invites later" },
      ],
    },
  },
  {
    name: "Roadmap",
    spec: {
      template: "roadmap",
      title: "Rollout",
      aliases: ["roadmap", "timeline"],
      reveal: "all",
      items: [
        { when: "November", label: "Templates", detail: "Ready-made workspaces", cue: "templates november" },
        { when: "December", label: "Imports", detail: "From the tools teams use", cue: "imports december" },
        { when: "January", label: "Invites later", detail: "After the first project", cue: "invites january" },
      ],
    },
  },
  {
    name: "Process flow",
    spec: {
      template: "process",
      title: "New first run",
      aliases: ["flow"],
      reveal: "all",
      steps: [
        { icon: "sparkles", label: "Sign up", detail: "Email or SSO", cue: "sign up" },
        { icon: "layout-template", label: "Pick a template", detail: "Or import", cue: "template" },
        { icon: "rocket", label: "First project", detail: "Live in minutes", cue: "first project" },
        { icon: "user-plus", label: "Invite the team", detail: "When it is useful", cue: "invite" },
      ],
    },
  },
  {
    name: "UI sketch",
    spec: {
      template: "ui_sketch",
      title: "Templates on first open",
      caption: "What a new workspace looks like",
      aliases: ["templates screen", "sketch"],
      window_title: "New workspace",
      sidebar: ["Home", "Projects", "Templates", "Settings"],
      heading: "Start with a template",
      blocks: [
        { kind: "grid", label: "Popular", items: ["Product roadmap", "Sprint planning", "Team wiki", "Launch plan"], highlight: true },
        { kind: "button", label: "Start from scratch", items: [], highlight: false },
      ],
    },
  },
  {
    name: "From → to",
    said: "We're at $100,000 in revenue today, and we want to be at $200,000 next year.",
    spec: {
      template: "goal",
      title: "Revenue",
      aliases: ["revenue", "target"],
      from: { table: "", column: "", pick: "said", ...none, said_value: 100000, said_unit: "currency", said_currency: "$", said_label: "Revenue today" },
      to: { table: "", column: "", pick: "said", ...none, said_value: 200000, said_unit: "currency", said_currency: "$", said_label: "Revenue target" },
      from_label: "Today",
      to_label: "Next year",
      good_direction: "up",
    },
  },
  {
    name: "Diagram: target segments",
    spec: {
      template: "diagram",
      title: "Who we target first",
      caption: "Segments by team size and tool maturity",
      aliases: ["segments", "targets"],
      aspect: "square",
      reveal: "all",
      regions: [
        { label: "Small teams", x: 2, y: 2, w: 47, h: 47, shape: "rect", tone: "accent", cue: "" },
        { label: "Mid-market", x: 51, y: 2, w: 47, h: 47, shape: "rect", tone: "neutral", cue: "" },
        { label: "Agencies", x: 2, y: 51, w: 47, h: 47, shape: "rect", tone: "neutral", cue: "" },
        { label: "Enterprise", x: 51, y: 51, w: 47, h: 47, shape: "rect", tone: "muted", cue: "" },
      ],
      nodes: [
        { id: "now", label: "Now", detail: "Design studios", x: 25, y: 28, w: 0, h: 0, shape: "pill", tone: "accent", icon: "target", cue: "" },
        { id: "next", label: "Next", detail: "Ops teams", x: 75, y: 28, w: 0, h: 0, shape: "pill", tone: "neutral", icon: "rocket", cue: "" },
        { id: "later", label: "Later", detail: "Agencies", x: 25, y: 77, w: 0, h: 0, shape: "pill", tone: "neutral", icon: "users", cue: "" },
      ],
      links: [
        { from: "now", to: "next", label: "", style: "arrow", tone: "accent", cue: "" },
        { from: "next", to: "later", label: "", style: "dashed", tone: "neutral", cue: "" },
      ],
      paths: [],
      markers: [],
    },
  },
  // Drawn the way the model draws them: outlines from points, nothing pre-made.
  {
    name: "Diagram: anatomy",
    spec: {
      template: "diagram",
      title: "Where it acts",
      caption: "",
      aliases: ["body"],
      aspect: "square",
      reveal: "all",
      regions: [],
      nodes: [],
      links: [],
      paths: [
        {
          id: "head",
          label: "",
          points: [{ x: 50, y: 4 }, { x: 57, y: 9 }, { x: 57, y: 17 }, { x: 50, y: 22 }, { x: 43, y: 17 }, { x: 43, y: 9 }],
          closed: true,
          filled: true,
          weight: "thin",
          arrow: false,
          tone: "muted",
          cue: "",
        },
        {
          id: "body",
          label: "",
          points: [
            { x: 46, y: 23 }, { x: 54, y: 23 }, { x: 66, y: 28 }, { x: 70, y: 52 }, { x: 66, y: 53 }, { x: 62, y: 36 },
            { x: 61, y: 60 }, { x: 60, y: 95 }, { x: 54, y: 95 }, { x: 50, y: 64 }, { x: 46, y: 95 }, { x: 40, y: 95 },
            { x: 39, y: 60 }, { x: 38, y: 36 }, { x: 34, y: 53 }, { x: 30, y: 52 }, { x: 34, y: 28 },
          ],
          closed: true,
          filled: true,
          weight: "thin",
          arrow: false,
          tone: "muted",
          cue: "",
        },
      ],
      markers: [
        { id: "brain", label: "Brain", x: 50, y: 11, kind: "dot", tone: "accent", cue: "" },
        { id: "heart", label: "Heart", x: 53, y: 34, kind: "dot", tone: "highlight", cue: "" },
        { id: "lungs", label: "Lungs", x: 45, y: 33, kind: "dot", tone: "accent", cue: "" },
        { id: "liver", label: "Liver", x: 45, y: 44, kind: "dot", tone: "accent", cue: "" },
      ],
    },
  },
  {
    name: "Diagram: overtake",
    spec: {
      template: "diagram",
      title: "The move into turn three",
      caption: "Late braking on the inside",
      aliases: ["overtake", "race"],
      aspect: "wide",
      reveal: "all",
      regions: [],
      nodes: [],
      links: [],
      paths: [
        {
          id: "track",
          label: "",
          points: [
            { x: 12, y: 80 }, { x: 60, y: 80 }, { x: 84, y: 72 }, { x: 88, y: 55 }, { x: 78, y: 46 }, { x: 70, y: 36 },
            { x: 74, y: 18 }, { x: 58, y: 10 }, { x: 46, y: 24 }, { x: 28, y: 22 }, { x: 10, y: 38 }, { x: 8, y: 62 },
          ],
          closed: true,
          filled: false,
          weight: "thick",
          arrow: false,
          tone: "neutral",
          cue: "",
        },
        { id: "ham", label: "", points: [{ x: 86, y: 64 }, { x: 84, y: 52 }, { x: 76, y: 44 }], closed: false, filled: false, weight: "normal", arrow: true, tone: "accent", cue: "" },
        { id: "rival", label: "", points: [{ x: 89, y: 60 }, { x: 87, y: 52 }, { x: 81, y: 48 }], closed: false, filled: false, weight: "thin", arrow: false, tone: "muted", cue: "" },
      ],
      markers: [
        { id: "h", label: "Hamilton", x: 76, y: 44, kind: "car", tone: "accent", cue: "" },
        { id: "r", label: "Rival", x: 81, y: 49, kind: "car", tone: "muted", cue: "" },
      ],
    },
  },
  {
    name: "Statement",
    spec: {
      template: "statement",
      title: "The ask",
      kicker: "The ask",
      text: "Back the plan and help us ship templates in November",
      aliases: ["ask"],
    },
  },
];
