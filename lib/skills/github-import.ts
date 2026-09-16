import { Buffer } from "node:buffer";
import * as yazl from "yazl";
import {
  DEFAULT_SKILL_LIMITS,
  SKILL_MD_FILENAME,
} from "./constants";
import { analyzeSkillUpload, type SkillUploadPreview } from "./upload";
import { loadSkillPackageFromZip } from "./zip";

export type GithubImportErrorCode =
  | "URL_INVALID"
  | "UNSUPPORTED_HOST"
  | "REPOSITORY_NOT_FOUND"
  | "PRIVATE_REPOSITORY"
  | "ACCESS_DENIED"
  | "SKILL_MD_NOT_FOUND"
  | "VALIDATION_FAILED"
  | "PACKAGE_TOO_LARGE"
  | "GITHUB_RATE_LIMIT"
  | "FETCH_FAILED";

export type GithubRepositoryReference = {
  owner: string;
  repo: string;
  fullName: string;
  url: string;
  defaultBranch: string;
};

export type ParsedGithubRepositoryUrl = {
  owner: string;
  repo: string;
  url: string;
};

export type GithubImportResult =
  | {
      kind: "success";
      repository: GithubRepositoryReference;
      preview: SkillUploadPreview;
      fileName: string;
      packageBase64: string;
    }
  | {
      kind: "validation-error";
      repository: GithubRepositoryReference;
      preview: SkillUploadPreview;
      error: {
        code: "SKILL_MD_NOT_FOUND" | "VALIDATION_FAILED";
        message: string;
      };
    }
  | {
      kind: "error";
      error: {
        code: GithubImportErrorCode;
        message: string;
      };
    };

export type GithubImportDependencies = {
  fetch?: typeof fetch;
  limits?: typeof DEFAULT_SKILL_LIMITS;
};

type GithubMetadata = {
  full_name?: unknown;
  private?: unknown;
  default_branch?: unknown;
  html_url?: unknown;
};

type GithubFetchResponse = {
  response: Response;
};

const GITHUB_API_ORIGIN = "https://api.github.com";
const GITHUB_API_HOSTS = new Set(["api.github.com"]);
const GITHUB_ARCHIVE_HOSTS = new Set([
  "api.github.com",
  "codeload.github.com",
  "github.com",
]);
const MAX_METADATA_BYTES = 128 * 1024;
const MAX_REDIRECTS = 3;

const ERROR_MESSAGES: Record<GithubImportErrorCode, string> = {
  URL_INVALID: "请输入有效的 GitHub Repository URL",
  UNSUPPORTED_HOST: "目前仅支持 GitHub.com",
  REPOSITORY_NOT_FOUND: "未找到该公开仓库",
  PRIVATE_REPOSITORY: "当前仅支持公开 GitHub 仓库",
  ACCESS_DENIED: "当前仅支持公开 GitHub 仓库",
  SKILL_MD_NOT_FOUND: "仓库根目录未找到 SKILL.md。",
  VALIDATION_FAILED: "Skill 验证未通过",
  PACKAGE_TOO_LARGE: "仓库内容超过 Skill Hub 的导入限制",
  GITHUB_RATE_LIMIT: "GitHub 请求频率受限，请稍后重试",
  FETCH_FAILED: "无法读取 GitHub 仓库，请稍后重试",
};

export class GithubImportFailure extends Error {
  readonly code: GithubImportErrorCode;

  constructor(code: GithubImportErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "GithubImportFailure";
    this.code = code;
  }
}

function failure(code: GithubImportErrorCode): never {
  throw new GithubImportFailure(code);
}

function isRepositoryPart(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
}

export function parseGithubRepositoryUrl(
  value: string,
): ParsedGithubRepositoryUrl | { error: "URL_INVALID" | "UNSUPPORTED_HOST" } {
  if (!value || value.trim().length > 2048) {
    return { error: "URL_INVALID" };
  }

  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return { error: "URL_INVALID" };
  }

  if (parsed.hostname.toLowerCase() !== "github.com") {
    return { error: "UNSUPPORTED_HOST" };
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash
  ) {
    return { error: "URL_INVALID" };
  }

  const authority = value.trim().match(/^https:\/\/([^/?#]*)/i)?.[1];
  if (authority?.toLowerCase() !== "github.com") {
    return { error: "URL_INVALID" };
  }

  const path = parsed.pathname.replace(/\/+$/, "");
  const rawParts = path.startsWith("/") ? path.slice(1).split("/") : [];
  if (rawParts.length !== 2 || rawParts.some((part) => !part)) {
    return { error: "URL_INVALID" };
  }

  let owner: string;
  let repo: string;
  try {
    owner = decodeURIComponent(rawParts[0] ?? "");
    repo = decodeURIComponent(rawParts[1] ?? "");
  } catch {
    return { error: "URL_INVALID" };
  }

  if (repo.toLowerCase().endsWith(".git")) {
    repo = repo.slice(0, -4);
  }

  if (!isRepositoryPart(owner) || !isRepositoryPart(repo)) {
    return { error: "URL_INVALID" };
  }

  return {
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}`,
  };
}

function publicError(code: GithubImportErrorCode) {
  return { code, message: ERROR_MESSAGES[code] };
}

function isRateLimited(response: Response, bodyText = "") {
  return (
    response.status === 429 ||
    response.headers.get("x-ratelimit-remaining") === "0" ||
    bodyText.toLowerCase().includes("rate limit")
  );
}

async function readResponseText(response: Response, maxBytes: number) {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) {
    failure("FETCH_FAILED");
  }

  try {
    const buffer = await readResponseBytes(response, maxBytes);
    return buffer.toString("utf8");
  } catch (error) {
    if (error instanceof GithubImportFailure) throw error;
    failure("FETCH_FAILED");
  }
}

async function readResponseBytes(response: Response, maxBytes: number) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    failure("PACKAGE_TOO_LARGE");
  }

  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      failure("PACKAGE_TOO_LARGE");
    }
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;

      const chunk = Buffer.from(next.value);
      total += chunk.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        failure("PACKAGE_TOO_LARGE");
      }
      chunks.push(chunk);
    }
  } catch (error) {
    if (error instanceof GithubImportFailure) throw error;
    failure("FETCH_FAILED");
  }

  return Buffer.concat(chunks, total);
}

function mapHttpFailure(response: Response, bodyText = ""): never {
  if (isRateLimited(response, bodyText)) {
    failure("GITHUB_RATE_LIMIT");
  }
  if (response.status === 404) {
    failure("REPOSITORY_NOT_FOUND");
  }
  if (response.status === 401) {
    failure("PRIVATE_REPOSITORY");
  }
  if (response.status === 403) {
    failure("ACCESS_DENIED");
  }
  failure("FETCH_FAILED");
}

function isAllowedGithubUrl(value: string, allowedHosts: ReadonlySet<string>) {
  const authority = value.match(/^https:\/\/([^/?#]*)/i)?.[1]?.toLowerCase();
  if (!authority || !allowedHosts.has(authority)) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  return (
    parsed.protocol === "https:" &&
    !parsed.username &&
    !parsed.password &&
    !parsed.port &&
    allowedHosts.has(parsed.hostname.toLowerCase())
  );
}

async function requestGithub(
  url: string,
  fetcher: typeof fetch,
  allowedHosts: ReadonlySet<string>,
): Promise<GithubFetchResponse> {
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    if (!isAllowedGithubUrl(currentUrl, allowedHosts)) {
      failure("FETCH_FAILED");
    }

    let response: Response;
    try {
      response = await fetcher(currentUrl, {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "Skill-Hub-GitHub-Import",
        },
        redirect: "manual",
      });
    } catch {
      failure("FETCH_FAILED");
    }

    if (response.url && !isAllowedGithubUrl(response.url, allowedHosts)) {
      failure("FETCH_FAILED");
    }

    if (response.status >= 300 && response.status < 400) {
      if (redirectCount === MAX_REDIRECTS) {
        failure("FETCH_FAILED");
      }

      const location = response.headers.get("location");
      if (!location) {
        failure("FETCH_FAILED");
      }

      let nextUrl: URL;
      try {
        nextUrl = new URL(location, currentUrl);
      } catch {
        failure("FETCH_FAILED");
      }

      if (!isAllowedGithubUrl(nextUrl.toString(), allowedHosts)) {
        failure("FETCH_FAILED");
      }
      currentUrl = nextUrl.toString();
      continue;
    }

    if (!response.ok) {
      let bodyText = "";
      try {
        bodyText = await readResponseText(response, MAX_METADATA_BYTES);
      } catch {
        bodyText = "";
      }
      mapHttpFailure(response, bodyText);
    }

    return { response };
  }

  failure("FETCH_FAILED");
}

async function requestMetadata(
  url: string,
  fetcher: typeof fetch,
): Promise<GithubMetadata> {
  const result = await requestGithub(url, fetcher, GITHUB_API_HOSTS);
  let bodyText: string;
  try {
    bodyText = await readResponseText(result.response, MAX_METADATA_BYTES);
  } catch {
    failure("FETCH_FAILED");
  }

  try {
    const value: unknown = JSON.parse(bodyText);
    if (!value || typeof value !== "object") {
      failure("FETCH_FAILED");
    }
    return value as GithubMetadata;
  } catch (error) {
    if (error instanceof GithubImportFailure) throw error;
    failure("FETCH_FAILED");
  }
}

function repositoryFromMetadata(
  parsed: ParsedGithubRepositoryUrl,
  metadata: GithubMetadata,
) {
  if (metadata.private === true) {
    failure("PRIVATE_REPOSITORY");
  }

  const defaultBranch =
    typeof metadata.default_branch === "string"
      ? metadata.default_branch.trim()
      : "";
  if (!defaultBranch) {
    failure("FETCH_FAILED");
  }

  const fullName =
    typeof metadata.full_name === "string" && metadata.full_name.trim()
      ? metadata.full_name.trim()
      : `${parsed.owner}/${parsed.repo}`;
  const url =
    typeof metadata.html_url === "string" && metadata.html_url.startsWith("https://github.com/")
      ? metadata.html_url
      : parsed.url;

  return {
    owner: parsed.owner,
    repo: parsed.repo,
    fullName,
    url,
    defaultBranch,
  };
}

function isSizeIssue(code: string) {
  return new Set([
    "ZIP_SIZE_LIMIT",
    "ZIP_CONTENT_LIMIT",
    "PACKAGE_SIZE_LIMIT",
    "FILE_SIZE_LIMIT",
    "FILE_COUNT_LIMIT",
    "DIRECTORY_DEPTH_LIMIT",
  ]).has(code);
}

function hasRootSkillMd(
  skillMdPath: string | undefined,
): skillMdPath is typeof SKILL_MD_FILENAME {
  return skillMdPath === SKILL_MD_FILENAME;
}

async function createNormalizedZip(
  files: NonNullable<Awaited<ReturnType<typeof loadSkillPackageFromZip>>["package"]["files"]>,
) {
  return new Promise<Buffer>((resolve, reject) => {
    const zip = new yazl.ZipFile();
    const chunks: Buffer[] = [];

    zip.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.once("error", reject);
    zip.outputStream.once("end", () => resolve(Buffer.concat(chunks)));

    try {
      for (const file of files) {
        if (file.type === "directory") {
          zip.addEmptyDirectory(file.path);
          continue;
        }

        if (!file.content) {
          reject(new GithubImportFailure("FETCH_FAILED"));
          return;
        }
        zip.addBuffer(Buffer.from(file.content), file.path);
      }
      zip.end();
    } catch {
      reject(new GithubImportFailure("FETCH_FAILED"));
    }
  });
}

function validationFailure(
  repository: GithubRepositoryReference,
  preview: SkillUploadPreview,
  code: "SKILL_MD_NOT_FOUND" | "VALIDATION_FAILED",
): GithubImportResult {
  return {
    kind: "validation-error",
    repository,
    preview,
    error: publicError(code) as {
      code: "SKILL_MD_NOT_FOUND" | "VALIDATION_FAILED";
      message: string;
    },
  };
}

export async function importGithubSkill(
  value: string,
  dependencies: GithubImportDependencies = {},
): Promise<GithubImportResult> {
  const parsed = parseGithubRepositoryUrl(value);
  if ("error" in parsed) {
    return { kind: "error", error: publicError(parsed.error) };
  }

  const fetcher = dependencies.fetch ?? fetch;
  const limits = dependencies.limits ?? DEFAULT_SKILL_LIMITS;

  try {
    const apiPath = `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
    const metadata = await requestMetadata(`${GITHUB_API_ORIGIN}${apiPath}`, fetcher);
    const repository = repositoryFromMetadata(parsed, metadata);

    const archivePath = `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/zipball/${encodeURIComponent(repository.defaultBranch)}`;
    const archiveResponse = await requestGithub(
      `${GITHUB_API_ORIGIN}${archivePath}`,
      fetcher,
      GITHUB_ARCHIVE_HOSTS,
    );

    const archive = await readResponseBytes(
      archiveResponse.response,
      limits.maxPackageSizeBytes,
    );
    if (archive.byteLength === 0) {
      failure("FETCH_FAILED");
    }

    const loaded = await loadSkillPackageFromZip(archive, { limits });
    const validationErrors = loaded.validation.issues.filter(
      (item) => item.severity === "error",
    );

    if (validationErrors.some((item) => isSizeIssue(item.code))) {
      failure("PACKAGE_TOO_LARGE");
    }

    const originalAnalysis = await analyzeSkillUpload({
      buffer: archive,
      fileName: `${parsed.repo}.zip`,
    }, { limits });

    if (!loaded.validation.valid) {
      if (
        !hasRootSkillMd(loaded.package.skillMdPath) &&
        validationErrors.every((item) =>
          [
            "SKILL_MD_MISSING",
            "SKILL_MD_NOT_AT_ROOT",
            "SKILL_MD_PATH_INVALID",
            "SKILL_MD_CONTENT_MISSING",
          ].includes(item.code),
        )
      ) {
        if (originalAnalysis.kind === "error" && originalAnalysis.preview) {
          return validationFailure(
            repository,
            originalAnalysis.preview,
            "SKILL_MD_NOT_FOUND",
          );
        }
        failure("SKILL_MD_NOT_FOUND");
      }

      if (originalAnalysis.kind === "error" && originalAnalysis.preview) {
        return validationFailure(
          repository,
          originalAnalysis.preview,
          "VALIDATION_FAILED",
        );
      }
      failure("VALIDATION_FAILED");
    }

    const normalizedZip = await createNormalizedZip(loaded.package.files ?? []);
    if (normalizedZip.byteLength > limits.maxPackageSizeBytes) {
      failure("PACKAGE_TOO_LARGE");
    }

    const normalizedAnalysis = await analyzeSkillUpload(
      { buffer: normalizedZip, fileName: `${parsed.repo}.zip` },
      { limits },
    );
    if (normalizedAnalysis.kind !== "preview") {
      if (normalizedAnalysis.error.code === "FILE_SIZE_LIMIT") {
        failure("PACKAGE_TOO_LARGE");
      }
      failure("VALIDATION_FAILED");
    }

    return {
      kind: "success",
      repository,
      preview: normalizedAnalysis.preview,
      fileName: `${parsed.repo}.zip`,
      packageBase64: normalizedZip.toString("base64"),
    };
  } catch (error) {
    if (error instanceof GithubImportFailure) {
      return { kind: "error", error: publicError(error.code) };
    }
    return { kind: "error", error: publicError("FETCH_FAILED") };
  }
}

export function githubImportErrorMessage(code: GithubImportErrorCode) {
  return ERROR_MESSAGES[code];
}
