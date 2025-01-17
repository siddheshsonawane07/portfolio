import { Octokit } from "@octokit/rest";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { FaissStore } from "@langchain/community/vectorstores/faiss";

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

const llm = new ChatOpenAI({
  modelName: "gpt-4o",
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0.2,
});

const embeddings = new OpenAIEmbeddings();

function formatRepoDataForFaiss(repoData) {
  return repoData.map((repo) => ({
    pageContent: JSON.stringify(repo),
    metadata: { source: repo.url },
  }));
}

// Middleware
app.use(cors());
app.use(express.json());

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

app.get("/", (req, res) => {
  res.send("Test Server");
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

app.post("/api/chat", async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || typeof question !== "string") {
      return res.status(400).json({
        error: "Invalid request",
        message: "Invalid or missing 'question' in the request body",
      });
    }
    const raw_repoData = await octokit.paginate("GET /user/repos");
    const documents = formatRepoDataForFaiss(raw_repoData);
    const vectorStore = await FaissStore.fromDocuments(documents, embeddings);

    const questionAnsweringPrompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        "You are a helpful assistant. Use the following context to answer questions about Siddhesh Sonawane and his GitHub projects: {context}",
      ],
      [
        "human",
        "{input}",
      ],
    ]);
    
    const combineDocsChain = await createStuffDocumentsChain({
      llm: llm,
      prompt: questionAnsweringPrompt,
    });

    const chain = await createRetrievalChain({
      retriever: vectorStore.asRetriever(),
      combineDocsChain,
      context: vectorStore.asRetriever(),
    });
    
    const response = await chain.invoke({
      input: question,
    });

    res.json({ answer: response.answer });
  } catch (error) {
    // console.log(error);
    res.status(500).json({ error: "Failed to process the request" });
  }
});
