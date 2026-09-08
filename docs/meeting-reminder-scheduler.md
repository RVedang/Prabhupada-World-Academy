# Meeting reminder scheduler

Run one authenticated Cloud Scheduler job every minute against the deployed endpoint:

`POST https://academy.prabhupadaworld.com/api/run/sendDueMeetingReminders`

Request body:

```json
{ "cronSecret": "<APP_CRON_SECRET>" }
```

Use the existing `APP_CRON_SECRET` (or `ZITE_CRON_SECRET`) App Hosting secret. The endpoint finds scheduled meetings that are due within 90 seconds of either reminder point, sends the 10-minute and 1-minute reminder once each, and records the sent flags on the meeting.

Each reminder is delivered to every meeting invitee through the in-app broadcast. Invitees with an enabled device subscription also receive Web Push. The service worker opens the meeting link when the notification is clicked.
