import axios from 'axios';
import { Log } from '../logging_middleware/index.js';

const API_URL = "http://4.224.186.213/evaluation-service/notifications";
const ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJNYXBDbGFpbXMiOnsiYXVkIjoiaHR0cDovLzIwLjI0NC41Ni4xNDQvZXZhbHVhdGlvbi1zZXJ2aWNlIiwiZW1haWwiOiJ2aW5vZHBhY2hpcGFsYTkzQGdtYWlsLmNvbSIsImV4cCI6MTc3ODkzMzUxMywiaWF0IjoxNzc4OTMyNjEzLCJpc3MiOiJBZmZvcmQgTWVkaWNhbCBUZWNobm9sb2dpZXMgUHJpdmF0ZSBMaW1pdGVkIiwianRpIjoiNjllMThkMmYtYzkyMS00M2FmLWI2NDItYjA0N2YzZGNhYTFlIiwibG9jYWxlIjoiZW4tSU4iLCJuYW1lIjoicGFjaGlwYWxhIHZpbm9kIiwic3ViIjoiZmMxNjUzNjQtMGQyYS00YmQ0LTk3MjctYTgxNDk1YTcyNDFiIn0sImVtYWlsIjoidmlub2RwYWNoaXBhbGE5M0BnbWFpbC5jb20iLCJuYW1lIjoicGFjaGlwYWxhIHZpbm9kIiwicm9sbE5vIjoiMjJtaWM3Mjc3IiwiYWNjZXNzQ29kZSI6IlNmRnVXZyIsImNsaWVudElEIjoiZmMxNjUzNjQtMGQyYS00YmQ0LTk3MjctYTgxNDk1YTcyNDFiIiwiY2xpZW50U2VjcmV0IjoiS0JuS01nYnREbmdtdUZwZCJ9.50TDBy2CEQMElCS4Gc_Kklo1UUUB4TCHzJ1yWbrmF9k"
const WEIGHTS = {
    "Placement": 3,
    "Result": 2,
    "Event": 1
};


function comparePriority(a, b) {
    const weightA = WEIGHTS[a.Type] || 0;
    const weightB = WEIGHTS[b.Type] || 0;

    if (weightA !== weightB) {
        return weightB - weightA; 
    }
    
    const timeA = new Date(a.Timestamp).getTime();
    const timeB = new Date(b.Timestamp).getTime();
    return timeB - timeA; 
}

async function fetchPriorityInbox(n = 10) {
    try {
        const response = await axios.get(API_URL, {
            headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
        });

        const notifications = Array.isArray(response.data) 
            ? response.data 
            : (response.data.notifications || []);
        
        notifications.sort(comparePriority);

        const topN = notifications.slice(0, n);
        
        console.log(`\nTOP ${n} PRIORITY INBOX`);
        console.table(topN.map(item => ({
            Type: item.Type,
            Message: item.Message,
            Timestamp: item.Timestamp
        })));

        await Log("backend", "info", "service", "Priority inbox fetched successfully");

    } catch (error) {
        console.error("Failed to fetch notifications:", error.response?.data || error.message);
        
        await Log("backend", "error", "service", "Failed to fetch notifications");
    }
}

fetchPriorityInbox(10);