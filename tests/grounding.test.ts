import { describe, expect, it } from "vitest";
import { scanText } from "../shared/grounding";

const ok = (s: string) => expect(scanText(s), s).toEqual([]);
const bad = (s: string) => expect(scanText(s).length, s).toBeGreaterThan(0);

describe("scanText", () => {
  it("allows months, quarters, years and small item counts", () => {
    ok("Templates in November");
    ok("Rollout by Q1 2027");
    ok("Plan for H2");
    ok("Three moves");
    ok("3 moves to fix onboarding");
    ok("Step 2: invite your team");
    ok("Ship by November 12");
    ok("FY26 plan");
    ok("Our 2nd priority");
    ok("Activation rate");
  });

  it("rejects numbers, percentages and currency", () => {
    bad("Activation up to 44%");
    bad("From 31 to 44");
    bad("Saves $2M a year");
    bad("Grew 20 percent");
    bad("2x faster setup");
    bad("Ten percent lift");
    bad("Half of users stall");
    bad("Invites after two weeks");
    bad("Revenue 1,200");
    bad("Conversion 3.5");
    bad("30-day trial");
    bad("+13 pts");
    bad("Doubled signups");
  });
});
