import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createStudyFlowMcpServer } from "../mcp/tools";
import { createUser, createUserSession, getUserBySessionToken } from "../src/lib/local/auth-store";
import { closeDatabaseForTests } from "../src/lib/local/database";
import {
  authorizeWithPassword,
  createAuthorizationRequest,
  exchangeAuthorizationCode,
  registerOAuthClient,
  resolveAccessToken,
} from "../src/lib/local/oauth-store";
import { LocalQuestionStore } from "../src/lib/local/question-store";
import { LocalSourceStore } from "../src/lib/local/source-store";
import { LocalStudyStore } from "../src/lib/local/study-store";

const dataDirectory = mkdtempSync(join(tmpdir(), "study-flow-test-"));
(process.env as Record<string, string | undefined>).NODE_ENV = "test";
process.env.STUDY_FLOW_DATA_DIR = dataDirectory;
process.env.MCP_PUBLIC_URL = "http://127.0.0.1:3333";
process.env.MCP_ALLOW_INSECURE_DEV_REDIRECTS = "true";

after(() => {
  closeDatabaseForTests();
  rmSync(dataDirectory, { recursive: true, force: true });
});

const alice = createUser({ displayName: "Alice", email: "alice@example.test", password: "senha-segura-1" });
const bob = createUser({ displayName: "Bob", email: "bob@example.test", password: "senha-segura-2" });

test("sessões locais são opacas e resolvem apenas o próprio usuário", () => {
  const session = createUserSession(alice.id);
  assert.equal(getUserBySessionToken(session.token)?.id, alice.id);
  assert.equal(getUserBySessionToken("token-inventado"), null);
});

test("SQLite, questões e uploads mantêm isolamento por usuário", () => {
  const aliceStudy = new LocalStudyStore(alice.id);
  const activity = aliceStudy.createActivity({ subject: "Direito", topic: "Constituição", type: "study", date: "2026-08-09", estimatedMinutes: 45, priority: "high", status: "planned" });
  assert.equal(aliceStudy.load().activities[0]?.id, activity.id);
  assert.equal(new LocalStudyStore(bob.id).load().activities.length, 0);

  const aliceSources = new LocalSourceStore(alice.id);
  const sourceId = aliceSources.create({ name: "Prova 2026", sourceType: "exam", year: 2026 }, { name: "prova.pdf", type: "application/pdf", size: 8, bytes: new TextEncoder().encode("%PDF-1.4") });
  assert.equal(aliceSources.readFile(sourceId).mimeType, "application/pdf");
  assert.throws(() => new LocalSourceStore(bob.id).readFile(sourceId), /não possui arquivo|Fonte|arquivo local/i);
  aliceSources.saveTopicsByName(sourceId, [{ subject: "Direito", topic: "Constituição", subtopic: "Direitos fundamentais", questionCount: 1, incidencePercentage: 100 }]);
  assert.equal(aliceSources.get(sourceId).topicStats.length, 1);

  const questionIds = new LocalQuestionStore(alice.id).saveQuestionsByName(sourceId, [{
    questionNumber: 1, statement: "Qual alternativa está correta?", subject: "Direito", topic: "Constituição", correctAlternative: "A",
    alternatives: [{ label: "A", text: "Correta" }, { label: "B", text: "Incorreta" }],
  }]);
  assert.equal(questionIds.length, 1);
  assert.equal(new LocalQuestionStore(alice.id).load(undefined, false).questions.length, 1);
  assert.equal(new LocalQuestionStore(bob.id).load(undefined, false).questions.length, 0);
  const questions = new LocalQuestionStore(alice.id);
  const sessionId = questions.createSession(questionIds);
  const answer = questions.answer(sessionId, "B");
  const answeredSession = questions.getSession(sessionId);
  questions.setErrorReason(answeredSession.questions[0].sessionQuestionId, answer.attemptId, "interpretation");
  questions.complete(sessionId);
  assert.equal(questions.getSession(sessionId).status, "completed");
});

test("OAuth usa PKCE S256, emite token local e impede reuso do código", () => {
  const redirectUri = "http://127.0.0.1:6274/oauth/callback";
  const client = registerOAuthClient({ clientName: "Inspector", redirectUris: [redirectUri] });
  const verifier = "a".repeat(64);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const request = createAuthorizationRequest({ clientId: client.client_id, redirectUri, responseType: "code", codeChallenge: challenge, codeChallengeMethod: "S256", scope: "studyflow:read studyflow:write" });
  const redirect = new URL(authorizeWithPassword(request.id, alice.email, "senha-segura-1"));
  const code = redirect.searchParams.get("code");
  assert.ok(code);
  const tokens = exchangeAuthorizationCode({ code, clientId: client.client_id, redirectUri, codeVerifier: verifier });
  const access = resolveAccessToken(tokens.access_token);
  assert.equal(access?.user.id, alice.id);
  assert.deepEqual(access?.scopes, ["studyflow:read", "studyflow:write"]);
  assert.throws(() => exchangeAuthorizationCode({ code, clientId: client.client_id, redirectUri, codeVerifier: verifier }), /inválido|expirado/i);
});

test("servidor MCP anuncia ferramentas e grava pelos stores do usuário autenticado", async () => {
  const server = createStudyFlowMcpServer(alice.id, ["studyflow:read", "studyflow:write"]);
  const client = new Client({ name: "study-flow-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const tools = await client.listTools();
  assert.ok(tools.tools.some((tool) => tool.name === "list_sources"));
  assert.ok(tools.tools.some((tool) => tool.name === "save_questions"));
  const result = await client.callTool({ name: "create_activity", arguments: { subject: "Português", topic: "Sintaxe", type: "review", date: "2026-08-10", estimatedMinutes: 30, priority: "medium", status: "planned" } });
  assert.equal(result.isError, undefined);
  assert.ok(new LocalStudyStore(alice.id).load().activities.some((activity) => activity.subject === "Português"));
  assert.equal(new LocalStudyStore(bob.id).load().activities.length, 0);
  await client.close();
  await server.close();
});
