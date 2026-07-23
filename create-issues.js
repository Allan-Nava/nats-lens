#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { URL } = require('url')

const TOKEN = process.env.GITHUB_TOKEN
if (!TOKEN) {
  console.error('ERROR: Set GITHUB_TOKEN in environment')
  process.exit(1)
}

const argv = process.argv.slice(2)
const args = {}
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i]
  if (arg === '--repo' || arg === '-r') {
    args.repo = argv[i + 1]
    i += 1
  } else if (arg === '--milestone' || arg === '-m') {
    args.milestone = argv[i + 1]
    i += 1
  } else if (arg === '--dry-run') {
    args.dryRun = true
  } else if (arg === '--help' || arg === '-h') {
    args.help = true
  }
}

if (args.help) {
  console.log(`Usage: node create-issues.js [--repo owner/repo] [--milestone "Milestone title"] [--dry-run]`)
  process.exit(0)
}

function parseRepoFromPackageJson() {
  const pkgJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'))
  const repo = pkgJson.repository?.url || pkgJson.repository
  if (!repo) return null
  const normalized = String(repo)
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .replace(/^git:/, 'https:')
  try {
    const url = new URL(normalized)
    const [, owner, repoName] = url.pathname.split('/').filter(Boolean)
    return owner && repoName ? `${owner}/${repoName}` : null
  } catch (err) {
    return null
  }
}

function parseBacklog(content) {
  const lines = content.split(/\r?\n/)
  const milestones = []
  let current = null

  for (const line of lines) {
    const milestoneMatch = line.match(/^##\s+Milestone:\s*(.+)$/)
    if (milestoneMatch) {
      current = { title: milestoneMatch[1].trim(), items: [] }
      milestones.push(current)
      continue
    }
    const itemMatch = line.match(/^\s*- \[ \]\s+(NL-\d+):\s+(.+?)(?:\s+[—–-]\s*(.*))?$/)
    if (itemMatch && current) {
      current.items.push({ id: itemMatch[1], title: itemMatch[2].trim(), desc: (itemMatch[3] || '').trim() })
    }
  }

  return milestones
}

function getApiUrl(repo) {
  return `https://api.github.com/repos/${repo}`
}

async function request(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `token ${TOKEN}`,
      'User-Agent': 'create-issues-script',
      ...(opts.headers || {}),
    },
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    const message = data?.message || res.statusText
    throw new Error(`${res.status} ${message} (${url})`)
  }
  return data
}

async function ensureMilestone(repo, title) {
  const all = await request(`${getApiUrl(repo)}/milestones?state=all&per_page=100`)
  const existing = all.find((item) => item.title === title)
  if (existing) return existing
  return request(`${getApiUrl(repo)}/milestones`, {
    method: 'POST',
    body: JSON.stringify({ title, state: 'open' }),
  })
}

async function listIssues(repo) {
  const issues = []
  let page = 1
  while (true) {
    const batch = await request(`${getApiUrl(repo)}/issues?state=all&per_page=100&page=${page}`)
    if (!batch.length) break
    issues.push(...batch)
    page += 1
  }
  return issues
}

async function ensureIssue(repo, issue, milestoneNumber, existingIssues) {
  const title = `${issue.id}: ${issue.title}`
  const existing = existingIssues.find((item) => item.title === title)
  const body = `Backlog item **${issue.id}**\n\n${issue.desc || ''}\n\nSource: BACKLOG.md`
  if (existing) {
    await request(`${getApiUrl(repo)}/issues/${existing.number}`, {
      method: 'PATCH',
      body: JSON.stringify({ body, milestone: milestoneNumber, labels: ['backlog'] }),
    })
    return existing
  }
  return request(`${getApiUrl(repo)}/issues`, {
    method: 'POST',
    body: JSON.stringify({ title, body, milestone: milestoneNumber, labels: ['backlog'] }),
  })
}

async function main() {
  const repo = args.repo || process.env.GITHUB_REPOSITORY || parseRepoFromPackageJson()
  if (!repo) {
    console.error('ERROR: repository not configured. Pass --repo owner/repo or set GITHUB_REPOSITORY or repository.url/package.json')
    process.exit(1)
  }

  const backlog = fs.readFileSync(path.join(__dirname, 'BACKLOG.md'), 'utf8')
  const milestones = parseBacklog(backlog)
  if (!milestones.length) {
    console.error('ERROR: no milestones found in BACKLOG.md')
    process.exit(1)
  }

  const selected = args.milestone ? milestones.find((m) => m.title === args.milestone) : milestones[milestones.length - 1]
  if (!selected) {
    console.error(`ERROR: milestone '${args.milestone}' not found in BACKLOG.md`)
    process.exit(1)
  }

  console.log(`Using repo: ${repo}`)
  console.log(`Milestone: ${selected.title}`)
  console.log(`Items: ${selected.items.length}`)

  if (args.dryRun) {
    selected.items.forEach((item) => {
      console.log(`- ${item.id}: ${item.title}`)
    })
    process.exit(0)
  }

  const milestone = await ensureMilestone(repo, selected.title)
  const existingIssues = await listIssues(repo)
  for (const item of selected.items) {
    const issue = await ensureIssue(repo, item, milestone.number, existingIssues)
    console.log(`Ensured issue: ${issue.title} (#${issue.number})`)
  }

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
