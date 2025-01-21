import { Octokit } from "@octokit/rest";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { FaissStore } from "@langchain/community/vectorstores/faiss";

// Configuration
dotenv.config();

// Constants
const PORT = process.env.PORT || 3000;
const REQUIRED_ENV_VARS = ['GITHUB_AUTH_TOKEN', 'OPENAI_API_KEY'];
const MAX_REPOS = 20;
const MAX_DESCRIPTION_LENGTH = 200;

// Validate environment variables
REQUIRED_ENV_VARS.forEach(varName => {
    if (!process.env[varName]) {
        throw new Error(`${varName} is not set in the environment variables`);
    }
});

// Initialize services
const app = express();
const octokit = new Octokit({ auth: process.env.GITHUB_AUTH_TOKEN });
const llm = new ChatOpenAI({
    modelName: "gpt-4",
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 0.2,
});
const embeddings = new OpenAIEmbeddings();

// Middleware
app.use(cors());
app.use(express.json());

// Helper functions
const formatRepoDataForFaiss = (repoData) => 
    repoData.map(repo => ({
        pageContent: JSON.stringify({
            name: repo.name,
            description: repo.description,
            language: repo.language,
            url: repo.html_url
        }),
        metadata: { source: repo.url },
    }));

const fetchRepoLanguages = async (repo) => {
    try {
        const languageResponse = await octokit.request(repo.languages_url);
        return Object.keys(languageResponse.data).join(", ") || "Not Specified";
    } catch (error) {
        console.error(`Error fetching languages for ${repo.name}:`, error.message);
        return "Not Specified";
    }
};

const fetchRepoReadme = async (owner, repoName) => {
    try {
        const readmeResponse = await octokit.request("GET /repos/{owner}/{repo}/readme", {
            owner,
            repo: repoName,
        });
        return Buffer.from(readmeResponse.data.content, "base64").toString("utf8").trim();
    } catch (error) {
        console.error(`Error fetching README for ${repoName}:`, error.message);
        return "README not available";
    }
};

// Routes
app.get("/", (_, res) => res.send("API Server"));

app.get("/user", async (_, res) => {
    try {
        const { data } = await octokit.request("/user");
        res.json(data);
    } catch (error) {
        console.error("Error fetching user data:", error.message);
        res.status(500).json({ error: "Failed to fetch user data" });
    }
});

app.get("/user/repos", async (_, res) => {
    try {
        const data = await octokit.paginate("GET /user/repos", { 
            per_page: 100,
            sort: 'updated',
            direction: 'desc'
        });
        
        const recentRepos = data.slice(0, MAX_REPOS);
        
        const repoDetails = await Promise.all(recentRepos.map(async (repo) => ({
            name: repo.name,
            url: repo.html_url || "Not Specified",
            language: await fetchRepoLanguages(repo),
            description: repo.description?.substring(0, MAX_DESCRIPTION_LENGTH) || "No Description",
            deployed_at: repo.homepage || "Not Deployed",
        })));

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

        const raw_repoData = await octokit.paginate("GET /user/repos", {
            per_page: 100,
            sort: 'updated',
            direction: 'desc'
        });
        
        const recentRepos = raw_repoData.slice(0, MAX_REPOS);
        const documents = formatRepoDataForFaiss(recentRepos);
        const vectorStore = await FaissStore.fromDocuments(documents, embeddings);

        const questionAnsweringPrompt = ChatPromptTemplate.fromMessages([
            [
                "system",
                "You are Siddhesh Sonawane, a software engineer. Core details: CS graduate (2024, CGPA: 8.76), expertise in MERN, Flutter, AI/LangChain. Notable projects in AI proctoring, chat parsing, and store APIs. Tech: JavaScript, Python, Java, MongoDB, MySQL. Email: siddheshsonawane2001@gmail.com. GitHub projects context: {context}"
            ],
            ["human", "{input}"]
        ]);
        
        const combineDocsChain = await createStuffDocumentsChain({
            llm,
            prompt: questionAnsweringPrompt,
        });

        const chain = await createRetrievalChain({
            retriever: vectorStore.asRetriever({
                k: 3  // Limit to top 3 most relevant results
            }),
            combineDocsChain,
        });
        
        const response = await chain.invoke({ input: question });
        res.json({ answer: response.answer });
    } catch (error) {
        console.error("Chat API error:", error);
        res.status(500).json({ error: "Failed to process the request" });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: "Internal Server Error",
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
