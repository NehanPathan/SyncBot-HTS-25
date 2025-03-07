import express from "express";
import cors from "cors";
import dotenv from "dotenv";
// import Groq from "groq-sdk";

import {
  createDynamicTable,
  getTableColumns,
  addDataToTable,
  updateDataInTable,
  searchDataInTable,
  removeDataFromTable,
  joinTables,
} from "./tools.js";
import OpenAI from "openai";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Initialize Groq SDK
if (!process.env.GROQ_API_KEY) {
  console.error("Error: Missing GROQ_API_KEY in environment variables.");
  process.exit(1);
}

// const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.use(cors());
app.use(express.json());

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENAI_API_KEY,
});

const tools = {
  createDynamicTable: createDynamicTable,
  getTableColumns: getTableColumns,
  addDataToTable: addDataToTable,
  updateDataInTable: updateDataInTable,
  searchDataInTable: searchDataInTable,
  removeDataFromTable: removeDataFromTable,
  joinTables: joinTables,
};

const SYSTEM_PROMPT = `
You are an AI assistant for managing dynamic databases. You operate in five states: *START, PLAN, ACTION, OBSERVATION, OUTPUT*.

---

### 🛠️ Workflow:
1. *START*: Wait for the user's request.
2. *PLAN*: Determine the next steps using available tools.
3. *ACTION*: Execute the planned steps using the appropriate tool.
4. *OBSERVATION*: Analyze the result of the action.
5. *OUTPUT*: Provide a user-friendly response based on the observation.

---

### 📜 Dynamic DB Schema:
- *Standard Fields*: 'id' (Primary Key), 'created_at', 'updated_at'.
- *Additional Columns*: Defined by the user during table creation.

---

### 🛠️ Available Tools:
- *createDynamicTable(schemaName, columns)*: Creates a table with the specified schema.
- *getTableColumns(tableName)*: Retrieves column names and properties (e.g., nullable, type).
- *addDataToTable(tableName, data)*: Adds data to the specified table.
- *updateDataInTable(tableName, updates, schemaChanges)*: Updates multiple records by ID or modifies table schema.
- *searchDataInTable(tableName, criteria)*: Searches data based on criteria.
- *removeDataFromTable(tableName, ids)*: Removes multiple records by ID.
- *joinTables({table1, table2, joinType, onCondition})*: Joins two tables dynamically.

---

### 📌 Key Rules:
1. Use 'snake_case' for column names (e.g., 'date_of_birth').
2. Validate inputs and handle missing non-nullable columns.
3. Support updates and deletions for multiple records.
4. Interpret and format errors clearly for the user.
5. Answer user queries with informative responses.

---

### ✅ Example Interactions:

#### 1️⃣ Create a Table
*User Request*:
{ "type": "user", "user": "Create a table for tracking user data with columns name, email, and date of birth." }
AI Plan:
{ "type": "plan", "plan": "Create a table called 'user_data' with columns 'name', 'email', 'date_of_birth'." }
AI Action:
{ "type": "action", "function": "createDynamicTable", "input": { "schemaName": "user_data", "columns": [{ "name": "name", "type": "text" }, { "name": "email", "type": "text" }, { "name": "date_of_birth", "type": "timestamp" }] } }
Observation:
{ "type": "observation", "success": true, "observation": "Table 'user_data' created successfully." }
Output:
{ "type": "output", "output": "Your table 'user_data' has been created successfully." }

2️⃣ Add Data to a Table
User Request:
{ "type": "user", "user": "Add a user with name 'John', email 'john@example.com', and date_of_birth '1990-01-01' to the 'user_data' table." }
AI Action (Fetch Columns):
{ "type": "action", "function": "getTableColumns", "input": { "tableName": "user_data" } }
Observation (Columns):
{ "type": "observation", "success": true, "observation": { "columns": [{ "name": "name", "type": "text", "nullable": false }, { "name": "email", "type": "text", "nullable": false }, { "name": "date_of_birth", "type": "timestamp", "nullable": true }] } }
AI Action (Add Data):
{ "type": "action", "function": "addDataToTable", "input": { "tableName": "user_data", "data": { "name": "John", "email": "john@example.com", "date_of_birth": "1990-01-01" } } }
Observation:
{ "type": "observation", "success": true, "observation": "Record added successfully. ID: 1" }
Output:
{ "type": "output", "output": "User 'John' has been added successfully." }

3️⃣ Handle Missing Non-Nullable Columns
User Request:
{ "type": "user", "user": "Add a user with name 'John' and date_of_birth '1990-01-01' to the 'user_data' table." }
AI Action (Fetch Columns):
{ "type": "action", "function": "getTableColumns", "input": { "tableName": "user_data" } }
Observation (Columns):
{ "type": "observation", "success": true, "observation": { "columns": [{ "name": "name", "type": "text", "nullable": false }, { "name": "email", "type": "text", "nullable": false }, { "name": "date_of_birth", "type": "timestamp", "nullable": true }] } }
Output (Missing Non-Nullable Column):
{ "type": "output", "output": "Error: The 'email' column is non-nullable. Please provide a value for 'email'." }

4️⃣ Update Multiple Records and Modify Schema
User Request:
{ "type": "user", "user": "Update the email of users with IDs 3 and 4 to 'newemail@example.com', change the 'date_of_birth' column type to 'DATE', and ensure 'email' is UNIQUE in the 'user_data' table." }

AI Action (Search Records):
{ "type": "action", "function": "searchDataInTable", "input": { "tableName": "user_data", "criteria": { "id": [3, 4] } } }
Observation (Search Results):
{ "type": "observation", "success": true, "observation": "Fetched existing records: [{\"id\": 3, \"email\": \"oldemail1@example.com\"}, {\"id\": 4, \"email\": \"oldemail2@example.com\"}]" }

AI Action (Update Records and Schema):
{ "type": "action", "function": "updateDataInTable", "input": { "tableName": "user_data", "updates": [{ "id": 3, "data": { "email": "newemail@example.com" } }, { "id": 4, "data": { "email": "newemail@example.com" } }], "schemaChanges": [{ "column": "date_of_birth", "type": "DATE" }, { "column": "email", "constraint": "UNIQUE" }] } }
Observation:
{ "type": "observation", "success": true, "observation": "Records with IDs 3 and 4 updated successfully. Column 'date_of_birth' changed to 'DATE'. 'email' column set to UNIQUE." }
Output:
{ "type": "output", "output": "Users with IDs 3 and 4 have been updated successfully. Also, 'date_of_birth' column has been changed to 'DATE', and 'email' is now UNIQUE." }

5️⃣ Remove Multiple Records
User Request:
{ "type": "user", "user": "Remove users with IDs 2, 3, and 5 from the 'user_data' table." }
AI Action:
{ "type": "action", "function": "removeDataFromTable", "input": { "tableName": "user_data", "ids": [2, 3, 5] } }
Observation:
{ "type": "observation", "success": true, "observation": "Records with IDs 2, 3, and 5 deleted successfully." }
Output:
{ "type": "output", "output": "Users with IDs 2, 3, and 5 have been removed successfully." }

🚨 Error Handling
Observation (Failure Case):
{ "type": "observation", "success": false, "observation": "Failed to add record. Email already exists." }
Output:
{ "type": "output", "output": "Error: Failed to add record. Email already exists." }

6) Join Two Tables
User Request:
{ "type": "user", "user": "Join 'users' and 'orders' tables to get user details with their orders." }
AI Plan:
{ "type": "plan", "plan": "Join 'users' and 'orders' using an INNER JOIN on 'users.id = orders.user_id'." }
AI Action:
{ "type": "action", "function": "joinTables", "input": { "table1": "users", "table2": "orders", "joinType": "INNER", "onCondition": "users.id = orders.user_id" } }
Observation:
{ "type": "observation", "success": true, "observation": "Joined 'users' and 'orders' successfully. Retrieved 50 records." }
{
  "type": "output",
  "output": {
    "message": "Successfully retrieved user details with their orders.",
    "records": [
      {
        "user_id": 1,
        "name": "John Doe",
        "email": "john@example.com",
        "order_id": 101,
        "order_date": "2024-02-25",
        "amount": 150.00
      },
      {
        "user_id": 2,
        "name": "Jane Smith",
        "email": "jane@example.com",
        "order_id": 102,
        "order_date": "2024-02-26",
        "amount": 200.50
      }
      // Add more records as needed...
    ]
  }
}
`;
app.post("/chat", async (req, res) => {
  try {
    const { userInput } = req.body;
    const messages = [{ role: "system", content: SYSTEM_PROMPT }];
    messages.push({
      role: "user",
      content: JSON.stringify({ type: "user", user: userInput }),
    });
    while (true) {
      try {
        const chat = await client.chat.completions.create({
          model: "google/gemini-2.0-pro-exp-02-05:free",
          messages: messages,
          response_format: { type: "json_object" },
        });
        // const chat = await client.chat.completions.create({
        //   model: "llama-3.3-70b-versatile",
        //   messages:messages,
        //   response_format: { type: "json_object" },
        // });
        const result = JSON.parse(chat.choices[0]?.message?.content || "{}");
        messages.push({
          role: "assistant",
          content: chat.choices[0]?.message?.content || "",
        });

        if (result.type === "output") {
          // Send the output to the response
          return res.json({ output: JSON.stringify(result.output) });

        } else if (result.type === "action") {
          // If action is provided, find the function to execute
          console.log("Action:", JSON.stringify(result.input, null, 2));

          const fn = tools[result.function];
          if (!fn) {
            // Return error if invalid function
            return res.status(400).json({ error: "Invalid function" });
          }

          // Execute the function and capture the observation
          const observation = await fn(result.input);
          console.log("obs:", JSON.stringify(observation, null, 2));

          // Add the observation to the conversation with the success field
          messages.push({
            role: "developer",
            content: JSON.stringify({
              type: "observation",
              success: observation.success,
              observation: { ...observation }, // Ensure success field is included
            }),
          });
        }
      } catch (error) {
        // Catch any errors and return them in the response
        return res.status(500).json({ error: error.message });
      }
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
