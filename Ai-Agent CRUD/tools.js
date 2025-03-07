import { pool } from "./db/index.js";

// Helper function to validate table/schema names
const validateName = (name) => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid table/schema name: ${name}`);
  }
};

// ✅ CREATE TABLE
const createDynamicTable = async ({ schemaName, columns }) => {
  try {
    validateName(schemaName);
    if (!Array.isArray(columns) || columns.length === 0) {
      throw new Error('The "columns" parameter must be a non-empty array.');
    }

    const defaultColumns = [
      { name: "id", type: "integer", primaryKey: true },
      { name: "created_at", type: "timestamp" },
      { name: "updated_at", type: "timestamp" },
    ];

    const allColumns = [
      ...defaultColumns,
      ...columns.filter(
        (col) =>
          !defaultColumns.some((defaultCol) => defaultCol.name === col.name)
      ),
    ];

    const columnDefinitions = allColumns
      .map((col) => {
        switch (col.type) {
          case "integer":
            return `${col.name} SERIAL${col.primaryKey ? " PRIMARY KEY" : ""}`;
          case "text":
            return `${col.name} TEXT NOT NULL`;
          case "timestamp":
            return `${col.name} TIMESTAMPTZ DEFAULT NOW()`;
          case "boolean":
            return `${col.name} BOOLEAN DEFAULT FALSE`;
          case "decimal":
            return `${col.name} DECIMAL(10,2)`;
          default:
            throw new Error(`Unsupported column type: ${col.type}`);
        }
      })
      .join(", ");

    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${schemaName} (${columnDefinitions})`
    );
    return {
      success: true,
      message: `${schemaName} table created successfully.`,
    };
  } catch (error) {
    console.error("Error creating table:", error);
    return { success: false, message: `Failed to create ${schemaName} table.` };
  }
};
// ✅ GET TABLE COLUMNS
const checkTableExists = async (tableName) => {
  const query = `
    SELECT EXISTS (
      SELECT 1 
      FROM information_schema.tables 
      WHERE table_name = $1
    ) AS exists;
  `;

  try {
    const res = await pool.query(query, [tableName]);
    return res.rows[0].exists; // Returns true if table exists, false otherwise
  } catch (error) {
    console.error(`Error checking if table ${tableName} exists:`, error);
    throw new Error(`Error checking table existence: ${error.message}`);
  }
};

const getTableColumns = async ({ tableName }) => {
  try {
    const tableExists = await checkTableExists(tableName);
    if (!tableExists) {
      return {
        success: false,
        message: `Table '${tableName}' does not exist.`,
      };
    }

    const query = `
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = $1;
    `;

    const res = await pool.query(query, [tableName]);
    const columns = res.rows.map((row) => ({
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === "YES", // Convert 'YES'/'NO' to boolean
    }));

    return { success: true, columns };
  } catch (error) {
    console.error(`Error fetching columns for table ${tableName}:`, error);
    return {
      success: false,
      message: `Error fetching columns: ${error.message}`,
    };
  }
};

// ✅ ADD DATA (SECURE)
const addDataToTable = async ({ tableName, data }) => {
  try {
    validateName(tableName);
    if (!data || (Array.isArray(data) && data.length === 0)) {
      throw new Error("No data provided.");
    }

    if (!Array.isArray(data)) data = [data];

    const columns = Object.keys(data[0]);
    const placeholders = data
      .map(
        (_, i) =>
          `(${columns
            .map((_, j) => `$${i * columns.length + j + 1}`)
            .join(", ")})`
      )
      .join(", ");

    const values = data.flatMap(Object.values);
    const insertQuery = `INSERT INTO ${tableName} (${columns.join(
      ", "
    )}) VALUES ${placeholders} RETURNING *`;

    const result = await pool.query(insertQuery, values);
    return { success: true, data: result.rows };
  } catch (error) {
    console.error("Error adding data:", error);
    return { success: false, message: "Failed to add data." };
  }
};

// ✅ UPDATE DATA (SECURE)
const updateDataInTable = async ({ tableName, updates = [], schemaChanges = [] }) => {
  try {
    validateName(tableName);

    if (!updates.length && !schemaChanges.length) {
      throw new Error("Either 'updates' or 'schemaChanges' must be provided.");
    }

    const queries = [];

    /*** 1️⃣ Handle Normal Data Updates ***/
    if (updates.length > 0) {
      updates.forEach(({ id, data }) => {
        if (!id || !data || Object.keys(data).length === 0) {
          throw new Error('Each update must have an "id" and non-empty "data".');
        }

        const setQuery = Object.entries(data)
          .map(([key, _], i) => `${key} = $${i + 1}`)
          .join(", ");

        const values = [...Object.values(data), id];

        console.log(`Updating ${tableName} - ID: ${id}, Data:`, data);

        queries.push(
          pool.query(
            `UPDATE ${tableName} SET ${setQuery}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
            values
          )
        );
      });
    }

    /*** 2️⃣ Handle Schema Changes ***/
    for (const { column, type, constraint } of schemaChanges) {
      if (!column || (!type && !constraint)) {
        throw new Error('Each schema change must have a "column" and either "type" or "constraint".');
      }

      let alterQueries = [];
      const constraintName = `${tableName}_${column}_constraint`;

      // **Change Data Type First (if provided)**
      if (type) {
        alterQueries.push(`ALTER TABLE ${tableName} ALTER COLUMN ${column} SET DATA TYPE ${type}`);
      }

      // **Handle Constraints**
      if (constraint) {
        switch (constraint.toUpperCase()) {
          case "UNIQUE":
            alterQueries.push(`ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS ${constraintName}`);
            alterQueries.push(`ALTER TABLE ${tableName} ADD CONSTRAINT ${constraintName} UNIQUE (${column})`);
            break;

          case "NOT NULL":
            alterQueries.push(`ALTER TABLE ${tableName} ALTER COLUMN ${column} SET NOT NULL`);
            break;

          case "NULL":
            alterQueries.push(`ALTER TABLE ${tableName} ALTER COLUMN ${column} DROP NOT NULL`);
            break;

          default:
            throw new Error(`Unsupported constraint: ${constraint}`);
        }
      }

      // **Execute All Queries Sequentially to Prevent Conflicts**
      for (const query of alterQueries) {
        console.log(`Executing: ${query}`);
        await pool.query(query); // Ensure constraints are applied correctly
      }
    }

    // Execute all data update queries in parallel
    const results = await Promise.all(queries);
    
    return { success: true, data: results.flatMap(res => res.rows || []) };

  } catch (error) {
    console.error("Error updating data/schema:", error);
    return { success: false, message: error.message || "Failed to update data/schema." };
  }
};

// ✅ SEARCH DATA (SECURE)
const searchDataInTable = async ({ tableName, criteria = {} }) => {
  try {
    validateName(tableName);

    let conditions = [];
    let values = [];

    Object.entries(criteria).forEach(([key, value]) => {
      if (typeof value === "object" && value !== null) {
        const operators = {
          $lt: "<",
          $gt: ">",
          $lte: "<=",
          $gte: ">=",
          $ne: "<>",
        };

        for (const [op, sqlOp] of Object.entries(operators)) {
          if (op in value) {
            conditions.push(`${key} ${sqlOp} $${values.length + 1}`);
            values.push(value[op]);
            return;
          }
        }

        throw new Error(`Unsupported operator in criteria for key: ${key}`);
      } else {
        conditions.push(`${key} = $${values.length + 1}`);
        values.push(value);
      }
    });

    // Construct query dynamically
    const searchQuery =
      `SELECT * FROM ${tableName}` +
      (conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "");

    const result = await pool.query(searchQuery, values);

    return { success: true, data: result.rows };
  } catch (error) {
    console.error("Error searching data:", error);
    return { success: false, message: "Failed to search data." };
  }
};
// ✅ REMOVE DATA (SECURE)
const removeDataFromTable = async ({ tableName, ids }) => {
  try {
    validateName(tableName);
    if (!ids || (Array.isArray(ids) && ids.length === 0)) {
      throw new Error("No IDs provided.");
    }

    if (!Array.isArray(ids)) ids = [ids];

    const deleteQuery = `DELETE FROM ${tableName} WHERE id = ANY($1) RETURNING *`;
    const result = await pool.query(deleteQuery, [ids]);
    return { success: true, data: result.rows };
  } catch (error) {
    console.error("Error removing data:", error);
    return { success: false, message: "Failed to remove data." };
  }
};
// ✅ JOIN TABLES (SECURE)
const joinTables = async ({
  table1,
  table2,
  joinType = "INNER",
  onCondition,
}) => {
  try {
    validateName(table1);
    validateName(table2);

    const allowedJoins = ["INNER", "LEFT", "RIGHT", "FULL"];
    if (!allowedJoins.includes(joinType.toUpperCase())) {
      throw new Error(
        `Invalid join type: ${joinType}. Allowed: ${allowedJoins.join(", ")}`
      );
    }

    if (!onCondition || typeof onCondition !== "string") {
      throw new Error(
        "Join condition must be provided as a valid SQL condition string."
      );
    }

    const query = `
      SELECT * FROM ${table1} 
      ${joinType.toUpperCase()} JOIN ${table2} 
      ON ${onCondition}
    `;

    const result = await pool.query(query);
    return { success: true, data: result.rows };
  } catch (error) {
    console.error("Error joining tables:", error);
    return {
      success: false,
      message: `Failed to join tables: ${error.message}`,
    };
  }
};

export {
  createDynamicTable,
  getTableColumns,
  addDataToTable,
  updateDataInTable,
  searchDataInTable,
  removeDataFromTable,
  joinTables,
};
