import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Container, Typography, Select, MenuItem, FormControl, InputLabel, 
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, 
  Paper, Pagination, Box, Chip 
} from '@mui/material';

import { Log } from 'logging_middleware';

const API_URL = "/evaluation-service/notifications";
const ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJNYXBDbGFpbXMiOnsiYXVkIjoiaHR0cDovLzIwLjI0NC41Ni4xNDQvZXZhbHVhdGlvbi1zZXJ2aWNlIiwiZW1haWwiOiJ2aW5vZHBhY2hpcGFsYTkzQGdtYWlsLmNvbSIsImV4cCI6MTc3ODkzNDQ0MywiaWF0IjoxNzc4OTMzNTQzLCJpc3MiOiJBZmZvcmQgTWVkaWNhbCBUZWNobm9sb2dpZXMgUHJpdmF0ZSBMaW1pdGVkIiwianRpIjoiZDk3MTdhMDAtOGQyNC00ZjA0LWE4MGItNmM0ZWE5NzlmMTAwIiwibG9jYWxlIjoiZW4tSU4iLCJuYW1lIjoicGFjaGlwYWxhIHZpbm9kIiwic3ViIjoiZmMxNjUzNjQtMGQyYS00YmQ0LTk3MjctYTgxNDk1YTcyNDFiIn0sImVtYWlsIjoidmlub2RwYWNoaXBhbGE5M0BnbWFpbC5jb20iLCJuYW1lIjoicGFjaGlwYWxhIHZpbm9kIiwicm9sbE5vIjoiMjJtaWM3Mjc3IiwiYWNjZXNzQ29kZSI6IlNmRnVXZyIsImNsaWVudElEIjoiZmMxNjUzNjQtMGQyYS00YmQ0LTk3MjctYTgxNDk1YTcyNDFiIiwiY2xpZW50U2VjcmV0IjoiS0JuS01nYnREbmdtdUZwZCJ9._d52qMxQ3KmZy49btZK8FhwHj4YFzsbpN_5CahTH6I4";

export default function App() {
  const [notifications, setNotifications] = useState([]);
  const [filterType, setFilterType] = useState('All');
  const [page, setPage] = useState(1);
  const limit = 10;

  async function fetchNotifications() {
    try {
      const response = await axios.get(API_URL, {
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
      });
      const data = Array.isArray(response.data) ? response.data : (response.data.notifications || []);
      setNotifications(data);
      await Log("frontend", "info", "page", "notifications fetched");
    } catch (error) {
      console.error(error.response?.data || error.message);
      await Log("frontend", "error", "api", "notification fetch failed");
    }
  }

  useEffect(() => {
    fetchNotifications();
  }, []);

  const filteredNotifications = filterType === 'All'
    ? notifications
    : notifications.filter(item => item.Type === filterType);

  const totalPages = Math.ceil(filteredNotifications.length / limit);
  const currentNotifications = filteredNotifications.slice((page - 1) * limit, page * limit);

  function chipColor(type) {
    if (type === "Placement") return "success";
    if (type === "Result") return "info";
    if (type === "Event") return "warning";
    return "default";
  }

  return (
    <Container maxWidth="md" sx={{ mt: 5, mb: 5 }}>
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        Campus Notifications
      </Typography>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
        <FormControl sx={{ minWidth: 220 }}>
          <InputLabel>Filter by Type</InputLabel>
          <Select
            value={filterType}
            label="Filter by Type"
            onChange={(e) => {
              setFilterType(e.target.value);
              setPage(1);
            }}
          >
            <MenuItem value="All">All Notifications</MenuItem>
            <MenuItem value="Placement">Placements</MenuItem>
            <MenuItem value="Result">Results</MenuItem>
            <MenuItem value="Event">Events</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <TableContainer component={Paper} elevation={3}>
        <Table>
          <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
            <TableRow>
              <TableCell><b>Type</b></TableCell>
              <TableCell><b>Message</b></TableCell>
              <TableCell><b>Date & Time</b></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {currentNotifications.length > 0 ? (
              currentNotifications.map((item, index) => (
                <TableRow key={index} hover>
                  <TableCell>
                    <Chip label={item.Type} color={chipColor(item.Type)} size="small" />
                  </TableCell>
                  <TableCell>{item.Message}</TableCell>
                  <TableCell>
                    {new Date(item.Timestamp).toLocaleString('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short'
                    })}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={3} align="center" sx={{ py: 3 }}>
                  No notifications found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(e, value) => { setPage(value); }}
            color="primary"
            size="large"
          />
        </Box>
      )}
    </Container>
  );
}
