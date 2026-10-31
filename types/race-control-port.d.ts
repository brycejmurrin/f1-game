/** RaceControl's private capabilities, constructed once by create(G).
 * Scalar reads are live, never snapshots or new state owners. The machine owns
 * its caution state; it cannot mutate the session, grid or network service.
 * Commands retain their original receivers. Announce returns false when absent
 * or rejected so local notification retries remain independent of host authority.
 * DebrisWorld, Storm, TyreModel and Log remain explicit legacy global dependencies.
 */
interface RaceControlPort {
  readonly state: GameCtx["state"];
  readonly session: GameCtx["session"];
  readonly timeTrial: boolean;
  readonly _s8Stamp: GameCtx["_s8Stamp"];
  readonly raceT: number;
  readonly raceWeather: GameCtx["raceWeather"];
  /** null means no leader; undefined preserves a present, incomplete harness car. */
  readonly leaderLap: number | null | undefined;
  readonly readCaution: () => unknown;
  readonly writeCaution: (enabled: boolean) => void;
  readonly networkActive: () => boolean;
  readonly ownsRaceControl: () => boolean;
  /** Borrowed payload for synchronous publication; existing transport owns copying. */
  readonly reportCaution: (data: {
    level: number; sector: number; frac: number; cause: string;
    total: number; sectors: number[]; sinceT: number; phase: string;
  }) => void;
  readonly announce: (text: string, seconds: number, kind: string) => unknown;
  readonly wetness: () => number | undefined;
}
