import axios from "axios";

const isBrowser = typeof window !== "undefined";
const url = isBrowser 
  ? "/evaluation-service/logs" 
  : "http://4.224.186.213/evaluation-service/logs";

const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJNYXBDbGFpbXMiOnsiYXVkIjoiaHR0cDovLzIwLjI0NC41Ni4xNDQvZXZhbHVhdGlvbi1zZXJ2aWNlIiwiZW1haWwiOiJ2aW5vZHBhY2hpcGFsYTkzQGdtYWlsLmNvbSIsImV4cCI6MTc3ODkzNDQ0MywiaWF0IjoxNzc4OTMzNTQzLCJpc3MiOiJBZmZvcmQgTWVkaWNhbCBUZWNobm9sb2dpZXMgUHJpdmF0ZSBMaW1pdGVkIiwianRpIjoiZDk3MTdhMDAtOGQyNC00ZjA0LWE4MGItNmM0ZWE5NzlmMTAwIiwibG9jYWxlIjoiZW4tSU4iLCJuYW1lIjoicGFjaGlwYWxhIHZpbm9kIiwic3ViIjoiZmMxNjUzNjQtMGQyYS00YmQ0LTk3MjctYTgxNDk1YTcyNDFiIn0sImVtYWlsIjoidmlub2RwYWNoaXBhbGE5M0BnbWFpbC5jb20iLCJuYW1lIjoicGFjaGlwYWxhIHZpbm9kIiwicm9sbE5vIjoiMjJtaWM3Mjc3IiwiYWNjZXNzQ29kZSI6IlNmRnVXZyIsImNsaWVudElEIjoiZmMxNjUzNjQtMGQyYS00YmQ0LTk3MjctYTgxNDk1YTcyNDFiIiwiY2xpZW50U2VjcmV0IjoiS0JuS01nYnREbmdtdUZwZCJ9._d52qMxQ3KmZy49btZK8FhwHj4YFzsbpN_5CahTH6I4";

const stacks = ["backend", "frontend"];
const levels = ["debug", "info", "warn", "error", "fatal"];
const pkgs = [
  "cache", "controller", "cron_job", "db", "domain", "handler", "repository", "route",
  "service", "api", "component", "hook", "page", "state", "style", "auth", "config",
  "middleware", "utils"
];

export const Log = async (stack, level, pkg, message) => {
  try {
    const s = String(stack).toLowerCase();
    const l = String(level).toLowerCase();
    const p = String(pkg).toLowerCase();

    if (!stacks.includes(s) || !levels.includes(l) || !pkgs.includes(p)) {
      console.log(`[Middleware Validation Failed] Invalid inputs: ${s}, ${l}, ${p}`);
      return;
    }

    const res = await axios.post(url, {
      stack: s,
      level: l,
      package: p,
      message
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log(`[Middleware Success] Log posted. Status: ${res.status}`);
    return res.data;
  } catch (e) {
    console.error("[Middleware Error] Log post failed:", e.response?.data || e.message);
  }
};