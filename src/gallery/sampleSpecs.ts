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
      backdrop: "none",
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
  {
    name: "Diagram: anatomy",
    spec: {
      template: "diagram",
      title: "Where it acts",
      caption: "",
      aliases: ["body"],
      aspect: "square",
      backdrop: "human_body",
      reveal: "all",
      regions: [],
      nodes: [],
      links: [],
      paths: [],
      markers: [
        { id: "heart", label: "Heart", anchor: "heart", x: 0, y: 0, kind: "dot", tone: "highlight", cue: "" },
        { id: "lungs", label: "Lungs", anchor: "lungs", x: 0, y: 0, kind: "dot", tone: "accent", cue: "" },
        { id: "liver", label: "Liver", anchor: "liver", x: 0, y: 0, kind: "dot", tone: "accent", cue: "" },
        { id: "brain", label: "Brain", anchor: "brain", x: 0, y: 0, kind: "dot", tone: "accent", cue: "" },
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
      backdrop: "race_track",
      reveal: "all",
      regions: [],
      nodes: [],
      links: [],
      paths: [
        { id: "ham", label: "", points: [{ x: 86, y: 54 }, { x: 80, y: 46 }, { x: 71, y: 44 }], closed: false, arrow: true, tone: "accent", cue: "" },
        { id: "rival", label: "", points: [{ x: 88, y: 50 }, { x: 82, y: 49 }, { x: 74, y: 47 }], closed: false, arrow: false, tone: "muted", cue: "" },
      ],
      markers: [
        { id: "h", label: "Hamilton", anchor: "", x: 71, y: 44, kind: "car", tone: "accent", cue: "" },
        { id: "r", label: "Rival", anchor: "", x: 76, y: 50, kind: "car", tone: "muted", cue: "" },
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
