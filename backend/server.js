const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// AI insight endpoint — calls Ollama (local)
app.post("/ai-insight", async (req, res) => {
  const { scenario, entryReason, exitReason, behaviors, pnlPct, score, total, inconsistent, fomoEntry, earlyExit, hasRisk } = req.body;

  const prompt = `You are an experienced long-term trading mentor. Evaluate this trade strictly and concisely.

Scenario: ${scenario}
Entry reason: "${entryReason || "None provided"}"
Exit reason: "${exitReason || "None provided"}"
Behaviors detected: ${behaviors.join(", ") || "None"}
P&L: ${pnlPct.toFixed(1)}%
Discipline score: ${score}/${total}
Inconsistency (claimed support but entered near peak): ${inconsistent}
FOMO entry: ${fomoEntry}
Early exit: ${earlyExit}
Risk plan mentioned: ${hasRisk}

Give exactly 3 short paragraphs:
1. What this trader did well (be specific, skip platitudes)
2. What mistakes were made and why they destroy long-term wealth
3. One concrete, actionable improvement for next time

Be direct. Treat this as real money. No filler words.`;

  // Detect which model is available on Ollama
  let model = "llama3";
  try {
    const listRes = await fetch("http://localhost:11434/api/tags");
    if (listRes.ok) {
      const listData = await listRes.json();
      const models = listData.models || [];
      if (models.length > 0) {
        // Prefer llama3, mistral, gemma, phi — pick first available
        const preferred = ["llama3", "mistral", "gemma2", "gemma", "phi3", "phi", "llama2"];
        const found = preferred.find((m) => models.some((x) => x.name.startsWith(m)));
        model = found || models[0].name;
      }
    }
  } catch (_) { /* keep default */ }

  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Ollama error:", errText);
      return res.status(500).json({ insight: `Ollama error: ${errText}. Run 'ollama list' to check available models.` });
    }

    const data = await response.json();
    console.log(`AI insight generated via Ollama model: ${model}`);
    res.json({ insight: data.response || "No response from Ollama." });
  } catch (err) {
    console.error("Ollama fetch failed:", err.message);
    res.status(500).json({
      error: "AI failed",
      insight: "Could not connect to Ollama. Make sure Ollama is running in the background (check Task Manager for ollama.exe).",
    });
  }
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  socket.on("disconnect", () => console.log("Client disconnected:", socket.id));
});

server.listen(5000, () => console.log("TRADEX backend running on http://localhost:5000"));
