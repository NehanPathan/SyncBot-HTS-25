import { db } from './db/index.js';
import { todosTable } from './db/schema.js';
import { eq, ilike } from 'drizzle-orm';
import { ChatOpenAI } from 'langchain/chat_models/openai';
import { OpenAI } from 'langchain/llms/openai';
import { initializeAgentExecutorWithOptions } from 'langchain/agents';
import { Tool } from 'langchain/tools';
import { Graph } from 'langgraph';
import { Client } from 'langsmith';
import dotenv from 'dotenv';
import readlineSync from 'readline-sync';

dotenv.config();

const langsmithClient = new Client({ apiKey: process.env.LANGSMITH_API_KEY });
const chatModel = new ChatOpenAI({ temperature: 0, openAIApiKey: process.env.OPENAI_API_KEY, modelname: 'google/gemini-2.0-pro-exp-02-05:free' });

// Define tools
const getAllTodos = new Tool({
    name: 'getAllTodos',
    description: 'Fetch all todos',
    func: async () => await db.select().from(todosTable),
});

const createTodo = new Tool({
    name: 'createTodo',
    description: 'Create a new todo',
    func: async (input) => {
        const [todoItem] = await db.insert(todosTable).values({ todo: input }).returning({ id: todosTable.id });
        return `Created todo with ID: ${todoItem.id}`;
    },
});

const deleteTodoById = new Tool({
    name: 'deleteTodoById',
    description: 'Delete a todo by ID',
    func: async (id) => {
        await db.delete(todosTable).where(eq(todosTable.id, id));
        return `Deleted todo with ID: ${id}`;
    },
});

const searchTodo = new Tool({
    name: 'searchTodo',
    description: 'Search todos by text',
    func: async (query) => await db.select().from(todosTable).where(ilike(todosTable.todo, `%${query}%`)),
});

// Initialize agent with tools
const agentExecutor = await initializeAgentExecutorWithOptions([getAllTodos, createTodo, deleteTodoById, searchTodo], chatModel, {
    agentType: 'openai-tools',
    verbose: true,
});

// Define LangGraph workflow
const graph = new Graph({ name: 'TodoAI', client: langsmithClient });

graph.node('START', async ({ input }) => ({ type: 'user', user: input }));

graph.node('PLAN', async ({ input }) => {
    return { type: 'plan', plan: `Processing user request: ${input.user}` };
});

graph.node('ACTION', async ({ input }) => {
    const action = await agentExecutor.invoke(input);
    return { type: 'action', result: action.output };
});

graph.node('OBSERVATION', async ({ input }) => {
    return { type: 'observation', observation: input.result };
});

graph.node('OUTPUT', async ({ input }) => {
    return { type: 'output', output: `📝 ${input.observation}` };
});

graph.edge('START', 'PLAN');
graph.edge('PLAN', 'ACTION');
graph.edge('ACTION', 'OBSERVATION');
graph.edge('OBSERVATION', 'OUTPUT');

// Start CLI interaction
while (true) {
    const query = readlineSync.question('>> ');
    const output = await graph.invoke({ input: query });
    console.log(output.output);
}
