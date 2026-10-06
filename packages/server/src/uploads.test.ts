import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prepareUpload, UploadStore, UPLOAD_CHUNK_BYTES, UPLOAD_MAX_BYTES } from "./uploads.js";

test("a file is stored in 5 MB chunks and assembled on disk", async () => {
  const dir = mkdtempSync(join(tmpdir(), "osb-upload-"));
  const uploads = new UploadStore(dir);
  const size = UPLOAD_CHUNK_BYTES + 32;
  const file = prepareUpload("report.pdf", "application/pdf", size);
  assert.equal(file.chunkCount, 2);
  const started = uploads.begin("cnv_1", file);
  assert.equal(started.chunkSize, UPLOAD_CHUNK_BYTES);

  const first = Buffer.alloc(UPLOAD_CHUNK_BYTES, 1);
  const second = Buffer.alloc(32, 2);
  const one = await uploads.writeChunk(started.id, "cnv_1", 0, first);
  assert.deepEqual(one, { received: 1, total: 2 });
  let incomplete = false;
  try {
    uploads.finish(started.id, "cnv_1");
  } catch (error) {
    incomplete = error instanceof Error && /incomplete/.test(error.message);
  }
  assert.equal(incomplete, true);
  await uploads.writeChunk(started.id, "cnv_1", 1, second);

  const attachment = uploads.finish(started.id, "cnv_1");
  assert.equal(attachment.name, "report.pdf");
  assert.equal(attachment.mimeType, "application/pdf");
  assert.equal(attachment.size, size);
  assert.equal(attachment.url, `/uploads/${attachment.id}.pdf`);
  const stored = readFileSync(join(dir, `${attachment.id}.pdf`));
  assert.equal(stored.length, size);
  assert.equal(stored[0], 1);
  assert.equal(stored[stored.length - 1], 2);
  uploads.close();
});

test("files over 50 MB and unknown types are refused before any bytes are stored", () => {
  assert.throws(() => prepareUpload("big.zip", "application/zip", UPLOAD_MAX_BYTES + 1), /50 MB/);
  assert.throws(() => prepareUpload("script.exe", "application/octet-stream", 10), /Unsupported file type/);
  assert.throws(() => prepareUpload("notes.txt", "image/png", 10), /does not match/);
});

test("a chunk for another conversation is not accepted", async () => {
  const dir = mkdtempSync(join(tmpdir(), "osb-upload-"));
  const uploads = new UploadStore(dir);
  const started = uploads.begin("cnv_1", prepareUpload("a.txt", "text/plain", 4));
  await assert.rejects(() => uploads.writeChunk(started.id, "cnv_2", 0, Buffer.from("abcd")), /not found/);
  uploads.close();
});
