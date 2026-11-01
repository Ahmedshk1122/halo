import {
  Calendar,
  Check,
  Clock,
  Compass,
  Download,
  FileText,
  Flag,
  Gauge,
  Globe,
  Heart,
  Layers,
  LayoutTemplate,
  Lightbulb,
  Lock,
  Mail,
  MessageCircle,
  Plug,
  Puzzle,
  RefreshCw,
  Rocket,
  Search,
  Settings,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  UserPlus,
  Users,
  WandSparkles,
  Zap,
  type LucideIcon,
  ChartLine,
  ChartBar,
  Funnel,
  Columns2,
  ListChecks,
  Milestone,
  Workflow,
  AppWindow,
  Quote,
  Goal,
  Shapes, PenTool } from "lucide-react";
import type { IconName, TemplateId } from "../../shared/visuals";

/** Lucide at a 1.75 stroke with rounded caps matches the feel of SF Symbols. */
export const ICON_STROKE = 1.75;

const ICONS: Record<IconName, LucideIcon> = {
  "layout-template": LayoutTemplate,
  download: Download,
  "user-plus": UserPlus,
  users: Users,
  rocket: Rocket,
  target: Target,
  zap: Zap,
  sparkles: Sparkles,
  layers: Layers,
  puzzle: Puzzle,
  compass: Compass,
  gauge: Gauge,
  "trending-up": TrendingUp,
  shield: Shield,
  lock: Lock,
  clock: Clock,
  calendar: Calendar,
  check: Check,
  lightbulb: Lightbulb,
  "message-circle": MessageCircle,
  mail: Mail,
  "file-text": FileText,
  "refresh-cw": RefreshCw,
  search: Search,
  settings: Settings,
  heart: Heart,
  flag: Flag,
  globe: Globe,
  plug: Plug,
  wand: WandSparkles,
};

const TEMPLATE_ICONS: Record<TemplateId, LucideIcon> = {
  metric: Gauge,
  line: ChartLine,
  bar: ChartBar,
  funnel: Funnel,
  comparison: Columns2,
  strategy: ListChecks,
  roadmap: Milestone,
  process: Workflow,
  ui_sketch: AppWindow,
  statement: Quote,
  goal: Goal,
  diagram: Shapes,
  drawing: PenTool,
};

export function Icon({ name, size, className }: { name: IconName; size: number; className?: string }) {
  const Component = ICONS[name] ?? Sparkles;
  return <Component size={size} strokeWidth={ICON_STROKE} className={className} aria-hidden />;
}

/** An icon placed inside an SVG drawing (diagrams). */
export function SvgIcon({ name, x, y, size, color }: { name: IconName; x: number; y: number; size: number; color: string }) {
  const Component = ICONS[name] ?? Sparkles;
  return <Component x={x} y={y} width={size} height={size} strokeWidth={ICON_STROKE} color={color} aria-hidden />;
}

export function TemplateIcon({ template, size }: { template: TemplateId; size: number }) {
  const Component = TEMPLATE_ICONS[template] ?? Sparkles;
  return <Component size={size} strokeWidth={ICON_STROKE} aria-hidden />;
}
