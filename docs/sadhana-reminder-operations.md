# Sadhana reminder delivery

## Deployment prerequisite

Browser timers do not provide closed-browser delivery. Deploy the notification
changes and activate the two server jobs below. As checked on 2026-09-09, the
Cloud Scheduler API is active and PW meeting reminders have a separate job.

## Required department jobs

- Project: `bvpw108`
- Location: `asia-southeast1`
- Job names: `pw-sadhana-reminders` and `folk-sadhana-reminders`
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
  "segment": "<PW or FOLK, matching the job>",
  "scheduled": true
}
```

The endpoint checks the selected department's saved enabled flag, frequency,
selected weekdays, and IST time before querying recipients. Most minute calls
return without sending. PW and FOLK settings use separate configuration
records, so changing one department never changes the other department's
schedule. Settings changes take effect without editing the jobs.
Keep the cron secret out of source control, command output and client code.
Meeting reminder jobs are separate. FOLK has no meeting or MoM reminders.

Scheduled dispatch claims each department/minute in a Firestore transaction,
so duplicate scheduler requests cannot resend that slot. Browser and service
worker local reminder timers are removed; day rules and submission eligibility
are evaluated by the server. Manual dispatch is independent of the automatic
enabled switch. Both dispatch paths exclude members who already submitted.

In-app messages use separate server-only `NotificationBroadcasts` documents.
The long-poll route consumes recent messages in order, including when PW and
FOLK send simultaneously. It never returns recipient lists to clients.

## Admin controls

Open **Notifications**, choose the automatic schedule and times (IST), then
click **Save Notification Settings**. A failed database save is shown as an
error. **Send Notification Instantly** sends an immediate Sadhana reminder
after confirmation; it does not require automatic reminders to be enabled.

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
