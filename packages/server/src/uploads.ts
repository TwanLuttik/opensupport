import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, extname, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import type { ServerConfig } from "./config.js";
import type { Attachment } from "./types.js";

/** Each request carries at most this much. A 50 MB file is ten of these. */
export const UPLOAD_CHUNK_BYTES = 5 * 1024 * 1024;
/** Largest file the server will keep. */
export const UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
const UPLOAD_TTL_MS = 1000 * 60 * 60;

export const UPLOAD_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".zip": "application/zip",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

interface UploadSession {
  id: string;
  conversationId: string;
  name: string;
  mimeType: string;
  size: number;
  ext: string;
  chunkCount: number;
  received: Set<number>;
  dir: string;
  updatedAt: number;
}

export interface PreparedUpload {
  name: string;
  mimeType: string;
  ext: string;
  size: number;
  chunkCount: number;
}

export function safeUploadName(raw: string): string {
  const name = basename(raw).replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "").slice(0, 80);
  return name || "attachment";
}

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

/** Profile photos and the business logo stay small and must be an image. */
export function prepareImageUpload(name: string, type: string, size: number, maxBytes = 2 * 1024 * 1024): PreparedUpload {
  const file = prepareUpload(name, type, size);
  if (file.size > maxBytes) {
    throw Object.assign(new Error("Image is larger than 2 MB"), { statusCode: 413 });
  }
  if (!IMAGE_EXTENSIONS.has(file.ext)) {
    throw Object.assign(new Error("Use a PNG, JPEG, GIF, or WebP image"), { statusCode: 415 });
  }
  return file;
}

export function prepareUpload(name: string, type: string, size: number): PreparedUpload {
  if (!Number.isFinite(size) || size <= 0) {
    throw Object.assign(new Error("File is empty"), { statusCode: 400 });
  }
  if (size > UPLOAD_MAX_BYTES) {
    throw Object.assign(new Error("File is larger than 50 MB"), { statusCode: 413 });
  }
  const safeName = safeUploadName(name);
  const ext = extname(safeName).toLowerCase();
  const mime = UPLOAD_MIME[ext];
  if (!mime) {
    throw Object.assign(new Error("Unsupported file type"), { statusCode: 415 });
  }
  const base = mime.split(";")[0]!;
  const declared = (type || "application/octet-stream").split(";")[0]!.trim().toLowerCase();
  if (declared !== base && declared !== "application/octet-stream") {
    throw Object.assign(new Error("Content type does not match file"), { statusCode: 415 });
  }
  return {
    name: safeName,
    mimeType: base,
    ext,
    size,
    chunkCount: Math.ceil(size / UPLOAD_CHUNK_BYTES),
  };
}

export function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("Payload too large"), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolvePromise(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * Chunked uploads land in `<uploadDir>/incoming/<id>/` and are assembled into
 * `<uploadDir>/<id><ext>` when every chunk has arrived. Nothing leaves the disk.
 */
export class UploadStore {
  private readonly sessions = new Map<string, UploadSession>();
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(dir, "incoming"), { recursive: true });
    this.timer = setInterval(() => this.sweep(), 60_000);
    this.timer.unref?.();
  }

  close(): void {
    clearInterval(this.timer);
  }

  /** Writes a finished image in one step. Used for profile photos and the business logo. */
  saveImage(file: PreparedUpload, bytes: Buffer): Attachment {
    if (bytes.length !== file.size) {
      throw Object.assign(new Error("Image size does not match"), { statusCode: 400 });
    }
    const id = randomBytes(12).toString("hex");
    const filename = `${id}${file.ext}`;
    writeFileSync(join(this.dir, filename), bytes);
    return {
      id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      url: `/uploads/${filename}`,
    };
  }

  begin(conversationId: string, file: PreparedUpload): { id: string; chunkSize: number; chunkCount: number } {
    const id = randomBytes(12).toString("hex");
    const dir = join(this.dir, "incoming", id);
    mkdirSync(dir, { recursive: true });
    this.sessions.set(id, {
      id,
      conversationId,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      ext: file.ext,
      chunkCount: file.chunkCount,
      received: new Set(),
      dir,
      updatedAt: Date.now(),
    });
    return { id, chunkSize: UPLOAD_CHUNK_BYTES, chunkCount: file.chunkCount };
  }

  async writeChunk(id: string, conversationId: string, index: number, bytes: Buffer): Promise<{ received: number; total: number }> {
    const session = this.sessionFor(id, conversationId);
    if (!Number.isInteger(index) || index < 0 || index >= session.chunkCount) {
      throw Object.assign(new Error("Chunk is out of range"), { statusCode: 400 });
    }
    const expected = index === session.chunkCount - 1 ? session.size - index * UPLOAD_CHUNK_BYTES : UPLOAD_CHUNK_BYTES;
    if (bytes.length !== expected) {
      throw Object.assign(new Error("Chunk size does not match"), { statusCode: 400 });
    }
    writeFileSync(join(session.dir, String(index)), bytes);
    session.received.add(index);
    session.updatedAt = Date.now();
    return { received: session.received.size, total: session.chunkCount };
  }

  finish(id: string, conversationId: string): Attachment {
    const session = this.sessionFor(id, conversationId);
    if (session.received.size !== session.chunkCount) {
      const error = new Error("Upload is incomplete");
      (error as Error & { statusCode: number }).statusCode = 400;
      throw error;
    }
    const filename = `${session.id}${session.ext}`;
    const target = join(this.dir, filename);
    const chunks = Array.from({ length: session.chunkCount }, (_, index) =>
      readChunk(join(session.dir, String(index))),
    );
    writeFileSync(target, Buffer.concat(chunks));
    rmSync(session.dir, { recursive: true, force: true });
    this.sessions.delete(id);
    return {
      id: session.id,
      name: session.name,
      mimeType: session.mimeType,
      size: session.size,
      url: `/uploads/${filename}`,
    };
  }

  private sessionFor(id: string, conversationId: string): UploadSession {
    const session = this.sessions.get(id);
    if (!session || session.conversationId !== conversationId) {
      throw Object.assign(new Error("Upload not found"), { statusCode: 404 });
    }
    return session;
  }

  private sweep(): void {
    const cutoff = Date.now() - UPLOAD_TTL_MS;
    for (const [id, session] of this.sessions) {
      if (session.updatedAt >= cutoff) continue;
      rmSync(session.dir, { recursive: true, force: true });
      this.sessions.delete(id);
    }
  }
}

function readChunk(path: string): Buffer {
  if (!existsSync(path)) {
    throw Object.assign(new Error("Upload is incomplete"), { statusCode: 400 });
  }
  return readFileSync(path);
}

export function serveUpload(config: ServerConfig, pathname: string, res: ServerResponse): boolean {
  if (!pathname.startsWith("/uploads/")) return false;
  const name = basename(pathname);
  if (!/^[a-zA-Z0-9._-]+$/.test(name) || name.includes("..")) {
    res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Bad filename" }));
    return true;
  }
  const filePath = resolve(config.uploadDir, name);
  if (!filePath.startsWith(resolve(config.uploadDir))) {
    res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Bad filename" }));
    return true;
  }
  try {
    const stat = statSync(filePath);
    if (!stat.isFile()) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Not found" }));
      return true;
    }
    res.writeHead(200, {
      "content-type": UPLOAD_MIME[extname(name).toLowerCase()] ?? "application/octet-stream",
      "content-length": stat.size,
      "content-disposition": `inline; filename="${name}"`,
      "cache-control": "private, max-age=3600",
    });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Not found" }));
  }
  return true;
}

/** Drop leftover part directories left behind by a crash. */
export function clearIncoming(dir: string): void {
  const incoming = join(dir, "incoming");
  if (!existsSync(incoming)) return;
  for (const name of readdirSync(incoming)) {
    rmSync(join(incoming, name), { recursive: true, force: true });
  }
}
