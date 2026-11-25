Fixed: RESTORE DRIVER CAREER / MY TEAM SAVES and LOAD CAREER FILE now skip a damaged slot, a slot from a newer build or a row with a junk slot number, list it in the review and import the rest; before, one bad slot refused the whole file (#6587, #6601).
Fixed: EXPORT ALL CAREER SAVES no longer fails when one stored slot is damaged; that slot is left out and the save message counts it (#6587).
Fixed: VIEW RESTORE POINTS can now restore over a damaged career slot; it says the damaged value can't be kept as a restore point, and a newer build's save is still protected (#6604).
