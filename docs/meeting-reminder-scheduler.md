# Meeting reminder scheduler

Run one authenticated Cloud Scheduler job every minute against the deployed endpoint:

`POST https://academy.prabhupadaworld.com/api/run/sendDueMeetingReminders`

Request body:

```json
{ "cronSecret": "<APP_CRON_SECRET>" }
```

Use the existing `APP_CRON_SECRET` (or `ZITE_CRON_SECRET`) App Hosting secret. The endpoint sends **10-minute and 1-minute reminders** for scheduled PW meetings.

If a scheduler tick is delayed, the 10-minute reminder can catch up until 1 minute before the meeting; the 1-minute reminder can catch up until the meeting starts. Cancelled, completed, started and FOLK meetings are excluded. Timezone-less meeting times use IST; explicit timezone offsets are preserved.

Each reminder publishes an in-app broadcast addressed to every participant's resolved account IDs and email, independently of Web Push. Native delivery requires notification permission and an enabled browser subscription. Every matching device is targeted, including when the app is hidden or closed; clicking the notification opens the meeting link. A push provider accepting a request does not confirm that the device displayed it.

Participant IDs are resolved against current user profiles, including legacy IDs and Firebase UIDs. Meeting edits fetch participant details in batches of 30. Meeting and subscription reads are paginated, so fixed record limits do not exclude recipients.

The server keeps a transaction lease and delivery checkpoint in `meta/meetingReminder-<hash>` for each meeting time and reminder type. Concurrent browser and scheduler calls share this checkpoint. Accepted devices are not retried during normal processing; transient failures remain eligible for the next scheduler tick. Expired subscriptions (404/410) do not block other devices. A crash between provider acceptance and saving the checkpoint can still cause a retry; stable notification IDs help clients suppress duplicates. Editing the meeting time creates a new checkpoint; changing participants reopens delivery while preserving accepted-device checkpoints.

Verification on 2026-09-09: the live `asia-southeast1/pw-meeting-reminders` Cloud Scheduler job was enabled on a one-minute schedule, with a successful latest attempt. This verifies scheduler configuration, not deployment of these source changes or delivery to participants' devices.
