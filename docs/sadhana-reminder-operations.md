# Sadhana reminder delivery

## Verified deployment prerequisite

On 2026-09-06, Cloud Scheduler returned HTTP 403 with `Cloud Scheduler API has
not been used in project bvpw108 before or it is disabled`. Browser timers do
not provide closed-browser delivery. Deploy the notification changes and
activate a server scheduler before declaring automatic reminders operational.

## Proposed PW job

- Project: `bvpw108`
- Location: `asia-southeast1`
- Job name: `pw-sadhana-reminders`
- Cron schedule: `* * * * *`
- Time zone: `Asia/Kolkata`
- Method: `POST`
- URL: `https://academy.prabhupadaworld.com/api/run/sendPushNotifications`
- Content-Type: `application/json`
- Retry count: `0` (avoid repeating a delivered reminder)
- Request body:

```json
{
  "cronSecret": "<value of existing ziteCronSecret, supplied securely>",
  "reminderSlot": "night-1",
  "segment": "PW",
  "scheduled": true
}
```

The endpoint checks the saved enabled flag, frequency, selected weekdays, and
IST time before querying recipients. Most minute calls return without sending.
Settings changes take effect without editing the job. The live saved times
observed on 2026-09-06 were 14:35, 15:15, 21:20 and 22:20 IST, daily.
Keep the cron secret out of source control, command output and client code.
This job targets PW only; FOLK needs an explicitly configured department job.

## Verification after activation

Use a consenting test member who has not submitted for the target day. Confirm
an in-app reminder with the app visible, then a native Chrome notification
with it closed, and confirm no reminder after submitting. `sent` means the
push service accepted the request, not that the device displayed it.
`inAppRecipients` counts members included in the published broadcast; it does
not count users who actually saw it. In-app broadcasts are transient and
require an already-open app, not a persistent notification inbox.

Check a successful Cloud Scheduler attempt at a configured time and the
endpoint result. An App Hosting build success alone does not establish delivery.
