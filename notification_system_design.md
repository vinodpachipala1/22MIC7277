# Stage 1

## 1. Core Notification Object Schema
All endpoints interacting with notifications will utilize the following base JSON structure.

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

## 2. REST API Contracts

### Fetch Notifications
Retrieves a paginated list of user notifications, with optional filtering by type.

* **Method:** `GET`
* **Endpoint:** `/api/v1/notifications`
* **Headers:** * `Authorization: Bearer <user_token>`
* **Query Parameters:**
  * `limit` (integer) - Number of records per page.
  * `page` (integer) - The specific page to fetch.
  * `notification_type` (string, optional) - Filters by type. Possible values: `Event`, `Result`, `Placement`.
* **Request Body:** None
* **Response (200 OK):**
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

### Mark Single Notification as Read
Acknowledges a specific notification.

* **Method:** `PATCH`
* **Endpoint:** `/api/v1/notifications/:id/read`
* **Headers:** * `Authorization: Bearer <user_token>`
* **Request Body:** None
* **Response (200 OK):**
```json
{
  "message": "Notification marked as read successfully."
}
```

### Mark All Notifications as Read
Acknowledges all currently unread notifications for the authorized user.

* **Method:** `PATCH`
* **Endpoint:** `/api/v1/notifications/read-all`
* **Headers:** * `Authorization: Bearer <user_token>`
* **Request Body:** None
* **Response (200 OK):**
```json
{
  "message": "All notifications marked as read."
}
```

### Get Unread Notification Count
Fetches the total number of unread notifications to populate UI badges.

* **Method:** `GET`
* **Endpoint:** `/api/v1/notifications/unread-count`
* **Headers:** * `Authorization: Bearer <user_token>`
* **Request Body:** None
* **Response (200 OK):**
```json
{
  "count": 12
}
```

---

## 3. Real-Time Notification Architecture

To deliver notifications instantly without requiring the client to poll the server, the platform will utilize a **WebSocket** architecture (e.g., Socket.io). 

When a user successfully authenticates on the frontend, a persistent, bidirectional WebSocket connection is established with the Node.js backend. As domain events occur (e.g., HR triggers a new placement alert), the server emits the `notification_object` payload directly to the connected client's active socket, updating the UI feed immediately.

To ensure high availability and scalability across multiple backend server instances, the socket connections can be horizontally scaled using a Redis Pub/Sub adapter or an event broker to guarantee distributed real-time delivery to the correct client nodes.

---



# Stage 2

## 1. Database Selection
**Choice:** PostgreSQL 

**Reasoning:**
* **Structured Data:** Notifications have a fixed schema (ID, Type, Message, Timestamp).
* **Reliability:** ACID compliance ensures read/unread states are accurate across the app.
* **Querying:** PostgreSQL supports filtering, sorting, and pagination efficiently out of the box.

## 2. Database Schema

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

## 3. Scaling Challenges & Solutions

**Problems as data volume increases:**
1. **Slow Queries:** Millions of rows will cause slow sequential scans when filtering for a specific student's alerts.
2. **High DB CPU Load:** Fetching unread counts on every page load will overwhelm the database.
3. **Table Bloat:** Storing years of old, read notifications slows down operations on active data.

**Solutions:**
* **Indexing:** Add a composite index on `(student_id, is_read, created_at DESC)` to speed up our most common read queries.
* **Caching:** Use Redis to store the unread count per user. Only hit the DB when a new notification arrives or state changes.
* **Partitioning/Archiving:** Implement a cron job to move read notifications older than 30 days to a separate archive table.

## 4. Applicable SQL Queries

**Fetch Notifications (with Pagination & Type Filtering):**
```sql
SELECT id, type, message, is_read, created_at 
FROM notifications 
WHERE student_id = $1 
  AND ($2::notification_type IS NULL OR type = $2)
ORDER BY created_at DESC 
LIMIT $3 OFFSET $4;
```

**Mark Single Notification as Read:**
```sql
UPDATE notifications 
SET is_read = TRUE 
WHERE id = $1 AND student_id = $2;
```

**Mark All Notifications as Read:**
```sql
UPDATE notifications 
SET is_read = TRUE 
WHERE student_id = $1 AND is_read = FALSE;
```

**Get Unread Notification Count:**
```sql
SELECT COUNT(*) 
FROM notifications 
WHERE student_id = $1 AND is_read = FALSE;
```


## Stage 3

### 1. Query Analysis
**Is the query accurate?** Logically yes, it correctly targets unread notifications for a specific student. However, using `SELECT *` is bad practice; it wastes memory and network bandwidth by fetching unneeded columns.

**Why is it slow?**
With 5,000,000 rows, executing this without a proper index results in a **Sequential Scan** (Full Table Scan). The database engine must read every single row on the disk to check the conditions. Furthermore, the `ORDER BY createdAt ASC` clause forces the database to perform an expensive in-memory sort on the resulting rows.

### 2. Proposed Changes & Computation Cost
**What to change:**
1. Replace `SELECT *` with only the required columns (e.g., `SELECT id, type, message, created_at`).
2. Implement a composite B-Tree index specifically tailored for this query: 
   `CREATE INDEX idx_user_unread ON notifications (student_id, is_read, created_at ASC);`

**Likely Computation Cost:**
* **Current (No Index):** **O(N)** time complexity. The engine scans all 5 million rows.
* **Proposed (With Index):** **O(log N)** time complexity. The B-Tree index allows the database to instantly traverse to the exact `student_id` and `is_read` node. Because `created_at` is included in the index, the data is already pre-sorted, entirely eliminating the sorting overhead.

### 3. Evaluating "Index Every Column" Advice
**Is this advice effective?** No, this is a dangerous database anti-pattern.

**Why/Why not?**
While indexes drastically speed up `SELECT` (read) queries, they heavily penalize write operations (`INSERT`, `UPDATE`, `DELETE`). If every column is indexed, the database has to update every single index tree every time a new notification is sent or marked as read. For a high-volume notification system, this would cause massive write latency, CPU spikes, and severe storage bloat. Indexes should be strictly limited to columns frequently used in `WHERE`, `JOIN`, or `ORDER BY` clauses.

### 4. Recent Placements Query
Query to fetch all students who received a placement notification in the last 7 days:

```sql
SELECT DISTINCT student_id 
FROM notifications 
WHERE type = 'Placement' 
  AND created_at >= NOW() - INTERVAL '7 days';


## Stage 4

### 1. Problem Analysis
The database is being overwhelmed because the frontend treats the notification API as stateless on every route change. Fetching notifications (or even just the unread count) on every page load causes massive, redundant read operations for data that hasn't actually changed.

### 2. Suggested Strategies & Tradeoffs

To solve this, I suggest a hybrid approach combining **Backend Caching** and **Frontend State Management**.

#### Strategy 1: Client-Side Global State + WebSockets (Frontend Optimization)
**How it improves performance:** Instead of the component fetching data on mount, we fetch the user's notifications **once** upon initial login and store them in a global state manager (e.g., React Context, Zustand, or Redux). As users navigate between pages, the UI reads directly from this local memory. We utilize the WebSocket connection (established in Stage 1) to listen for real-time `new_notification` events and append them to the global state dynamically.

**Tradeoffs:**
* **Pros:** Zero network latency on page loads; drastically reduces backend HTTP traffic and DB load.
* **Cons:** Increases memory consumption on the user's browser. Handling socket disconnections and state resynchronization adds frontend complexity.

#### Strategy 2: Redis Caching Layer (Backend Optimization)
**How it improves performance:**
Even with frontend optimizations, users refreshing the page or logging in simultaneously can still spike DB load. We introduce a Redis cache between the Express API and PostgreSQL. When `/api/v1/notifications` is called, the backend checks Redis first. If the data exists, it returns from RAM (sub-millisecond latency). The DB is only queried on a "cache miss". The cache is updated/invalidated ONLY when a notification is inserted or marked as read.

**Tradeoffs:**
* **Pros:** Protects the Postgres database from read-heavy traffic; massive reduction in API response times.
* **Cons:** Adds infrastructure overhead (managing a Redis cluster). Requires careful "cache invalidation" logic to ensure users don't see stale notification states.

#### Strategy 3: Client-Side Stale-While-Revalidate (SWR / React Query)
**How it improves performance:**
Use a data-fetching library like React Query or SWR. It caches the API response in the browser cache. On page load, it instantly serves the cached data to the user, and silently fetches the backend in the background to check for updates, deduplicating multiple requests happening at the same time.

**Tradeoffs:**
* **Pros:** Very easy to implement; provides a great UX with instant loads.
* **Cons:** Users might briefly see an old notification state for a split second before the background revalidation completes.


## Stage 5

### 1. Observed Shortcomings
* **Synchronous & Blocking:** Running 50,000 external API calls and DB inserts sequentially in a single `for` loop blocks the execution thread. If each loop takes just 100ms, the entire process takes over an hour, guaranteeing a server timeout.
* **Lack of Atomicity:** If `send_email` succeeds but `save_to_db` fails, the system state is corrupted (the user received an email, but the app shows no record).
* **No Fault Tolerance:** There is no retry mechanism for temporary network failures.

### 2. Handling Midway Failures
Because the original loop does not track the success/failure state of individual messages, handling the 200 failures is an operational nightmare. You cannot simply rerun the `notify_all` function, or 49,800 students will receive a duplicate email. 

### 3. Redesign Strategy (Reliable & Fast)
To fix this, we must move to an **Asynchronous Message Queue** architecture (e.g., Redis with BullMQ, or RabbitMQ/SQS).
* **Decoupling:** The API simply drops 50,000 "jobs" into a queue and immediately returns a 200 OK to the HR dashboard.
* **Concurrency:** Multiple background worker processes consume the queue simultaneously, drastically speeding up delivery.
* **Resilience:** If an email API call fails, the queue automatically retries that specific job based on a backoff strategy, or moves it to a Dead Letter Queue (DLQ) for manual inspection, preventing data loss.

### 4. Coupling DB and Email
**Should they happen together? No.** Saving to a Postgres DB is a fast, internal operation. Calling an external Email API is slow and prone to network drops or rate limits. They must be decoupled. The DB insert should happen first to establish the absolute "source of truth". Only after the data is safely persisted should the unreliable external API be called.

### 5. Revised Pseudocode

```javascript
// --- API Handler (Executes in milliseconds) ---
function notify_all(student_ids: array, message: string):
    // 1. Bulk insert to DB first (Fast, reliable source of truth)
    bulk_save_to_db(student_ids, message)
    
    // 2. Push independent jobs to a message queue
    for student_id in student_ids:
        message_queue.add({ action: "deliver", student_id, message })

    return "Notifications queued for delivery"


// --- Background Worker (Runs continuously, processes concurrently) ---
function process_job(job):
    try:
        // Execute slow/external tasks
        send_email(job.student_id, job.message)
        push_to_app(job.student_id, job.message) // Emit via WebSocket
        
    catch Error:
        // Queue automatically handles retries without affecting other users
        job.retry_with_backoff()


## Stage 6

### 1. Priority Sorting Approach
To determine the top 'n' notifications, the algorithm assigns a numerical weight to each type: `Placement = 3`, `Result = 2`, `Event = 1`. 
When comparing two notifications:
1. The one with the higher weight wins.
2. If the weights are identical, the one with the more recent `Timestamp` wins.

### 2. Efficiently Maintaining Top 10 (Streaming Data)
When handling an initial bulk payload, a standard sort `O(M log M)` is sufficient. However, as new notifications continuously stream in via WebSockets, resorting the entire array is highly inefficient. 

To maintain the top 10 efficiently in memory, we use a **Bounded Min-Heap** of size `n`:
* The root of the heap always holds the *lowest* priority notification currently in the top 10.
* When a new notification arrives, it is compared to the root in `O(1)` time.
* If it has a higher priority than the root, we pop the root and insert the new notification in `O(log n)` time.
* This guarantees that updating the Priority Inbox requires virtually zero compute overhead as the platform scales.

