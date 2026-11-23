(() => {
  "use strict";

  const get = (id) => document.getElementById(id);
  const fixture = get("fixture");
  const announcement = get("announcement");
  const { fixtures, evaluate } = VscLesson;
  const conditions = {
    default: "A long stint on Hards costs pace late in the race.",
    hardLife: "Hards are expected to hold pace on the long stint.",
    earlyGreen: "Hards are expected to hold pace. There’s a chance VSC ends before you rejoin.",
    traffic: "Hards are expected to hold pace. If you rejoin behind the other car, expect traffic.",
  };
  let choice = "";
  let step = 0;
  let playback = 0;

  const seconds = (time) => (time / 1000) + " s";
  const describeGap = (margin) => margin === 0 ? "level" :
    seconds(Math.abs(margin)) + (margin > 0 ? " ahead of" : " behind");

  function updatePaths(input, result) {
    const lanes = [
      ["pit", result.pitTime],
      ["track", input.vscTrack],
      ["green", input.greenTrack],
    ];
    for (const [id, time] of lanes) {
      get(id + "-time").textContent = step >= 2 ? seconds(time) : "—";
      get(id + "-bar").style.width = step >= 2 ? time / result.pitTime * 100 + "%" : "0";
    }
    get("track-label").textContent = step >= 2 && input.vscTrack < fixtures.default.vscTrack ?
      "Track · VSC then green" : "Track under VSC";
  }

  function updateProjection(input, result) {
    const traffic = input.traffic ? " + " + seconds(input.traffic) + " traffic" : "";
    get("box-total").textContent = seconds(result.boxLoss) + " pit + " +
      seconds(input.boxPace) + " pace" + traffic + " = " + seconds(result.boxTotal);
    get("stay-total").textContent = seconds(result.greenLoss) + " pit + " +
      seconds(input.stayPace) + " pace = " + seconds(result.stayTotal);
    const difference = result.stayTotal - result.boxTotal;
    get("verdict").textContent = difference === 0 ? "Both choices project the same finish time." :
      (difference > 0 ? "Boxing now" : "Staying out") + " projects " +
      seconds(Math.abs(difference)) + " less loss at the finish.";
  }

  function render() {
    const input = fixtures[fixture.value];
    const result = evaluate(input);
    const labels = ["Waiting for your pit call.", "Both paths start at the same timing marker.",
      "Both paths have reached the end marker.", "Compare where you would rejoin if you boxed.",
      "Compare projected race time for both pit calls."];
    get("conditions").textContent = conditions[fixture.value];
    get("choices").hidden = Boolean(choice);
    get("choice").hidden = !choice;
    get("choice").textContent = choice === "box" ? "Your call: box now." : "Your call: stay out until lap 25.";
    get("step-label").textContent = labels[step];
    get("timing-paths").hidden = step < 1;
    get("loss").hidden = step < 2;
    get("loss").textContent = seconds(result.pitTime) + " in the pits − " + seconds(input.vscTrack) +
      " on track = " + seconds(result.boxLoss) + " lost, " +
      seconds(result.greenLoss - result.boxLoss) + " less than under green.";
    get("rejoin").hidden = step < 3;
    get("rejoin").textContent = "Box now and you rejoin " + describeGap(result.rejoin) + " the reference car.";
    if (result.rejoin === 0) get("rejoin").textContent = "Box now and you rejoin level with the other car.";
    get("transport").hidden = step === 0 || step === 4;
    get("next").textContent = step === 3 ? "Compare finish projections" : "Next marker";
    get("projection").hidden = step < 4;
    if (step > 0) updatePaths(input, result);
    if (step === 4) {
      get("variants").hidden = false;
      get("history").hidden = false;
      updateProjection(input, result);
    }
  }

  function reset() {
    stopPlayback();
    choice = "";
    step = 0;
    for (const answer of get("check").querySelectorAll("input")) answer.checked = false;
    get("feedback").textContent = "";
    announcement.textContent = "";
    render();
    get("box").focus();
  }

  for (const id of ["box", "stay"]) {
    get(id).addEventListener("click", () => {
      choice = id;
      step = 1;
      fixture.disabled = true;
      render();
      get("timing-heading").focus();
    });
  }
  function stopPlayback() {
    clearInterval(playback);
    playback = 0;
    get("play").textContent = "Play steps";
  }

  function advance() {
    step += 1;
    render();
    if (step === 4) {
      stopPlayback();
      fixture.disabled = false;
      get("projection-heading").focus();
    } else {
      announcement.textContent = get(step === 2 ? "loss" : "rejoin").textContent;
    }
  }

  get("next").addEventListener("click", () => {
    stopPlayback();
    advance();
  });
  get("play").addEventListener("click", () => {
    if (playback) {
      stopPlayback();
      return;
    }
    get("play").textContent = "Pause steps";
    playback = setInterval(advance, 1600);
  });
  window.addEventListener("pagehide", stopPlayback);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopPlayback();
  });
  fixture.addEventListener("change", reset);
  get("replay").addEventListener("click", () => {
    fixture.disabled = false;
    reset();
  });
  get("check").addEventListener("change", (event) => {
    get("feedback").textContent = event.target.value === "track" ?
      "Correct. The pit path still took 30 s. The reference car took longer on track." :
      "The pit path still took 30 s. Compare the two track times.";
  });

  LearnAppearance.mount();
  render();
})();
