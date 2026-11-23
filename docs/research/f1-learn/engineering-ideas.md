# F1 Learn engineering module ideas

Research cutoff 23 November 2026. The proposed release is one stand-alone Learn lesson called **Energy & Overtake**.

## Three options

| Module | Learner choice and feedback | Scope |
| --- | --- | --- |
| **Energy & Overtake** | Spend charge to respond now, save for a faster straight, or request both. Compare delivered power, energy and the charge left for the next window. A second detection-gap case changes eligibility. [FIA 2026 Technical C5.2](https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_21_-_2026-10-19.pdf) · [FIA Las Vegas PU bulletin](https://www.fia.com/system/files/decision-document/2026_las_vegas_grand_prix_-_power_unit_information.pdf) | Two windows, one charge ledger and two curves. The inputs work in the existing static Learn shell. |
| **Aero Modes and Balance** | Decide whether to lower drag on a straight, hold Corner Mode approaching a bend, or use the front-only mode in the Low Grip zone. A side profile and two small readouts show axle balance and drag. [FIA 2026 Sporting B7.1](https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_b_sporting_-_iss_09_-_2026-10-01.pdf) | A plausible follow-up inside Aero Lab. Car-specific force and balance curves need experimental evidence or explicit teaching assumptions. |
| **Floor Height and Consistency** | Choose ride-height margin for a smooth or bumpy segment. Compare time spent in a useful clearance range and oscillation exposure across the profiles. [FIA porpoising intervention](https://www.fia.com/news/fia-takes-steps-reduce-porpoising-interests-safety) · [FIA 2022/23 regulation updates](https://www.fia.com/news/world-motor-sport-council-approves-f1-2026-power-unit-regulations-and-updated-2022-2023) | A later lesson. Credible lap chatter needs suspension response and a validated aero map or a clearly labeled qualitative model. |

Energy & Overtake has the clearest decision with a predictable, source-grounded outcome. It extends the Learn index beyond the existing Aero Lab and Grip & Braking and needs no car render, telemetry capture or engine changes. [Existing Learn integration](driving-sessions.md)

## Lesson brief

**Learning objective.** Given a fixed speed, state of charge and detection result, choose where to deploy and explain why a higher power allowance does not guarantee more energy later in the lap.

**Prompt.** “Can you save enough charge for the faster straight?” The learner chooses **Early**, **Late** or **Both**. Early represents a defensive response to immediate pressure. Late represents preparing an overtaking attempt. Opening task is to deliver at least **0.80 MJ on the late straight**. After the comparison, offer an optional goal of at least **0.60 MJ early** to show why a different decision can be appropriate. These targets measure electrical delivery in the sample. No outcome claims that a position was gained or defended.

**Label.** “Practice model using FIA power limits. Speeds, durations, charge and targets are illustrative.” Present Overtake as the speed-dependent electrical allowance a driver can request after activation. Put active aero and driver Boost in the explainer only. This lesson uses dry Race conditions and main-overtaking-zone curves. [FIA Technical C5.2 and C5.12](https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_21_-_2026-10-19.pdf) · [FIA Sporting B7.1–2](https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_b_sporting_-_iss_09_-_2026-10-01.pdf)

### Verified rules and event context

- Absolute ERS-K electrical DC cap is **350 kW**. Under the standard curve, clamp to 0–350 kW after computing `1800 - 5 * speedKph` below 340 km/h, `6900 - 20 * speedKph` from 340 to below 345 km/h, and zero at or above 345 km/h. With Overtake active, clamp `7100 - 20 * speedKph` to 0–350 kW, with zero at or above 355 km/h. The resulting full-power thresholds are 290 and 337.5 km/h respectively. Speed remains a fixture input. [FIA Technical C5.2.7–8](https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_21_-_2026-10-19.pdf)
- The detection line records the gap and the activation line changes the state. Use a fresh inactive lap and only the initial qualifying check `gapSeconds < detectionGap`; model no equality carry-over from a previous activation. Las Vegas specified a 1.0 s detection gap at 5,299 m and activation at 5,400 m. Both sample power windows follow the activation event. Their speeds and duration are teaching fixtures with no claim to reproduce Las Vegas geography or telemetry. [FIA Sporting B7.2](https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_b_sporting_-_iss_09_-_2026-10-01.pdf) · [FIA Las Vegas PU bulletin](https://www.fia.com/system/files/decision-document/2026_las_vegas_grand_prix_-_power_unit_information.pdf)
- The FIA defines up to a **4 MJ** state-of-charge swing and measures recharge per lap separately. The Las Vegas bulletin specified 6.0 MJ in qualifying, 8.5 MJ in practice, and 8.0/8.5 MJ in the race with Overtake inactive/active. Overtake can raise the maximum permitted recharge, subject to B7.2. The amount available to deploy still depends on actual recovery. The model adds one fixed braking recovery and does not implement the lap recharge budget. [FIA Technical C5.2.9–10](https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_21_-_2026-10-19.pdf) · [FIA Las Vegas PU bulletin](https://www.fia.com/system/files/decision-document/2026_las_vegas_grand_prix_-_power_unit_information.pdf)

### Calculation and fixtures

1. Start with **0.80 MJ** in the usable charge window. Show detection **0.85 s** against **1.00 s**, then activate Overtake at the second marker.
2. Early window holds **320 km/h for 2.0 s**. Standard allowance is 200 kW or 0.40 MJ, and Overtake allowance is 350 kW or 0.70 MJ.
3. The illustrative braking segment restores **0.30 MJ**. Clamp usable charge to **4.00 MJ**. This segment has no command or input.
4. Late window holds **340 km/h for 3.0 s**. Standard allowance is 100 kW or 0.30 MJ, and Overtake allowance is 300 kW or 0.90 MJ.
5. A chosen window requests its applicable ceiling. A skipped window draws zero in this incremental teaching model. Convert ceiling × duration to MJ by dividing by 1,000, and deliver the minimum of that result and available charge. Charge never goes negative. When charge runs out partway through a window, a trace can show power dropping to zero and a text status should say which budget bound the run. Use the full-precision values for passing the objective and format values afterward.

| Detection | Plan | Early | After brake | Late | Finish | Late target |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 0.85 s | Early | 0.70 MJ | 0.40 MJ | 0.00 MJ | 0.40 MJ | Miss |
| 0.85 s | Late | 0.00 MJ | 1.10 MJ | 0.90 MJ | 0.20 MJ | Met |
| 0.85 s | Both | 0.70 MJ | 0.40 MJ | 0.40 MJ | 0.00 MJ | Miss |
| 1.10 s | Early | 0.40 MJ | 0.70 MJ | 0.00 MJ | 0.70 MJ | Miss |
| 1.10 s | Late | 0.00 MJ | 1.10 MJ | 0.30 MJ | 0.80 MJ | Unreachable |
| 1.10 s | Both | 0.40 MJ | 0.70 MJ | 0.30 MJ | 0.40 MJ | Unreachable |

The score for the optional early goal is met by Early and Both at 0.85 s. The 1.10 s transfer prompt asks “Why does 1.10 MJ available still deliver only 0.30 MJ when you choose Late?” The learner picks **Power limit** from **Power limit** and **Charge available**, then sees that three seconds at 100 kW use just 0.30 MJ. Both at 0.85 s demonstrates the reverse constraint at the same straight. If the visual shows a depleted 300 kW burst, its late cutoff is **1.333… s** into the 3 s window.

### UI states and delivery

| State | Screen and behavior |
| --- | --- |
| Predict | One objective, detection/activation markers and the two window speeds. Show opening charge, select a plan with three native radio controls and enable **Run plan** once selected. |
| Compare | Show a single timeline with charge start, early draw, braking recovery and late draw. Indicate whether the target was met and which constraint bound each selected window. Keep the previous result visible when the learner runs a second plan. Include units and written outcomes independent of color. |
| Transfer | **Try a larger gap** loads 1.10 s with the same charge, windows and objective. Show **Overtake unavailable** at activation. Retain standard deployment and ask which constraint limited late delivery. |
| Reset / return | Reset restores 0.85 s, the opening objective and the empty comparison. Back or Escape follows the existing return to the Learn index. Use the existing loading, ready, retry and focus behavior for embedded lessons. |

Use the existing Learn lesson shell and appearance settings, with a single scroll surface and the controls close to the timeline at 844×390 landscape. Native radio controls, visible focus, labeled marker steps and a polite result summary suffice for the first version. Keep the trace readable without animation. Add a same-origin lesson under `learn/energy/`, its Learn index entry and the normal manifest, offline cache and desktop/mobile staging coverage. No persistence or integration with Race, Watch, Data, controls or car physics is needed for this lesson. [Learn shell reference](driving-sessions.md)

**Acceptance cases.** Check the six fixture rows and optional objective. At 290 km/h both curves permit 350 kW. At 337.5 km/h the standard cap is 112.5 kW and Overtake is 350 kW. At 340 km/h the caps are 100 and 300 kW. At 345 km/h the caps are 0 and 200 kW. At 355 km/h both are zero. With a fresh inactive lap, exactly 1.00 s fails the strict gap comparison. No early eligibility is granted before activation. On repeated runs the same plan starts from 0.80 MJ.

**Pitfalls.** Keep DC kW, energy in MJ and mechanical performance separate. A flat power trace only describes these fixed-speed windows. Full racing introduces speed changes, mandated power reduction, differing sector curves, grip, efficiency, and team strategies. Avoid equating recharge allowance with energy granted. Avoid universalizing the Las Vegas 1.0 s detection gap or the illustrated windows. Avoid “press to pass” copy because the lesson has no opponent simulation. The FIA revised harvest and deployment after the first three 2026 events, which makes the October rule edition and event bulletin important source labels. [FIA Miami refinements](https://www.fia.com/news/refinements-2026-fia-formula-1-regulations-agreed-all-stakeholders)
