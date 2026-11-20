import { AwsClient } from "aws4fetch";

// Cloudflare R2 (S3-compatible) storage for exports. Everything this app writes lives under
// R2_ROOT_PREFIX (new-system/social-management-center) in the R2_BUCKET_NAME bucket.
// Files are only handed out through short-lived signed links, never public URLs.

function cfg() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("Cloudflare R2 is not configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME)");
  }
  return {
    client: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: process.env.R2_REGION || "auto" }),
    base: `https://${accountId}.r2.cloudflarestorage.com/${bucket}`,
  };
}

const enc = (key: string) => key.split("/").map(encodeURIComponent).join("/");

/** Full object key under this app's folder. */
export function r2Key(path: string) {
  const root = (process.env.R2_ROOT_PREFIX || "new-system/social-management-center").replace(/^\/+|\/+$/g, "");
  return `${root}/${path.replace(/^\/+/, "")}`;
}

export async function r2Put(key: string, body: Uint8Array, contentType: string) {
  const { client, base } = cfg();
  const res = await client.fetch(`${base}/${enc(key)}`, {
    method: "PUT",
    body: body as unknown as BodyInit,
    headers: { "content-type": contentType },
  });
  if (!res.ok) throw new Error(`R2 upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

export async function r2Delete(key: string) {
  const { client, base } = cfg();
  const res = await client.fetch(`${base}/${enc(key)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`R2 delete failed (${res.status})`);
}

/** A download link valid for `seconds` that saves the file as `fileName`. */
export async function r2SignedUrl(key: string, fileName: string, seconds = 300) {
  const { client, base } = cfg();
  const url = new URL(`${base}/${enc(key)}`);
  url.searchParams.set("X-Amz-Expires", String(seconds));
  url.searchParams.set("response-content-disposition", `attachment; filename="${fileName.replace(/"/g, "")}"`);
  const signed = await client.sign(url.toString(), { method: "GET", aws: { signQuery: true } });
  return signed.url;
}
