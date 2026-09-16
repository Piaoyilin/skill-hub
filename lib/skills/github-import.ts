import { Buffer } from "node:buffer";
import * as yazl from "yazl";
import {
  DEFAULT_SKILL_LIMITS,
  SKILL_MD_FILENAME,
} from "./constants";
import { logTiming, logTimingEvent, measureAsync } from "../diagnostics/timing";
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
  timeouts?: Partial<GithubImportTimeouts>;
};

export type GithubImportTimeouts = {
  metadataMs: number;
  archiveHeadersMs: number;
  archiveBodyMs: number;
};

type GithubMetadata = {
  full_name?: unknown;
  private?: unknown;
  default_branch?: unknown;
  html_url?: unknown;
  size?: unknown;
};

type GithubFetchResponse = {
  response: Response;
  finalUrl: string;
  redirectCount: number;
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
const DEFAULT_GITHUB_IMPORT_TIMEOUTS: GithubImportTimeouts = {
  metadataMs: 10_000,
  archiveHeadersMs: 20_000,
  archiveBodyMs: 120_000,
};

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

function elapsedMilliseconds(startedAt: number) {
  return Number((performance.now() - startedAt).toFixed(1));
}

function megabytes(bytes: number) {
  return Number((bytes / (1024 * 1024)).toFixed(2));
}

function githubTiming(
  label: string,
  startedAt: number,
  context: Record<string, string | number | boolean | undefined> = {},
) {
  logTiming(label, elapsedMilliseconds(startedAt), context);
}

function hostFromUrl(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return "unknown";
  }
}

async function withTimeout<T>(
  label: string,
  timeoutMs: number,
  callback: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await callback(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      logTimingEvent("GITHUB timeout", {
        operation: label,
        timeoutMs,
      });
      failure("FETCH_FAILED");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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

async function readResponseText(
  response: Response,
  maxBytes: number,
  options: { timeoutMs?: number } = {},
) {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) {
    failure("FETCH_FAILED");
  }

  try {
    const buffer = await readResponseBytes(response, maxBytes, options);
    return buffer.toString("utf8");
  } catch (error) {
    if (error instanceof GithubImportFailure) throw error;
    failure("FETCH_FAILED");
  }
}

async function readResponseBytes(
  response: Response,
  maxBytes: number,
  options: {
    timeoutMs?: number;
    onProgressBytes?: (bytes: number) => void;
  } = {},
) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    failure("PACKAGE_TOO_LARGE");
  }

  if (!response.body) {
    const buffer = Buffer.from(
      await (options.timeoutMs
        ? withTimeout("response body", options.timeoutMs, () =>
            response.arrayBuffer(),
          )
        : response.arrayBuffer()),
    );
    if (buffer.byteLength > maxBytes) {
      failure("PACKAGE_TOO_LARGE");
    }
    options.onProgressBytes?.(buffer.byteLength);
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  let timedOut = false;
  const timeout =
    options.timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          timedOut = true;
          void reader.cancel().catch(() => undefined);
        }, options.timeoutMs);

  try {
    while (true) {
      const next = await reader.read();
      if (timedOut) {
        failure("FETCH_FAILED");
      }
      if (next.done) break;

      const chunk = Buffer.from(next.value);
      total += chunk.byteLength;
      options.onProgressBytes?.(total);
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        failure("PACKAGE_TOO_LARGE");
      }
      chunks.push(chunk);
    }
  } catch (error) {
    if (error instanceof GithubImportFailure) throw error;
    if (timedOut) failure("FETCH_FAILED");
    failure("FETCH_FAILED");
  } finally {
    if (timeout) clearTimeout(timeout);
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
  options: { operation: string; timeoutMs: number },
): Promise<GithubFetchResponse> {
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    if (!isAllowedGithubUrl(currentUrl, allowedHosts)) {
      failure("FETCH_FAILED");
    }

    let response: Response;
    const startedAt = performance.now();
    try {
      response = await withTimeout(
        `${options.operation} headers`,
        options.timeoutMs,
        (signal) =>
          fetcher(currentUrl, {
            headers: {
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28",
              "User-Agent": "Skill-Hub-GitHub-Import",
            },
            redirect: "manual",
            signal,
          }),
      );
    } catch {
      failure("FETCH_FAILED");
    }
    githubTiming("GITHUB HTTP request", startedAt, {
      operation: options.operation,
      host: hostFromUrl(currentUrl),
      statusCode: response.status,
      redirectCount,
    });

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

    return { response, finalUrl: currentUrl, redirectCount };
  }

  failure("FETCH_FAILED");
}

async function requestMetadata(
  url: string,
  fetcher: typeof fetch,
  timeouts: GithubImportTimeouts,
): Promise<GithubMetadata> {
  const result = await requestGithub(url, fetcher, GITHUB_API_HOSTS, {
    operation: "metadata",
    timeoutMs: timeouts.metadataMs,
  });
  let bodyText: string;
  try {
    bodyText = await readResponseText(result.response, MAX_METADATA_BYTES, {
      timeoutMs: timeouts.metadataMs,
    });
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

function estimatedRepositoryBytes(metadata: GithubMetadata) {
  return typeof metadata.size === "number" && Number.isFinite(metadata.size)
    ? Math.max(0, metadata.size) * 1024
    : undefined;
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
  const totalStartedAt = performance.now();
  const parseStartedAt = performance.now();
  const parsed = parseGithubRepositoryUrl(value);
  githubTiming("GITHUB parse URL", parseStartedAt);
  if ("error" in parsed) {
    githubTiming("GITHUB TOTAL", totalStartedAt, {
      status: "error",
      code: parsed.error,
    });
    return { kind: "error", error: publicError(parsed.error) };
  }

  const fetcher = dependencies.fetch ?? fetch;
  const limits = dependencies.limits ?? DEFAULT_SKILL_LIMITS;
  const timeouts = {
    ...DEFAULT_GITHUB_IMPORT_TIMEOUTS,
    ...dependencies.timeouts,
  };

  try {
    const apiPath = `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
    const metadata = await measureAsync(
      "GITHUB metadata",
      "fetch repository metadata",
      () => requestMetadata(`${GITHUB_API_ORIGIN}${apiPath}`, fetcher, timeouts),
      { repository: `${parsed.owner}/${parsed.repo}` },
    );
    const estimatedSizeBytes = estimatedRepositoryBytes(metadata);
    logTimingEvent("GITHUB repository size estimate", {
      bytes: estimatedSizeBytes,
      mb:
        estimatedSizeBytes === undefined
          ? undefined
          : megabytes(estimatedSizeBytes),
    });
    if (
      estimatedSizeBytes !== undefined &&
      estimatedSizeBytes > limits.maxPackageSizeBytes
    ) {
      failure("PACKAGE_TOO_LARGE");
    }
    const branchStartedAt = performance.now();
    const repository = repositoryFromMetadata(parsed, metadata);
    githubTiming("GITHUB default branch", branchStartedAt, {
      defaultBranch: repository.defaultBranch,
    });

    const archivePath = `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/zipball/${encodeURIComponent(repository.defaultBranch)}`;
    const archiveResponse = await measureAsync(
      "GITHUB archive headers",
      "request archive",
      () =>
        requestGithub(
          `${GITHUB_API_ORIGIN}${archivePath}`,
          fetcher,
          GITHUB_ARCHIVE_HOSTS,
          {
            operation: "archive",
            timeoutMs: timeouts.archiveHeadersMs,
          },
        ),
      { repository: repository.fullName },
    );
    const rawContentLength = archiveResponse.response.headers.get("content-length");
    const contentLength = rawContentLength === null ? NaN : Number(rawContentLength);
    logTimingEvent("GITHUB archive response headers", {
      host: hostFromUrl(archiveResponse.finalUrl),
      statusCode: archiveResponse.response.status,
      redirectCount: archiveResponse.redirectCount,
      contentLengthBytes: Number.isFinite(contentLength) ? contentLength : undefined,
      contentType: archiveResponse.response.headers.get("content-type") ?? undefined,
    });

    const archiveStartedAt = performance.now();
    let archiveBytesRead = 0;
    let archive: Buffer;
    try {
      archive = await readResponseBytes(
        archiveResponse.response,
        limits.maxPackageSizeBytes,
        {
          timeoutMs: timeouts.archiveBodyMs,
          onProgressBytes: (bytes) => {
            archiveBytesRead = bytes;
          },
        },
      );
      githubTiming("GITHUB archive body", archiveStartedAt, {
        bytes: archive.byteLength,
        mb: megabytes(archive.byteLength),
      });
      logTimingEvent("GITHUB archive byte size", {
        bytes: archive.byteLength,
        mb: megabytes(archive.byteLength),
      });
    } catch (error) {
      githubTiming("GITHUB archive body", archiveStartedAt, {
        bytes: archiveBytesRead,
        mb: megabytes(archiveBytesRead),
        status: "error",
      });
      throw error;
    }
    if (archive.byteLength === 0) {
      failure("FETCH_FAILED");
    }

    const loaded = await measureAsync(
      "GITHUB loadSkillPackageFromZip",
      "original archive",
      () =>
        loadSkillPackageFromZip(archive, {
          limits,
          diagnostics: { source: "github-original" },
        }),
      { bytes: archive.byteLength, mb: megabytes(archive.byteLength) },
    );
    const validationErrors = loaded.validation.issues.filter(
      (item) => item.severity === "error",
    );

    if (validationErrors.some((item) => isSizeIssue(item.code))) {
      failure("PACKAGE_TOO_LARGE");
    }

    const originalAnalysis = await measureAsync(
      "GITHUB analyzeSkillUpload",
      "original archive",
      () =>
        analyzeSkillUpload({
          buffer: archive,
          fileName: `${parsed.repo}.zip`,
        }, {
          limits,
          diagnostics: { source: "github-original-analysis" },
        }),
      { bytes: archive.byteLength, mb: megabytes(archive.byteLength) },
    );

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

    const normalizedZip = await measureAsync(
      "GITHUB normalized ZIP generation",
      "create normalized zip",
      () => createNormalizedZip(loaded.package.files ?? []),
      { fileCount: loaded.package.files?.length ?? 0 },
    );
    if (normalizedZip.byteLength > limits.maxPackageSizeBytes) {
      failure("PACKAGE_TOO_LARGE");
    }

    const normalizedAnalysis = await measureAsync(
      "GITHUB analyzeSkillUpload",
      "normalized zip",
      () =>
        analyzeSkillUpload(
          { buffer: normalizedZip, fileName: `${parsed.repo}.zip` },
          {
            limits,
            diagnostics: { source: "github-normalized-analysis" },
          },
        ),
      {
        bytes: normalizedZip.byteLength,
        mb: megabytes(normalizedZip.byteLength),
      },
    );
    if (normalizedAnalysis.kind !== "preview") {
      if (normalizedAnalysis.error.code === "FILE_SIZE_LIMIT") {
        failure("PACKAGE_TOO_LARGE");
      }
      failure("VALIDATION_FAILED");
    }

    const serializationStartedAt = performance.now();
    const packageBase64 = normalizedZip.toString("base64");
    githubTiming("GITHUB package base64", serializationStartedAt, {
      bytes: normalizedZip.byteLength,
      base64Bytes: packageBase64.length,
    });
    githubTiming("GITHUB TOTAL", totalStartedAt, {
      status: "success",
      repository: repository.fullName,
      archiveBytes: archive.byteLength,
      normalizedBytes: normalizedZip.byteLength,
    });

    return {
      kind: "success",
      repository,
      preview: normalizedAnalysis.preview,
      fileName: `${parsed.repo}.zip`,
      packageBase64,
    };
  } catch (error) {
    if (error instanceof GithubImportFailure) {
      githubTiming("GITHUB TOTAL", totalStartedAt, {
        status: "error",
        code: error.code,
      });
      return { kind: "error", error: publicError(error.code) };
    }
    githubTiming("GITHUB TOTAL", totalStartedAt, {
      status: "error",
      code: "FETCH_FAILED",
    });
    return { kind: "error", error: publicError("FETCH_FAILED") };
  }
}

export function githubImportErrorMessage(code: GithubImportErrorCode) {
  return ERROR_MESSAGES[code];
}
