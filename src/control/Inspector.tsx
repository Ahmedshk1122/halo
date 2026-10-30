import { useState } from "react";
import { Empty, Segmented } from "./ui/controls";

type Tab = "transcript" | "decisions" | "arc";

/** Right-hand inspector: transcript, Halo's decision log, and the arc of the talk. Presenter only. */
export function Inspector() {
  const [tab, setTab] = useState<Tab>("decisions");
  return (
    <aside className="ctl-inspector">
      <div className="ctl-inspector-head">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          label="Inspector"
          options={[
            { value: "transcript", label: "Transcript" },
            { value: "decisions", label: "Decisions" },
            { value: "arc", label: "Arc" },
          ]}
        />
      </div>
      <div className="ctl-inspector-body">
        {tab === "transcript" && <Empty title="No speech yet">Only you can see the transcript.</Empty>}
        {tab === "decisions" && <Empty title="No decisions yet">Halo logs every decision here, with its reason and latency.</Empty>}
        {tab === "arc" && <Empty title="No arc yet">Beats of your talk appear here as Halo follows along.</Empty>}
      </div>
    </aside>
  );
}
