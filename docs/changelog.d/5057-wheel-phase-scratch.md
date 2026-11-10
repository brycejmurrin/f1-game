Fixed: wheel spin no longer allocates a fresh object per car every frame (1,320 short-lived objects a second on a full grid), trimming minor-GC churn on the phone
