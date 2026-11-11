import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export interface MediaStorageLocation {
  provider: "local" | "supabase";
  bucket: string;
  objectKey: string;
}

@Injectable()
export class MediaStorageService {
  async put(objectKey: string, bytes: Buffer): Promise<MediaStorageLocation> {
    const config = this.configuration();
    if (config.provider === "local") {
      const target = this.localPath(config.directory, objectKey);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
      return { provider: "local", bucket: config.bucket, objectKey };
    }

    const response = await fetch(this.storageUrl(config.url, config.bucket, objectKey), {
      method: "POST",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "image/webp",
        "x-upsert": "false",
      },
      body: new Blob([new Uint8Array(bytes)], { type: "image/webp" }),
    });
    if (!response.ok) throw new ServiceUnavailableException("Object storage could not save the image.");
    return { provider: "supabase", bucket: config.bucket, objectKey };
  }

  async get(location: MediaStorageLocation): Promise<Buffer> {
    if (location.provider === "local") {
      const config = this.configuration();
      if (config.provider !== "local" || location.bucket !== config.bucket) {
        throw new ServiceUnavailableException("The local media store is not available.");
      }
      try {
        return await readFile(this.localPath(config.directory, location.objectKey));
      } catch {
        throw new ServiceUnavailableException("The stored image is unavailable.");
      }
    }

    const config = this.configuration();
    if (config.provider !== "supabase" || location.bucket !== config.bucket) {
      throw new ServiceUnavailableException("Object storage is not configured for this image.");
    }
    const response = await fetch(this.storageUrl(config.url, location.bucket, location.objectKey, true), {
      headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}` },
    });
    if (!response.ok) throw new ServiceUnavailableException("The stored image is unavailable.");
    return Buffer.from(await response.arrayBuffer());
  }

  async remove(location: MediaStorageLocation): Promise<void> {
    if (location.provider === "local") {
      const config = this.configuration();
      if (config.provider === "local" && location.bucket === config.bucket) {
        await rm(this.localPath(config.directory, location.objectKey), { force: true });
      }
      return;
    }

    const config = this.configuration();
    if (config.provider !== "supabase" || location.bucket !== config.bucket) return;
    const response = await fetch(this.storageUrl(config.url, location.bucket), {
      method: "DELETE",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: [location.objectKey] }),
    });
    if (!response.ok) throw new ServiceUnavailableException("Object storage could not remove the image.");
  }

  private configuration():
    | { provider: "local"; bucket: string; directory: string }
    | { provider: "supabase"; bucket: string; url: string; serviceRoleKey: string } {
    const requested = process.env.MEDIA_STORAGE_PROVIDER?.trim();
    if ((requested === undefined || requested === "local") && process.env.NODE_ENV !== "production") {
      return {
        provider: "local",
        bucket: "local-development",
        directory: resolve(process.env.MEDIA_LOCAL_DIRECTORY?.trim() || resolve(process.cwd(), ".local-media")),
      };
    }
    if (requested === "supabase") {
      const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
      const bucket = process.env.SUPABASE_MEDIA_BUCKET?.trim();
      if (url && serviceRoleKey && bucket) return { provider: "supabase", bucket, url, serviceRoleKey };
    }
    throw new ServiceUnavailableException("Media storage is not configured. Configure Supabase Storage for production.");
  }

  private localPath(directory: string, objectKey: string): string {
    const root = resolve(directory);
    const target = resolve(root, ...objectKey.split("/"));
    const pathFromRoot = relative(root, target);
    if (!isAbsolute(root) || pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
      throw new ServiceUnavailableException("The media object key is invalid.");
    }
    return target;
  }

  private storageUrl(baseUrl: string, bucket: string, objectKey?: string, authenticatedRead = false): URL {
    const base = new URL(baseUrl);
    if (base.protocol !== "https:" && process.env.NODE_ENV === "production") {
      throw new ServiceUnavailableException("Supabase Storage must use HTTPS in production.");
    }
    const path = ["storage", "v1", "object", ...(authenticatedRead ? ["authenticated"] : []), bucket, ...(objectKey ? objectKey.split("/") : [])]
      .map((part) => encodeURIComponent(part))
      .join("/");
    return new URL(path, `${base.origin}/`);
  }
}
