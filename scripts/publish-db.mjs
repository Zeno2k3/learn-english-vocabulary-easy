#!/usr/bin/env node
/* Ghi bài học từ Git vào Supabase. Chỉ chạy sau khi dữ liệu đã qua kiểm tra. */
import { createHash } from "node:crypto";
import { loadSite, report } from "./build.mjs";

const url = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SECRET_KEY || "";
if (!url || !key) { console.error("Thiếu SUPABASE_URL hoặc SUPABASE_SECRET_KEY."); process.exit(1); }

const { lessons, topics, rep } = loadSite();
if (rep.errors.length) { report(rep); process.exit(1); }

const wordKey = w => String(w).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
const payload = {
  topics,
  lessons: lessons.map(({ base, file, ...content }) => ({
    id: content.id, title: content.title, base, content,
    hash: createHash("sha256").update(JSON.stringify(content)).digest("hex"),
    words: content.words.map(w => ({ key: wordKey(w.w), w: w.w, vi: w.vi, t: w.t, topic: w.topic, ipa: w.ipa || null, data: w })),
  })),
};

const headers = { apikey: key, "Content-Type": "application/json" };
if (key.startsWith("eyJ")) headers.Authorization = "Bearer " + key;
const res = await fetch(url + "/rest/v1/rpc/publish_content", { method: "POST", headers, body: JSON.stringify({ payload }) });
if (!res.ok) { console.error("Không ghi được vào database (HTTP " + res.status + "): " + (await res.text()).slice(0, 400)); process.exit(1); }
const out = await res.json();
console.log("Database: " + out.total + " bài, cập nhật " + out.changed + ", gỡ " + out.removed + ".");
