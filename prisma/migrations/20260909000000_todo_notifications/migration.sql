-- A dated To-Do could go overdue without the notification engine ever seeing
-- it: Needs Attention and Upcoming & Due knew, the bell did not. A To-Do now
-- raises its own notification, on the due date itself.
--
-- There is no lead time to add alongside the milestone/relationship/custom-item
-- settings: ADR-009 is explicit that capture must not require a deadline, so a
-- To-Do has no advance stage to look ahead from. It speaks on the day, which
-- also means it is a statement rather than a prediction -- and so, like an
-- expired document, it is not silenced by turning reminders off.
ALTER TYPE "NotificationType" ADD VALUE 'TODO_DUE';

ALTER TABLE "Notification" ADD COLUMN "todoId" TEXT;

CREATE UNIQUE INDEX "Notification_userId_todoId_type_expiryDate_key"
ON "Notification"("userId", "todoId", "type", "expiryDate");

CREATE INDEX "Notification_todoId_idx" ON "Notification"("todoId");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_todoId_fkey"
FOREIGN KEY ("todoId") REFERENCES "Todo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
