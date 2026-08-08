import { loadEnvConfig } from "@next/env";
import { getDatabase, nowIso } from "@/lib/local/database";

loadEnvConfig(process.cwd());

const email = process.argv[2]?.trim().toLowerCase();

if (!email || process.argv.length !== 3 || !/^\S+@\S+\.\S+$/.test(email)) {
  console.error("Uso: npm run user:make-admin -- email@usuario.com");
  process.exitCode = 1;
} else {
  const database = getDatabase();
  const user = database.prepare("SELECT id, display_name, role FROM users WHERE email = ?").get(email) as
    | { id: string; display_name: string; role: "admin" | "user" }
    | undefined;

  if (!user) {
    console.error(`Usuário não encontrado: ${email}`);
    process.exitCode = 1;
  } else if (user.role === "admin") {
    console.log(`${user.display_name} (${email}) já é administrador.`);
  } else {
    database.prepare("UPDATE users SET role = 'admin', updated_at = ? WHERE id = ?").run(nowIso(), user.id);
    console.log(`${user.display_name} (${email}) agora é administrador.`);
  }
}
