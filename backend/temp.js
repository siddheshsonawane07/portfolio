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
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import cors from "cors";
import axios from "axios";

dotenv.config();

if (!process.env.GITHUB_AUTH_TOKEN) {
  throw new Error("GITHUB_AUTH_TOKEN is not set in the environment variables");
}
if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set in the environment variables");
}

const app = express();
const port = 3000;
const octokit = new Octokit({ auth: process.env.GITHUB_AUTH_TOKEN });

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("combined"));

// Global variables for FAISS store and initialization status
let globalVectorStore = null;
let isInitializing = false;
let initializationError = null;

// Format repository data for FAISS
function formatRepoDataForFaiss(repoData) {
  return repoData.map((repo) => {
    const content = [
      `Repository Name: ${repo.name || "N/A"}`,
      `URL: ${repo.url || "N/A"}`,
      `Languages: ${repo.language || "Not Specified"}`,
      `Description: ${repo.description || "No Description"}`,
      `Deployed At: ${repo.deployed_at || "Not Deployed"}`,
      `README Content: ${(repo.readme || "No README available").slice(
        0,
        500
      )}...`,
    ].join("\n");

    return new Document({
      pageContent: content,
      metadata: { name: repo.name },
    });
  });
}

// Create FAISS index with better error handling
async function createFaissIndex(documents) {
  try {
    const embeddings = new OpenAIEmbeddings();
    const store = await FaissStore.fromDocuments(documents, embeddings);
    // console.log(store);
    return store;
  } catch (error) {
    console.error("Error creating FAISS index:", error.message);
    throw error;
  }
}

// Set up the chat interface
// async function setupChatInterface(vectorStore) {
//   const model = new ChatOpenAI({ modelName: "gpt-4" });
//   const prompt = ChatPromptTemplate.fromTemplate(`

//     Answer the following question about me and my github projects.First of all, thank you for the opportunity to introduce myself. My name is Siddhesh Sonawane, and I recently graduated in 2024 with a Bachelor's in Computer Engineering from Dr. D.Y. Patil Institute of Technology, Pimpri, achieving an aggregate CGPA of 8.76. Over the past four years, I have developed a strong passion for learning and experimenting with new technologies.
//     I started my journey with Flutter Development, where I co-led the Flutter team at GDSC DIT, and then expanded my skills into the MERN stack for full-stack development. Most recently, I have been delving into the world of AI and studying LangChain, which has deepened my interest in AI technologies.
//     I’ve had the opportunity to participate in several hackathons, including the Smart India Hackathon and Flipkart Grid, where I was able to apply my knowledge to build innovative solutions. Some of the key projects I’ve worked on include Proctorise, an online proctoring solution, Store API, Task Manager, and an Online Radio app.
//     I’m a focused individual, known for being a team player with a positive outlook, and I consistently strive to work efficiently towards achieving my goals.

//     Question: {question}
//     Context: {context}

//     Answer in a helpful and informative way. If you don't have enough information to answer, say so.
//   `);

//   const documentChain = await createStuffDocumentsChain({
//     llm: model,
//     prompt,
//   });

//   return createRetrievalChain({
//     retriever: vectorStore.asRetriever({
//       k: 2,
//     }),
//     combineDocsChain: documentChain,
//   });
// }

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
          languages =
            Object.keys(languageResponse.data).join(", ") || "Not Specified";
        } catch (error) {
          console.error(
            `Error fetching languages for ${repo.name}:`,
            error.message
          );
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
          console.error(
            `Error fetching README for ${repo.name}:`,
            error.message
          );
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

// Initialize endpoint with better error handling and state management
app.post("/api/initialize", async (req, res) => {
 
});

// Chat endpoint with proper vector store checking
app.post("/api/chat", async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || typeof question !== "string") {
      return res.status(400).json({
        error: "Invalid request",
        message: "Invalid or missing 'question' in the request body",
      });
    }

    // Check if store is initialized
    if (!globalVectorStore) {
      if (initializationError) {
        return res.status(500).json({
          error: "Vector store initialization failed",
          message: initializationError,
        });
      } else if (isInitializing) {
        return res.status(409).json({
          error: "Vector store initializing",
          message: "Please wait for initialization to complete",
        });
      } else {
        return res.status(400).json({
          error: "Vector store not initialized",
          message: "Please call /api/initialize first",
        });
      }
    }

    // const qaChain = await setupChatInterface(globalVectorStore);
    const llm = new ChatOpenAI({ modelName: "gpt-4-mini", temperature: 0 });
    const retriever = globalVectorStore.asRetriever({
      searchType: "similarity",
      k: 20,
    });

    const prompt = ChatPromptTemplate.fromTemplate(`
      Answer based on the following context:
      Context: {context}
      Question: {question}
    `);

    const documentChain = await createStuffDocumentsChain({
      globalVectorStore,
      llm,
      prompt,
    });

    const qaChain = await createRetrievalChain({
      retriever,
      combineDocsChain: documentChain,
    });

    const response = await qaChain.invoke({ 
      question: question 
    });

    console.log("Question received for QA chain:", question);
    console.log("QA chain response:", response);

    res.json({ answer: response.answer || response.text });
  } catch (error) {
    console.error("Error processing chat:", error.message);
    res.status(500).json({
      error: "Chat processing failed",
      message: error.message,
    });
  }
});

// Status endpoint to check initialization state
app.get("/api/status", (req, res) => {
  res.json({
    initialized: !!globalVectorStore,
    initializing: isInitializing,
    error: initializationError,
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
