// Load the knowledgebase from SQLite (June's `db` resource) once per process.
// Docs + precomputed bge-m3 embeddings live in kura.db; only the query is embedded.
import { Kb } from "@kurajs/core";
import { transformers } from "@kurajs/transformers";
import { db } from "@junejs/server";

export type Doc = { title: string; text: string };
const DIM = 1024;

let building: Promise<Kb<Doc>> | null = null;
export function getKb(): Promise<Kb<Doc>> {
  return (building ??= build());
}

type Row = { id: string; title: string; text: string; embedding: Uint8Array };

async function build(): Promise<Kb<Doc>> {
  const kb = new Kb<Doc>({ dim: DIM, embedder: transformers() });
  const rows = await db.query<Row>("SELECT id, title, text, embedding FROM docs");
  kb.add(rows.map((r) => {
    const v = new Float32Array(DIM);
    new Uint8Array(v.buffer).set(r.embedding); // copy bytes (alignment-safe)
    return { id: r.id, vector: v, data: { title: r.title, text: r.text } };
  }));
  return kb;
}

export async function docCount(): Promise<number> {
  const r = await db.get<{ n: number }>("SELECT count(*) AS n FROM docs");
  return r?.n ?? 0;
}
