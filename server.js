const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");

const app = express();
const PORT = process.env.PORT || 3000;
const meetingsFile = path.join(__dirname, "meetings.json");

app.use(express.json({ limit: "2mb" }));

function normalizeMeetings(meetings) {
    return meetings.map(meeting => ({
        ...meeting,
        country: meeting.country ?? null
    }));
}

function readMeetings() {
    const meetings = JSON.parse(fs.readFileSync(meetingsFile, "utf8"));
    return normalizeMeetings(meetings);
}

function writeMeetings(meetings) {
    fs.writeFileSync(meetingsFile, JSON.stringify(normalizeMeetings(meetings), null, 2));
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
    return null;
}

app.get("/api/meetings", (req, res) => {
    try {
        res.json(readMeetings());
    } catch (error) {
        res.status(500).json({ error: "Unable to read meetings." });
    }
});

app.get("/api/meetings/:id", (req, res) => {
    const meetings = readMeetings();
    const meeting = meetings.find(item => String(item.id) === req.params.id);

    if (!meeting) return res.status(404).json({ error: "Meeting not found." });
    res.json(meeting);
});

app.post("/api/meetings", (req, res) => {
    const error = validateMeeting(req.body);
    if (error) return res.status(400).json({ error });

    try {
        const meetings = readMeetings();
        const numericIds = meetings.map(item => Number(item.id)).filter(Number.isFinite);
        const id = numericIds.length ? Math.max(...numericIds) + 1 : 1;
        const meeting = { id, ...req.body };

        meetings.push(meeting);
        writeMeetings(meetings);
        res.status(201).json(meeting);
    } catch (error) {
        res.status(500).json({ error: "Unable to create meeting." });
    }
});

app.put("/api/meetings/:id", (req, res) => {
    const error = validateMeeting(req.body);
    if (error) return res.status(400).json({ error });

    try {
        const meetings = readMeetings();
        const index = meetings.findIndex(item => String(item.id) === req.params.id);

        if (index === -1) return res.status(404).json({ error: "Meeting not found." });

        meetings[index] = { ...meetings[index], ...req.body, id: meetings[index].id };
        writeMeetings(meetings);
        res.json(meetings[index]);
    } catch (error) {
        res.status(500).json({ error: "Unable to update meeting." });
    }
});

app.delete("/api/meetings/:id", (req, res) => {
    try {
        const meetings = readMeetings();
        const index = meetings.findIndex(item => String(item.id) === req.params.id);

        if (index === -1) return res.status(404).json({ error: "Meeting not found." });

        const deleted = meetings.splice(index, 1)[0];
        writeMeetings(meetings);
        res.json(deleted);
    } catch (error) {
        res.status(500).json({ error: "Unable to delete meeting." });
    }
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

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
