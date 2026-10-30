// The director loop. Triggers on each final speech segment, and when the
// interim transcript grows by about 12 words without a final. Only one request
// is in flight; speech that arrives meanwhile is merged into the next request.
// Decisions are grounded (data references resolved, text scanned) before
// anything reaches the stage.

import { describeCatalog } from "../../../shared/data";
import type { DirectorDecision, DirectorRequest, Proactivity, TranscriptLine, VisualRef } from "../../../shared/director";
import { prepareVisual } from "../../../shared/resolve";
import { countRevealed, wordCount } from "../../../shared/reveal";
import { revealCount, revealCues } from "../../../shared/visuals";
import type { SpeechEvent, SpeechSource, SpeechState } from "../../speech/types";
import { now } from "../../sync/channel";
import {
  clearStage,
  recallVisual,
  setReveal,
  showVisual,
  toggleExpand,
  tuckVisual,
  updateVisual,
} from "../stageActions";
import { onStageRendered } from "../stageSync";
import { store, type ControlState, type DecisionEntry, type DecisionTrigger, type VisualInstance } from "../state";
import { allVisuals, matchPrepared, matchVisual, parseCommand, type ParsedCommand } from "./commands";
import { ServerDirector, type DirectorProvider } from "./providers";

export const TRANSCRIPT_WINDOW_SEC = 60;
export const INTERIM_TRIGGER_WORDS = 12;
export const SPACING_SEC: Record<Proactivity, number> = { quiet: 10, balanced: 6, eager: 4 };
/** Director visuals: items already said are revealed by this time even if cues were paraphrased. */
const DIRECTOR_REVEAL_GRACE_MS = 3000;
/** Prepared visuals: reveal the next item after this many words without a cue match. */
const PREPARED_REVEAL_WORDS = 40;

interface Trigger {
  trigger: DecisionTrigger;
  speechEndAt: number;
  request: string | null;
}

let catalogFor: ControlState["tables"] | null = null;
let catalogCache = "";
function catalogText(tables: ControlState["tables"]): string {
  if (tables !== catalogFor) {
    catalogFor = tables;
    catalogCache = describeCatalog(tables);
  }
  return catalogCache;
}

class Director {
  private provider: DirectorProvider = new ServerDirector();
  private source: SpeechSource | null = null;
  private unsubs: (() => void)[] = [];
  private inFlight = false;
  private pending: Trigger | null = null;
  /** Transcript entries with a larger id are "just said". */
  private decidedThrough = 0;
  private interimWordsAtTrigger = 0;
  private nextTranscriptId = 1;
  private nextDecisionId = 1;
  private deferred: { timer: number; logId: number } | null = null;
  private latencyFor = new Map<string, number>();
  private revealTimer = 0;
  /** Bumped by reset(), so answers to requests from before a reset are ignored. */
  private generation = 0;

  constructor() {
    onStageRendered((id, at) => this.onRendered(id, at, "stage"));
    this.revealTimer = window.setInterval(() => this.updateReveals(), 400);
  }

  setProvider(p: DirectorProvider) {
    this.provider = p;
  }

  get providerName() {
    return this.provider.name;
  }

  // -------------------------------------------------------------------------
  // Speech input
  // -------------------------------------------------------------------------

  attach(source: SpeechSource) {
    this.detach();
    this.source = source;
    store.set({ speech: { status: "starting", source: source.kind } });
    this.unsubs = [
      source.onEvent((e) => this.onSpeech(e)),
      source.onState((status: SpeechState, detail?: string) => store.set({ speech: { status, detail, source: source.kind } })),
    ];
    source.start();
  }

  detach() {
    this.source?.stop();
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.source = null;
    store.set({ interim: null, speech: { status: "idle", source: null } });
  }

  get attachedKind() {
    return this.source?.kind ?? null;
  }

  /** Feed speech directly (used by tests and the typed-input fallback). */
  onSpeech(e: SpeechEvent) {
    if (e.type === "interim") {
      store.set({ interim: { text: e.text, at: e.at, label: e.label } });
      this.updateReveals();
      if (wordCount(e.text) - this.interimWordsAtTrigger >= INTERIM_TRIGGER_WORDS) {
        this.interimWordsAtTrigger = wordCount(e.text);
        this.schedule({ trigger: "interim", speechEndAt: e.at, request: null });
      }
      return;
    }
    const id = this.nextTranscriptId++;
    const parsed = parseCommand(e.text);
    store.set((s) => ({
      interim: null,
      transcript: [...s.transcript, { id, text: e.text, at: e.at, startedAt: e.startedAt, label: e.label }].slice(-400),
    }));
    this.interimWordsAtTrigger = 0;
    this.updateReveals();
    if (parsed && this.runCommand(parsed, id, e)) return;
    this.schedule({ trigger: "final", speechEndAt: e.at, request: null });
  }

  // -------------------------------------------------------------------------
  // Scheduling: one request in flight, later speech merged into the next one
  // -------------------------------------------------------------------------

  private schedule(t: Trigger) {
    if (this.inFlight) {
      this.pending = {
        trigger: this.pending?.trigger === "request" || t.trigger === "request" ? "request" : t.trigger === "final" || this.pending?.trigger === "final" ? "final" : "interim",
        speechEndAt: Math.max(t.speechEndAt, this.pending?.speechEndAt ?? 0),
        request: t.request ?? this.pending?.request ?? null,
      };
      return;
    }
    void this.run(t);
  }

  private async run(t: Trigger) {
    this.inFlight = true;
    store.set((s) => ({ director: { ...s.director, inFlight: true } }));
    const { req, newThrough, said, label, cueFrom } = this.buildRequest(t.request);
    const logId = this.log({
      trigger: t.trigger,
      source: this.provider.name,
      action: "none",
      outcome: "pending",
      reason: "",
      beat: store.get().arc.beat,
      said,
      label,
      speechEndAt: t.speechEndAt,
    });
    const sentAt = now();
    const generation = this.generation;
    try {
      const res = await this.provider.decide(req);
      if (generation !== this.generation) return;
      this.patchLog(logId, { requestMs: Math.round(now() - sentAt), modelMs: res.timing.modelMs, model: res.model });
      this.decidedThrough = Math.max(this.decidedThrough, newThrough);
      this.apply(res.decision, { logId, speechEndAt: t.speechEndAt, explicit: t.trigger === "request", cueFrom });
    } catch (err) {
      if (generation !== this.generation) return;
      this.decidedThrough = Math.max(this.decidedThrough, newThrough);
      this.patchLog(logId, { action: "error", outcome: "error", reason: (err as Error).message, requestMs: Math.round(now() - sentAt) });
    } finally {
      this.inFlight = false;
      store.set((s) => ({ director: { ...s.director, inFlight: false } }));
      const next = this.pending;
      this.pending = null;
      if (next) void this.run(next);
    }
  }

  /** Show a visual prepared from talk notes right away (panel button or voice command). */
  showPrepared(id: string, reason: string, from?: { trigger: DecisionTrigger; said: string; label?: string; speechEndAt: number }) {
    const t = now();
    const logId = this.log({
      trigger: from?.trigger ?? "request",
      source: "command",
      action: "show",
      outcome: "pending",
      reason,
      beat: store.get().arc.beat,
      said: from?.said ?? "",
      label: from?.label,
      speechEndAt: from?.speechEndAt ?? t,
    });
    const s = store.get();
    this.apply(
      { action: "show", reason, beat: s.arc.beat, arc: s.arc.summary, targetIds: [], tuckIds: [], preparedId: id, visual: null },
      { logId, speechEndAt: from?.speechEndAt ?? t, explicit: true, cueFrom: (from?.speechEndAt ?? t) - 15_000 },
    );
  }

  /** Ask the director for something specific (from a voice command or the panel). */
  request(text: string) {
    this.schedule({ trigger: "request", speechEndAt: now(), request: text });
  }

  // -------------------------------------------------------------------------
  // Request context
  // -------------------------------------------------------------------------

  private buildRequest(request: string | null) {
    const s = store.get();
    const t = now();
    const recent = s.transcript.filter((l) => t - l.at <= TRANSCRIPT_WINDOW_SEC * 1000);
    const lines: TranscriptLine[] = recent.map((l) => ({
      text: l.text,
      ageSec: (t - l.at) / 1000,
      isNew: l.id > this.decidedThrough,
      ...(l.command ? { handled: l.command } : {}),
    }));
    if (s.interim) lines.push({ text: s.interim.text, ageSec: 0, isNew: true, interim: true });
    const fresh = recent.filter((l) => l.id > this.decidedThrough);
    const said = [...fresh.map((l) => l.text), s.interim?.text ?? ""].filter(Boolean).join(" ");
    const label = s.interim?.label ?? (fresh.length ? fresh[fresh.length - 1].label : s.transcript[s.transcript.length - 1]?.label);
    const firstNew = fresh[0]?.startedAt ?? s.interim?.at ?? t;

    const ref = (v: VisualInstance): VisualRef => {
      const total = revealCount(v.visual);
      return {
        id: v.id,
        template: v.visual.template,
        title: v.title,
        ageSec: (t - v.shownAt) / 1000,
        ...(total ? { reveal: `${v.reveal} of ${total}` } : {}),
      };
    };
    const onScreen = s.onStage.map((id) => s.visuals[id]).filter(Boolean);
    const chips = s.chips.map((id) => s.visuals[id]).filter(Boolean);
    const history = Object.values(s.visuals)
      .filter((v) => v.status === "cleared" && v.source !== "test")
      .slice(-10)
      .map((v) => ({ ...ref(v), status: "cleared" }));

    const req: DirectorRequest = {
      arc: s.arc.summary,
      beat: s.arc.beat,
      transcript: lines,
      onScreen: onScreen.map(ref),
      chips: chips.map(({ id, visual, title }) => ({ id, template: visual.template, title })),
      history,
      secondsSinceLastShow: s.director.lastShowAt === null ? null : (t - s.director.lastShowAt) / 1000,
      catalog: catalogText(s.tables),
      prepared: s.prepared.filter((p) => p.visual).map((p) => ({ id: p.id, template: p.template, title: p.title, when: p.when })),
      proactivity: s.director.proactivity,
      request,
    };
    const newThrough = recent.length ? recent[recent.length - 1].id : this.decidedThrough;
    return { req, newThrough, said, label, cueFrom: firstNew - 15_000 };
  }

  // -------------------------------------------------------------------------
  // Applying decisions
  // -------------------------------------------------------------------------

  private apply(d: DirectorDecision, ctx: { logId: number; speechEndAt: number; explicit: boolean; cueFrom: number }) {
    this.updateArc(d);
    const s = store.get();
    const base = { action: d.action, reason: d.reason, beat: d.beat };

    switch (d.action) {
      case "none":
        this.patchLog(ctx.logId, { ...base, outcome: "none" });
        return;
      case "clear":
        this.cancelDeferred();
        clearStage();
        this.patchLog(ctx.logId, { ...base, outcome: "applied", onScreenMs: Math.round(now() - ctx.speechEndAt) });
        return;
      case "tuck": {
        const ids = d.targetIds.filter((id) => s.onStage.includes(id));
        ids.forEach(tuckVisual);
        this.patchLog(ctx.logId, { ...base, outcome: ids.length ? "applied" : "none", errors: ids.length ? undefined : ["Nothing on screen to tuck"] });
        return;
      }
      case "recall": {
        const v = s.visuals[d.targetIds[0] ?? ""];
        if (!v) {
          this.patchLog(ctx.logId, { ...base, outcome: "dropped", errors: [`Unknown visual ${d.targetIds[0] ?? ""}`] });
          return;
        }
        this.recall(v, ctx.logId, ctx.speechEndAt);
        this.patchLog(ctx.logId, { ...base });
        return;
      }
      case "update": {
        const target = s.visuals[d.targetIds[0] ?? ""];
        if (!target || !d.visual) {
          // An update to something we no longer have: treat it as a new visual.
          this.apply({ ...d, action: "show", targetIds: [] }, ctx);
          return;
        }
        const r = prepareVisual(d.visual, s.tables);
        if (!r.ok) {
          this.patchLog(ctx.logId, { ...base, outcome: "dropped", errors: r.errors, title: d.visual.title, template: d.visual.template });
          return;
        }
        if (target.status !== "onscreen") recallVisual(target.id);
        updateVisual(target.id, r.visual, r.spec);
        store.set((st) => ({
          visuals: { ...st.visuals, [target.id]: { ...st.visuals[target.id], revealDeadline: now() + DIRECTOR_REVEAL_GRACE_MS, aliases: r.spec.aliases } },
        }));
        this.updateReveals();
        requestAnimationFrame(() =>
          this.patchLog(ctx.logId, { ...base, outcome: "applied", visualId: target.id, title: r.visual.title, template: r.visual.template, onScreenMs: Math.round(now() - ctx.speechEndAt) }),
        );
        return;
      }
      case "show": {
        const prepared = d.preparedId ? s.prepared.find((p) => p.id === d.preparedId) : null;
        const spec = prepared ? prepared.spec : d.visual;
        if (!spec) {
          this.patchLog(ctx.logId, { ...base, outcome: "dropped", errors: [d.preparedId ? `Unknown prepared visual ${d.preparedId}` : "No visual in the decision"] });
          return;
        }
        const r = prepareVisual(spec, s.tables);
        if (!r.ok) {
          this.patchLog(ctx.logId, { ...base, outcome: "dropped", errors: r.errors, title: spec.title, template: spec.template });
          return;
        }
        // Never duplicate: an identical visual on screen is a no-op, a tucked one is recalled.
        const same = allVisuals(s).find((v) => v.visual.template === r.visual.template && v.title.toLowerCase() === r.visual.title.toLowerCase());
        if (same && same.status === "onscreen") {
          this.patchLog(ctx.logId, { ...base, outcome: "none", visualId: same.id, title: same.title, template: same.visual.template, errors: ["Already on screen"] });
          return;
        }
        if (same) {
          this.recall(same, ctx.logId, ctx.speechEndAt);
          this.patchLog(ctx.logId, { ...base, action: "recall" });
          return;
        }
        const doShow = () => {
          this.deferred = null;
          const st = store.get();
          const tuck = d.tuckIds.filter((id) => st.onStage.includes(id));
          const id = showVisual(r.visual, {
            spec: r.spec,
            source: prepared ? "prepared" : "director",
            beat: d.beat,
            aliases: r.spec.aliases,
            tuck,
            cueFrom: ctx.cueFrom,
            revealDeadline: prepared ? null : now() + DIRECTOR_REVEAL_GRACE_MS,
          });
          store.set((x) => ({ director: { ...x.director, lastShowAt: now() } }));
          this.addVisualToBeat(id);
          this.latencyFor.set(id, ctx.logId);
          this.patchLog(ctx.logId, { ...base, outcome: "applied", visualId: id, title: r.visual.title, template: r.visual.template });
          this.updateReveals();
          if (!store.get().stage.connected) requestAnimationFrame(() => this.onRendered(id, now(), "preview"));
        };
        const spacing = SPACING_SEC[s.director.proactivity] * 1000;
        const wait = s.director.lastShowAt === null || ctx.explicit ? 0 : spacing - (now() - s.director.lastShowAt);
        this.cancelDeferred();
        if (wait > 0) {
          this.patchLog(ctx.logId, { ...base, outcome: "deferred", title: r.visual.title, template: r.visual.template, errors: [`Waiting ${(wait / 1000).toFixed(1)}s to keep visuals spaced`] });
          this.deferred = { logId: ctx.logId, timer: window.setTimeout(doShow, wait) };
        } else {
          doShow();
        }
        return;
      }
    }
  }

  private recall(v: VisualInstance, logId: number, speechEndAt: number) {
    if (v.status === "onscreen") {
      this.patchLog(logId, { outcome: "none", visualId: v.id, title: v.title, template: v.visual.template, errors: ["Already on screen"] });
      return;
    }
    recallVisual(v.id);
    this.latencyFor.set(v.id, logId);
    this.patchLog(logId, { outcome: "applied", visualId: v.id, title: v.title, template: v.visual.template, speechEndAt });
    if (!store.get().stage.connected) requestAnimationFrame(() => this.onRendered(v.id, now(), "preview"));
  }

  private cancelDeferred() {
    if (!this.deferred) return;
    window.clearTimeout(this.deferred.timer);
    this.patchLog(this.deferred.logId, { outcome: "superseded" });
    this.deferred = null;
  }

  private onRendered(id: string, at: number, from: "stage" | "preview") {
    const logId = this.latencyFor.get(id);
    if (logId === undefined) return;
    if (from === "preview" && store.get().stage.connected) return;
    this.latencyFor.delete(id);
    const entry = store.get().decisions.find((d) => d.id === logId);
    if (entry) this.patchLog(logId, { onScreenMs: Math.round(at - entry.speechEndAt) });
  }

  // -------------------------------------------------------------------------
  // Voice commands
  // -------------------------------------------------------------------------

  /** Returns true if the segment was a command and fully handled. */
  private runCommand(p: ParsedCommand, transcriptId: number, e: Extract<SpeechEvent, { type: "final" }>): boolean {
    const s = store.get();
    const visuals = allVisuals(s).filter((v) => v.source !== "test");
    const logBase = { trigger: "command" as const, source: "command" as const, beat: s.arc.beat, said: e.text, label: e.label, speechEndAt: e.at };
    const mark = (label: string) =>
      store.set((st) => ({ transcript: st.transcript.map((l) => (l.id === transcriptId ? { ...l, command: label } : l)) }));
    const c = p.command;

    switch (c.kind) {
      case "clear": {
        this.cancelDeferred();
        clearStage();
        mark("clear");
        this.log({ ...logBase, action: "clear", outcome: "applied", reason: "You asked Halo to clear the stage", onScreenMs: Math.round(now() - e.at) });
        return true;
      }
      case "back":
      case "recall": {
        const target =
          c.kind === "back"
            ? (s.chips.length ? s.visuals[s.chips[s.chips.length - 1]] : visuals.find((v) => v.status !== "onscreen")) ?? null
            : matchVisual(c.query, visuals);
        if (!target) {
          if (!p.addressed) return false; // "let's go back to ..." with nothing to recall is just speech
          mark("nothing to recall");
          this.log({ ...logBase, action: "recall", outcome: "dropped", reason: "Nothing matched what you asked to go back to", errors: [c.kind === "recall" ? c.query : "no earlier visual"] });
          return true;
        }
        mark(`recall ${target.id}`);
        const logId = this.log({ ...logBase, action: "recall", outcome: "pending", reason: `You asked to go back to ${target.title}` });
        this.recall(target, logId, e.at);
        return true;
      }
      case "show": {
        const existing = matchVisual(c.query, visuals);
        if (existing) {
          mark(`recall ${existing.id}`);
          const logId = this.log({ ...logBase, action: "recall", outcome: "pending", reason: `You asked for ${existing.title}` });
          this.recall(existing, logId, e.at);
          return true;
        }
        const prepared = matchPrepared(c.query, s.prepared);
        if (prepared) {
          mark(`show ${prepared.id}`);
          this.showPrepared(prepared.id, `You asked for ${prepared.title}`, { trigger: "command", said: e.text, label: e.label, speechEndAt: e.at });
          return true;
        }
        mark("request");
        // Not on hand: ask the director to build it now, regardless of pacing.
        this.request(`${c.query}`);
        return true;
      }
      case "hide": {
        const onScreen = s.onStage.map((id) => s.visuals[id]).filter(Boolean);
        const targets = c.query ? [matchVisual(c.query, onScreen)].filter((v): v is VisualInstance => !!v) : onScreen;
        targets.forEach((v) => tuckVisual(v.id));
        mark("tuck");
        this.log({ ...logBase, action: "tuck", outcome: targets.length ? "applied" : "none", reason: "You asked Halo to put it away" });
        return true;
      }
      case "expand":
      case "collapse": {
        const onScreen = s.onStage.map((id) => s.visuals[id]).filter(Boolean);
        const target = (c.query ? matchVisual(c.query, onScreen) : null) ?? onScreen[onScreen.length - 1];
        if (target && target.expanded === (c.kind === "collapse")) toggleExpand(target.id);
        mark(c.kind);
        this.log({ ...logBase, action: "update", outcome: target ? "applied" : "none", reason: `You asked to ${c.kind} it`, visualId: target?.id, title: target?.title });
        return true;
      }
      case "next": {
        const target = s.onStage.map((id) => s.visuals[id]).find((v) => v && v.reveal < revealCount(v.visual));
        if (target) setReveal(target.id, target.reveal + 1);
        mark("next");
        this.log({ ...logBase, action: "update", outcome: target ? "applied" : "none", reason: "You asked for the next item", visualId: target?.id, title: target?.title });
        return true;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Speech-synced reveal
  // -------------------------------------------------------------------------

  updateReveals() {
    const s = store.get();
    const t = now();
    for (const id of s.onStage) {
      const v = s.visuals[id];
      if (!v) continue;
      const total = revealCount(v.visual);
      if (total === 0) continue;
      const spoken = [...s.transcript.filter((l) => l.at >= v.cueFrom).map((l) => l.text), s.interim?.text ?? ""].join(" ");
      let n = countRevealed(revealCues(v.visual), spoken);
      if (v.revealDeadline !== null && t >= v.revealDeadline) n = total;
      const spokenWords = wordCount(spoken);
      if (v.source === "prepared" && v.reveal < total && v.reveal > 0 && spokenWords - v.wordsAtReveal >= PREPARED_REVEAL_WORDS) {
        n = Math.max(n, v.reveal + 1);
      }
      n = Math.min(total, Math.max(n, v.reveal));
      if (n !== v.reveal) {
        setReveal(id, n);
        store.set((st) => ({ visuals: { ...st.visuals, [id]: { ...st.visuals[id], wordsAtReveal: spokenWords } } }));
      }
    }
  }

  // -------------------------------------------------------------------------
  // Arc and log
  // -------------------------------------------------------------------------

  private updateArc(d: DirectorDecision) {
    store.set((s) => {
      const beat = d.beat.trim() || s.arc.beat;
      const beats = beat && beat.toLowerCase() !== s.arc.beat.toLowerCase() ? [...s.arc.beats, { name: beat, at: now(), visualIds: [] }] : s.arc.beats;
      return { arc: { summary: d.arc.trim() || s.arc.summary, beat, beats } };
    });
  }

  private addVisualToBeat(id: string) {
    store.set((s) => {
      if (s.arc.beats.length === 0) return { arc: { ...s.arc, beats: [{ name: s.arc.beat || "Opening", at: now(), visualIds: [id] }] } };
      const beats = s.arc.beats.slice();
      const last = beats[beats.length - 1];
      beats[beats.length - 1] = { ...last, visualIds: [...last.visualIds, id] };
      return { arc: { ...s.arc, beats } };
    });
  }

  private log(entry: Omit<DecisionEntry, "id" | "at">): number {
    const id = this.nextDecisionId++;
    store.set((s) => ({ decisions: [...s.decisions, { id, at: now(), ...entry }].slice(-300) }));
    return id;
  }

  private patchLog(id: number, patch: Partial<DecisionEntry>) {
    store.set((s) => ({ decisions: s.decisions.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
  }

  /** Start over: transcript, arc, decisions and stage. Data and notes are kept. */
  reset() {
    this.generation += 1;
    this.cancelDeferred();
    this.pending = null;
    this.decidedThrough = 0;
    this.interimWordsAtTrigger = 0;
    this.latencyFor.clear();
    clearStage();
    store.set((s) => ({
      transcript: [],
      interim: null,
      decisions: [],
      arc: { summary: "", beat: "", beats: [] },
      director: { ...s.director, lastShowAt: null },
      visuals: {},
      onStage: [],
      chips: [],
      nextVisualNumber: 1,
    }));
  }

  dispose() {
    window.clearInterval(this.revealTimer);
    this.detach();
  }
}

export const director = new Director();
