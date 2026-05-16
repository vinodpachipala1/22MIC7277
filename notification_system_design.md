# Notification System Design

## Stage 1

### 1. Core Notification Object Schema

All endpoints interacting with notifications will use the following base JSON structure.

```json
{
  "ID": "d146095a-0d86-4a34-9e69-3900a14576bc",
  "Type": "Placement",
  "Message": "CSX Corporation hiring",
  "isRead": false,
  "Timestamp": "2026-04-22 17:51:18"
}
```

---

### 2. REST API Contracts

#### Fetch Notifications

Retrieves a paginated list of user notifications with optional filtering.

- Method: GET
- Endpoint: `/api/v1/notifications`
- Headers:
  - Authorization: Bearer `<user_token>`

##### Query Parameters
- `limit` → number of records per page
- `page` → page number
- `notification_type` → optional filter (`Event`, `Result`, `Placement`)

##### Response

```json
{
  "data": [
    {
      "ID": "d146095a-0d86-4a34-9e69-3900a14576bc",
      "Type": "Placement",
      "Message": "CSX Corporation hiring",
      "isRead": false,
      "Timestamp": "2026-04-22 17:51:18"
    }
  ],
  "meta": {
    "currentPage": 1,
    "totalPages": 5,
    "totalRecords": 45
  }
}
```

---

#### Mark Single Notification as Read

- Method: PATCH
- Endpoint: `/api/v1/notifications/:id/read`

##### Response

```json
{
  "message": "Notification marked as read successfully."
}
```

---

#### Mark All Notifications as Read

- Method: PATCH
- Endpoint: `/api/v1/notifications/read-all`

##### Response

```json
{
  "message": "All notifications marked as read."
}
```

---

#### Get Unread Notification Count

- Method: GET
- Endpoint: `/api/v1/notifications/unread-count`

##### Response

```json
{
  "count": 12
}
```

---

### 3. Real-Time Notification Architecture

To avoid continuous polling from the client side, the system uses WebSockets for real-time delivery.

When a user logs in, a persistent socket connection is established between frontend and backend. Whenever a new notification is generated, the backend emits the notification directly to the connected client.

For scalability across multiple servers, Redis Pub/Sub can be used to synchronize socket events.

---

# Stage 2

### 1. Database Selection

**Chosen Database:** PostgreSQL

#### Reasons
- Notifications follow a structured schema
- PostgreSQL supports filtering, sorting, and pagination efficiently
- ACID compliance helps maintain correct read/unread states

---

### 2. Database Schema

```sql
CREATE TYPE notification_type AS ENUM ('Event', 'Result', 'Placement');

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL,
    type notification_type NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

### 3. Scaling Challenges and Solutions

#### Problems
- Slow queries when table size grows
- High database load from unread count requests
- Old notification records increasing table size

#### Solutions
- Add indexes on commonly queried fields
- Use Redis caching for unread counts
- Archive old notifications periodically

---

### 4. SQL Queries

#### Fetch Notifications

```sql
SELECT id, type, message, is_read, created_at
FROM notifications
WHERE student_id = $1
  AND ($2::notification_type IS NULL OR type = $2)
ORDER BY created_at DESC
LIMIT $3 OFFSET $4;
```

#### Mark Single Notification as Read

```sql
UPDATE notifications
SET is_read = TRUE
WHERE id = $1 AND student_id = $2;
```

#### Mark All Notifications as Read

```sql
UPDATE notifications
SET is_read = TRUE
WHERE student_id = $1 AND is_read = FALSE;
```

#### Get Unread Notification Count

```sql
SELECT COUNT(*)
FROM notifications
WHERE student_id = $1 AND is_read = FALSE;
```

---

# Stage 3

### 1. Query Analysis

The query logic is correct for fetching unread notifications. However, using `SELECT *` is inefficient because it retrieves unnecessary columns.

Without indexing, the database performs a full table scan which becomes very slow when the table contains millions of rows.

---

### 2. Proposed Improvements

#### Recommended Changes
- Fetch only required columns
- Add a composite index

```sql
CREATE INDEX idx_user_unread
ON notifications (student_id, is_read, created_at ASC);
```

#### Complexity
- Without index → `O(N)`
- With index → `O(log N)`

---

### 3. Why Indexing Every Column is Bad

Creating indexes on every column increases storage usage and slows down insert/update operations because every index must also be updated.

Indexes should mainly be created for columns used in:
- WHERE
- JOIN
- ORDER BY

---

### 4. Query for Recent Placements

```sql
SELECT DISTINCT student_id
FROM notifications
WHERE type = 'Placement'
  AND created_at >= NOW() - INTERVAL '7 days';
```

---

# Stage 4

### 1. Problem Analysis

The frontend repeatedly calling notification APIs on every page load creates unnecessary traffic and database load.

---

### 2. Optimization Strategies

#### Strategy 1: Global State + WebSockets

Store notifications in a global frontend state and update them through WebSockets.

##### Advantages
- Faster page navigation
- Reduced API calls

##### Drawbacks
- Slightly higher frontend complexity

---

#### Strategy 2: Redis Caching

Store unread counts and frequently accessed notification data in Redis.

##### Advantages
- Faster responses
- Lower database load

##### Drawbacks
- Additional infrastructure setup

---

#### Strategy 3: SWR / React Query

Use frontend caching libraries for stale-while-revalidate behavior.

##### Advantages
- Better user experience
- Reduced duplicate requests

##### Drawbacks
- Small possibility of briefly showing stale data

---

# Stage 5

### 1. Issues in the Original Design

- Sequential processing blocks execution
- No retry mechanism
- Database and email operations are tightly coupled

---

### 2. Failure Handling

If the process fails midway, rerunning it may send duplicate notifications to users.

---

### 3. Improved Design

Use an asynchronous message queue system such as BullMQ or RabbitMQ.

#### Benefits
- Faster processing
- Retry support
- Better scalability

---

### 4. DB and Email Coupling

Database insertion should happen first because it acts as the source of truth. Email delivery should happen asynchronously afterward.

---

### 5. Revised Pseudocode

```javascript
function notify_all(student_ids, message) {

    bulk_save_to_db(student_ids, message);

    for (const student_id of student_ids) {
        message_queue.add({
            student_id,
            message
        });
    }

    return "Notifications queued";
}

function process_job(job) {

    try {
        send_email(job.student_id, job.message);
        push_to_app(job.student_id, job.message);

    } catch (error) {
        job.retry_with_backoff();
    }
}
```

---

# Stage 6

### 1. Priority Sorting Logic

Priority weights:
- Placement = 3
- Result = 2
- Event = 1

If two notifications have the same priority, the latest timestamp gets higher priority.

---

### 2. Maintaining Top Notifications Efficiently

A bounded min-heap of size `n` can efficiently maintain the top priority notifications.

#### Working
- Root stores the lowest priority item
- Incoming notifications are compared against the root
- Insertions/removals happen in `O(log n)` time

This approach helps maintain the priority inbox efficiently even with continuous real-time notifications.
