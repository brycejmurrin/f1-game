Fixed: on a slow link the installed app no longer lands on "cannot open the page" after a new build deploys; it waits for the new shell instead of giving up after 3 s (#4924).
Fixed: when the launch-time update check fails on a bad link, the app now re-checks for a new build 30 s later instead of 10 minutes later (#4925).
