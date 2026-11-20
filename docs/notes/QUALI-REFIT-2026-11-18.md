# Qualifying model refit: before/after tables, 2026-11-18 (#5783 Q1, PR #5786)

Kind: measurement · Re-measure-by: 2027-02-18

Summary: At the shipped OVERALL SPEED (PACE 0.8396) the simulated qualifying lap ran 1.06 to 1.09 times the lap the same AI car drives (per-circuit median; up to 1.23), so a lap at AI pace took pole everywhere. After the refit (`QUALI_TRIM` 0.92, `PACE_CORNER` 1.15, `skill x dd.corner` on the corner cap) the per-circuit median is 0.94 to 1.00, median 0.965 to 0.969 by level. Because the sheet is only about a second wide, a lap at the AI's own pace now qualifies at the back, not mid-field.

Method (Node VM, `tools/lib/game-vm.cjs`, one seed, day, dry, tyre wear and wind off): per circuit and level, two thinned AI-only fields (grid slots `i % 4 == 1` and `i % 4 == 3`, the rest retired and lifted off the road), each car's best of three timed laps in clear air (11 cars per cell); the model's `carLap` for the same cars on the tree before (`9261395b`) and after (`7408d0d4`); the sheet is `G.qualiSim(0)`; gold is `referencePole()`. The preparing lane measured the same calendar on grid slots 0 and 2 (#5783 comment 6983248659) and agrees within 0.01. To re-measure: the diagnostics of `tests/unit/quali-absolute-parity-vm.test.mjs` print the ratio for five circuits; the loop in that file is the method.

### Model ÷ driven, per-circuit median (min / median / max over circuits)

| level | circuits | before | after | AI fastest ÷ new gold |
|---|---|---|---|---|
| easy | 52 | 0.999 / 1.090 / 1.225 | 0.944 / 0.969 / 1.000 | 1.007 / 1.045 / 1.075 |
| normal | 52 | 1.012 / 1.080 / 1.187 | 0.942 / 0.965 / 0.995 | 1.006 / 1.042 / 1.078 |
| hard | 52 | 1.007 / 1.059 / 1.148 | 0.940 / 0.965 / 0.994 | 1.003 / 1.042 / 1.071 |

### easy: simulated sheet P1 / P11 / P22 before → after, vs driven best laps (fastest / median / slowest of the sampled cars)

| circuit | sheet before | sheet after | driven best laps | ratio before → after (car min–max after) | gold before → after |
|---|---|---|---|---|---|
| abudhabi | 143.3 / 144.3 / 145.3 | 126.7 / 127.3 / 128.1 | 127.6 / 130.6 / 134.8 (n=11) | 1.105 → 0.974 (0.947–1.003) | 140.4 → 123.9 |
| albert_park | 142.7 / 143.9 / 145.0 | 123.5 / 124.1 / 124.9 | 124.7 / 126.4 / 130.8 (n=11) | 1.133 → 0.980 (0.953–1.000) | 139.3 → 120.9 |
| anderstorp | 105.5 / 106.3 / 107.1 | 93.8 / 94.3 / 94.8 | 96.8 / 97.8 / 101.8 (n=11) | 1.091 → 0.966 (0.929–0.975) | 103.4 → 91.6 |
| bahrain | 147.8 / 148.8 / 149.9 | 132.0 / 132.7 / 133.4 | 135.1 / 138.0 / 142.8 (n=11) | 1.076 → 0.960 (0.932–0.987) | 144.6 → 129.4 |
| baku | 160.5 / 161.7 / 162.9 | 141.5 / 142.2 / 143.0 | 146.8 / 148.1 / 154.5 (n=11) | 1.088 → 0.959 (0.924–0.971) | 157.0 → 138.4 |
| brands_hatch | 102.2 / 102.9 / 103.7 | 91.1 / 91.6 / 92.2 | 93.0 / 94.7 / 99.5 (n=11) | 1.086 → 0.969 (0.924–0.990) | 99.9 → 89.1 |
| buddh | 138.9 / 139.9 / 140.9 | 125.7 / 126.3 / 127.1 | 126.4 / 130.8 / 135.2 (n=11) | 1.073 → 0.969 (0.937–1.004) | 136.2 → 123.1 |
| buenos_aires | 116.9 / 117.7 / 118.5 | 106.4 / 107.0 / 107.6 | 109.0 / 109.9 / 113.7 (n=11) | 1.068 → 0.972 (0.943–0.982) | 114.9 → 104.2 |
| catalunya | 122.5 / 123.4 / 124.3 | 106.3 / 106.9 / 107.5 | 107.1 / 110.5 / 113.7 (n=11) | 1.120 → 0.970 (0.943–1.002) | 119.8 → 103.9 |
| cota | 153.8 / 154.8 / 155.8 | 141.7 / 142.3 / 143.2 | 142.3 / 144.1 / 148.2 (n=11) | 1.070 → 0.986 (0.963–1.002) | 151.1 → 138.8 |
| dijon | 97.7 / 98.6 / 99.4 | 78.7 / 79.1 / 79.7 | 80.2 / 81.3 / 87.4 (n=11) | 1.217 → 0.976 (0.906–0.987) | 94.9 → 76.7 |
| donington | 107.3 / 108.1 / 108.9 | 96.1 / 96.6 / 97.1 | 99.6 / 101.8 / 104.4 (n=11) | 1.065 → 0.953 (0.927–0.971) | 104.8 → 94.1 |
| estoril | 112.4 / 113.2 / 114.0 | 100.8 / 101.3 / 101.9 | 104.3 / 105.8 / 109.0 (n=11) | 1.074 → 0.962 (0.933–0.972) | 110.2 → 98.7 |
| fuji | 124.5 / 125.5 / 126.4 | 109.3 / 109.9 / 110.5 | 112.0 / 113.6 / 117.6 (n=11) | 1.102 → 0.967 (0.935–0.985) | 121.8 → 107.0 |
| hockenheim | 123.2 / 124.1 / 125.0 | 109.0 / 109.6 / 110.2 | 112.5 / 113.7 / 117.9 (n=11) | 1.090 → 0.962 (0.932–0.978) | 120.6 → 106.7 |
| hungaroring | 118.6 / 119.4 / 120.1 | 109.0 / 109.6 / 110.2 | 108.5 / 111.8 / 115.7 (n=11) | 1.067 → 0.981 (0.950–1.014) | 116.7 → 106.6 |
| imola | 132.4 / 133.4 / 134.3 | 117.5 / 118.1 / 118.8 | 123.7 / 125.1 / 127.9 (n=11) | 1.066 → 0.944 (0.926–0.956) | 129.6 → 115.0 |
| indianapolis | 110.9 / 111.7 / 112.5 | 94.4 / 94.9 / 95.5 | 95.1 / 96.8 / 100.1 (n=11) | 1.150 → 0.978 (0.950–1.003) | 108.6 → 92.2 |
| interlagos | 116.7 / 117.5 / 118.4 | 101.5 / 102.1 / 102.7 | 104.1 / 105.5 / 107.6 (n=11) | 1.114 → 0.969 (0.952–0.985) | 114.2 → 99.3 |
| istanbul | 144.1 / 145.2 / 146.2 | 128.0 / 128.7 / 129.4 | 131.8 / 133.6 / 135.9 (n=11) | 1.088 → 0.966 (0.948–0.976) | 141.3 → 125.3 |
| jacarepagua | 129.2 / 130.1 / 131.0 | 115.7 / 116.2 / 116.9 | 116.3 / 118.8 / 123.9 (n=11) | 1.091 → 0.977 (0.941–1.004) | 126.5 → 113.0 |
| jeddah | 163.6 / 165.0 / 166.2 | 138.4 / 139.2 / 140.1 | 142.1 / 145.2 / 148.2 (n=11) | 1.137 → 0.960 (0.940–0.985) | 159.6 → 135.3 |
| jerez | 118.4 / 119.3 / 120.1 | 106.4 / 107.0 / 107.6 | 109.7 / 110.6 / 114.7 (n=11) | 1.076 → 0.968 (0.936–0.975) | 115.9 → 104.2 |
| korea | 155.3 / 156.4 / 157.5 | 139.1 / 139.8 / 140.6 | 139.6 / 143.1 / 147.5 (n=11) | 1.089 → 0.975 (0.951–1.006) | 152.4 → 136.4 |
| kyalami | 121.3 / 122.2 / 123.1 | 108.6 / 109.2 / 109.8 | 113.1 / 115.5 / 119.0 (n=11) | 1.064 → 0.949 (0.921–0.964) | 118.7 → 106.4 |
| madrid | 145.6 / 146.7 / 147.7 | 131.0 / 131.7 / 132.4 | 132.3 / 135.5 / 139.1 (n=11) | 1.079 → 0.970 (0.950–1.000) | 142.6 → 128.2 |
| magny_cours | 120.5 / 121.5 / 122.4 | 107.4 / 108.0 / 108.6 | 111.2 / 112.9 / 115.9 (n=11) | 1.079 → 0.958 (0.933–0.969) | 117.8 → 105.2 |
| mexico | 122.0 / 122.8 / 123.6 | 109.2 / 109.7 / 110.3 | 107.6 / 111.3 / 115.5 (n=11) | 1.103 → 0.986 (0.952–1.024) | 119.8 → 106.9 |
| miami | 147.3 / 148.4 / 149.5 | 125.2 / 125.9 / 126.6 | 126.1 / 128.6 / 133.1 (n=11) | 1.154 → 0.980 (0.950–1.003) | 144.1 → 122.6 |
| monaco | 99.0 / 99.6 / 100.1 | 93.9 / 94.3 / 94.9 | 97.3 / 99.5 / 101.3 (n=11) | 0.999 → 0.948 (0.934–0.973) | 97.9 → 92.1 |
| mont_tremblant | 113.7 / 114.6 / 115.4 | 99.9 / 100.4 / 101.0 | 104.3 / 105.5 / 108.7 (n=11) | 1.088 → 0.955 (0.926–0.963) | 111.2 → 97.8 |
| montreal | 120.1 / 121.0 / 121.8 | 106.0 / 106.6 / 107.2 | 107.9 / 112.9 / 114.4 (n=11) | 1.078 → 0.948 (0.934–0.993) | 117.5 → 104.0 |
| monza | 154.7 / 156.0 / 157.2 | 128.7 / 129.4 / 130.3 | 130.3 / 132.1 / 137.5 (n=11) | 1.175 → 0.977 (0.945–0.994) | 150.7 → 125.8 |
| mosport | 103.8 / 104.7 / 105.6 | 83.9 / 84.4 / 85.0 | 84.4 / 85.7 / 90.1 (n=11) | 1.225 → 0.991 (0.941–1.001) | 100.7 → 81.9 |
| mugello | 135.7 / 136.8 / 137.8 | 116.8 / 117.5 / 118.2 | 117.3 / 118.6 / 123.8 (n=11) | 1.150 → 0.990 (0.951–1.003) | 132.6 → 114.0 |
| nurburgring | 140.3 / 141.3 / 142.3 | 124.9 / 125.6 / 126.3 | 128.3 / 129.7 / 134.4 (n=11) | 1.094 → 0.972 (0.938–0.977) | 137.4 → 122.2 |
| okayama | 101.1 / 101.7 / 102.4 | 91.3 / 91.8 / 92.3 | 94.0 / 94.8 / 98.7 (n=11) | 1.072 → 0.967 (0.932–0.978) | 99.3 → 89.2 |
| paul_ricard | 157.3 / 158.5 / 159.7 | 136.6 / 137.3 / 138.2 | 136.5 / 139.3 / 143.9 (n=11) | 1.142 → 0.989 (0.957–1.011) | 153.8 → 133.7 |
| portimao | 126.6 / 127.5 / 128.3 | 113.5 / 114.1 / 114.7 | 118.6 / 119.6 / 123.6 (n=11) | 1.065 → 0.956 (0.926–0.964) | 124.1 → 111.1 |
| qatar | 141.6 / 142.6 / 143.6 | 126.4 / 127.0 / 127.8 | 128.0 / 133.1 / 137.1 (n=11) | 1.069 → 0.953 (0.930–0.996) | 138.7 → 123.4 |
| redbull | 114.4 / 115.3 / 116.2 | 99.7 / 100.3 / 100.9 | 101.8 / 102.8 / 108.8 (n=11) | 1.118 → 0.975 (0.924–0.989) | 111.7 → 97.7 |
| sepang | 151.6 / 152.7 / 153.7 | 136.0 / 136.7 / 137.5 | 141.4 / 142.4 / 146.9 (n=11) | 1.074 → 0.961 (0.934–0.969) | 148.4 → 133.3 |
| shanghai | 149.3 / 150.4 / 151.4 | 130.5 / 131.2 / 132.0 | 130.6 / 135.3 / 137.4 (n=11) | 1.118 → 0.974 (0.957–1.009) | 146.3 → 127.8 |
| silverstone | 154.0 / 155.2 / 156.3 | 133.3 / 134.0 / 134.8 | 131.7 / 133.7 / 140.2 (n=11) | 1.156 → 1.000 (0.959–1.022) | 150.6 → 130.1 |
| singapore | 137.4 / 138.4 / 139.3 | 126.2 / 126.8 / 127.5 | 128.1 / 131.6 / 135.4 (n=11) | 1.051 → 0.964 (0.939–0.994) | 135.1 → 123.7 |
| sochi | 160.6 / 161.7 / 162.9 | 144.2 / 144.9 / 145.7 | 149.7 / 151.6 / 157.1 (n=11) | 1.069 → 0.959 (0.924–0.966) | 157.3 → 141.3 |
| spa | 186.1 / 187.7 / 189.2 | 155.0 / 155.8 / 156.8 | 159.0 / 161.3 / 166.5 (n=11) | 1.161 → 0.966 (0.940–0.978) | 180.9 → 151.4 |
| suzuka | 152.9 / 154.1 / 155.2 | 132.7 / 133.4 / 134.2 | 134.9 / 135.5 / 140.0 (n=11) | 1.132 → 0.983 (0.954–0.991) | 149.5 → 129.7 |
| vegas | 166.8 / 168.2 / 169.5 | 141.4 / 142.2 / 143.1 | 144.5 / 146.5 / 151.1 (n=11) | 1.153 → 0.975 (0.945–0.981) | 162.8 → 138.4 |
| watkins_glen | 142.7 / 143.9 / 145.0 | 121.3 / 122.0 / 122.7 | 125.7 / 128.3 / 131.7 (n=11) | 1.125 → 0.954 (0.929–0.972) | 139.2 → 118.5 |
| zandvoort | 114.2 / 115.1 / 115.9 | 100.7 / 101.3 / 101.8 | 104.3 / 105.2 / 108.7 (n=11) | 1.096 → 0.966 (0.934–0.970) | 111.8 → 98.4 |
| zolder | 108.7 / 109.5 / 110.3 | 97.6 / 98.1 / 98.7 | 100.8 / 103.1 / 105.2 (n=11) | 1.065 → 0.954 (0.935–0.971) | 106.4 → 95.6 |

### normal: simulated sheet P1 / P11 / P22 before → after, vs driven best laps (fastest / median / slowest of the sampled cars)

| circuit | sheet before | sheet after | driven best laps | ratio before → after (car min–max after) | gold before → after |
|---|---|---|---|---|---|
| abudhabi | 136.6 / 137.5 / 138.4 | 121.5 / 122.1 / 122.8 | 123.6 / 124.8 / 129.5 (n=11) | 1.099 → 0.977 (0.946–0.986) | 134.1 → 118.9 |
| albert_park | 134.9 / 136.0 / 137.0 | 118.3 / 118.9 / 119.6 | 120.6 / 121.9 / 126.4 (n=11) | 1.117 → 0.978 (0.944–0.988) | 131.9 → 115.9 |
| anderstorp | 100.7 / 101.4 / 102.0 | 89.8 / 90.3 / 90.8 | 92.4 / 93.5 / 97.6 (n=11) | 1.083 → 0.965 (0.928–0.978) | 99.0 → 87.8 |
| bahrain | 140.5 / 141.5 / 142.5 | 126.9 / 127.5 / 128.3 | 131.4 / 132.6 / 137.1 (n=11) | 1.066 → 0.961 (0.933–0.972) | 137.8 → 124.5 |
| baku | 152.5 / 153.6 / 154.6 | 135.6 / 136.3 / 137.1 | 140.4 / 142.2 / 146.8 (n=11) | 1.080 → 0.959 (0.932–0.975) | 149.5 → 132.7 |
| brands_hatch | 97.1 / 97.8 / 98.5 | 87.3 / 87.8 / 88.3 | 90.3 / 91.4 / 94.6 (n=11) | 1.073 → 0.963 (0.931–0.975) | 95.3 → 85.4 |
| buddh | 132.6 / 133.5 / 134.4 | 120.8 / 121.4 / 122.1 | 122.2 / 125.6 / 129.7 (n=11) | 1.062 → 0.966 (0.939–0.997) | 130.3 → 118.4 |
| buenos_aires | 112.3 / 112.9 / 113.6 | 102.2 / 102.7 / 103.3 | 102.8 / 106.1 / 109.2 (n=11) | 1.065 → 0.970 (0.943–1.003) | 110.7 → 100.1 |
| catalunya | 116.4 / 117.2 / 118.0 | 101.7 / 102.2 / 102.8 | 103.3 / 106.1 / 108.6 (n=11) | 1.107 → 0.964 (0.945–0.994) | 114.2 → 99.4 |
| cota | 147.7 / 148.5 / 149.4 | 136.4 / 137.0 / 137.8 | 137.5 / 138.7 / 142.9 (n=11) | 1.072 → 0.989 (0.961–0.998) | 145.6 → 133.7 |
| dijon | 91.5 / 92.3 / 93.0 | 74.8 / 75.2 / 75.7 | 75.8 / 78.3 / 79.7 (n=11) | 1.187 → 0.966 (0.947–0.992) | 89.1 → 73.0 |
| donington | 101.8 / 102.5 / 103.2 | 92.2 / 92.7 / 93.2 | 95.2 / 96.7 / 100.5 (n=11) | 1.056 → 0.957 (0.925–0.978) | 99.8 → 90.3 |
| estoril | 107.2 / 108.0 / 108.7 | 96.8 / 97.2 / 97.8 | 100.1 / 100.9 / 104.4 (n=11) | 1.069 → 0.963 (0.935–0.969) | 105.4 → 94.8 |
| fuji | 118.5 / 119.3 / 120.1 | 104.9 / 105.4 / 106.0 | 105.6 / 109.3 / 112.4 (n=11) | 1.093 → 0.966 (0.940–1.003) | 116.3 → 102.8 |
| hockenheim | 117.3 / 118.1 / 118.9 | 104.6 / 105.1 / 105.7 | 109.1 / 111.8 / 113.4 (n=11) | 1.058 → 0.942 (0.930–0.962) | 115.2 → 102.5 |
| hungaroring | 114.1 / 114.7 / 115.4 | 104.7 / 105.2 / 105.8 | 104.8 / 107.8 / 111.1 (n=11) | 1.063 → 0.975 (0.949–1.008) | 112.5 → 102.3 |
| imola | 126.0 / 126.9 / 127.7 | 112.7 / 113.3 / 114.0 | 119.1 / 119.7 / 122.5 (n=11) | 1.059 → 0.947 (0.928–0.955) | 123.5 → 110.4 |
| indianapolis | 105.6 / 106.3 / 107.0 | 90.2 / 90.7 / 91.2 | 92.2 / 93.7 / 95.5 (n=11) | 1.137 → 0.969 (0.953–0.981) | 103.6 → 88.2 |
| interlagos | 111.0 / 111.8 / 112.6 | 97.3 / 97.8 / 98.4 | 99.9 / 101.2 / 103.1 (n=11) | 1.101 → 0.965 (0.952–0.980) | 109.0 → 95.2 |
| istanbul | 137.5 / 138.4 / 139.3 | 122.9 / 123.5 / 124.2 | 125.0 / 128.3 / 131.8 (n=11) | 1.075 → 0.961 (0.940–0.992) | 135.0 → 120.4 |
| jacarepagua | 123.1 / 123.9 / 124.8 | 110.8 / 111.4 / 112.0 | 111.5 / 114.6 / 118.5 (n=11) | 1.078 → 0.970 (0.943–1.003) | 121.0 → 108.3 |
| jeddah | 154.5 / 155.7 / 156.8 | 132.3 / 133.0 / 133.8 | 136.3 / 138.3 / 142.5 (n=11) | 1.123 → 0.960 (0.937–0.980) | 151.1 → 129.3 |
| jerez | 112.8 / 113.6 / 114.3 | 102.2 / 102.7 / 103.3 | 105.8 / 106.5 / 110.5 (n=11) | 1.065 → 0.964 (0.932–0.972) | 110.8 → 100.1 |
| korea | 148.5 / 149.5 / 150.4 | 133.7 / 134.4 / 135.2 | 134.2 / 137.6 / 142.5 (n=11) | 1.085 → 0.975 (0.945–1.006) | 146.2 → 131.1 |
| kyalami | 115.4 / 116.2 / 116.9 | 104.3 / 104.8 / 105.4 | 107.7 / 110.0 / 115.7 (n=11) | 1.053 → 0.951 (0.909–0.978) | 113.2 → 102.2 |
| madrid | 138.8 / 139.7 / 140.6 | 125.8 / 126.4 / 127.1 | 128.9 / 130.4 / 134.3 (n=11) | 1.072 → 0.972 (0.944–0.981) | 136.3 → 123.2 |
| magny_cours | 114.4 / 115.2 / 116.0 | 103.2 / 103.7 / 104.3 | 107.0 / 109.8 / 111.2 (n=11) | 1.055 → 0.948 (0.935–0.968) | 112.3 → 101.0 |
| mexico | 116.9 / 117.6 / 118.3 | 104.9 / 105.4 / 106.0 | 103.4 / 107.8 / 111.2 (n=11) | 1.090 → 0.977 (0.951–1.024) | 115.1 → 102.8 |
| miami | 139.9 / 140.9 / 141.9 | 119.9 / 120.6 / 121.3 | 121.8 / 124.0 / 127.5 (n=11) | 1.140 → 0.975 (0.947–0.987) | 137.1 → 117.5 |
| monaco | 96.3 / 96.7 / 97.3 | 90.6 / 91.0 / 91.5 | 94.0 / 95.7 / 96.9 (n=11) | 1.012 → 0.952 (0.941–0.971) | 95.4 → 88.8 |
| mont_tremblant | 107.9 / 108.7 / 109.5 | 95.8 / 96.3 / 96.9 | 99.0 / 100.9 / 104.0 (n=11) | 1.075 → 0.953 (0.929–0.977) | 105.8 → 93.9 |
| montreal | 114.1 / 114.9 / 115.7 | 101.9 / 102.4 / 103.0 | 103.9 / 106.3 / 109.9 (n=11) | 1.080 → 0.964 (0.935–0.990) | 111.8 → 100.0 |
| monza | 145.8 / 146.9 / 148.0 | 122.9 / 123.5 / 124.3 | 125.3 / 127.1 / 131.5 (n=11) | 1.150 → 0.970 (0.943–0.984) | 142.3 → 120.2 |
| mosport | 96.9 / 97.8 / 98.6 | 79.9 / 80.4 / 80.9 | 79.2 / 82.4 / 84.1 (n=11) | 1.187 → 0.978 (0.960–1.015) | 94.1 → 78.1 |
| mugello | 128.8 / 129.7 / 130.6 | 111.6 / 112.2 / 112.9 | 112.3 / 113.9 / 118.0 (n=11) | 1.139 → 0.985 (0.954–1.001) | 126.3 → 109.0 |
| nurburgring | 133.7 / 134.7 / 135.6 | 119.9 / 120.5 / 121.2 | 123.6 / 124.7 / 127.2 (n=11) | 1.080 → 0.968 (0.949–0.973) | 131.4 → 117.4 |
| okayama | 97.0 / 97.6 / 98.2 | 87.6 / 88.0 / 88.5 | 88.8 / 93.2 / 94.3 (n=11) | 1.049 → 0.946 (0.936–0.995) | 95.6 → 85.6 |
| paul_ricard | 149.4 / 150.5 / 151.5 | 130.9 / 131.6 / 132.4 | 132.3 / 133.4 / 137.4 (n=11) | 1.126 → 0.986 (0.961–0.997) | 146.5 → 128.2 |
| portimao | 121.0 / 121.8 / 122.6 | 108.9 / 109.5 / 110.1 | 113.4 / 114.6 / 118.6 (n=11) | 1.060 → 0.954 (0.926–0.969) | 119.1 → 106.6 |
| qatar | 135.1 / 136.0 / 136.9 | 121.1 / 121.7 / 122.4 | 125.2 / 126.7 / 132.1 (n=11) | 1.071 → 0.959 (0.924–0.974) | 132.7 → 118.3 |
| redbull | 108.2 / 109.1 / 109.8 | 95.7 / 96.2 / 96.7 | 98.2 / 100.2 / 103.7 (n=11) | 1.093 → 0.964 (0.931–0.978) | 105.9 → 93.8 |
| sepang | 144.4 / 145.4 / 146.3 | 130.7 / 131.4 / 132.1 | 133.2 / 137.5 / 141.4 (n=11) | 1.058 → 0.956 (0.931–0.990) | 141.8 → 128.1 |
| shanghai | 142.4 / 143.3 / 144.3 | 125.2 / 125.9 / 126.6 | 127.6 / 130.1 / 131.8 (n=11) | 1.104 → 0.970 (0.957–0.986) | 139.8 → 122.7 |
| silverstone | 146.3 / 147.3 / 148.4 | 127.5 / 128.2 / 128.9 | 128.0 / 129.0 / 134.1 (n=11) | 1.143 → 0.995 (0.959–1.002) | 143.5 → 124.5 |
| singapore | 131.9 / 132.7 / 133.5 | 121.5 / 122.0 / 122.7 | 123.3 / 128.6 / 129.9 (n=11) | 1.035 → 0.951 (0.942–0.994) | 130.0 → 119.1 |
| sochi | 153.1 / 154.1 / 155.2 | 138.6 / 139.3 / 140.1 | 143.1 / 145.0 / 151.5 (n=11) | 1.060 → 0.959 (0.923–0.977) | 150.3 → 135.9 |
| spa | 174.8 / 176.2 / 177.6 | 147.9 / 148.7 / 149.6 | 149.7 / 153.0 / 158.6 (n=11) | 1.150 → 0.972 (0.941–0.998) | 170.6 → 144.6 |
| suzuka | 145.2 / 146.2 / 147.2 | 127.1 / 127.7 / 128.5 | 128.3 / 130.9 / 134.6 (n=11) | 1.120 → 0.979 (0.952–0.996) | 142.4 → 124.3 |
| vegas | 157.6 / 158.8 / 160.0 | 135.3 / 136.0 / 136.9 | 137.0 / 139.1 / 144.1 (n=11) | 1.140 → 0.976 (0.947–0.998) | 153.9 → 132.5 |
| watkins_glen | 134.8 / 135.9 / 136.8 | 115.9 / 116.5 / 117.2 | 119.6 / 121.0 / 125.9 (n=11) | 1.125 → 0.966 (0.929–0.979) | 131.8 → 113.3 |
| zandvoort | 108.8 / 109.6 / 110.3 | 96.5 / 97.0 / 97.6 | 99.9 / 100.9 / 103.9 (n=11) | 1.088 → 0.964 (0.937–0.971) | 107.0 → 94.4 |
| zolder | 103.5 / 104.2 / 104.9 | 93.8 / 94.3 / 94.8 | 96.9 / 99.0 / 100.9 (n=11) | 1.058 → 0.956 (0.936–0.971) | 101.6 → 91.9 |

### hard: simulated sheet P1 / P11 / P22 before → after, vs driven best laps (fastest / median / slowest of the sampled cars)

| circuit | sheet before | sheet after | driven best laps | ratio before → after (car min–max after) | gold before → after |
|---|---|---|---|---|---|
| abudhabi | 127.0 / 127.8 / 128.5 | 115.2 / 115.8 / 116.4 | 117.3 / 119.6 / 123.4 (n=11) | 1.070 → 0.970 (0.940–0.987) | 125.4 → 112.9 |
| albert_park | 123.3 / 124.1 / 124.9 | 111.7 / 112.2 / 112.9 | 113.8 / 116.7 / 118.3 (n=11) | 1.069 → 0.965 (0.949–0.984) | 121.3 → 109.5 |
| anderstorp | 94.2 / 94.7 / 95.2 | 85.4 / 85.8 / 86.3 | 86.9 / 89.0 / 92.7 (n=11) | 1.065 → 0.965 (0.928–0.991) | 93.1 → 83.5 |
| bahrain | 129.8 / 130.6 / 131.4 | 120.4 / 120.9 / 121.6 | 122.8 / 126.1 / 129.6 (n=11) | 1.035 → 0.959 (0.936–0.989) | 127.8 → 118.2 |
| baku | 140.9 / 141.8 / 142.7 | 128.3 / 128.9 / 129.7 | 131.8 / 135.5 / 138.7 (n=11) | 1.048 → 0.953 (0.933–0.982) | 138.9 → 125.7 |
| brands_hatch | 90.0 / 90.6 / 91.1 | 82.9 / 83.3 / 83.8 | 84.6 / 86.4 / 89.2 (n=11) | 1.046 → 0.964 (0.937–0.989) | 88.8 → 81.2 |
| buddh | 123.6 / 124.3 / 125.0 | 114.9 / 115.5 / 116.1 | 118.8 / 120.6 / 122.9 (n=11) | 1.034 → 0.961 (0.942–0.973) | 122.0 → 112.7 |
| buenos_aires | 106.1 / 106.6 / 107.2 | 97.6 / 98.1 / 98.6 | 100.2 / 101.3 / 104.2 (n=11) | 1.052 → 0.967 (0.943–0.982) | 105.2 → 95.6 |
| catalunya | 108.1 / 108.7 / 109.4 | 96.3 / 96.8 / 97.3 | 98.7 / 100.1 / 103.0 (n=11) | 1.089 → 0.969 (0.942–0.982) | 106.8 → 94.2 |
| cota | 139.6 / 140.3 / 141.0 | 130.1 / 130.7 / 131.4 | 131.1 / 132.7 / 136.3 (n=11) | 1.059 → 0.987 (0.961–1.000) | 138.4 → 127.7 |
| dijon | 82.4 / 83.1 / 83.7 | 69.8 / 70.2 / 70.6 | 71.0 / 72.3 / 75.0 (n=11) | 1.147 → 0.970 (0.937–0.991) | 80.6 → 68.2 |
| donington | 94.2 / 94.8 / 95.4 | 87.7 / 88.1 / 88.6 | 91.5 / 94.0 / 94.8 (n=11) | 1.012 → 0.940 (0.932–0.961) | 93.0 → 85.9 |
| estoril | 100.1 / 100.7 / 101.3 | 91.9 / 92.3 / 92.8 | 94.3 / 96.0 / 99.4 (n=11) | 1.047 → 0.961 (0.932–0.983) | 99.0 → 90.1 |
| fuji | 109.8 / 110.5 / 111.1 | 99.2 / 99.7 / 100.3 | 100.7 / 103.3 / 105.8 (n=11) | 1.068 → 0.966 (0.944–0.994) | 108.2 → 97.4 |
| hockenheim | 109.1 / 109.7 / 110.4 | 99.3 / 99.8 / 100.3 | 102.3 / 104.1 / 107.8 (n=11) | 1.054 → 0.958 (0.928–0.979) | 107.6 → 97.4 |
| hungaroring | 107.9 / 108.4 / 109.0 | 99.9 / 100.4 / 100.9 | 101.7 / 104.0 / 106.1 (n=11) | 1.044 → 0.966 (0.948–0.987) | 107.0 → 97.8 |
| imola | 116.3 / 117.0 / 117.7 | 106.8 / 107.3 / 107.9 | 112.2 / 113.8 / 116.0 (n=11) | 1.032 → 0.945 (0.928–0.960) | 114.4 → 104.8 |
| indianapolis | 97.7 / 98.3 / 98.9 | 84.8 / 85.2 / 85.7 | 85.8 / 87.8 / 90.2 (n=11) | 1.118 → 0.969 (0.946–0.997) | 96.3 → 83.0 |
| interlagos | 103.1 / 103.7 / 104.3 | 92.0 / 92.4 / 92.9 | 95.0 / 96.1 / 97.4 (n=11) | 1.079 → 0.963 (0.952–0.975) | 101.7 → 90.1 |
| istanbul | 127.8 / 128.5 / 129.3 | 116.6 / 117.2 / 117.8 | 119.9 / 121.7 / 123.9 (n=11) | 1.053 → 0.962 (0.948–0.978) | 126.0 → 114.3 |
| jacarepagua | 115.1 / 115.7 / 116.4 | 105.4 / 105.9 / 106.5 | 105.7 / 108.9 / 113.0 (n=11) | 1.063 → 0.973 (0.940–1.005) | 113.9 → 103.1 |
| jeddah | 141.6 / 142.5 / 143.4 | 124.6 / 125.2 / 125.9 | 127.2 / 130.2 / 133.6 (n=11) | 1.094 → 0.962 (0.940–0.988) | 139.1 → 121.9 |
| jerez | 105.4 / 105.9 / 106.5 | 97.2 / 97.6 / 98.2 | 98.3 / 102.1 / 105.1 (n=11) | 1.035 → 0.955 (0.932–0.997) | 104.3 → 95.2 |
| korea | 138.9 / 139.7 / 140.5 | 127.0 / 127.6 / 128.3 | 127.4 / 131.0 / 134.9 (n=11) | 1.066 → 0.973 (0.949–1.005) | 137.3 → 124.7 |
| kyalami | 107.2 / 107.8 / 108.5 | 99.0 / 99.5 / 100.1 | 102.2 / 105.3 / 107.3 (n=11) | 1.026 → 0.946 (0.930–0.978) | 105.9 → 97.1 |
| madrid | 129.6 / 130.3 / 131.1 | 119.7 / 120.3 / 120.9 | 119.7 / 123.7 / 126.1 (n=11) | 1.052 → 0.971 (0.956–1.008) | 128.3 → 117.3 |
| magny_cours | 106.1 / 106.7 / 107.3 | 98.0 / 98.5 / 99.0 | 101.6 / 103.5 / 105.6 (n=11) | 1.035 → 0.955 (0.935–0.968) | 104.6 → 96.1 |
| mexico | 109.5 / 110.1 / 110.7 | 99.6 / 100.1 / 100.6 | 98.5 / 102.7 / 105.4 (n=11) | 1.069 → 0.973 (0.951–1.020) | 108.2 → 97.7 |
| miami | 128.9 / 129.8 / 130.6 | 113.1 / 113.6 / 114.3 | 115.1 / 116.1 / 120.6 (n=11) | 1.116 → 0.978 (0.944–0.987) | 126.8 → 110.9 |
| monaco | 92.5 / 92.9 / 93.4 | 86.9 / 87.3 / 87.8 | 90.8 / 92.3 / 93.6 (n=11) | 1.007 → 0.946 (0.932–0.960) | 92.0 → 85.2 |
| mont_tremblant | 99.9 / 100.4 / 101.0 | 90.6 / 91.1 / 91.6 | 94.7 / 95.7 / 100.0 (n=11) | 1.047 → 0.950 (0.914–0.960) | 98.7 → 88.9 |
| montreal | 105.1 / 105.8 / 106.5 | 96.6 / 97.0 / 97.6 | 98.8 / 102.6 / 103.5 (n=11) | 1.034 → 0.948 (0.940–0.986) | 103.4 → 94.8 |
| monza | 132.2 / 133.2 / 134.1 | 115.2 / 115.8 / 116.4 | 118.0 / 119.2 / 123.6 (n=11) | 1.121 → 0.974 (0.940–0.985) | 129.5 → 112.8 |
| mosport | 86.3 / 87.0 / 87.6 | 74.6 / 75.0 / 75.4 | 74.3 / 75.9 / 79.3 (n=11) | 1.148 → 0.991 (0.949–1.013) | 84.4 → 72.9 |
| mugello | 119.5 / 120.2 / 120.9 | 105.7 / 106.3 / 106.9 | 106.0 / 107.5 / 111.6 (n=11) | 1.117 → 0.988 (0.955–1.004) | 117.9 → 103.3 |
| nurburgring | 124.6 / 125.3 / 126.0 | 114.1 / 114.6 / 115.2 | 114.7 / 119.7 / 121.6 (n=11) | 1.049 → 0.959 (0.945–1.003) | 123.1 → 111.8 |
| okayama | 91.6 / 92.0 / 92.5 | 83.6 / 84.0 / 84.4 | 84.3 / 87.3 / 89.7 (n=11) | 1.052 → 0.961 (0.939–1.000) | 90.8 → 81.7 |
| paul_ricard | 138.1 / 138.9 / 139.8 | 124.0 / 124.6 / 125.3 | 123.4 / 125.5 / 129.6 (n=11) | 1.109 → 0.994 (0.964–1.013) | 136.1 → 121.5 |
| portimao | 113.5 / 114.1 / 114.8 | 103.6 / 104.1 / 104.6 | 108.1 / 110.5 / 112.8 (n=11) | 1.035 → 0.944 (0.925–0.961) | 112.2 → 101.5 |
| qatar | 126.0 / 126.7 / 127.5 | 115.1 / 115.6 / 116.3 | 117.3 / 121.3 / 126.2 (n=11) | 1.043 → 0.952 (0.919–0.989) | 124.6 → 112.5 |
| redbull | 99.2 / 99.9 / 100.5 | 90.5 / 91.0 / 91.5 | 91.8 / 93.7 / 97.6 (n=11) | 1.063 → 0.970 (0.935–0.995) | 97.5 → 88.8 |
| sepang | 134.3 / 135.0 / 135.8 | 124.1 / 124.7 / 125.4 | 129.3 / 131.0 / 135.6 (n=11) | 1.033 → 0.954 (0.922–0.968) | 132.6 → 121.8 |
| shanghai | 132.2 / 132.9 / 133.7 | 118.6 / 119.1 / 119.8 | 118.9 / 122.4 / 127.3 (n=11) | 1.087 → 0.974 (0.938–1.006) | 130.3 → 116.3 |
| silverstone | 135.4 / 136.2 / 137.1 | 120.9 / 121.5 / 122.1 | 118.5 / 122.6 / 126.8 (n=11) | 1.108 → 0.989 (0.961–1.029) | 133.5 → 118.1 |
| singapore | 124.0 / 124.6 / 125.3 | 115.8 / 116.4 / 117.0 | 119.2 / 121.0 / 124.1 (n=11) | 1.028 → 0.960 (0.940–0.979) | 122.7 → 113.7 |
| sochi | 142.0 / 142.8 / 143.7 | 131.4 / 132.1 / 132.8 | 135.6 / 137.5 / 142.4 (n=11) | 1.037 → 0.960 (0.930–0.977) | 140.0 → 129.1 |
| spa | 159.0 / 160.1 / 161.2 | 139.1 / 139.8 / 140.6 | 141.9 / 144.6 / 148.9 (n=11) | 1.110 → 0.969 (0.942–0.983) | 156.1 → 136.1 |
| suzuka | 134.3 / 135.1 / 136.0 | 120.4 / 121.0 / 121.6 | 121.5 / 122.9 / 126.7 (n=11) | 1.098 → 0.983 (0.957–0.997) | 132.4 → 117.8 |
| vegas | 143.4 / 144.4 / 145.4 | 127.2 / 127.8 / 128.6 | 128.3 / 130.9 / 135.0 (n=11) | 1.101 → 0.976 (0.950–1.001) | 140.7 → 124.7 |
| watkins_glen | 123.2 / 124.0 / 124.8 | 109.1 / 109.7 / 110.3 | 111.1 / 114.7 / 119.4 (n=11) | 1.081 → 0.957 (0.920–0.991) | 121.0 → 106.8 |
| zandvoort | 101.5 / 102.1 / 102.7 | 91.7 / 92.1 / 92.6 | 94.8 / 95.6 / 98.6 (n=11) | 1.070 → 0.966 (0.937–0.971) | 100.3 → 89.7 |
| zolder | 96.1 / 96.6 / 97.2 | 89.2 / 89.6 / 90.1 | 92.1 / 95.0 / 95.6 (n=11) | 1.019 → 0.945 (0.939–0.975) | 94.8 → 87.5 |

Outside [0.93, 0.99] after: mosport easy 0.991; mosport hard 0.991; mugello easy 0.990; paul_ricard hard 0.994; silverstone easy 1.000; silverstone normal 0.995

## Where a lap at AI pace lands on the sheet (52 circuits)

| level | before: AI-median lap takes pole at | after: AI-median lap slower than P22 at | after: AI-fastest lap is pole / top half / slower than P22 at |
|---|---|---|---|
| easy | 51 | 51 | 4 / 5 / 35 |
| normal | 52 | 52 | 2 / 3 / 40 |
| hard | 52 | 52 | 4 / 5 / 38 |

## AI pit strategy with tyre wear on (same seeds before and after, 21 AI cars, dry)

| circuit | level | laps | seed | pit loss (laps) before > after | planned stops before > after | stops made before | stops made after | leader s before > after | winner before > after | top5 same | order moved (cars) | DSQ before/after | one-compound before/after | DNF before/after |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| redbull | normal | 10 | 1 | 0.190>0.214 | 21x1 > 21x1 | 21x1 | 21x1 | 1038.87>1033.7 | RUS>RUS | no | 18/21 | 0/0 | 0/0 | 0/0 |
| redbull | normal | 10 | 7 | 0.190>0.214 | 21x1 > 21x1 | 21x1 | 21x1 | 1020.57>1030.63 | ALO>HUL | no | 20/21 | 0/0 | 0/0 | 0/0 |
| redbull | normal | 20 | 1 | 0.190>0.214 | 5x1 16x2 > 15x1 6x2 | 14x1 7x2 | 15x1 6x2 | 2027.25>2026.82 | ALO>ALO | no | 10/21 | 0/0 | 0/0 | 0/0 |
| redbull | normal | 20 | 7 | 0.190>0.214 | 8x1 13x2 > 10x1 11x2 | 14x1 7x2 | 14x1 7x2 | 2032.43>2032.43 | HUL>HUL | yes | 0/21 | 0/0 | 0/0 | 0/0 |
| redbull | hard | 10 | 1 | 0.206>0.226 | 21x1 > 21x1 | 21x1 | 21x1 | 957.73>964 | ALO>ALO | no | 20/21 | 0/0 | 0/0 | 0/0 |
| redbull | hard | 10 | 7 | 0.206>0.226 | 21x1 > 21x1 | 21x1 | 21x1 | 984.67>980.23 | HAM>STR | no | 17/21 | 0/0 | 0/0 | 0/0 |
| redbull | hard | 20 | 1 | 0.206>0.226 | 10x1 11x2 > 15x1 6x2 | 14x1 7x2 | 15x1 6x2 | 1917.38>1917.38 | ALO>ALO | yes | 6/21 | 0/0 | 0/0 | 0/0 |
| redbull | hard | 20 | 7 | 0.206>0.226 | 10x1 11x2 > 10x1 11x2 | 14x1 7x2 | 14x1 7x2 | 1903.77>1903.77 | ALO>ALO | yes | 0/21 | 0/0 | 0/0 | 0/0 |
| shanghai | normal | 10 | 1 | 0.154>0.176 | 21x1 > 21x1 | 21x1 | 21x1 | 1329.77>1329.77 | RUS>RUS | yes | 0/21 | 0/0 | 0/0 | 0/0 |
| shanghai | normal | 10 | 7 | 0.154>0.176 | 21x1 > 21x1 | 21x1 | 21x1 | 1338.62>1338.62 | HAM>HAM | yes | 0/21 | 0/0 | 0/0 | 0/0 |
| shanghai | normal | 20 | 1 | 0.154>0.176 | 21x1 > 21x1 | 21x1 | 21x1 | 2620.25>2620.25 | PIA>PIA | yes | 0/21 | 0/0 | 0/0 | 0/0 |
| shanghai | normal | 20 | 7 | 0.154>0.176 | 21x1 > 21x1 | 21x1 | 21x1 | 2638.85>2638.85 | COL>COL | yes | 0/21 | 0/0 | 0/0 | 0/0 |
| shanghai | hard | 10 | 1 | 0.165>0.185 | 21x1 > 21x1 | 21x1 | 21x1 | 1262.31>1262.31 | RUS>RUS | yes | 0/21 | 0/0 | 0/0 | 0/0 |
| shanghai | hard | 10 | 7 | 0.165>0.185 | 21x1 > 21x1 | 21x1 | 21x1 | 1276.11>1276.11 | HAM>HAM | yes | 0/21 | 0/0 | 0/0 | 0/0 |
| shanghai | hard | 20 | 1 | 0.165>0.185 | 21x1 > 21x1 | 21x1 | 21x1 | 2495.31>2495.31 | RUS>RUS | yes | 0/21 | 0/0 | 0/0 | 0/0 |
| shanghai | hard | 20 | 7 | 0.165>0.185 | 21x1 > 21x1 | 21x1 | 21x1 | 2465.99>2465.99 | STR>STR | yes | 0/21 | 0/0 | 0/0 | 0/0 |
| monza | normal | 10 | 1 | 0.154>0.182 | 21x1 > 21x1 | 21x1 | 21x1 | 1311.92>1311.92 | RUS>RUS | yes | 0/21 | 0/0 | 0/0 | 0/0 |
| monza | normal | 10 | 7 | 0.154>0.182 | 21x1 > 21x1 | 21x1 | 21x1 | 1323.1>1323.1 | HAM>HAM | yes | 0/21 | 0/0 | 0/0 | 0/0 |
| monza | normal | 20 | 1 | 0.154>0.182 | 21x1 > 21x1 | 21x1 | 21x1 | 2584.17>2584.17 | PIA>PIA | yes | 0/21 | 0/0 | 0/0 | 0/0 |
| monza | normal | 20 | 7 | 0.154>0.182 | 21x1 > 21x1 | 21x1 | 21x1 | 2581.21>2581.21 | ALO>ALO | yes | 0/21 | 0/0 | 0/0 | 0/0 |
| monza | hard | 10 | 1 | 0.169>0.194 | 21x1 > 21x1 | 21x1 | 21x1 | 1239.15>1239.15 | RUS>RUS | yes | 0/21 | 0/0 | 0/0 | 0/0 |
| monza | hard | 10 | 7 | 0.169>0.194 | 21x1 > 21x1 | 21x1 | 21x1 | 1242.61>1242.61 | ALO>ALO | yes | 0/21 | 0/0 | 0/0 | 0/0 |
| monza | hard | 20 | 1 | 0.169>0.194 | 21x1 > 21x1 | 21x1 | 21x1 | 2377.82>2377.82 | ALO>ALO | yes | 0/21 | 0/0 | 0/0 | 0/0 |
| monza | hard | 20 | 7 | 0.169>0.194 | 21x1 > 21x1 | 21x1 | 21x1 | 2397.3>2397.3 | ALO>ALO | yes | 0/21 | 0/0 | 0/0 | 0/0 |

Monza and Shanghai are identical races before and after. At the Red Bull Ring the dearer stop (pit loss in laps up 10 to 13 %; 12 to 18 % across the three circuits) makes a few cars swap compound order in a 10-lap race, and planned two-stops become one-stops in a 20-lap race; stops actually made barely move. No disqualification, no single-compound finisher, no retirement in 48 races.

The player's reference plan (RACE SETTINGS stint bar), hard: Red Bull Ring 20 laps reads 2 stops (H > H > M, laps 7 and 14) before and 1 stop (H > M, lap 11) after; Bahrain, Qatar and Monza are unchanged at 10, 15, 20 and 30 laps.

## What does not move

A state hash (every car's position, speed, lap, stops and wear, plus the RNG seed and stream, every 30 frames) is identical before and after for races with tyre wear off (Monza hard, Suzuka normal, Monaco easy) and for Monza hard with wear on; it differs for the Red Bull Ring with wear on, through `referenceLapS` only.

## After the first measurement: what spreads the field, and the qualifying-trim yardstick

- The driven spread is the team wing level `aeroLoad`, not ERS deploy: with each car alone at Monza (hard), Ocon with Gasly's `aeroLoad` laps 118.83 (from 122.85) and Gasly with Ocon's 122.58 (from 118.70); swapping `ersDeploy` changes nothing. The per-car residual of the model correlates 0.83 with `aeroLoad` (independent reader, 333 car-cells).
- A driven qualifying lap is quicker than a clear-air race lap by the same driver model: 0.4 to 0.9 % with tyre wear off (the flying start), 1.3 to 2.0 % with wear "real" (plus zero fuel and a set fitted at temperature), at Monza, Monaco and Suzuka on hard.
- Prototype (not in this PR): `carLap` also takes `sqrt(1 + (aeroLoad - 0.5) x 0.16)` on the corner cap. Sheet span P1 to P22 on hard goes from 0.8-1.5 s to 2.6-5.4 s (median 4.0; driven 2.5-8.9, median 5.4). Centred on 1.00 an AI-median lap lands at P12 by median, but pole at 10 circuits and last at 3 of 52: the model's circuit-to-circuit error (0.979 to 1.027) is larger than the gap between grid places.
- By circuit type (independent reader, hard): power 0.971, street 0.956, flowing high-downforce 0.986. Not fitted away here.

## Scripts (run with the working directory at the tree to measure)

Calendar: `node cal.cjs drive out/drive-0.json 0/2` and `1/2`, then `node cal.cjs model out/model-after.json` on the patched tree and on a worktree of the base (`out/model-base.json`); the tables above are per-circuit medians of `model / best` over the sampled cars. Stops: `node stops.cjs out/stops-after.json` on each tree; the table compares the two JSON files car by car. A process that boots more than about 40 games can run out of heap: the scripts resume from their output file.

### cal.cjs

```js
// cal.cjs <drive|model> <out.json> [shard k/n] — run with cwd = the tree to measure.
// drive: clear-air best laps of two thinned AI fields (grid slots i%4==1 and i%4==3), best of 3.
// model: the simulated sheet (P1/P11/P22), referencePole and carLap per car. No driving.
const path = require("path"), fs = require("fs");
const { createGame } = require(path.join(process.cwd(), "tools/lib/game-vm.cjs"));
const [mode, out, shard] = process.argv.slice(2);
const [k, n] = (shard || "0/1").split("/").map(Number);
const tracks = (process.env.TRACKS ? process.env.TRACKS.split(",") : fs.readdirSync("js/circuits").filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3)).sort())
  .filter((_, i) => i % n === k);
const levels = (process.env.LEVELS || "easy,normal,hard").split(",");
const LAPS = 3, DT = 1 / 60;
const res = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : {};

async function cell(track, difficulty) {
  const g = await createGame({ track, carMeshes: false, storage: { difficulty } });
  try {
    const a = g.apex; a.headless(true);
    const row = { pace: null, cars: {} };
    if (mode === "model") {
      await g.race(track, "day", "dry", { laps: LAPS + 2 });
      const G = g.G; row.pace = G.PACE;
      const q = g.sandbox.Quali.create(G);
      row.pole = q.referencePole();
      const sheet = (G.qualiSim(0) || []).map((r) => r.t).filter((t) => t > 0).sort((x, y) => x - y);
      row.sheet = [sheet[0], sheet[10], sheet[sheet.length - 1]]; row.sheetN = sheet.length; row.sheetAll = sheet;
      G.cars.forEach((c, i) => { row.cars[i] = { code: c.code, tierV: c.tierV, skill: c.skill, aero: c.aeroLoad, model: q.carLap(c, G.track, G.gripMult(c)) }; });
      return row;
    }
    for (const keep of [1, 3]) {
      await g.race(track, "day", "dry", { laps: LAPS + 2 });
      const G = g.G; row.pace = G.PACE;
      g.aiOnly();
      G.cars.forEach((c, i) => { if (!c.retired && i % 4 !== keep) a.retire(i, "bench"); });
      G.cars.forEach((c) => { if (c.retired) { c.x = (c.x >= 0 ? 1 : -1) * 500; c.xVis = c.x; c.parkedOnRoad = false; } });
      const idx = []; G.cars.forEach((c, i) => { if (!c.retired) idx.push(i); });
      const cars = idx.map((i) => G.cars[i]);
      const seen = cars.map((c) => c.lap || 0), last = cars.map(() => null), laps = cars.map(() => []);
      let t = 0;
      for (let f = 0; f < 900 / DT && laps.some((l) => l.length < LAPS); f++) {
        g.step(1, DT); t += DT;
        cars.forEach((c, i) => { if ((c.lap || 0) > seen[i]) { if (last[i] != null) laps[i].push(t - last[i]); last[i] = t; seen[i] = c.lap; } });
      }
      cars.forEach((c, i) => { row.cars[idx[i]] = { code: c.code, tierV: c.tierV, skill: c.skill, best: laps[i].length ? Math.min(...laps[i]) : null, laps: laps[i].map((x) => +x.toFixed(3)) }; });
    }
    return row;
  } finally { g.close(); }
}

(async () => {
  for (const tr of tracks) for (const lv of levels) {
    const key = tr + "|" + lv;
    if (res[key]) continue;
    try { res[key] = await cell(tr, lv); } catch (e) { res[key] = { error: String(e && e.message || e) }; }
    fs.writeFileSync(out, JSON.stringify(res));
    console.log(key, res[key].error || "ok");
  }
})();
```

### stops.cjs

```js
// stops.cjs <out.json> — cwd = the tree. Full AI races with tyre wear "real"; per-car stops, order, DSQ.
const path = require("path"), fs = require("fs");
const { createGame } = require(path.join(process.cwd(), "tools/lib/game-vm.cjs"));
const out = process.argv[2];
const tracks = (process.env.TRACKS || "redbull,shanghai,monza").split(",");
const levels = (process.env.LEVELS || "normal,hard").split(",");
const lapsList = (process.env.LAPS || "10,20").split(",").map(Number);
const seeds = (process.env.SEEDS || "1,7").split(",").map(Number);
const res = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : {};
const DT = 1 / 60;

async function cell(track, difficulty, laps, seed) {
  const g = await createGame({ track, carMeshes: false, storage: { difficulty, tyreWear: "real" } });
  try {
    const a = g.apex, t0 = Date.now(); a.headless(true); a.seed(seed);
    await g.race(track, "day", "dry", { laps });
    const G = g.G;
    g.aiOnly();
    const row = { pace: G.PACE, wear: G.tyres.level(), seed: G.seed, lapsTarget: G.lapsTarget, pole: G.referencePole(), twoCompound: G.pits.twoCompoundApplies(), cars: {} };
    const plans = {};
    let f = 0; const cap = (laps * 260 + 240) / DT;
    for (; f < cap && G.state !== "results"; f++) {
      g.step(1, DT);
      if (f === 120) G.cars.forEach((c) => { if (c.pitPlan) plans[c.code] = { stops: c.pitPlan.stops, seq: c.pitPlan.seq, lapsAt: c.pitPlan.lapsAt, pll: c.pitPlan.pitLossLaps }; });
    }
    row.state = G.state; row.simS = +(f * DT).toFixed(1); row.wallS = (Date.now() - t0) / 1000;
    G.cars.forEach((c) => {
      if (c.isPlayer || (c.retired && c.dnf === "bench")) return;
      row.cars[c.code] = { finPos: c.finPos || 0, finishT: c.finishT != null ? +c.finishT.toFixed(2) : null, lap: c.lap, stops: c.pitStops || 0,
        tyres: (c.tyreLog || []).map((x) => (x && (x.code || x.cls || x)) + "").join(">"), dsq: c.dsq || null, retired: !!c.retired, dnf: c.dnf || null,
        pen: c.penalty || 0, plan: plans[c.code] || null };
    });
    return row;
  } finally { g.close(); }
}

(async () => {
  for (const tr of tracks) for (const lv of levels) for (const laps of lapsList) for (const seed of seeds) {
    const key = [tr, lv, laps, seed].join("|");
    if (res[key]) continue;
    try { res[key] = await cell(tr, lv, laps, seed); } catch (e) { res[key] = { error: String(e && e.stack || e) }; }
    fs.writeFileSync(out, JSON.stringify(res));
    const r = res[key];
    console.log(key, r.error ? r.error.slice(0, 300) : `${r.state} sim ${r.simS}s wall ${r.wallS}s stops ${Object.values(r.cars).map((c) => c.stops).join("")}`);
  }
})();
```

