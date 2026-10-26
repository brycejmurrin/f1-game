Fixed: Shared debug Chrome discovery now honors an absolute `XDG_CONFIG_HOME`.
Fixed: `debugger_break` uses separate breakpoint-wait and trigger-execution deadlines so inspecting a paused frame does not consume the short wait budget.
