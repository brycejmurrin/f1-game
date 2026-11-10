Fixed: photo-mode bookmarks with corrupt or short eye/at vectors are refused on save and skipped on load, so LOAD no longer aims the free-cam at NaN.
Fixed: entering photo mode raises a soft render scale back to 1 for the shot (exit still restores the prior scale).
Fixed: the photo FOV slider clamps to 20..110 so a bad value cannot leave FOV at NaN or 0.
