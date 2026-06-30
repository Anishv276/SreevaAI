import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GitHubUser {
  login: string;
  avatar_url: string;
  html_url: string;
}

interface GitHubCommit {
  id: string;
  message: string;
  timestamp: string;
  url: string;
  author: {
    name: string;
    email: string;
    username?: string;
  };
  added: string[];
  modified: string[];
  removed: string[];
}

interface GitHubRepository {
  full_name: string;
  html_url: string;
  name: string;
}

interface PushPayload {
  ref: string;
  before: string;
  after: string;
  commits: GitHubCommit[];
  pusher: { name: string; email: string };
  sender: GitHubUser;
  repository: GitHubRepository;
  compare: string;
  forced: boolean;
  deleted: boolean;
  created: boolean;
}

interface PullRequestPayload {
  action: string;
  number: number;
  pull_request: {
    title: string;
    html_url: string;
    state: string;
    merged: boolean;
    body: string | null;
    head: { ref: string; sha: string };
    base: { ref: string };
    user: GitHubUser;
    created_at: string;
    updated_at: string;
    merged_at: string | null;
    commits: number;
    additions: number;
    deletions: number;
    changed_files: number;
    draft: boolean;
  };
  sender: GitHubUser;
  repository: GitHubRepository;
}

interface CreateDeletePayload {
  ref: string;
  ref_type: "branch" | "tag";
  sender: GitHubUser;
  repository: GitHubRepository;
  master_branch?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBranchFromRef(ref: string): string {
  return ref.replace("refs/heads/", "").replace("refs/tags/", "tag:");
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }) + " IST";
}

function truncate(text: string, max = 72): string {
  const firstLine = text.split("\n")[0].trim();
  return firstLine.length > max ? firstLine.slice(0, max - 1) + "…" : firstLine;
}

function fileStats(commits: GitHubCommit[]): string {
  const added = commits.reduce((s, c) => s + c.added.length, 0);
  const modified = commits.reduce((s, c) => s + c.modified.length, 0);
  const removed = commits.reduce((s, c) => s + c.removed.length, 0);
  const parts: string[] = [];
  if (added) parts.push(`+${added} added`);
  if (modified) parts.push(`~${modified} modified`);
  if (removed) parts.push(`-${removed} removed`);
  return parts.join(", ") || "no file changes";
}

// ─── Slack Block Builders ─────────────────────────────────────────────────────

function buildPushBlocks(payload: PushPayload): object[] {
  const branch = getBranchFromRef(payload.ref);
  const repoName = payload.repository.full_name;
  const repoUrl = payload.repository.html_url;
  const pusher = payload.sender.login;
  const pusherUrl = payload.sender.html_url;
  const avatarUrl = payload.sender.avatar_url;
  const commits = payload.commits;
  const now = new Date().toISOString();

  const action = payload.deleted
    ? "🗑️ Deleted branch via push"
    : payload.created
    ? "🌿 Force-created branch"
    : payload.forced
    ? "⚡ Force-pushed"
    : "📦 Pushed";

  const headerText = `${action} to *<${repoUrl}/tree/${branch}|${branch}>* in *<${repoUrl}|${repoName}>*`;

  const commitLines = commits
    .slice(0, 5)
    .map((c) => {
      const msg = truncate(c.message);
      const shortSha = c.id.slice(0, 7);
      const who = c.author.username
        ? `<https://github.com/${c.author.username}|${c.author.name}>`
        : c.author.name;
      const time = formatTimestamp(c.timestamp);
      return `• \`<${c.url}|${shortSha}>\` ${msg}\n  _by ${who} at ${time}_`;
    })
    .join("\n");

  const extra = commits.length > 5 ? `\n_...and ${commits.length - 5} more commits_` : "";
  const fileSummary = fileStats(commits);

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${"=".repeat(50)}\n${headerText}\n${"=".repeat(50)}`
      },
      accessory: {
        type: "image",
        image_url: avatarUrl,
        alt_text: pusher,
      },
    },
    ...(commits.length > 0
      ? [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*${commits.length} commit${commits.length > 1 ? "s" : ""}* — ${fileSummary}\n\n${commitLines}${extra}`,
            },
          },
        ]
      : []),
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `👤 *<${pusherUrl}|${pusher}>*` },
        { type: "mrkdwn", text: `🕐 ${formatTimestamp(now)}` },
        ...(payload.compare && commits.length > 1
          ? [{ type: "mrkdwn", text: `<${payload.compare}|Compare changes>` }]
          : []),
      ],
    },
  ];
}

function buildPRBlocks(payload: PullRequestPayload): object[] {
  const pr = payload.pull_request;
  const action = payload.action;
  const repoName = payload.repository.full_name;
  const repoUrl = payload.repository.html_url;
  const sender = payload.sender.login;
  const senderUrl = payload.sender.html_url;
  const avatarUrl = payload.sender.avatar_url;
  const now = new Date().toISOString();

  const actionEmoji: Record<string, string> = {
    opened: "🟢",
    closed: pr.merged ? "🟣" : "🔴",
    reopened: "🔄",
    synchronize: "🔁",
    ready_for_review: "👀",
    converted_to_draft: "📝",
    edited: "✏️",
    review_requested: "🙋",
    assigned: "👤",
  };

  const actionLabel: Record<string, string> = {
    opened: "Opened PR",
    closed: pr.merged ? "Merged PR" : "Closed PR (not merged)",
    reopened: "Reopened PR",
    synchronize: "Pushed new commits to PR",
    ready_for_review: "Marked PR ready for review",
    converted_to_draft: "Converted PR to Draft",
    edited: "Edited PR",
    review_requested: "Requested review on PR",
    assigned: "Assigned PR",
  };

  const emoji = actionEmoji[action] || "🔔";
  const label = actionLabel[action] || `${action} PR`;

  const headerText = `${emoji} *${label}* in *<${repoUrl}|${repoName}>*`;
  const prTitle = `<${pr.html_url}|#${payload.number}: ${pr.title}>`;
  const branchInfo = `\`${pr.head.ref}\` → \`${pr.base.ref}\``;

  const statsText =
    action === "opened" || action === "synchronize" || action === "closed"
      ? `${pr.commits} commit${pr.commits !== 1 ? "s" : ""} · +${pr.additions} / -${pr.deletions} · ${pr.changed_files} file${pr.changed_files !== 1 ? "s" : ""} changed`
      : "";

  const blocks: object[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${"=".repeat(50)}\n${headerText}\n*${prTitle}*\n${branchInfo}${pr.draft ? " · _Draft_" : ""}\n${"=".repeat(50)}`,
      },
      accessory: {
        type: "image",
        image_url: avatarUrl,
        alt_text: sender,
      },
    },
  ];

  if (pr.body && (action === "opened" || action === "edited")) {
    const body = pr.body.slice(0, 300);
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `_${body}${pr.body.length > 300 ? "…" : ""}_` },
    });
  }

  blocks.push({
    type: "context",
    elements: [
      { type: "mrkdwn", text: `👤 *<${senderUrl}|${sender}>*` },
      { type: "mrkdwn", text: `🕐 ${formatTimestamp(now)}` },
      ...(statsText ? [{ type: "mrkdwn", text: statsText }] : []),
      {
        type: "mrkdwn",
        text: `<${pr.html_url}|View PR →>`,
      },
    ],
  });

  return blocks;
}

function buildCreateDeleteBlocks(
  payload: CreateDeletePayload,
  eventType: "create" | "delete"
): object[] {
  const isCreate = eventType === "create";
  const refType = payload.ref_type;
  const refName = payload.ref;
  const sender = payload.sender.login;
  const senderUrl = payload.sender.html_url;
  const avatarUrl = payload.sender.avatar_url;
  const repoName = payload.repository.full_name;
  const repoUrl = payload.repository.html_url;
  const now = new Date().toISOString();

  const emoji = isCreate ? (refType === "branch" ? "🌿" : "🏷️") : refType === "branch" ? "🗑️" : "❌";
  const action = isCreate ? "Created" : "Deleted";
  const branchUrl = isCreate && refType === "branch"
    ? `${repoUrl}/tree/${refName}`
    : repoUrl;

  const headerText =
    refType === "branch"
      ? `${emoji} *${action} branch* \`<${branchUrl}|${refName}>\` in *<${repoUrl}|${repoName}>*`
      : `${emoji} *${action} tag* \`${refName}\` in *<${repoUrl}|${repoName}>*`;

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${"=".repeat(50)}\n${headerText}\n${"=".repeat(50)}`
      },
      accessory: {
        type: "image",
        image_url: avatarUrl,
        alt_text: sender,
      },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `👤 *<${senderUrl}|${sender}>*` },
        { type: "mrkdwn", text: `🕐 ${formatTimestamp(now)}` },
      ],
    },
  ];
}

// ─── Signature Verification ───────────────────────────────────────────────────

function verifySignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return !secret; // if no secret configured, skip check
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ─── Slack Sender ─────────────────────────────────────────────────────────────

async function sendToSlack(blocks: object[], text: string): Promise<void> {
  const webhookUrl = process.env.SLACK_GITHUB_WEBHOOK_URL || process.env.SLACK_ERROR_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("[GitHub Webhook] No Slack webhook URL configured");
    return;
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, blocks }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[GitHub Webhook] Slack send failed:", res.status, body);
  }
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const event = req.headers.get("x-github-event");
    const signature = req.headers.get("x-hub-signature-256");
    const deliveryId = req.headers.get("x-github-delivery");

    console.log(`[GitHub Webhook] Event: ${event}, Delivery: ${deliveryId}`);

    // Verify webhook secret if configured
    const secret = process.env.GITHUB_WEBHOOK_SECRET || "";
    if (secret && !verifySignature(rawBody, signature, secret)) {
      console.warn("[GitHub Webhook] Signature verification failed");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    let blocks: object[] = [];
    let fallbackText = "";

    switch (event) {
      case "push": {
        const p = payload as PushPayload;
        // Skip pushes to non-branch refs (tags via push, etc.)
        if (!p.ref.startsWith("refs/heads/") && !p.ref.startsWith("refs/tags/")) break;
        // Skip if no commits (e.g. branch deletion via push is handled separately)
        if (!p.deleted && p.commits.length === 0) break;

        blocks = buildPushBlocks(p);
        const branch = getBranchFromRef(p.ref);
        fallbackText = `${p.sender.login} pushed ${p.commits.length} commit(s) to ${branch} in ${p.repository.full_name}`;
        break;
      }

      case "pull_request": {
        const p = payload as PullRequestPayload;
        // Only notify on meaningful actions
        const notifyActions = [
          "opened", "closed", "reopened", "synchronize",
          "ready_for_review", "converted_to_draft",
        ];
        if (!notifyActions.includes(p.action)) break;

        blocks = buildPRBlocks(p);
        fallbackText = `${p.sender.login} ${p.action} PR #${p.number}: ${p.pull_request.title}`;
        break;
      }

      case "create": {
        const p = payload as CreateDeletePayload;
        if (p.ref_type !== "branch" && p.ref_type !== "tag") break;

        blocks = buildCreateDeleteBlocks(p, "create");
        fallbackText = `${p.sender.login} created ${p.ref_type} "${p.ref}" in ${p.repository.full_name}`;
        break;
      }

      case "delete": {
        const p = payload as CreateDeletePayload;
        if (p.ref_type !== "branch" && p.ref_type !== "tag") break;

        blocks = buildCreateDeleteBlocks(p, "delete");
        fallbackText = `${p.sender.login} deleted ${p.ref_type} "${p.ref}" in ${p.repository.full_name}`;
        break;
      }

      case "ping": {
        console.log("[GitHub Webhook] Ping received — webhook configured successfully!");
        return NextResponse.json({ ok: true, message: "Pong! Webhook connected." });
      }

      default:
        console.log(`[GitHub Webhook] Unhandled event: ${event}`);
        return NextResponse.json({ ok: true, message: `Event '${event}' ignored` });
    }

    if (blocks.length > 0) {
      await sendToSlack(blocks, fallbackText);
      console.log(`[GitHub Webhook] Slack notified: ${fallbackText}`);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[GitHub Webhook] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
