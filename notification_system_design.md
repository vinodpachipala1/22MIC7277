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

- **Method:** `GET`
- **Endpoint:** `/api/v1/notifications`
- **Headers:**  
  - `Authorization: Bearer <user_token>`

- **Query Parameters:**
  - `limit` (integer) - Number of records per page.
  - `page` (integer) - The specific page to fetch.
  - `notification_type` (string, optional) - Filters by type. Possible values: `Event`, `Result`, `Placement`.

- **Request Body:** None

- **Response (200 OK):**

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

- **Method:** `PATCH`
- **Endpoint:** `/api/v1/notifications/:id/read`
- **Headers:**  
  - `Authorization: Bearer <user_token>`

- **Request Body:** None

- **Response (200 OK):**

```json
{
  "message": "Notification marked as read successfully."
}
```

### Mark All Notifications as Read

Acknowledges all currently unread notifications for the authorized user.

- **Method:** `PATCH`
- **Endpoint:** `/api/v1/notifications/read-all`
- **Headers:**  
  - `Authorization: Bearer <user_token>`

- **Request Body:** None

- **Response (200 OK):**

```json
{
  "message": "All notifications marked as read."
}
```

### Get Unread Notification Count

Fetches the total number of unread notifications to populate UI badges.

- **Method:** `GET`
- **Endpoint:** `/api/v1/notifications/unread-count`
- **Headers:**  
  - `Authorization: Bearer <user_token>`

- **Request Body:** None

- **Response (200 OK):**

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
