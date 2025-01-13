import { Octokit } from "@octokit/rest";
import * as dotenv from "dotenv";
import express, { json } from "express";
import helmet from "helmet";
import morgan from "morgan";

dotenv.config();

// Validate environment variables
if (!process.env.GITHUB_AUTH_TOKEN) {
  throw new Error("GITHUB_AUTH_TOKEN is not set in the environment variables");
}

const app = express();
const port = process.env.PORT || 3000;
const octokit = new Octokit({ auth: process.env.GITHUB_AUTH_TOKEN });

// Middleware
app.use(helmet()); // Security headers
app.use(json());
app.use(morgan("combined")); // Logging

app.get("/", (req, res) => {
  res.send("Hello from server");
});

app.get("/user", async (req, res) => {
  try {
    const { data } = await octokit.request("/user");
    res.json(data);
  } catch (err) {
    console.error("Error fetching user data:", err.message);
    res.status(500).json({ error: "Failed to fetch user data" });
  }
});

app.get("/user/repos", async (req, res) => {
  try {
    const data = await octokit.paginate("GET /user/repos", { per_page: 100 });

    const repoDetails = await Promise.all(
      data.map(async (repo) => {
        let languages = "Not Specified";
        let readmeContent = "README not available";

        // Fetch languages
        try {
          const languageResponse = await octokit.request(repo.languages_url);
          languages =
            Object.keys(languageResponse.data).join(", ") || "Not Specified";
        } catch (err) {
          console.error(
            `Error fetching languages for ${repo.name}:`,
            err.message
          );
        }

        // Fetch README.md
        try {
          const readmeResponse = await octokit.request(
            "GET /repos/{owner}/{repo}/readme",
            {
              owner: repo.owner.login,
              repo: repo.name,
            }
          );
          const buffer = Buffer.from(readmeResponse.data.content, "base64");

          // Clean up the README content
          readmeContent = buffer
            .toString("utf8")
            .replace(/\\n/g, "\n") // Replace \n with actual line breaks
            .replace(/\\r/g, "") // Remove \r if present
            .replace(/\\"/g, '"') // Replace escaped quotes with regular quotes
            .replace(/\\/g, "") // Remove any remaining backslashes
            .trim(); // Remove leading/trailing whitespace
        } catch (err) {
          console.error(`Error fetching README for ${repo.name}:`, err.message);
        }

        return {
          name: repo.name,
          url: repo.html_url || "Not Specified",
          language: languages,
          description: repo.description || "No Description",
          deployed_at: repo.homepage || "Not Deployed",
          readme: readmeContent || "README not available",
        };
      })
    );

    res.json(repoDetails);
  } catch (error) {
    console.error("Error fetching repositories:", error.message);
    res.status(500).json({ error: "Failed to fetch repositories" });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});