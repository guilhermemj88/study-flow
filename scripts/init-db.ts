import { loadEnvConfig } from "@next/env";
import { getDataDirectory, getDatabase, getUploadsDirectory } from "@/lib/local/database";

loadEnvConfig(process.cwd());
getDatabase();
getUploadsDirectory();
console.log(`SQLite inicializado em ${getDataDirectory()}`);
