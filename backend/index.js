import { Octokit } from "@octokit/rest";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { OpenAIEmbeddings } from "@langchain/openai";
import { ChatOpenAI } from "@langchain/openai";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { Document } from "@langchain/core/documents";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { PromptTemplate } from "@langchain/core/prompts";
import cors from "cors";
import axios from "axios";

// Load environment variables
dotenv.config();

if (!process.env.GITHUB_AUTH_TOKEN) {
  throw new Error("GITHUB_AUTH_TOKEN is not set in the environment variables");
}
if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set in the environment variables");
}

// Initialize Express and Octokit
const app = express();
const port = process.env.PORT || 3000;
const octokit = new Octokit({ auth: process.env.GITHUB_AUTH_TOKEN });

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("combined"));

// Global FAISS vector store
let vectorStore = null;
let isVectorStoreReady = false;

// Format repository data for FAISS
function formatRepoDataForFaiss(repoData) {
  return repoData.map((repo) => {
    const content = [
      `Repository Name: ${repo.name || "N/A"}`,
      `URL: ${repo.url || "N/A"}`,
      `Languages: ${repo.language || "Not Specified"}`,
      `Description: ${repo.description || "No Description"}`,
      `Deployed At: ${repo.deployed_at || "Not Deployed"}`,
      `README Content: ${(repo.readme || "No README available").slice(0, 500)}...`,
    ].join("\n");

    return new Document({
      pageContent: content,
      metadata: { name: repo.name },
    });
  });
}

// Create FAISS index
async function createFaissIndex(documents, indexPath = "repo_faiss_index") {
  try {
    const embeddings = new OpenAIEmbeddings();
    const store = await FaissStore.fromDocuments(documents, embeddings);
    await store.save(indexPath);
    console.log(`FAISS index saved at ${indexPath}`);
    return store;
  } catch (error) {
    console.error("Error creating FAISS index:", error.message);
    throw new Error("Failed to create FAISS index.");
  }
}

// Set up the chat interface
async function setupChatInterface(faissIndex) {
  const model = new ChatOpenAI({ modelName: "gpt-4" });
  const prompt = PromptTemplate.fromTemplate(`
    Answer the following question about repositories:
    Question: {question}
    Context: {context}
  `);

  const documentChain = await createStuffDocumentsChain({
    llm: model,
    prompt,
  });

  return createRetrievalChain({
    retriever: faissIndex.asRetriever(),
    combineDocsChain: documentChain,
  });
}

// Routes
app.get("/", (req, res) => {
  res.send("Repository Chat API Server");
});

app.get("/user", async (req, res) => {
  try {
    const { data } = await octokit.request("/user");
    res.json(data);
  } catch (error) {
    console.error("Error fetching user data:", error.message);
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

        try {
          const languageResponse = await octokit.request(repo.languages_url);
          languages = Object.keys(languageResponse.data).join(", ") || "Not Specified";
        } catch (error) {
          console.error(`Error fetching languages for ${repo.name}:`, error.message);
        }

        try {
          const readmeResponse = await octokit.request(
            "GET /repos/{owner}/{repo}/readme",
            {
              owner: repo.owner.login,
              repo: repo.name,
            }
          );
          const buffer = Buffer.from(readmeResponse.data.content, "base64");
          readmeContent = buffer.toString("utf8").trim();
        } catch (error) {
          console.error(`Error fetching README for ${repo.name}:`, error.message);
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

// Initialize the FAISS index

app.post("/api/initialize", async (req, res) => {
  try {
    const response = await axios.get(`http://localhost:3000/user/repos`);
    const repoData = response.data;

    if (!Array.isArray(repoData) || repoData.length === 0) {
      return res.status(404).json({ error: "No repositories found" });
    }

    const documents = formatRepoDataForFaiss(repoData);
    vectorStore = await createFaissIndex(documents);
    isVectorStoreReady = true; 

    res.json({ message: "Repository index created successfully" });
  } catch (error) {
    console.error("Error initializing FAISS index:", error.message);
    isVectorStoreReady = false; 
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "Invalid or missing 'question' in the request body." });
    }

    if (!isVectorStoreReady || !vectorStore) {
      return res.status(400).json({
        error: "FAISS index not initialized. Please call /api/initialize first.",
      });
    }

    console.log("Processing chat request:", question);
    const qaChain = await setupChatInterface(vectorStore);
    const response = await qaChain.invoke({ question });

    res.json({ answer: response.text });
  } catch (error) {
    console.error("Error processing chat:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});


// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
