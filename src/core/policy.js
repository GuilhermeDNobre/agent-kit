// Self-contained on purpose: this module is copied verbatim into generated projects
// (.agent-kit/hooks/policy.mjs) so the approval hook runs without the package installed.

export const DEFAULT_PROTECTED_ACTIONS = [
  {
    id: "production-deploy",
    description: "Deploy to production",
    patterns: [
      "\\b(vercel|netlify)\\b.*--prod\\b",
      "\\bfly(ctl)?\\s+deploy\\b",
      "\\bheroku\\s+.*(deploy|releases:rollback|container:release)\\b",
      "\\b(gcloud|aws|az)\\s+.*\\bdeploy\\b",
      "\\bkubectl\\s+.*\\b(prod|production)\\b",
      "\\bgit\\s+push\\b.*\\b(prod|production|release)\\b",
    ],
  },
  {
    id: "production-infra",
    description: "Change production infrastructure",
    patterns: [
      "\\bterraform\\s+(apply|destroy|import|state\\s+rm)\\b",
      "\\bpulumi\\s+(up|destroy)\\b",
      "\\bhelm\\s+(install|upgrade|uninstall|rollback)\\b",
      "\\bkubectl\\s+(apply|delete|scale|rollout|drain|cordon)\\b",
    ],
  },
  {
    id: "data-destruction",
    description: "Irreversible data deletion",
    patterns: [
      "\\bdrop\\s+(database|schema|table)\\b",
      "\\btruncate\\s+(table\\s+)?\\w",
      "\\bdelete\\s+from\\s+\\w+\\s*(;|$|\")",
      "\\bdropdb\\b",
      "\\b(prisma\\s+migrate\\s+reset|db:drop|rake\\s+db:reset)\\b",
      "\\brm\\s+-[a-z]*r[a-z]*\\s+(-[a-z]+\\s+)*(/|~|\\$HOME|\\*|\\.\\.?)(\\s|/?$)",
      "\\bredis-cli\\b.*\\bflush(all|db)\\b",
    ],
  },
  {
    id: "external-destructive",
    description: "Destructive operation on an external service",
    patterns: [
      "\\bgit\\s+push\\b.*(--force\\b|--force-with-lease\\b|\\s-f\\b|--delete\\b|\\s:\\S)",
      "\\bgh\\s+(repo|release)\\s+delete\\b",
      "\\bgh\\s+pr\\s+merge\\b",
      "\\baws\\s+s3\\s+(rm|rb)\\b",
      "\\bgsutil\\s+(rm|rb)\\b",
      "\\bdocker\\s+push\\b",
    ],
  },
  {
    id: "package-publish",
    description: "Publish a package or release (cannot be unpublished safely)",
    patterns: [
      "\\b(npm|pnpm|bun)\\s+publish\\b",
      "\\byarn\\s+(npm\\s+)?publish\\b",
      "\\bcargo\\s+publish\\b",
      "\\btwine\\s+upload\\b",
      "\\bgem\\s+push\\b",
      "\\bgh\\s+release\\s+create\\b",
    ],
  },
  {
    id: "financial",
    description: "Charges, payouts or other financial changes",
    patterns: ["\\bstripe\\s+\\S*(charges|payment_intents|refunds|payouts|transfers|subscriptions)\\b.*\\b(create|update|cancel|delete)\\b"],
  },
  {
    id: "credential-exposure",
    description: "Printing or exporting credentials",
    patterns: [
      "\\b(cat|type|less|more|head|tail|bat)\\s+[^|;&]*\\.env(\\.[\\w-]+)?\\b",
      "\\b(cat|type)\\s+[^|;&]*(id_rsa|id_ed25519|\\.pem|credentials(\\.json)?)\\b",
      "\\bprintenv\\b",
      "\\becho\\s+[^|;&]*\\$\\{?\\w*(token|secret|password|api_?key)\\w*",
      "\\bgh\\s+auth\\s+token\\b",
      "\\baws\\s+configure\\s+get\\b",
    ],
  },
];

const GIT_PUSH = /\bgit\s+push\b/i;
const GIT_COMMIT = /\bgit\s+commit\b/i;

function compile(pattern) {
  return new RegExp(pattern, "i");
}

export function protectedCategories(autonomy = {}) {
  const configured = autonomy.protectedActions?.categories;
  return Array.isArray(configured) ? configured : DEFAULT_PROTECTED_ACTIONS;
}

export function classifyCommand(command, autonomy = {}) {
  const text = String(command || "");
  const decision = autonomy.protectedActions?.decision || "ask";
  const allowed = new Set(autonomy.protectedActions?.allow || []);
  for (const category of protectedCategories(autonomy)) {
    if (allowed.has(category.id)) continue;
    const hit = (category.patterns || []).find((pattern) => compile(pattern).test(text));
    if (hit) return { decision, category: category.id, reason: category.description };
  }
  const permissions = autonomy.permissions || {};
  if (GIT_PUSH.test(text) && !permissions.push) {
    return { decision, category: "git-push", reason: "Pushing is not enabled in autonomy.permissions.push" };
  }
  if (GIT_COMMIT.test(text) && !permissions.localCommits) {
    return {
      decision,
      category: "git-commit",
      reason: "Local commits are not enabled in autonomy.permissions.localCommits",
    };
  }
  return { decision: "allow", category: null, reason: null };
}

function globToRegExp(glob) {
  const normalized = glob.replace(/\\/g, "/");
  let source = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (char === "*" && normalized[index + 1] === "*") {
      source += ".*";
      index += normalized[index + 2] === "/" ? 2 : 1;
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`, "i");
}

export function matchesAny(path, globs = []) {
  const normalized = String(path).replace(/\\/g, "/").replace(/^\.\//, "");
  return globs.some((glob) => globToRegExp(glob).test(normalized));
}

export function classifyWrite(path, autonomy = {}) {
  const permissions = autonomy.permissions || {};
  const decision = autonomy.protectedActions?.decision || "ask";
  if (matchesAny(path, permissions.denyWrite || [])) {
    return { decision, category: "protected-path", reason: `Writing ${path} is protected` };
  }
  return { decision: "allow", category: null, reason: null };
}
