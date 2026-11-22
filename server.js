const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");

const app = express();
const PORT = process.env.PORT || 3000;
const seedMeetingsFile = path.join(__dirname, "meetings.json");
const meetingsFile = process.env.VERCEL
    ? path.join(os.tmpdir(), "schedule-meetings.json")
    : seedMeetingsFile;

const seedInterviewFile = path.join(__dirname, "interview.json");
const interviewFile = process.env.VERCEL
    ? path.join(os.tmpdir(), "schedule-interviews.json")
    : seedInterviewFile;

app.use(express.json({ limit: "2mb" }));

let memoryMeetings = null;
let memoryInterviews = null;

function normalizeMeetings(meetings) {
    return meetings.map(meeting => ({
        ...meeting,
        country: meeting.country ?? null
    }));
}

async function readMeetings() {
    if (process.env.VERCEL) {
        const githubFile = await readGitHubJson("meetings.json");
        if (githubFile) {
            memoryMeetings = githubFile.data;
            return normalizeMeetings(githubFile.data);
        }
    }

    if (memoryMeetings) return normalizeMeetings(memoryMeetings);

    if (!fs.existsSync(meetingsFile)) {
        fs.copyFileSync(seedMeetingsFile, meetingsFile);
    }

    const meetings = JSON.parse(fs.readFileSync(meetingsFile, "utf8"));
    memoryMeetings = meetings;
    return normalizeMeetings(meetings);
}

async function writeMeetings(meetings) {
    const normalized = normalizeMeetings(meetings);
    memoryMeetings = normalized;

    if (process.env.VERCEL) {
        if (!process.env.GITHUB_TOKEN) {
            throw new Error("GITHUB_TOKEN is required to save meetings on Vercel.");
        }
        await writeGitHubJson("meetings.json", normalized, "Update meetings.json");
        return;
    }

    fs.writeFileSync(seedMeetingsFile, JSON.stringify(normalized, null, 2));
}

function validDate(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validTime(value) {
    return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validateMeeting(meeting) {
    if (!meeting || typeof meeting !== "object" || Array.isArray(meeting)) {
        return "Meeting must be a JSON object.";
    }
    if (!meeting.name || typeof meeting.name !== "string") {
        return "Name is required.";
    }
    if (meeting.country !== null && meeting.country !== undefined && typeof meeting.country !== "string") {
        return "Country must be a string.";
    }
    if (meeting.date !== null && meeting.date !== undefined && !validDate(meeting.date)) {
        return "Date must use YYYY-MM-DD format.";
    }
    if (meeting.time !== null && meeting.time !== undefined && !validTime(meeting.time)) {
        return "Time must use HH:mm format.";
    }
    if (meeting.end_time !== null && meeting.end_time !== undefined && !validTime(meeting.end_time)) {
        return "End time must use HH:mm format.";
    }
    if (meeting.time && meeting.end_time && meeting.end_time <= meeting.time) {
        return "End time must be after start time.";
    }
    return null;
}

async function readInterviews() {
    if (process.env.VERCEL) {
        const githubFile = await readGitHubJson("interview.json");
        if (githubFile) {
            memoryInterviews = githubFile.data;
            return memoryInterviews;
        }
    }

    if (memoryInterviews) return memoryInterviews;

    if (!fs.existsSync(interviewFile)) {
        fs.copyFileSync(seedInterviewFile, interviewFile);
    }

    memoryInterviews = JSON.parse(fs.readFileSync(interviewFile, "utf8"));
    return memoryInterviews;
}

async function writeInterviews(interviews) {
    memoryInterviews = interviews;

    if (process.env.VERCEL) {
        if (!process.env.GITHUB_TOKEN) {
            throw new Error("GITHUB_TOKEN is required to save interviews on Vercel.");
        }
        await writeGitHubJson("interview.json", interviews, "Update interview.json");
        return;
    }

    fs.writeFileSync(seedInterviewFile, JSON.stringify(interviews, null, 2));
}

function validateInterview(interview) {
    if (!interview || typeof interview !== "object" || Array.isArray(interview)) {
        return "Interview must be a JSON object.";
    }
    if (!interview.name || typeof interview.name !== "string") {
        return "Name is required.";
    }
    if (interview.date !== null && interview.date !== undefined && !validDate(interview.date)) {
        return "Date must use YYYY-MM-DD format.";
    }
    if (interview.time !== null && interview.time !== undefined && !validTime(interview.time)) {
        return "Time must use HH:mm format.";
    }
    if (interview.end_time !== null && interview.end_time !== undefined && !validTime(interview.end_time)) {
        return "End time must use HH:mm format.";
    }
    if (interview.time && interview.end_time && interview.end_time <= interview.time) {
        return "End time must be after start time.";
    }
    return null;
}

app.get("/api/meetings", async (req, res) => {
    try {
        res.set("Cache-Control", "no-store");
        res.json(await readMeetings());
    } catch (error) {
        res.status(500).json({ error: error.message || "Unable to read meetings." });
    }
});

app.get("/api/meetings/:id", async (req, res) => {
    try {
        const meetings = await readMeetings();
        const meeting = meetings.find(item => String(item.id) === req.params.id);
        if (!meeting) return res.status(404).json({ error: "Meeting not found." });
        res.json(meeting);
    } catch (error) {
        res.status(500).json({ error: error.message || "Unable to read meeting." });
    }
});

app.post("/api/meetings", async (req, res) => {
    const error = validateMeeting(req.body);
    if (error) return res.status(400).json({ error });
    try {
        const meetings = await readMeetings();
        const numericIds = meetings.map(item => Number(item.id)).filter(Number.isFinite);
        const id = numericIds.length ? Math.max(...numericIds) + 1 : 1;
        const meeting = { id, ...req.body };
        meetings.push(meeting);
        await writeMeetings(meetings);
        res.status(201).json(meeting);
    } catch (error) {
        sendWriteError(res, error, "Unable to create meeting.");
    }
});

app.put("/api/meetings/:id", async (req, res) => {
    const error = validateMeeting(req.body);
    if (error) return res.status(400).json({ error });
    try {
        const meetings = await readMeetings();
        const index = meetings.findIndex(item => String(item.id) === req.params.id);
        if (index === -1) return res.status(404).json({ error: "Meeting not found." });
        meetings[index] = { ...meetings[index], ...req.body, id: meetings[index].id };
        await writeMeetings(meetings);
        res.json(meetings[index]);
    } catch (error) {
        sendWriteError(res, error, "Unable to update meeting.");
    }
});

app.delete("/api/meetings/:id", async (req, res) => {
    try {
        const meetings = await readMeetings();
        const index = meetings.findIndex(item => String(item.id) === req.params.id);
        if (index === -1) return res.status(404).json({ error: "Meeting not found." });
        const deleted = meetings.splice(index, 1)[0];
        await writeMeetings(meetings);
        res.json(deleted);
    } catch (error) {
        sendWriteError(res, error, "Unable to delete meeting.");
    }
});

app.get("/api/interviews", async (req, res) => {
    try {
        res.set("Cache-Control", "no-store");
        res.json(await readInterviews());
    } catch (error) {
        res.status(500).json({ error: error.message || "Unable to read interviews." });
    }
});

app.post("/api/interviews", async (req, res) => {
    const error = validateInterview(req.body);
    if (error) return res.status(400).json({ error });
    try {
        const interviews = await readInterviews();
        const numericIds = interviews.map(item => Number(item.id)).filter(Number.isFinite);
        const id = numericIds.length ? Math.max(...numericIds) + 1 : 1;
        const interview = { id, ...req.body };
        interviews.push(interview);
        await writeInterviews(interviews);
        res.status(201).json(interview);
    } catch (error) {
        sendWriteError(res, error, "Unable to create interview.");
    }
});

app.put("/api/interviews/:id", async (req, res) => {
    const error = validateInterview(req.body);
    if (error) return res.status(400).json({ error });
    try {
        const interviews = await readInterviews();
        const index = interviews.findIndex(item => String(item.id) === req.params.id);
        if (index === -1) return res.status(404).json({ error: "Interview not found." });
        interviews[index] = { ...interviews[index], ...req.body, id: interviews[index].id };
        await writeInterviews(interviews);
        res.json(interviews[index]);
    } catch (error) {
        sendWriteError(res, error, "Unable to update interview.");
    }
});

app.delete("/api/interviews/:id", async (req, res) => {
    try {
        const interviews = await readInterviews();
        const index = interviews.findIndex(item => String(item.id) === req.params.id);
        if (index === -1) return res.status(404).json({ error: "Interview not found." });
        const deleted = interviews.splice(index, 1)[0];
        await writeInterviews(interviews);
        res.json(deleted);
    } catch (error) {
        sendWriteError(res, error, "Unable to delete interview.");
    }
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/storage", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({
        vercel: Boolean(process.env.VERCEL),
        repository: GITHUB_REPOSITORY,
        branch: GITHUB_BRANCH,
        githubConfigured: Boolean(process.env.GITHUB_TOKEN),
        persistence: process.env.VERCEL
            ? (process.env.GITHUB_TOKEN ? "github" : "github-readonly-missing-token")
            : "local"
    });
});

if (require.main === module) {
    app.listen(PORT, "0.0.0.0", () => {
        const interfaces = os.networkInterfaces();
        const addresses = Object.values(interfaces)
            .flat()
            .filter(address => address && address.family === "IPv4" && !address.internal)
            .map(address => address.address);

        console.log(`Calendar server running on port ${PORT}`);
        console.log(`Local: http://localhost:${PORT}`);
        addresses.forEach(address => {
            console.log(`Network: http://${address}:${PORT}`);
        });
    });
}

module.exports = app;

const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || "timz204/calendar-demo";
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";

async function readGitHubJson(fileName) {
    const url = `https://api.github.com/repos/${GITHUB_REPOSITORY}/contents/${fileName}?ref=${encodeURIComponent(GITHUB_BRANCH)}&t=${Date.now()}`;
    const response = await fetch(url, {
        headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "schedule-app",
            ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
        },
        cache: "no-store"
    });

    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub returned ${response.status} while reading ${fileName}.`);

    const file = await response.json();
    const content = Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8");
    return { data: JSON.parse(content), sha: file.sha };
}

async function writeGitHubJson(fileName, data, message) {
    if (!process.env.GITHUB_TOKEN) return false;

    const existing = await readGitHubJson(fileName);
    const url = `https://api.github.com/repos/${GITHUB_REPOSITORY}/contents/${fileName}`;
    const response = await fetch(url, {
        method: "PUT",
        headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
            "User-Agent": "schedule-app",
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            message,
            content: Buffer.from(JSON.stringify(data, null, 2) + "\n", "utf8").toString("base64"),
            branch: GITHUB_BRANCH,
            ...(existing?.sha ? { sha: existing.sha } : {})
        })
    });

    if (!response.ok) {
        const details = await response.text();
        throw new Error(`GitHub returned ${response.status} while saving ${fileName}: ${details}`);
    }

    return true;
}

function sendWriteError(res, error, fallbackMessage) {
    const message = error.message || fallbackMessage;
    if (/GITHUB_TOKEN is required/.test(message)) {
        return res.status(503).json({
            error: message,
            code: "PERSISTENCE_NOT_CONFIGURED",
            storage: "/api/storage"
        });
    }
    return res.status(500).json({ error: message });
}
